"""Rebuild four pre-CS2 Major cohorts and a separate pre-Copenhagen CS2 transfer check."""
import argparse
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from statistics import mean

from build_history import AMBIGUOUS, COUNTRIES, SOURCES, normalize
from features import snapshot

HERE = Path(__file__).resolve().parent
GIT_SHA = 'ce8a5f242a768c5698f8068828eeedc4fc134db1'
SOURCE = 'https://github.com/tedtay/CS-GO-Pro-Matches-Comprehensive-Dataset/blob/' + GIT_SHA + '/csgo_pro_games_data.csv'
MAP_DIGEST = '963154fa2069c5b0a63de48f0d908373a155363d56d03ad4d62bcdd3c22f7057'
STAGES = {
    'PGL Major Stockholm 2021': '2021-10-26',
    'PGL Major Antwerp 2022': '2022-05-09',
    'IEM Rio Major 2022': '2022-10-31',
    'BLAST.tv Paris Major 2023': '2023-05-08',
}
# These two fives were announced after their clubs’ last pre-Major match.
ANNOUNCED = {
    ('PGL Major Stockholm 2021', 'Astralis'): ('2021-10-13',
        'dupreeh gla1ve lucky magisk xyp9x',
        'https://www.hltv.org/news/32552/gla1ve-returns-for-pgl-major-stockholm-bubzkji-out'),
    ('PGL Major Stockholm 2021', 'Virtus.pro'): ('2021-10-22',
        'buster fl1t jame qikert yekindar',
        'https://www.hltv.org/news/32606/virtuspro-replace-sanji-with-fl1t-for-pgl-major'),
}


def checked(file, sha):
    if hashlib.sha256(file.read_bytes()).hexdigest() != sha:
        raise ValueError('Source checksum mismatch for ' + str(file))


def official_fives(path):
    checked(path, SOURCES['csgo'][3])
    players = defaultdict(lambda: defaultdict(dict))
    with path.open(encoding='utf-8-sig') as f:
        for row in csv.DictReader(f, delimiter=';'):
            stage = row['event'].removesuffix(' Challengers Stage')
            if row['event'] == stage or stage not in STAGES or int(row['maps']) < 1:
                continue
            handle = normalize(row['name'])
            full = handle + '@' + COUNTRIES[row['nationality']] if handle in AMBIGUOUS else handle
            players[stage][row['team']][handle] = full
    return players


def read_maps(source):
    checked(source, MAP_DIGEST)
    data = []
    with source.open(encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            if not '2021-04' <= row['datetime'][:7] <= '2023-05':
                continue
            teams = (row['team1'],row['team2'])
            fives = tuple(tuple(sorted(normalize(row[f'team{s}_p{i}_name']) for i in range(1,6))) for s in (1,2))
            if any(not all(p) or len(set(p)) != 5 for p in fives) or set(fives[0]) & set(fives[1]):
                continue
            # Named team/map score in the archive is independent of the player-table order.
            diff = int(row['team1_rounds']) - int(row['team2_rounds'])
            if teams[0] != teams[1] and diff:
                data.append((row['datetime'],row['event_name'],teams,fives,0 if diff>0 else 1,row['map_name_short']))
    return sorted(data)


def rating_name(player, team):
    # Keep ambiguous handles on different clubs distinct in pre-event strength estimation.
    return player + '@' + team if player in AMBIGUOUS else player


def frozen_strength(maps, cutoff):
    first = (date.fromisoformat(cutoff)-timedelta(days=180)).isoformat()
    prior = [m for m in maps if first <= m[0][:10] < cutoff]
    # In this CSV the player tables on a map can be ordered independently of
    # the two score labels. Resolve the assignment using only this pre-event window.
    co = Counter((t,p) for _,_,teams,fives,_,_ in prior for t in teams for five in fives for p in five)
    ratings = defaultdict(float)
    exact = {}
    used = 0
    for stamp,_,teams,fives,winner,_ in prior:
        def association(order):
            return sum(co[t,p] for t,five in zip(teams,order) for p in five)
        fwd,rev = association(fives),association(fives[::-1])
        if fwd == rev:
            continue
        ordered = fives if fwd > rev else fives[::-1]
        for team,five in zip(teams,ordered):
            exact[(team,five)] = stamp[:10]
        a,b = [[rating_name(p,t) for p in five] for t,five in zip(teams,ordered)]
        delta = mean(ratings[p] for p in a)-mean(ratings[p] for p in b)
        change = 0.1 * (int(winner==0)-1/(1+math.exp(-delta)))
        for player in a:
            ratings[player] += change
        for player in b:
            ratings[player] -= change
        used += 1
    return ratings,exact,used


def legacy_stage(name, start, maps, rosters, history):
    ratings, evidence, count = frozen_strength(maps,start)
    label = name+' Challengers Stage'
    lines = [row for row in maps if row[1]==label]
    assert len(rosters) == 16 and all(len(rs)==5 for rs in rosters.values())
    assert min(row[0] for row in lines)[:10]==start
    five = {t:tuple(sorted(rs)) for t,rs in rosters.items()}
    members = {t:list(rs.values()) for t,rs in rosters.items()}
    prior_evidence = {t:evidence.get((t,r)) for t,r in five.items()}
    announcements = {}
    for t in rosters:
        if (name,t) in ANNOUNCED:
            when,announced,url = ANNOUNCED[name,t]
            assert when < start and tuple(sorted(announced.split())) == five[t]
            prior_evidence[t] = when
            announcements[t] = url
    # Exclude an unverified five rather than allowing its first appearance at the
    # target Major to supply a forecast feature. Score outcomes remain complete.
    prior = snapshot(history,[dict(name=t,roster=members[t]) for t in members],start)
    assert prior['latest'] < start
    team_record = {}
    for t,players in five.items():
        team_record[t] = dict(roster=members[t],verifiedOn=prior_evidence[t],
                              strength=mean(ratings[rating_name(p,t)] for p in players),
                              vector=prior['teams'][t]['vector'])
    series = defaultdict(list)
    unique_maps = set()
    for stamp,_,teams,fives,w,map_name in lines:
        map_key=(tuple(sorted(teams)), map_name)
        assert map_key not in unique_maps, (name, map_key)
        unique_maps.add(map_key)
        assert {five[team] for team in teams} == set(fives), (name,teams,fives)
        pair = tuple(sorted(teams))
        series[pair].append(teams[w])
    assert len(series)==33
    rows = []
    format_counts=Counter()
    for (a,b),outcomes in series.items():
        score = Counter(outcomes)
        assert max(score.values()) in (1,2) and score[a]!=score[b]
        best_of = 1 if max(score.values())==1 else 3
        assert len(outcomes)<=best_of
        format_counts[best_of]+=1
        w,l=(a,b) if score[a]>score[b] else (b,a)
        rows.append(dict(w=w,l=l,bo=best_of))
    assert format_counts == {1:20,3:13}
    wins=Counter(r['w'] for r in rows)
    losses=Counter(r['l'] for r in rows)
    assert Counter((wins[t],losses[t]) for t in rosters)=={(3,0):2,(3,1):3,(3,2):3,(2,3):3,(1,3):3,(0,3):2}
    return dict(name=name,start=start,end=max(r[0] for r in lines)[:10],lastPriorMajor=prior['latest'],
                preEventMaps=count,announcements=announcements,teams=team_record,series=rows)


def transfer_check(history):
    # These are non-Major CS2 series with pre-match VRS and both verified lineups.
    # Stage cutoffs, dates and labels are kept so calibration can reserve a last block.
    filename=HERE.parent/'history24'/'fit_examples.csv'
    result=[]
    for row in csv.DictReader(filename.open()):
        if row['event'] != 'copenhagen':
            continue
        cutoff=row['date']
        assert '2023-09-27'<=cutoff<'2024-03-17'
        slots = ['A','B']
        teams = [dict(name=row['team'+s],roster=row['lineup'+s].split('|')) for s in slots]
        exp=snapshot(history,teams,cutoff)
        assert exp['latest']<cutoff
        a,b=[exp['teams'][t['name']]['vector'] for t in teams]
        if a is not None and b is not None:
            result.append(dict(date=cutoff,match=row['matchInSnapshot'],y=int(row['y']),
                               vrs=float(row['vrsPer100']),x=[i-j for i,j in zip(a,b)]))
    assert len({r['match'] for r in result})==len(result)
    return sorted(result,key=lambda r:(r['date'],r['match']))


def build(args):
    history = json.loads((HERE/'history.json').read_text())
    maps = read_maps(args.maps)
    official=official_fives(args.rosters)
    events=[legacy_stage(n,d,maps,official[n],history) for n,d in STAGES.items()]
    out=dict(source=SOURCE,sourceCommitDate='2024-01-31',rosterSourceDate='2023-07-07',rosterSource='https://www.kaggle.com/datasets/matheusnbrega/players-stats-all-csgo-majors/versions/1',
             events=events,transfer=transfer_check(history))
    args.output.write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
    for e in events:
        excluded=[n for n,t in e['teams'].items() if not t['verifiedOn'] or not t['vector']]
        print(e['name'],len(e['series']),e['preEventMaps'], 'unverified',excluded)
    print('CS2 transfer check',len(out['transfer']))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('maps',type=Path)
    p.add_argument('rosters',type=Path)
    p.add_argument('--output',type=Path,default=HERE/'legacy.json')
    build(p.parse_args())
