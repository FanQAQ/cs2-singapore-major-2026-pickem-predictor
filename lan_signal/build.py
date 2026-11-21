"""Fit the like-for-like LAN increment on matches available before each Stage 1."""
import argparse
import csv
import gzip
import json
import math
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from major_form.contrast import Identities, expectation

WINDOW = 120
HALF_LIFE = 45
BANDWIDTH = .18
PRIOR = 2.0
TRAIN_DAYS = 365


@dataclass(frozen=True)
class Game:
    match: int
    day: int
    tournament: tuple
    best_of: int
    a: frozenset
    b: frozenset
    p: float
    won: int


def iso(day):
    return date.fromordinal(day).isoformat()


def ordinal(day):
    return date.fromisoformat(day).toordinal()


def read_games():
    identities = Identities()
    games = {}

    def add(match, day, tournament, bo, sides, points, won):
        if sides[0] & sides[1] or min(map(len, sides)) < 3:
            return
        assert bo in (1, 3) and won in (0, 1) and all(points)
        g = Game(match, ordinal(day), (day[:4], tournament), bo, *sides, expectation(*points), won)
        if match in games:
            # Preserve the original edition-independent observation when both sources saw the series.
            other = games[match]
            assert other.day == g.day and other.best_of == g.best_of and other.tournament == g.tournament
            assert ((other.a <= g.a and other.b <= g.b and other.won == g.won)
                    or (other.a <= g.b and other.b <= g.a and other.won == 1-g.won)), (other,g)
        else:
            games[match] = g

    with gzip.open(ROOT/'region_risk/evidence.csv.gz', 'rt') as f:
        for row in csv.DictReader(f):
            assert row['snapshot'] < row['day'] and min(int(row[k]) for k in ('overlapA','overlapB')) >= 3
            assert len(set(row['a'].split('|')) | set(row['b'].split('|'))) == 10
            sides = [identities.roster(row[k].split('|')) for k in ('a','b')]
            add(int(row['id']), row['day'], row['tournament'], int(row['bo']), sides,
                [int(row[k]) for k in ('pointsA','pointsB')], int(row['y']))

    venues = json.loads((HERE/'late_venues.json').read_text())
    for row in json.loads(gzip.decompress((ROOT/'refresh_close/observations.json.gz').read_bytes())):
        venue = venues.get(str(row['id']))
        rank = row.get('rank')
        if not venue or not rank:
            continue
        # The only Major-labelled offline fixtures eligible as evidence are its prior qualifiers.
        if 'major' in venue.casefold() and 'rmr' not in venue.casefold():
            continue
        assert rank['day'] < row['day']
        sides = [identities.roster(players, club) for players, club in zip(row['lineups'], row['teams'])]
        rank_sides = [identities.roster(players, club) for players, club in zip(rank['lineups'], row['teams'])]
        if any(len(s & r) < 3 for s, r in zip(sides, rank_sides)):
            continue
        maps_won = sum(a > b for _, a, b in row['maps'])
        add(row['id'], row['day'], venue, row['bo'], sides, rank['points'], int(2*maps_won > len(row['maps'])))
    return sorted(games.values(), key=lambda g: (g.day, g.match)), identities


class History:
    def __init__(self, games):
        self.by_core = defaultdict(list)
        for g in games:
            for side, roster in enumerate((g.a, g.b)):
                for core in combinations(sorted(roster), 3):
                    self.by_core[core].append((g, side))

    def observations(self, roster, cutoff, excluded=None):
        seen = {}
        for core in combinations(sorted(roster), 3):
            for g, side in self.by_core.get(core, ()):
                if g.match in seen or g.tournament == excluded or not cutoff - WINDOW < g.day <= cutoff:
                    continue
                shared = len(roster & (g.b if side else g.a))
                w = .5 ** ((cutoff - g.day)/HALF_LIFE) * (shared/5) ** 2
                seen[g.match] = (g, g.best_of, 1-g.p if side else g.p, 1-g.won if side else g.won, w)
        return [seen[mid] for mid in sorted(seen)]


def profile(history, current_p, best_of):
    if len(history) < 2:
        return 0.
    numerator, info = 0., PRIOR
    for _, bo, old_p, outcome, age_and_core in history:
        weight = age_and_core * math.exp(-.5 * ((old_p-current_p)/BANDWIDTH)**2)
        if bo != best_of:
            weight *= .35
        numerator += weight*(outcome-old_p)
        info += weight*old_p*(1-old_p)
    return numerator/info


def training(games, history):
    first = {}
    for g in games:
        first.setdefault(g.tournament, g.day)
    observations = []
    for g in games:
        # Exclude earlier results of the same event, including matches played on a previous day.
        cutoff = first[g.tournament]-1
        left = profile(history.observations(g.a, cutoff, g.tournament), g.p, g.best_of)
        right = profile(history.observations(g.b, cutoff, g.tournament), 1-g.p, g.best_of)
        if left != right:
            observations.append((g.day, g.tournament, g.p, g.won, left-right))
    return observations


def fit(observations, end):
    rows = [r for r in observations if end-TRAIN_DAYS < r[0] <= end]
    counts = Counter(row[1] for row in rows)
    # Ridge (precision 2). Give long fixtures at most 12 full-weight training series per edition.
    beta = 0.
    for _ in range(30):
        score, info = -2*beta, 2.
        for _, key, p, y, x in rows:
            ew = min(1., 12/counts[key])
            estimate = 1/(1+((1-p)/p)*math.exp(-beta*x))
            score += ew*x*(y-estimate)
            info += ew*x*x*estimate*(1-estimate)
        update = min(2., max(0., beta+score/info))
        if abs(update-beta) < 1e-9:
            break
        beta = update
    return round(beta, 8), len(rows), len(counts)


def generate():
    games, identities = read_games()
    history = History(games)
    examples = training(games, history)
    anchors = json.loads((ROOT/'region_risk/anchor.json').read_text())
    cutoffs = json.loads((ROOT/'refresh_close/events.json').read_text())
    output = {}
    for event, anchor in anchors.items():
        final = cutoffs[event]
        assert anchor['asOf'] == final['baseAsOf'] <= final['asOf'] < final['stageStart']
        end = ordinal(final['asOf'])
        beta, trained, tournaments = fit(examples, end)
        teams = {}
        for name, team in anchor['teams'].items():
            roster = identities.roster(team['roster'], name)
            evidence = history.observations(roster, end)
            observations = [[bo, round(p, 8), y, round(w, 8)] for _, bo, p, y, w in evidence]
            teams[name] = dict(roster=team['roster'], n=len(evidence), bo1=sum(r[1]==1 for r in evidence),
                               latest=max((iso(r[0].day) for r in evidence), default=None),
                               rmr=sum('rmr' in r[0].tournament[1].casefold() for r in evidence),
                               observations=observations)
        output[event] = dict(asOf=final['asOf'], stageStart=final['stageStart'], weight=beta,
                             trainN=trained, trainEvents=tournaments,
                             covered=sum(t['n']>=2 for t in teams.values()), teams=teams)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = generate()
    text = json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(',',':'))+'\n'
    filepath = HERE/'events.json'
    if args.check:
        assert filepath.read_text() == text
    else:
        filepath.write_text(text)
    for key, value in result.items():
        print(key, value['asOf'], value['covered'], value['trainN'], value['weight'])
