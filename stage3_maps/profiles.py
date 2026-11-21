"""Build the same pre-stage map profiles for every possible pairing."""
import argparse
import json
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from map_strength.build import map_prior, profile, roster, team_for

FIELDS = ('ban', 'pick', 'banOpportunities', 'pickOpportunities')
IDS = ('austin-2025-3', 'budapest-2025-3', 'cologne-2026-3', 'epl23-stage2')


def build(field, veto):
    pool, start = field['pool'], date.fromisoformat(field['start'])
    cutoff = start - timedelta(days=1)
    rotations=json.loads((HERE/'pools.json').read_text(encoding='utf8'))['rotations']
    switches=[date.fromisoformat(row['valveNoteDate']) for row in rotations
              if set(row['pool'])==set(pool) and row['valveNoteDate']<field['start']]
    assert switches
    # Source dates lack precise times. The first full day after the patch is eligible.
    pool_since=(max(switches)+timedelta(days=1)).isoformat()
    entrants = {t['name']: roster(n.split('@')[0] for n in t['roster']) for t in field['teams']}
    assert len(entrants) == 16 and len(pool) == len(set(pool)) == 7
    records, series, seen, side_map = defaultdict(list), defaultdict(dict), set(), {}
    for g in field['maps']:
        day, game, sid = g['day'], str(g['gameId']), str(g['series'])
        age = (cutoff - date.fromisoformat(day)).days
        assert 0 <= age < 90 and g['rankDay'] < day < field['start']
        assert (sid, game) not in seen and int(g['winnerA']) in (0,1) and g['bo'] in (1,3)
        seen.add((sid, game))
        assert int(g['roundsA']) != int(g['roundsB'])
        assert int(g['winnerA']) == int(g['roundsA']>g['roundsB'])
        fives = [roster(n.split('@')[0] for n in g[k]) for k in ('fiveA','fiveB')]
        assert not (fives[0] & fives[1])
        if g['map'] not in pool:
            continue
        p = map_prior(int(g['pointsA'])-int(g['pointsB']),g['bo'])
        for i,code in enumerate(('a','b')):
            team = team_for(fives[i],entrants)
            if not team:
                continue
            name, common = team
            side = (name, common, fives[1-i], day, age, g['bo'])
            # A mixed-lineup series would invalidate its side-level veto link.
            assert side_map.setdefault((sid,code),side) == side
            series[name][sid] = fives[1-i]
            records[name].append({'map':g['map'], 'series':sid, 'date':day, 'bo':g['bo'],
                                  'y':int(g['winnerA']) if i==0 else 1-int(g['winnerA']),
                                  'prior':p if i==0 else 1-p,'baseWeight':common/5*0.5**(age/45)})
    repeats = {n:{s:sum(len(opp & other)>=3 for other in ss.values()) for s,opp in ss.items()}
               for n,ss in series.items()}
    strengths, appearance, coverage = {}, {}, {}
    for name in entrants:
        obs = records[name]
        for g in obs:
            g['weight'] = g['baseWeight']/repeats[name][g['series']]
        strengths[name] = profile(pool,obs)
        weighted = dict.fromkeys(pool,0.)
        for g in obs:
            if g['bo']==3 and g['date'] >= pool_since:
                weighted[g['map']] += g['weight']
        appearance[name] = {m:round(x,8) for m,x in weighted.items()}
        coverage[name] = {'maps':len(obs), 'series':len(series[name]),
                          'seriesWithRepeatOpponent':sum(n>1 for n in repeats.get(name,{}).values()),
                          'largestRepeatCount':max(repeats.get(name,{}).values(),default=0)}
    vetos = {name:{'bo3':{'n':0,**{k:dict.fromkeys(pool,0.) for k in FIELDS}}} for name in entrants}
    used = set()
    for v in veto['observations']:
        sid, code = str(v['series']),v['side']
        assert (sid,code) not in used and code in ('a','b')
        used.add((sid,code))
        side = side_map.get((sid,code))
        if side is None:
            # A source may also provide the opposing side, who is not an entrant.
            continue
        name, common, _, day, age, bo = side
        if bo != 3:
            continue
        counts = v['counts']
        assert day==v['day'] and len(counts)==4 and all(len(row)==7 for row in counts)
        assert sum(counts[0])==2 and sum(counts[1])==1
        assert all(0<=b<=ob and 0<=p<=op and b+p<=1 for b,p,ob,op in zip(*counts))
        weight = common/5*0.5**(age/45)/repeats[name][sid]
        values = vetos[name]['bo3']
        values['n'] += 1
        for key, row in zip(FIELDS,counts):
            for m, value in zip(pool,row):
                values[key][m] += weight*value
    for obj in vetos.values():
        for k in FIELDS:
            obj['bo3'][k]={m:round(w,8) for m,w in obj['bo3'][k].items()}
    asof=cutoff.isoformat()
    return {'id':field['id'], 'asOf':asof, 'start':field['start'], 'teams':list(entrants), 'coverage':coverage,
            'mapStrength':{'asOf':asof,'pool':pool,'teams':strengths},
            'mapVeto':{'asOf':asof,'pool':pool,'teams':vetos}, 'appearances':appearance}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    source=json.loads((HERE/'field-maps.json').read_text(encoding='utf8'))['fields']
    veto=json.loads((HERE/'field-veto.json').read_text(encoding='utf8'))['fields']
    out={id:build(source[id],veto[id]) for id in IDS}
    text=json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n'
    output=HERE/'profiles.json'
    if args.check:
        assert output.read_text(encoding='utf8')==text
    else:
        output.write_bytes(text.encode('utf8'))
    for key, event in out.items():
        print(key, 'team map rows',sum(v['maps'] for v in event['coverage'].values()),
              'team veto rows',sum(v['bo3']['n'] for v in event['mapVeto']['teams'].values()))
