"""Extract actual named maps, their verified lineups and strictly previous VRS points."""
import argparse
import bisect
import csv
import gzip
import io
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from build import HERE, POOLS, entries, team_for
from history24 import build as vintage
from datajob import build_features as ratings
from strategy_v4.prepare import map_sides

COLS = ['event','day','series','gameId','map','bo','fiveA','fiveB','rankDay','pointsA','pointsB','winnerA']


def validated(rows):
    first = rows[0]
    if first['bestOf'] not in ('1','1.0','3','3.0'):
        return None
    if 'showmatch' in (first['team1']+first['team2']+first['tournament']).lower():
        return None
    bo = int(float(first['bestOf']))
    fives = map_sides(first)
    if not fives:
        return None
    day = first['datetime'][:10]
    winner_by_map = []
    names, ids = set(), set()
    final = (first['score1_match'],first['score2_match'])
    for row in rows:
        name, gid = row['map_name'], row['game_id']
        if (not name or not gid or name in names or gid in ids or row['datetime'][:10]!=day
                or map_sides(row)!=fives or row['bestOf']!=first['bestOf']
                or (row['score1_match'],row['score2_match'])!=final):
            return None
        try:
            a,b = int(float(row['score1_game'])),int(float(row['score2_game']))
        except ValueError:
            return None
        if a==b or min(a,b)<0 or max(a,b)<13:
            return None
        names.add(name)
        ids.add(gid)
        winner_by_map.append((gid, name, int(a>b)))
    wins = sum(y for _,_,y in winner_by_map)
    scores = (wins,len(rows)-wins)
    try:
        if scores!=tuple(int(float(x)) for x in final) or max(scores)!=1+bo//2 or scores[0]==scores[1]:
            return None
    except ValueError:
        return None
    return day, bo, fives, winner_by_map


def extract(source, early_cache):
    specs = entries()
    # Verify the frozen archive against the shared pinned SHA-256.
    by_id = defaultdict(list)
    gids = Counter()
    for row in vintage.load_series(source):
        if row['is_total']=='False' and row['match_id']:
            by_id[row['match_id']].append(row)
            gids[row['game_id']] += 1
    tables = vintage.load_tables(early_cache)
    months = sorted({d for e,(cutoff,_) in specs.items() if e not in vintage.CUTOFF
                     for d in ratings.month_snapshots(cutoff)})
    for d in months:
        tables[d.isoformat()] = ratings.parse_standings(ratings.snapshot_path(d)).rows
    standings = {day:vintage.Ranking(rows) for day,rows in tables.items()}
    days = sorted(standings)
    output = []
    for mid, rows in by_id.items():
        valid = validated(rows)
        if not valid:
            continue
        day, bo, fives, games = valid
        idx = bisect.bisect_left(days,day)-1
        if idx < 0 or any(gids[gid]!=1 for gid,_,_ in games):
            continue
        rank_day = days[idx]
        ranked = [standings[rank_day].lookup(five)[0] for five in fives]
        if not all(ranked) or ranked[0] is ranked[1]:
            continue
        for event,(cutoff, entrants) in specs.items():
            age = (cutoff-date.fromisoformat(day)).days
            if not 0 <= age < 90 or not any(team_for(five, entrants) for five in fives):
                continue
            for gid, name, winner in games:
                if name in POOLS[event][0].split():
                    output.append((event, day, mid, gid, name, bo,
                                   *('|'.join(sorted(five)) for five in fives), rank_day,
                                   *(row['points'] for row in ranked), winner))
    buf = io.StringIO()
    writer = csv.writer(buf,lineterminator='\n')
    writer.writerow(COLS)
    writer.writerows(sorted(output))
    return gzip.compress(buf.getvalue().encode(),mtime=0)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--maps',type=Path,required=True)
    parser.add_argument('--historic-ranking-cache',type=Path,required=True)
    parser.add_argument('--check',action='store_true')
    args = parser.parse_args()
    product = extract(args.maps,args.historic_ranking_cache)
    path = HERE/'maps.csv.gz'
    if args.check:
        if gzip.decompress(product)!=gzip.decompress(path.read_bytes()):
            raise SystemExit('Input changed')
    else:
        path.write_bytes(product)
