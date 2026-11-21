"""Fit the Stage 1 direct-encounter term with a strictly temporal holdout.

Requires NumPy and SciPy. All model inputs are bundled CSVs, and every date is in UTC.
"""
import csv
import datetime as dt
import json
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import expit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'fitting'))
from fit import fit
from build_features import roster_key

LOOKBACK = dt.timedelta(days=90)
PRIOR = 8
PRIOR_SD = 2.0

def name_key(s):
    return ''.join(s.casefold().split())

@dataclass
class Match:
    date: dt.date
    players_a: set
    players_b: set
    y: int
    expected: float

def stats(series, day, a, b, include_day=False):
    """Score both historical orientations by actual rosters, even across club transfers."""
    if len(a) != 5 or len(b) != 5 or a & b:
        return 0, 0, 0.
    cutoff = day - LOOKBACK
    n, wins, expected = 0, 0, 0.
    for game in series:
        if not cutoff < game.date <= day or (game.date == day and not include_day):
            continue
        if len(a & game.players_a) >= 3 and len(b & game.players_b) >= 3:
            result, probability = game.y, game.expected
        elif len(a & game.players_b) >= 3 and len(b & game.players_a) >= 3:
            result, probability = 1 - game.y, 1 - game.expected
        else:
            continue
        n += 1
        wins += result
        expected += probability
    return n, wins, expected

def history_rows(rows):
    series, by_id = [], {}
    for r in rows:
        players_a, players_b = (roster_key(r[col].split('|')) for col in ('lineupA', 'lineupB'))
        if not players_a or not players_b or players_a & players_b:
            continue
        key = (name_key(r['a']), name_key(r['b']))
        if key[0] >= key[1]:
            raise ValueError('Series lacks canonical ordering')
        expected = 1 / (1 + 10 ** ((int(r['pointsB']) - int(r['pointsA'])) / 400))
        match = Match(dt.date.fromisoformat(r['date']), players_a, players_b, int(r['y']), expected)
        identity = (r['date'], r['id'])
        if identity in by_id:
            raise ValueError('Duplicate series ' + str(identity))
        series.append(match)
        by_id[identity] = (key, match)
    return series, by_id

def score_loss(y, logodds):
    return float(np.mean(np.logaddexp(0, logodds) - y * logodds))

def fit_weight(y, baseline, h):
    # Nonnegative coefficient: a lack of persistent signal returns to the underlying win model.
    def penalized(coef):
        return score_loss(y, baseline + coef * h) * len(y) + .5 * (coef / PRIOR_SD) ** 2
    sol = minimize_scalar(penalized, bounds=(0, 20), method='bounded')
    if not sol.success:
        raise RuntimeError(sol.message)
    return float(sol.x) if penalized(sol.x) < penalized(0) - 1e-9 else 0.

def features(rows, series, by_id):
    y, x, h, days, counts = [], [], [], [], []
    for row in rows:
        target = by_id.get((row['date'], row['matchInSnapshot']))
        n = wins = expect = 0
        if target is not None:
            key, game = target
            fit_a, fit_b = (roster_key(row[k].split('|')) for k in ('lineupA', 'lineupB'))
            if (key != (name_key(row['teamA']), name_key(row['teamB']))
                    or game.players_a != fit_a or game.players_b != fit_b or game.y != int(row['y'])):
                raise ValueError('Series join failed')
            n, wins, expect = stats(series, game.date, game.players_a, game.players_b)
        counts.append(n)
        h.append((wins - expect) / (n + PRIOR))
        x.append([float(row[k]) for k in ['vrsPer100', 'formDiff', 'strongDiff', 'weakDiff']])
        y.append(int(row['y']))
        days.append(row['date'])
    return np.array(y), np.array(x), np.array(h), np.array(days), np.array(counts)

def calibrate(rows, series, by_id, asof):
    y, x, h, days, counts = features(rows, series, by_id)
    cutoff = (asof - dt.timedelta(days=20)).isoformat()
    train = days < cutoff
    heldout = ~train
    cv_logodds = x @ fit(x[train], y[train], 7)
    cv_weight = fit_weight(y[train], cv_logodds[train], h[train])
    pre = cv_logodds[heldout]
    post = pre + cv_weight * h[heldout]
    cv_before = score_loss(y[heldout], pre)
    cv_after = score_loss(y[heldout], post)
    brier = lambda logits: round(float(np.mean((expit(logits) - y[heldout]) ** 2)), 6)
    passed = cv_after < cv_before
    final_weight = fit_weight(y, x @ fit(x, y, 7), h) if passed else 0
    return dict(weight=round(final_weight, 6), prior=PRIOR,
                validation=dict(n=int(heldout.sum()), repeated=int((counts[heldout] > 0).sum()), since=cutoff,
                                baseLogLoss=round(cv_before, 6), h2hLogLoss=round(cv_after, 6),
                                baseBrier=brier(pre), h2hBrier=brier(post), passed=bool(passed)))

def prepare_snapshots(info, fixtures, series, day):
    by_name = {name_key(t['name']): t for t in info['teams']}
    teams = [by_name[name_key(n)] for n in fixtures['seeds']]
    output = {}
    for i, a in enumerate(teams):
        for j, b in enumerate(teams[i + 1:], i + 1):
            pa, pb = roster_key(a['roster']), roster_key(b['roster'])
            n, wins, expected = stats(series, day, pa, pb, include_day=True)
            if n:
                output[f'{i}:{j}'] = dict(n=n, wins=wins, expected=round(expected/n, 8))
    return output

def csv_by_event(path):
    groups = defaultdict(list)
    with path.open(encoding='utf-8', newline='') as fp:
        for row in csv.DictReader(fp):
            groups[row['event']].append(row)
    return groups

def main():
    fixtures = json.loads((ROOT / 'fixtures/fixtures.json').read_text())
    snapshots = json.loads((ROOT / 'datajob/features.json').read_text())
    historical = csv_by_event(HERE / 'series.csv')
    training = csv_by_event(ROOT / 'fitting/fit_examples.csv')
    result = {}
    for event, snap in snapshots.items():
        series, by_id = history_rows(historical[event])
        day = dt.date.fromisoformat(snap['asOf'])
        fit_info = calibrate(training[event], series, by_id, day)
        stage = prepare_snapshots(snap, fixtures[event], series, day)
        result[event] = dict(asOf=snap['asOf'], **fit_info, pairs=stage)
        print(event, len(stage), 'eligible pairs', sum(x['n'] for x in stage.values()), 'series', fit_info)
    (HERE / 'matchups.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
if __name__ == '__main__':
    main()
