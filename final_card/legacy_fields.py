"""Freeze team/rank inputs for four independently scored CS:GO Legends stages."""
import argparse
import json
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "experience"))
from build_legacy import MAP_DIGEST, SOURCE, checked, read_maps

FIELDS = [
    ("PGL Major Stockholm 2021", "2021-10-30", "2021-11-02", "32674/navi-heroic-headlines-pgl-stockholm-legends-stage-opening-matches",
     "Evil Geniuses|G2|Gambit|Liquid|Vitality|Natus Vincere|Ninjas in Pyjamas|FURIA",
     "FaZe|Copenhagen Flames|ENCE|Entropiq|Virtus.pro|Heroic|MOUZ|Astralis"),
    ("PGL Major Antwerp 2022", "2022-05-14", "2022-05-17", "33791/opening-matches-of-pgl-major-antwerp-legends-stage-set",
     "Heroic|Copenhagen Flames|Ninjas in Pyjamas|Cloud9|FaZe|FURIA|Natus Vincere|BIG",
     "Liquid|Bad News Eagles|Vitality|Outsiders|ENCE|Spirit|G2|Imperial"),
    ("IEM Rio Major 2022", "2022-11-05", "2022-11-08", "34983/two-top-5-matchups-in-first-round-of-iem-rio-legends-stage",
     "Liquid|Spirit|FaZe|Sprout|Natus Vincere|Heroic|Ninjas in Pyjamas|ENCE",
     "MOUZ|Bad News Eagles|Cloud9|BIG|Vitality|Outsiders|fnatic|FURIA"),
    ("BLAST.tv Paris Major 2023", "2023-05-13", "2023-05-16", "36256/two-top-five-matchups-set-for-first-round-blast-paris-major-legends-stage",
     "Natus Vincere|9INE|FURIA|fnatic|Heroic|Into the Breach|Vitality|Bad News Eagles",
     "GamerLegion|Liquid|Monte|Ninjas in Pyjamas|FaZe|Apeks|G2|ENCE")
]


def field(maps, name, start, end, url, direct, promoted):
    first = (date.fromisoformat(start) - timedelta(days=90)).isoformat()
    rows = [r for r in maps if first <= r[0][:10] < start]
    index = Counter((t,p) for _,_,teams,fives,_,_ in rows for t in teams for five in fives for p in five)
    lineups, rmr = {}, {}
    series = defaultdict(list)
    for stamp, ev, teams, fives, winner, map_name in rows:
        def affinity(f):
            return sum(index[t,p] for t, five in zip(teams,f) for p in five)
        forward, reverse = affinity(fives), affinity(fives[::-1])
        if forward == reverse:
            continue
        fives = fives if forward > reverse else fives[::-1]
        for t,five in zip(teams,fives):
            lineups[t] = (stamp[:10],tuple(five))
            if 'PGL Major Antwerp 2022 Europe RMR' in ev:
                rmr[t] = (stamp[:10],tuple(five))
        pair = tuple(sorted(teams))
        key = (stamp[:10],ev,pair)
        series[key].append((teams[winner],dict(zip(teams,fives)),map_name))
    samples = []
    for (day,ev,pair), played in series.items():
        if len(set(r[2] for r in played)) != len(played):
            continue
        wins = Counter(r[0] for r in played)
        if wins[pair[0]] == wins[pair[1]]:
            continue
        victor = max(pair,key=wins.get) if all(t in wins for t in pair) else next(iter(wins))
        for t in pair:
            rosters = {r[1][t] for r in played}
            if len(rosters) == 1:
                samples.append((set(next(iter(rosters))),t==victor))

    teams=direct.split('|') + promoted.split('|')
    old = {}
    for t in teams:
        if (name,t)==('PGL Major Antwerp 2022','Cloud9'):
            day,five='2022-04-24',('ax1le','hobbit','interz','nafany','sh1ro')
        elif (name,t)==('PGL Major Antwerp 2022','BIG'):
            day,five=rmr[t]
        else:
            day,five = lineups[t]
        sample = [win for players,win in samples if len(players & set(five))>=3]
        old[t] = dict(name=t, roster=five, lastSeen=day, series=len(sample), wins=sum(sample),
                      points=(sum(sample)+5)/(len(sample)+10))

    # Target results are read after field and rank inputs have been frozen.
    stage = [m for m in maps if m[1] == name and start <= m[0][:10] <= end]
    matches = defaultdict(list)
    for stamp,ev,pair,fives,w,map_name in stage:
        assert set(pair) <= set(teams)
        for t in pair:
            observed=max(fives,key=lambda f:len(set(f)&set(old[t]['roster'])))
            if set(observed)!=set(old[t]['roster']):
                raise ValueError(f'{name} {t}: missing pre-event roster proof {old[t]["roster"]} vs {observed}')
        matches[tuple(sorted(pair))].append(pair[w])
    assert len(matches)==33
    w,l=Counter(),Counter()
    for pair,m in matches.items():
        counts=Counter(m)
        assert counts[pair[0]]!=counts[pair[1]]
        winner=max(pair,key=lambda t:counts[t])
        w[winner]+=1
        l[pair[pair.index(winner)^1]]+=1
    actual=[0 if w[t]==3 and l[t]==0 else 1 if w[t]==3 else 2 if w[t]==0 and l[t]==3 else 3 for t in teams]
    assert [actual.count(c) for c in range(4)]==[2,6,2,6]
    return dict(name=name,date=start,end=end,source='https://www.hltv.org/news/'+url,
                teams=[old[t] for t in teams],actual=actual)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('raw', type=Path)
    parser.add_argument('--check', action='store_true')
    args=parser.parse_args()
    checked(args.raw,MAP_DIGEST)
    maps=read_maps(args.raw)
    stages=[field(maps,*config) for config in FIELDS]
    file=Path(__file__).with_name('legacy_fields.json')
    body=json.dumps(dict(source=SOURCE,sha256=MAP_DIGEST,stages=stages),ensure_ascii=False,indent=2)+'\n'
    if args.check:
        assert file.read_text(encoding='utf8')==body
    else:
        file.write_bytes(body.encode('utf8'))


if __name__=='__main__':
    main()
