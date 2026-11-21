"""Join archived pre-stage probabilities to verified participants in each played series."""
import argparse
import csv
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from experience import build_history as xp

STARTS = {'copenhagen':'2024-03-17','shanghai':'2024-11-30','austin':'2025-06-03',
          'budapest':'2025-11-24','cologne':'2026-06-02'}
LABELS = {'copenhagen':'哥本哈根 2024','shanghai':'上海 2024','austin':'奥斯汀 2025',
          'budapest':'布达佩斯 2025','cologne':'科隆 2026'}
ALIASES = {**xp.ALIASES,'rmn':'roman'}


def read(path):
    return json.loads((ROOT/path).read_text())


def identities(roster, club):
    """Unresolved homonyms cannot supply a verified overlap."""
    aliases = xp.TEAM_ALIASES.get(xp.normalize(club), {})
    result = []
    for nick in roster:
        name = xp.normalize(nick)
        name = aliases.get(name, ALIASES.get(name,name))
        if name not in xp.AMBIGUOUS:
            result.append(name)
    return set(result)


def starters_from_source(source):
    expected = xp.SOURCES['cs2'][3]
    assert hashlib.sha256(source.read_bytes()).hexdigest() == expected
    titles = {info[0]:key for key,info in zip(STARTS, xp.CS2)}
    exhibition = {info[-1] for info in xp.CS2}
    handles, totals, per_map = defaultdict(set), [], defaultdict(list)
    with source.open() as f:
        for row in csv.DictReader(f):
            for side in ('team1','team2'):
                for i in range(1,6):
                    col = f'{side}_player{i}'
                    nick = re.split(r'\s*[,(/]',row[col],maxsplit=1)[0]
                    if nick:
                        handles[row[col+'_id']].add(xp.normalize(nick))
            if row['tournament'] not in titles or row['match_id'] in exhibition:
                continue
            if row['is_total']=='True':
                totals.append(row)
            else:
                for side in ('team1','team2'):
                    per_map[row['match_id'],row[side]].append(
                        {row[f'{side}_player{i}_id'] for i in range(1,6)})
    by_event = defaultdict(list)
    for row in totals:
        lineups = []
        for side in ('team1','team2'):
            ids = {row[f'{side}_player{i}_id'] for i in range(1,6)}
            maps = per_map[row['match_id'],row[side]]
            assert len(ids)==5 and all(s==ids for s in maps)
            roster = []
            for pid in ids:
                assert pid.isdecimal() and int(pid)>0 and len(handles[pid])==1
                name, = handles[pid]
                if name in xp.AMBIGUOUS:
                    name = 'zero@cn' if name=='zero' and row[side]=='TYLOO' else xp.CS2_HOMONYMS[pid]
                roster.append(ALIASES.get(name,name))
            assert len(set(roster))==5
            lineups.append(sorted(roster))
        assert not set(lineups[0]) & set(lineups[1])
        score = [float(row[f'score{i}_match']) for i in (1,2)]
        assert score[0]!=score[1]
        by_event[titles[row['tournament']]].append(dict(id=row['match_id'],day=row['datetime'][:10],
            clubs=[row['team1'],row['team2']],bo=int(2*max(score)-1),sourceBo=int(float(row['bestOf'])),mapVerified=bool(maps),lineups=lineups,y=int(score[0]>score[1])))
    return by_event


def generate(by_event):
    primary = read('region_vrs_eval/diagnostics.json')['stages']
    later = [s for s in read('integrated_eval/diagnostics.json')['stages'] if s['id'] not in STARTS]
    later_specs = read('extra_validation/stages.json')
    strengths = read('extra_validation/strengths.json')
    anchor = read('region_risk/anchor.json')
    primary_strengths = {**read('history24/models.json'),**read('datajob/features.json')}
    editions = {}
    for eid,info in zip(STARTS,xp.CS2):
        start = STARTS[eid]
        entry = dict(id=eid,label=LABELS[eid],start=start,end=info[1],matches=[])
        editions[eid] = entry
        stages = [s for s in primary+later if s['id'].split('-')[0]==eid]
        dates = [start]+[later_specs[s['id']]['start'] for s in stages[1:]]
        used = set()
        for index, stage in enumerate(stages):
            if index==0:
                teams = {t['name']:t for t in primary_strengths[eid]['teams']}
            else:
                teams = strengths[eid]['teams']
            pool = sorted((fact for fact in by_event[eid] if fact['day']>=dates[index]),key=lambda f:(f['day'],f['id']))
            assert len(pool)>=33 and (len(pool)==33 or pool[32]['day']<pool[33]['day'])
            stage_facts = pool[:33]
            for m in stage['matches']:
                a,b = m['a'],m['b']
                reg = [identities(teams[n]['roster'],n) for n in (a,b)]
                candidates = []
                for fact in stage_facts:
                    if m['bestOf']!=fact['bo'] or fact['id'] in used:
                        continue
                    for direction in (0,1):
                        aligned = fact['lineups'][::1 if direction==0 else -1]
                        if min(len(r&set(h)) for r,h in zip(reg,aligned))>=3:
                            winner = fact['y'] if direction==0 else 1-fact['y']
                            if winner == m['y']:
                                candidates.append((fact,aligned))
                assert len(candidates)==1,(eid,stage['id'],a,b)
                fact,aligned = candidates[0]
                p = m['baseVrs'] if index==0 else m['base']
                assert 0<p<1
                used.add(fact['id'])
                entry['matches'].append(dict(id=fact['id'],stage=index+1,day=fact['day'],bo=fact['bo'],
                    a=a,b=b,rosterA=aligned[0],rosterB=aligned[1],y=m['y'],p=p,
                    mapVerified=fact['mapVerified'],sourceBo=fact['sourceBo'],pSource='v4-region-vrs' if index==0 else 'v4',
                    pointsA=teams[a]['points'],pointsB=teams[b]['points'],pointsAsOf=anchor[eid]['asOf']))
        entry['matches'].sort(key=lambda r:(r['day'],r['id']))
        assert len(used)==len(stages)*33
    return dict(editions=editions)


def all_stages(by_event):
    anchors = read('region_risk/anchor.json')
    editions = {}
    for eid,info in zip(STARTS,xp.CS2):
        swiss = 2 if eid in ('copenhagen','shanghai') else 3
        games=sorted(by_event[eid],key=lambda f:(f['day'],f['id']))
        assert len(games)==swiss*33+7 and games[0]['day']==STARTS[eid] and games[-1]['day']==info[1]
        for boundary in range(33,swiss*33+1,33):
            assert games[boundary-1]['day']<games[boundary]['day']
        rows=[]
        for i,f in enumerate(games):
            rows.append(dict(id=f['id'],stage=1+i//33 if i<33*swiss else 'playoffs',day=f['day'],bo=f['bo'],
                a=f['clubs'][0],b=f['clubs'][1],rosterA=f['lineups'][0],rosterB=f['lineups'][1],y=f['y'],
                pointsAsOf=anchors[eid]['asOf'],sourceBo=f['sourceBo'],mapVerified=f['mapVerified']))
        editions[eid]=dict(id=eid,label=LABELS[eid],start=STARTS[eid],end=info[1],matches=rows)
    return dict(editions=editions)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('source',type=Path,help='Pinned cs2_all_tiers_games.csv release v11')
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    records=starters_from_source(args.source)
    for name,content in [('evidence.json',generate(records)),('all_stages.json',all_stages(records))]:
        body=json.dumps(content,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n'
        dest=HERE/name
        if args.check: assert dest.read_text()==body
        else: dest.write_text(body)
