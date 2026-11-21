"""Build the frozen OpenCS2 match cohort and the pre-Major roster summaries."""
from collections import Counter, defaultdict
import argparse
import gzip
import json
from pathlib import Path

from extract import handle

HERE = Path(__file__).resolve().parent
KEYS = ('earlyContact', 'trade', 'awp')
AS_OF = '2026-05-02'


def profile(roster, observations):
    roster = set(map(handle,roster))
    evidence = []
    totals = Counter()
    for item,team in observations:
        overlap = len(roster.intersection(team['roster']))
        if overlap < 3:
            continue
        evidence.append((item,overlap))
        totals.update({k:v for k,v in team.items() if k!='roster'})
    n = len(evidence)
    series = len({item['match'] for item,_ in evidence})
    def rate(numer, denom):
        return round(totals[numer]/totals[denom],6) if totals[denom] else None
    early = rate('earlyHalfUnits','roundsT')
    return dict(roster=sorted(roster), maps=n, series=series, roundsT=totals['roundsT'],
                firstMatch=evidence[0][0]['day'] if n else None, latestMatch=evidence[-1][0]['day'] if n else None,
                coreOverlap={str(m):sum(x==m for _,x in evidence) for m in [3,4,5]},
                classKey='unknown', metrics={
                    'earlyContact':round(early/2,6) if early is not None else None,
                    'trade':rate('trades','kills'), 'awp':rate('awp','kills'),
                    'rifleHS':rate('rifleHS','rifle'), 'utilityFinish':rate('utility','kills')
                }, counts=dict(totals), examples=list(dict.fromkeys(item['matchURL'] for item,_ in reversed(evidence)))[:2])


def sufficient(row):
    return row['maps'] >= 4 and row['series'] >= 2 and row['roundsT'] >= 35 and row['counts'].get('kills',0) >= 50


def classify(row,reference):
    if not sufficient(row):
        return row
    percentiles = {}
    for axis,values in reference.items():
        x = row['metrics'][axis]
        percentiles[axis] = round(sum((v<x) + 0.5*(v==x) for v in values)/len(values), 6)
    ranked = sorted(percentiles, key=lambda k:percentiles[k],reverse=True)
    top,next_axis = ranked[:2]
    row['classKey'] = top if percentiles[top]>=0.70 and percentiles[top]-percentiles[next_axis]>=0.05 else 'mixed'
    row['percentiles'] = percentiles
    return row


def flash_sample(roster, matches):
    five = set(map(handle, roster))
    selected = []
    for match in sorted(matches, key=lambda m:(m['day'],m['url']), reverse=True):
        for team in match['teams']:
            overlap = len(five.intersection(map(handle, team['roster'])))
            if overlap >= 3 and '2026-08-23' <= match['day'] <= '2026-11-20':
                selected.append(dict(day=match['day'], url=match['url'], overlap=overlap,
                                     maps=len(match['scorePairs']), rounds=sum(sum(s) for s in match['scorePairs']),
                                     thrown=team['thrown']))
    selected = selected[:2]
    rounds = sum(m['rounds'] for m in selected)
    thrown = sum(m['thrown'] for m in selected)
    return dict(series=len(selected), maps=sum(m['maps'] for m in selected), rounds=rounds,
                thrown=thrown, perRound=round(thrown / rounds, 3) if rounds else None, examples=selected)


def validate_flash(matches):
    assert len({m['url'] for m in matches}) == len(matches)
    for m in matches:
        assert m['url'].startswith('https://bo3.gg/matches/') and m['url'].endswith('/grenades')
        assert '2026-08-23' <= m['day'] <= '2026-11-20'
        assert m['scorePairs'] and all(max(s) >= 13 and min(s) >= 0 and s[0] != s[1] for s in m['scorePairs'])
        assert len(m['teams']) == 2 and all(len(t['roster'])==5 and t['thrown']>=0 for t in m['teams'])
        assert len({handle(p) for team in m['teams'] for p in team['roster']}) == 10


def build():
    maps=json.loads(gzip.decompress((HERE/'maps.json.gz').read_bytes()))
    observations=[(item,team) for item in maps for team in item['teams']]
    exact=defaultdict(list)
    for item,team in observations:
        exact[tuple(team['roster'])].append((item,team))
    # Reference units are adequately observed exact fives. Each has equal weight.
    rows=[profile(r,obs) for r,obs in sorted(exact.items())]
    ref_rows=[r for r in rows if sufficient(r)]
    reference={k:sorted(r['metrics'][k] for r in ref_rows) for k in KEYS}
    cohort=dict(asOf=AS_OF, firstMatch=maps[0]['day'],lastMatch=maps[-1]['day'],
                maps=len(maps), series=len({m['match'] for m in maps}), referenceFives=len(ref_rows),
                profiles=[classify(r,reference) for r in rows])
    rosters=json.loads((HERE.parent/'datajob/stage_rosters.json').read_bytes())
    boxscores=json.loads((HERE/'recent.json').read_bytes())
    flash_matches=json.loads((HERE/'flash_matches.json').read_bytes())
    validate_flash(flash_matches)
    events={}
    for event in ['cologne','singapore']:
        profiles={}
        for team,roster in rosters[event].items():
            row=classify(profile(roster,observations),reference)
            if event in boxscores:
                row['recent']=boxscores[event][team]
            if event == 'singapore':
                row['flash']=flash_sample(roster,flash_matches)
            profiles[team]=row
        events[event]=profiles
    return cohort,events


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true')
    check=parser.parse_args().check
    cohort,events=build()
    for name,content in [('cohort',cohort),('events',events)]:
        dest=HERE/(name+'.json')
        if check:
            assert json.loads(dest.read_bytes())==content
        else:
            dest.write_bytes((json.dumps(content,ensure_ascii=False,separators=(',',':'))+'\n').encode())
    print('Exact fives:',len(cohort['profiles']),'reference:',cohort['referenceFives'])
    for event,rows in events.items():
        print(event,[(name,r['maps'],r['classKey']) for name,r in rows.items()])
