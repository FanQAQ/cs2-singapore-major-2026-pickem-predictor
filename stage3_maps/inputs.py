"""Rebuild dated maps and seven-step veto opportunities for later-stage fields."""
import argparse
import bisect
import gzip
import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'map_strength'))
from history24 import build as historical
from map_strength.prepare import validated
from map_veto_data import extract_archive as hltvy


def load(file):
    return json.loads(file.read_text(encoding='utf8'))


def five(roster):
    return tuple(sorted(historical.canonical(p).split('@')[0] for p in roster))


def field_specs():
    rules = load(HERE / 'pools.json')
    pools = {r['valveNoteDate']: r['pool'] for r in rules['rotations']}
    fields = {}
    for stage in load(ROOT / 'multi_stage/inputs.json'):
        if stage['stage'] == 3:
            fields[stage['id']] = dict(id=stage['id'], start=stage['date'], pool=None,
                                       teams=[{k: t[k] for k in ('name','roster','points')} for t in stage['teams']])
    epl = load(ROOT / 'epl_transfer/field.json')
    fields[epl['id']] = dict(id=epl['id'], start=epl['start'], pool=None,
                             teams=[{k:t[k] for k in ('name','roster','points')}
                                    for t in load(ROOT / 'epl_transfer/rosters.json')['teams']])
    for ident, field in fields.items():
        target = rules['stages'][ident]
        assert target['start'] == field['start']
        field['pool'] = pools[target['poolRotation']]
        assert len(set(field['pool'])) == 7
    return fields


def collect(cache, source_csv, windows):
    report = cache / 'results.json.gz'
    assert hashlib.sha256(report.read_bytes()).hexdigest() == hltvy.SHA256
    with gzip.open(report,'rt',encoding='utf8') as stream:
        records = json.load(stream)
    hltv_end = '2026-03-23'
    games = []
    for row in records:
        try:
            m = hltvy.normalize(row)
        except (TypeError,ValueError,OverflowError):
            continue
        if not m or not m['lineupA'] or not m['lineupB'] or not any(a<=m['day']<b for a,b in windows):
            continue
        assert m['day'] <= hltv_end
        ident = 'hltv:'+str(m['mid'])
        games.append(dict(day=m['day'],series=ident,sourceUrl=m['url'],bo=m['bo'],a=m['a'],b=m['b'],
                          fiveA=five(m['lineupA']),fiveB=five(m['lineupB']),steps=m['steps'],
                          maps=[(ident+':'+mp,mp,x,y) for mp,x,y in m['maps']]))
    if len(games) != len({g['series'] for g in games}):
        raise ValueError('Duplicate verified HLTV series')
    # Cover the rest of the Cologne window with verified BO/map records. Historical
    # source intervals are disjoint so a match cannot enter twice under different IDs.
    series = defaultdict(list)
    gid_counts = Counter()
    for row in historical.load_series(source_csv):
        day=row['datetime'][:10]
        if row['is_total']=='False' and row['match_id'] and day>hltv_end and any(a<=day<b for a,b in windows):
            series[row['match_id']].append(row)
            gid_counts[row['game_id']]+=1
    for mid,rows in series.items():
        verified=validated(rows)
        if not verified:
            continue
        day,bo,rosters,maps=verified
        if any(gid_counts[gid]!=1 for gid,_,_ in maps):
            continue
        ident='ektarr:'+mid
        games.append(dict(day=day,series=ident,sourceUrl=None,bo=bo,a=rows[0]['team1'],b=rows[0]['team2'],
                          fiveA=five(rosters[0]),fiveB=five(rosters[1]),steps=None,
                          maps=[('ektarr:'+r['game_id'],r['map_name'],int(float(r['score1_game'])),int(float(r['score2_game'])))
                                for r in rows]))
    return sorted(games,key=lambda g:(g['day'],g['series']))


def ratings(cache):
    snapshots={}
    for day, digest in load(HERE / 'inputs-snapshots.json').items():
        file = cache / ('standings_global_' + day.replace('-', '_') + '.md')
        content = file.read_bytes()
        assert hashlib.sha256(content).hexdigest() == digest, file
        lines = content.decode('utf8').splitlines()
        assert day.replace('-', '_') in lines[0], file
        rows=[]
        for line in lines:
            cells=[v.strip() for v in line.split('|')]
            if len(cells)>5 and cells[1].isdigit():
                names=five(cells[4].split(', '))
                if len(set(names))==5:
                    rows.append(dict(name=cells[3],roster=names,points=int(cells[2])))
        assert rows
        snapshots[day]=historical.Ranking(rows)
    return snapshots


def veto_counts(steps,bo,pool):
    if not steps or [step[1] for step in steps] != (['ban']*6 if bo==1 else ['ban','ban','pick','pick','ban','ban'])+['left']:
        return None
    if set(s[2] for s in steps)!=set(pool):
        return None
    # Counts mirror map_veto_data.prepare.choices, including each side's actual opportunities.
    counts={side:[[0]*7 for _ in range(4)] for side in ('a','b')}
    available=set(pool)
    for side,action,mp in steps[:-1]:
        k=0 if action=='ban' else 1
        counts[side][k][pool.index(mp)]+=1
        for opt in available:
            counts[side][k+2][pool.index(opt)]+=1
        available.remove(mp)
    return counts


def build(cache,csv_path):
    fields=field_specs()
    windows={k:((date.fromisoformat(s['start'])-timedelta(days=90)).isoformat(),s['start']) for k,s in fields.items()}
    games=collect(cache,csv_path,windows.values())
    snapshots=ratings(cache)
    dates=sorted(snapshots)
    veto={}
    for ident,stage in fields.items():
        low,high=windows[ident]
        entrants=[set(five(t['roster'])) for t in stage['teams']]
        stage.update(windowStart=low,maps=[])
        observations=[]
        for m in games:
            if not low<=m['day']<high:
                continue
            a,b=set(m['fiveA']),set(m['fiveB'])
            if len(a)!=5 or len(b)!=5 or a&b:
                continue
            owners=[[i for i,t in enumerate(entrants) if len(side&t)>=3] for side in (a,b)]
            if (not any(owners) or any(len(candidates)>1 for candidates in owners) or
                    (owners[0] and owners[0]==owners[1])):
                continue
            rank_ix=bisect.bisect_left(dates,m['day'])-1
            assert rank_ix>=0
            rank_day=dates[rank_ix]
            assert 0<(date.fromisoformat(m['day'])-date.fromisoformat(rank_day)).days<=36
            ra,rb=(snapshots[rank_day].lookup(f)[0] for f in (a,b))
            if not ra or not rb or ra is rb:
                continue
            # Only surviving maps may contribute across rotations. A veto must
            # have seven observed steps covering the exact tournament pool.
            eligible=[(gid,mp,x,y) for gid,mp,x,y in m['maps'] if mp in stage['pool']]
            if not eligible:
                continue
            common={k:m[k] for k in ('day','series','bo','a','b','fiveA','fiveB')}
            for gid,mp,x,y in eligible:
                stage['maps'].append(dict(common,gameId=gid,map=mp,roundsA=x,roundsB=y,winnerA=int(x>y),
                                          rankDay=rank_day,pointsA=ra['points'],pointsB=rb['points']))
            counts=veto_counts(m['steps'],m['bo'],stage['pool'])
            if counts:
                for side in ('a','b'):
                    observations.append(dict(day=m['day'],series=m['series'],side=side,
                                             sourceUrl=m['sourceUrl'],counts=counts[side]))
        assert len(stage['maps'])==len({r['gameId'] for r in stage['maps']})
        veto[ident]=dict(observations=observations)
        print(ident,len(stage['maps']),'maps',len({r['series'] for r in stage['maps']}),'series',
              len(observations)//2,'verified vetos')
    return {'field-maps.json':dict(fields=fields),'field-veto.json':dict(fields=veto)}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--ektarr',type=Path,required=True)
    parser.add_argument('--write',action='store_true')
    args=parser.parse_args()
    for filename,obj in build(args.cache,args.ektarr).items():
        text=json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n'
        if args.write:
            (HERE/filename).write_bytes(text.encode('utf8'))
        else:
            assert (HERE/filename).read_text(encoding='utf8')==text,filename
