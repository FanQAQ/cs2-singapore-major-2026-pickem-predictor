"""Join dated, roster-verified VRS series to complete sets of public map scores."""
import argparse
import csv
import gzip
import io
import re
from collections import Counter, defaultdict
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from history24 import build as vintage

COLUMNS = ['event', 'day', 'id', 'lineupA', 'lineupB', 'gap', 'winner', 'mapSeriesId', 'scores']
OUTPUT = HERE / 'series.csv.gz'


def map_sides(row):
    handles = []
    ids = []
    for side in (1, 2):
        names = set()
        for number in range(1, 6):
            field = f'team{side}_player{number}'
            name = vintage.canonical(re.split(r'\s*[,(/]', row[field], maxsplit=1)[0])
            player_id = row[field + '_id']
            if not name or not player_id or player_id == '0':
                return None
            names.add(name)
            ids.append(player_id)
        handles.append(frozenset(names))
    if any(len(team) != 5 for team in handles) or len(set(ids)) != 10 or handles[0] & handles[1]:
        return None
    return tuple(handles)


def complete_scores(catalog):
    """Connect score and roster orientations, retaining all maps in a complete BO."""
    series = defaultdict(list)
    for row in catalog:
        if row['is_total'] == 'False' and row['match_id']:
            series[row['match_id']].append(row)
    index = defaultdict(list)
    for match, maps in series.items():
        first = maps[0]
        if first['bestOf'] not in ('1', '1.0', '3', '3.0'):
            continue
        best_of = int(float(first['bestOf']))
        fives = map_sides(first)
        if not fives:
            continue
        day = first['datetime'][:10]
        scores = []
        games = set()
        final = (first['score1_match'], first['score2_match'])
        for row in maps:
            if (not row['game_id'] or row['game_id'] in games or row['datetime'][:10] != day
                    or map_sides(row) != fives or row['bestOf'] != first['bestOf']
                    or (row['score1_match'], row['score2_match']) != final):
                break
            try:
                rounds = (int(float(row['score1_game'])), int(float(row['score2_game'])))
            except ValueError:
                break
            if max(rounds) < 13 or min(rounds) < 0 or rounds[0] == rounds[1]:
                break
            scores.append(rounds)
            games.add(row['game_id'])
        else:
            wins = sum(a > b for a, b in scores)
            result = (wins, len(scores) - wins)
            try:
                reported = tuple(int(float(v)) for v in final)
            except ValueError:
                continue
            if (result != reported or max(result) != best_of // 2 + 1
                    or result[0] == result[1]):
                continue
            a, b = fives
            won = int(result[0] > result[1])
            index[day, a, b, won].append((match, scores))
            index[day, b, a, 1 - won].append((match, [(q, p) for p, q in scores]))
    return index


def normalized(row, event, historic):
    def players(side):
        return tuple(sorted(vintage.canonical(n) for n in row['lineup' + side].split('|')))
    if historic:
        gap = float(row['vrsPer100'])
        key = row['matchInSnapshot']
    else:
        gap = (int(row['pointsA']) - int(row['pointsB'])) / 100
        key = row['id']
    return [event, row['date'], str(key), '|'.join(players('A')), '|'.join(players('B')),
            gap, int(row['y'])]


def prepare(raw, cache):
    catalog = vintage.load_series(raw)
    scores = complete_scores(catalog)
    ranking = {d: vintage.Ranking(t) for d, t in vintage.load_tables(cache).items()}
    by_event = defaultdict(list)
    for event, cutoff in vintage.CUTOFF.items():
        for row in vintage.verified(catalog, ranking, cutoff):
            by_event[event].append(normalized(row, event, True))
    with (ROOT / 'styles_model' / 'series.csv').open() as source:
        for row in csv.DictReader(source):
            by_event[row['event']].append(normalized(row, row['event'], False))

    out = io.StringIO()
    csvout = csv.writer(out, lineterminator='\n')
    csvout.writerow(COLUMNS)
    for event, history in by_event.items():
        entries = []
        ids = Counter()
        for record in sorted(history, key=lambda r: (r[1], r[2])):
            _, day, key, left, right, _, y = record
            key_found = (day, frozenset(left.split('|')), frozenset(right.split('|')), y)
            links = scores.get(key_found, [])
            if event in vintage.CUTOFF:
                links = [link for link in links if link[0] == key]
            match, maps = links[0] if len(links) == 1 else ('', [])
            ids[match] += 1
            entries.append((record, match, maps))
        for record, match, maps in entries:
            unique = bool(match) and ids[match] == 1
            results = '|'.join(f'{a}-{b}' for a, b in maps) if unique else ''
            csvout.writerow([*record, match if unique else '', results])
    return gzip.compress(out.getvalue().encode('utf-8'), mtime=0)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--maps', type=Path, required=True, help='cs2_all_tiers_games.csv, Ektarr v11')
    parser.add_argument('--cache', type=Path, default=ROOT/'history24'/'cache')
    args = parser.parse_args()
    OUTPUT.write_bytes(prepare(args.maps, args.cache))
