"""Train the continuity increment solely on the frozen pre-stage series."""
import argparse
import csv
import gzip
import json
import subprocess
import sys
from collections import defaultdict
from datetime import date
from itertools import combinations, groupby
from pathlib import Path

import numpy as np
from scipy.special import expit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from strategy_v4 import build as v4


def continuity(history, day, roster):
    appearances = set()
    for triple in combinations(sorted(roster), 3):
        appearances.update(history.by_core.get(triple, ()))
    weighted = total = 0.
    count = 0
    for i in sorted(appearances):
        previous, old_lineup, *_ = history.series[i]
        age = day - previous
        if not 0 < age <= 90:
            continue
        weight = 2 ** (-age / 45)
        overlap = len(old_lineup & roster)
        weighted += weight * (overlap - 4)
        total += weight
        count += 1
    # Three, four and five survivors contribute -1, 0, +1. Five neutral games shrink short histories.
    return weighted / (total + 5), count


def feature(a, b):
    return a[0] - b[0] if a[1] and b[1] else 0.


def fit_offset(offsets, diffs, outcomes):
    """One zero-centred N(0,1) slope with fixed offset; no parameter choices use Major labels."""
    x, base, y = np.asarray(diffs), np.asarray(offsets), np.asarray(outcomes)
    slope = 0.
    for _ in range(40):
        p = expit(base + slope * x)
        step = (np.dot(x, p-y) + slope) / (np.dot(x*x, p*(1-p)) + 1)
        slope -= step
        if abs(step) < 1e-10:
            break
    return float(slope)


def fit_stage(rows, ids, frozen, rosters):
    cutoff = date.fromisoformat(frozen['asOf']).toordinal()
    history = v4.AppearanceHistory()
    gaps, labels, offsets, diffs, outcomes = [], [], [], [], []
    cross = squared = 0.
    seen = set()
    beta = frozen['masks']['15']['beta']
    for stamp, batch in groupby(rows, key=lambda r: r['day']):
        day = date.fromisoformat(stamp).toordinal()
        assert day <= cutoff
        gap_slope = v4.calibrated_slope(gaps, labels)
        round_slope = cross / (squared + 1)
        arrivals = []
        for row in batch:
            a, b = (v4.lineup(row[col].split('|')) for col in ('lineupA', 'lineupB'))
            gap = float(row['gap'])
            y = int(row['winner'])
            score = v4.margin(row['scores'])
            if row['id'] in ids:
                assert row['id'] not in seen and cutoff - day < 85
                seen.add(row['id'])
                av, bv = history.profile(day, a), history.profile(day, b)
                design = v4.design(gap, gap_slope, av, bv)
                offsets.append(float(np.dot(beta, design)))
                diffs.append(feature(continuity(history, day, a), continuity(history, day, b)))
                outcomes.append(y)
            arrivals.append((a, b, gap, y, score))
        # Observations from the entire date become eligible only for later dates.
        for a, b, gap, y, score in arrivals:
            p = float(expit(gap_slope * gap))
            residual = None
            if score is not None:
                residual = score - float(np.clip(round_slope * gap, -1, 1))
                cross += gap * score
                squared += gap * gap
            history.add(day, a, y, p, residual)
            history.add(day, b, 1-y, 1-p, None if residual is None else -residual)
            gaps.append(gap)
            labels.append(y)
    assert seen == ids and len(outcomes) == frozen['n']
    teams = {name: continuity(history, cutoff+1, v4.lineup(players)) for name, players in rosters.items()}
    assert all(n == frozen['teams'][name]['n'] for name, (_, n) in teams.items())
    return dict(asOf=frozen['asOf'], trainN=len(outcomes), slope=fit_offset(offsets, diffs, outcomes),
                withHistory=sum(n > 0 for _, n in teams.values()), profiles=teams)


def build():
    models = v4.read('strategy_v4/models.json')
    rosters = {**{k: v['rosters'] for k, v in v4.read('history24/fixtures.json').items()},
               **v4.read('datajob/stage_rosters.json')}
    ids = defaultdict(set)
    for path in ('history24/fit_examples.csv', 'fitting/fit_examples.csv'):
        with (ROOT / path).open() as f:
            for row in csv.DictReader(f):
                ids[row['event']].add(row['matchInSnapshot'])
    source = defaultdict(list)
    with gzip.open(ROOT / 'strategy_v4/series.csv.gz', 'rt') as f:
        for row in csv.DictReader(f):
            source[row['event']].append(row)
    result = {}
    for key in sorted(models, key=lambda e: models[e]['asOf']):
        if key == 'singapore':
            continue
        rows = sorted(source[key], key=lambda r: (r['day'], r['id']))
        result[key] = fit_stage(rows, ids[key], models[key], rosters[key])
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    opts = parser.parse_args()
    payload = json.dumps(build(), allow_nan=False)
    report = subprocess.run(['node', str(HERE / 'evaluate.cjs')], input=payload,
                            text=True, capture_output=True, check=True).stdout
    output = HERE / 'report.json'
    if opts.check:
        if output.read_text() != report:
            raise SystemExit('Reproduction differs from saved report.')
    else:
        output.write_text(report)
    print(report)
