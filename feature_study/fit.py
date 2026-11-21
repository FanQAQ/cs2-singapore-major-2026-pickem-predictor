"""Test one extra BO3 feature. Major results are never read while fitting."""
import argparse
import csv
import gzip
import json
import sys
from collections import defaultdict
from datetime import date
from functools import lru_cache
from itertools import combinations, groupby
from pathlib import Path

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import expit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from strategy_v4 import build as v4


def score_bo3(row):
    """Return one observation for the loser of a completed, linked BO3."""
    scores = [tuple(map(int, x.split('-'))) for x in row['scores'].split('|')] if row['scores'] else []
    if len(scores) < 2:
        return None
    wins = sum(a > b for a, b in scores)
    losses = len(scores) - wins
    if any(a == b for a, b in scores) or sorted([wins, losses]) not in ([0, 2], [1, 2]):
        raise ValueError(f"Invalid completed BO3: {row['id']}")
    a_won = int(row['winner'])
    assert bool(a_won) == (wins > losses)
    return int(len(scores) == 3)


class LossHistory:
    def __init__(self):
        self.examples = []
        self.triples = defaultdict(list)

    def add(self, day, five, difference):
        index = len(self.examples)
        self.examples.append((day, five, difference))
        for triple in combinations(sorted(five), 3):
            self.triples[triple].append(index)

    def profile(self, day, five):
        ids = set()
        for triple in combinations(sorted(five), 3):
            ids.update(self.triples.get(triple, ()))
        weighted = weight = 0.
        n = 0
        for index in sorted(ids):
            prev, lineup, difference = self.examples[index]
            age = day - prev
            if 0 < age <= 90:
                w = 2**(-age / 45) * len(lineup & five) / 5
                weighted += w * difference
                weight += w
                n += 1
        return dict(residual=round(weighted / (weight + 8), 10), n=n,
                    effectiveN=round(weight, 6))


def salvage_rate(examples):
    """Probability a losing side won a map, given its own pre-match VRS gap."""
    if not examples:
        return (0., 0.)
    g, y = np.asarray(examples).T
    X = np.stack((np.ones(len(g)), g), axis=1)
    beta = np.zeros(2)
    # Both coefficients have fixed ridge precision 5.
    for _ in range(20):
        p = expit(X @ beta)
        gradient = X.T @ (y - p) - 5 * beta
        hessian = X.T @ ((p*(1-p))[:, None]*X) + 5*np.eye(2)
        step = np.linalg.solve(hessian, gradient)
        beta += step
        if np.max(np.abs(step)) < 1e-9:
            break
    return beta


def learn_effect(rows):
    if not rows:
        return 0.
    z, diff, y = np.asarray(rows).T
    def loss(b):
        return np.sum(np.logaddexp(0., z + b * diff) - y*(z + b * diff)) + .5*b*b
    return round(float(minimize_scalar(loss, bounds=(-2., 2.), method='bounded').x), 10)


def event_profiles(rows, cohort, stage):
    cut = date.fromisoformat(stage['asOf']).toordinal()
    observed = LossHistory()
    general = v4.AppearanceHistory()
    baseline_x, baseline_y = [], []
    gaps, all_y, conditional_examples, incremental_rows = [], [], [], []
    margin_xy = margin_xx = 0.
    bo3_total = 0
    first = last = None
    for stamp, batch_iter in groupby(sorted(rows,key=lambda r:(r['day'],r['id'])), key=lambda r:r['day']):
        day = date.fromisoformat(stamp).toordinal()
        assert day <= cut
        batch = list(batch_iter)
        base_slope = v4.calibrated_slope(gaps, all_y)
        round_slope = margin_xy / (margin_xx+1)
        intercept, slope = salvage_rate(conditional_examples)
        base_weights = (v4.fit(baseline_x, baseline_y, 15) if len(baseline_x)>=35
                        else [v4.GAP_PRIOR,0.,0.,0.,0.])
        outcomes = []
        designs = []
        @lru_cache(maxsize=None)
        def stats(five):
            return general.profile(day, five)
        @lru_cache(maxsize=None)
        def losses(five):
            return observed.profile(day, five)
        for row in batch:
            a = v4.lineup(row['lineupA'].split('|'))
            b = v4.lineup(row['lineupB'].split('|'))
            assert not a & b
            g, y = float(row['gap']), int(row['winner'])
            salvage = score_bo3(row)
            if row['id'] in cohort:
                assert 0 <= cut-day < 85
                x = v4.design(g, base_slope, stats(a), stats(b))
                designs.append((x, y))
                if salvage is not None:
                    bo3_total += 1
                    ap,bp = losses(a), losses(b)
                    if ap['n'] and bp['n']:
                        incremental_rows.append((np.dot(x,base_weights),ap['residual']-bp['residual'],y))
                        first = first or stamp
                        last = stamp
            outcomes.append((a,b,g,y,salvage,v4.margin(row['scores'])))
        # Release observations after all predictions for the day are built.
        for x,y in designs:
            baseline_x.append(x)
            baseline_y.append(y)
        for a,b,g,y,salvage,margin in outcomes:
            if salvage is not None:
                loser = b if y else a
                loser_gap = -g if y else g
                p = float(expit(intercept + slope*loser_gap))
                observed.add(day,loser,salvage-p)
                conditional_examples.append((loser_gap,salvage))
            expected = float(expit(base_slope*g))
            margin_error = None
            if margin is not None:
                margin_error = margin - float(np.clip(round_slope*g,-1.,1.))
                margin_xx += g*g
                margin_xy += g*margin
            general.add(day,a,y,expected,margin_error)
            general.add(day,b,1-y,1-expected,-margin_error if margin is not None else None)
            gaps.append(g); all_y.append(y)
    assert len(baseline_x)==len(cohort)
    return dict(asOf=stage['asOf'],coefficient=learn_effect(incremental_rows),
                trainingBO3=bo3_total,trainingBoth=len(incremental_rows),firstTraining=first,lastTraining=last,
                teams={name:observed.profile(cut+1,v4.lineup(t['roster'])) for name,t in stage['teams'].items()})


def generate():
    stages = json.loads((ROOT/'region_risk/anchor.json').read_text())
    observations = defaultdict(list)
    with gzip.open(ROOT/'strategy_v4/series.csv.gz','rt') as handle:
        for row in csv.DictReader(handle):
            observations[row['event']].append(row)
    ids = defaultdict(set)
    for filename in ('history24/fit_examples.csv','fitting/fit_examples.csv'):
        with (ROOT/filename).open() as handle:
            for row in csv.DictReader(handle):
                ids[row['event']].add(row['matchInSnapshot'])
    return {event:event_profiles(observations[event],ids[event],stage) for event,stage in stages.items()}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    result = generate()
    data = json.dumps(result,separators=(',',':'),ensure_ascii=False,allow_nan=False)+'\n'
    path = HERE/'profiles.json'
    if parser.parse_args().check:
        assert path.read_text()==data
    else:
        path.write_text(data)
    for event,study in result.items():
        print(event,study['trainingBO3'],study['trainingBoth'],study['coefficient'],
              sum(t['n']>0 for t in study['teams'].values()))
