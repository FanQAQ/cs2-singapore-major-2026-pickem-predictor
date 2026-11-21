"""Learn how own map picks convert relative to the same core on the same map."""
import argparse
import csv
import gzip
import json
import re
import sys
from collections import defaultdict
from datetime import date
from itertools import combinations, groupby
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
import numpy as np
from scipy.optimize import minimize
from scipy.special import expit

from feature_study.fit import score_bo3
from map_strength.build import entries, map_prior, POOLS, roster, team_for
from strategy_v4.build import calibrated_slope


def load_maps():
    grouped = defaultdict(list)
    with gzip.open(ROOT / 'map_strength/maps.csv.gz', 'rt') as src:
        for r in csv.DictReader(src):
            if r['bo'] == '3':
                grouped[r['event'], r['series']].append(r)
    return grouped


def collect(specs, grouped):
    with gzip.open(ROOT / 'map_veto_data/evidence.json.gz', 'rt') as src:
        vetoes = json.load(src)
    observations = defaultdict(list)
    unique = set()
    for veto in vetoes:
        link = re.search(r'\bEktarr (\d+)\b', veto['rosterSource'])
        if veto['format'] != 'bo3' or not link:
            continue
        event, sid = veto['event'], link[1]
        day, five = date.fromisoformat(veto['date']), roster(veto['roster'])
        cutoff, entrants = specs[event]
        assert 0 <= (cutoff - day).days < 90
        assert team_for(five, entrants) == (veto['team'], veto['overlap'])
        picks = veto['counts'][1]
        assert sum(picks) == 1
        own = POOLS[event][0].split()[picks.index(1)]
        linked = []
        for row in grouped.get((event, sid), ()):
            a, b = (roster(row[k].split('|')) for k in ('fiveA', 'fiveB'))
            if five not in (a, b) or row['day'] != veto['date']:
                continue
            assert not a & b and row['rankDay'] < row['day']
            y = int(row['winnerA'])
            p = map_prior(int(row['pointsA']) - int(row['pointsB']), 3)
            if five == b:
                y, p = 1-y, 1-p
            linked.append((row['map'], y, p))
        if sum(m == own for m, _, _ in linked) != 1:
            continue
        assert len({m for m, _, _ in linked}) == len(linked)
        side = (event, sid, five)
        assert side not in unique
        unique.add(side)
        for m, y, p in linked:
            observations[event].append((day.toordinal(), five, sid, m, m == own, y, p))
    return observations


class History:
    def __init__(self, rows):
        self.rows = rows
        self.by_core = defaultdict(set)
        for i, (_, five, *_) in enumerate(rows):
            for triple in combinations(sorted(five), 3):
                self.by_core[triple].add(i)

    def profile(self, target, day):
        indices = set()
        for triple in combinations(sorted(target), 3):
            indices.update(self.by_core.get(triple, ()))
        groups = defaultdict(lambda: [[0., 0.], [0., 0.]])
        count = wins = 0
        expected = 0.
        for i in sorted(indices):
            stamp, five, _, m, own, y, p = self.rows[i]
            age = day - stamp
            if not 0 < age <= 90:
                continue
            common = len(five & target)
            w = (common/5)**2 * 2**(-age/45)
            bucket = groups[m][int(own)]
            bucket[0] += w
            bucket[1] += w*(y-p)
            if own:
                count += 1
                wins += y
                expected += p
        mass = premium = 0.
        comparable = 0
        for control, pick in groups.values():
            n0, s0 = control
            n1, s1 = pick
            if n0 and n1:
                comparable += 1
                information = n0*n1/(n0+n1)
                mass += information
                premium += information*(s1/n1-s0/n0)
        return dict(picks=count, wins=wins, expected=round(expected, 5),
                    comparableMaps=comparable, effectivePairs=round(mass, 6),
                    value=round(premium/(3+mass), 9))


def combined_series(ratings, grouped):
    """Add independent, settled BO3 series that have no duplicate in the VRS samples."""
    candidates = defaultdict(list)
    scores = defaultdict(list)
    for event, rows in ratings.items():
        for row in rows:
            a, b = (roster(row[k].split('|')) for k in ('lineupA', 'lineupB'))
            candidates[event, row['day'], frozenset([a,b])].append(len(scores[event]))
            scores[event].append((row['day'], a, b, float(row['gap']), int(row['winner']),
                                  score_bo3(row) is not None, 'vrs:'+row['id']))
    for (event, sid), maps in grouped.items():
        first = maps[0]
        stamp = first['day']
        a,b = (roster(first[k].split('|')) for k in ('fiveA','fiveB'))
        wins = losses = 0
        valid = True
        for m in maps:
            ma,mb = (roster(m[k].split('|')) for k in ('fiveA','fiveB'))
            if {a,b} != {ma,mb} or m['day'] != stamp:
                valid = False
                break
            assert m['rankDay'] < stamp
            won = (int(m['winnerA']) == 1) == (a == ma)
            wins += won
            losses += not won
        if valid and max(wins,losses) == 2 and min(wins,losses) < 2:
            matches = candidates.get((event,stamp,frozenset([a,b])),[])
            if matches:
                if len(matches) == 1:
                    index = matches[0]
                    old = scores[event][index]
                    same_winner = bool(old[4]) == ((wins > losses) == (a == old[1]))
                    if same_winner and not old[5]:
                        scores[event][index] = (*old[:5],True,old[6])
                continue
            gap = (int(first['pointsA']) - int(first['pointsB'])) / 100.
            scores[event].append((stamp, a, b, gap, int(wins > losses), True, 'ektarr:'+sid))
    return scores


def training_rows(history, src, cutoff):
    samples, past_gaps, past_labels = [], [], []
    for stamp, batch in groupby(sorted(src, key=lambda r: (r[0],r[-1])), key=lambda r:r[0]):
        day = date.fromisoformat(stamp).toordinal()
        assert day <= cutoff.toordinal()
        slope = calibrated_slope(past_gaps,past_labels)
        cache = {}
        for _, a, b, gap, y, is_bo3, series in batch:
            if is_bo3:
                for five in [a,b]:
                    if five not in cache:
                        cache[five] = history.profile(five,day)
                ap,bp = cache[a],cache[b]
                if ap['comparableMaps'] or bp['comparableMaps']:
                    known_side = int(bool(ap['comparableMaps'])) - int(bool(bp['comparableMaps']))
                    samples.append(((stamp,series), (stamp,slope*gap,ap['value']-bp['value'],known_side,y)))
            past_gaps.append(gap)
            past_labels.append(y)
    return samples


def fit(samples):
    if not samples:
        return 0.,0.
    z,delta,indicator,y = np.asarray([s[1:] for s in samples]).T
    x = np.stack((delta,indicator),axis=1)
    precision = np.array([1.,4.])

    def loss(coef):
        logits = z + x @ coef
        return (np.sum(np.logaddexp(0.,logits)-y*logits) + .5*np.dot(precision,coef**2),
                x.T @ (expit(logits)-y) + precision*coef)

    fit_result = minimize(loss,[0.,0.],jac=True,bounds=[(-2.,2.),(-2.,2.)],method='L-BFGS-B',
                          options={'ftol': 1e-12})
    if not fit_result.success:
        raise ValueError(fit_result.message)
    return tuple(float(round(v,9)) for v in fit_result.x)


def build():
    specs = entries()
    grouped = load_maps()
    obs = collect(specs,grouped)
    ratings = defaultdict(list)
    with gzip.open(ROOT/'strategy_v4/series.csv.gz', 'rt') as src:
        for row in csv.DictReader(src):
            ratings[row['event']].append(row)
    series_rows = combined_series(ratings,grouped)
    training = {}
    result = {}
    for event, (cutoff, entrants) in sorted(specs.items(), key=lambda kv: kv[1][0]):
        history = History(obs[event])
        for series, sample in training_rows(history, series_rows[event], cutoff):
            assert series not in training, 'Repeated cross-window training series'
            training[series] = sample
        accepted = list(training.values())
        assert all(s[0] <= cutoff.isoformat() for s in accepted)
        teams = {name: history.profile(five, cutoff.toordinal()+1) for name, five in entrants.items()}
        coefficient, availability = fit(accepted)
        result[event] = dict(asOf=cutoff.isoformat(), teams=teams, trainingSeries=len(accepted),
                             lastTraining=max((s[0] for s in accepted), default=None),
                             coefficient=coefficient, availabilityCoefficient=availability,
                             trainingBoth=sum(s[-2] == 0 for s in accepted),
                             pickTeams=sum(t['picks'] > 0 for t in teams.values()),
                             comparableTeams=sum(t['comparableMaps'] > 0 for t in teams.values()))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    result = build()
    data = json.dumps(result, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n'
    output = HERE/'events.json'
    if parser.parse_args().check:
        assert output.read_text() == data
    else:
        output.write_text(data)
    for name, row in result.items():
        print(name, row['pickTeams'], row['comparableTeams'], row['trainingSeries'], row['coefficient'])
