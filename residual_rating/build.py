"""Estimate a regularized Bradley–Terry residual from verified pre-stage series."""
import csv
import gzip
import json
import math
import sys
from collections import defaultdict
from datetime import date
from itertools import combinations
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.sparse import csr_matrix
from scipy.special import expit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'strategy_v4'))
from build import GAP_PRIOR, lineup


def read(name):
    return json.loads((ROOT / name).read_text(encoding='utf8'))


def triples(players):
    return combinations(sorted(players), 3)


def model(rows, cutoff, entrants):
    ids = {}
    columns, signs, ptr = [], [], [0]
    weights, gaps, labels = [], [], []
    counts = defaultdict(int)
    eligible = []
    for row in rows:
        age = (cutoff - date.fromisoformat(row['day'])).days
        if age < 0:
            raise ValueError('Series dated after cutoff')
        if age >= 90:
            continue
        a, b = (lineup(row[c].split('|')) for c in ('lineupA', 'lineupB'))
        y = int(row['winner'])
        assert not (a & b) and y in (0, 1)
        for side, sign in ((a, 1), (b, -1)):
            counts[side] += 1
            for core in triples(side):
                columns.append(ids.setdefault(core, len(ids)))
                signs.append(sign / math.sqrt(10))
        ptr.append(len(columns))
        weights.append(2**(-age / 45))
        gaps.append(float(row['gap']))
        labels.append(y)
        eligible.append(row)
    assert len({r['id'] for r in eligible}) == len(eligible)
    design = csr_matrix((signs, columns, ptr), shape=(len(labels), len(ids)))
    w, x, y = map(np.asarray, (weights, gaps, labels))
    def objective(params):
        slope, theta = params[0], params[1:]
        z = x * slope + design @ theta
        diff = w * (expit(z) - y)
        loss = w @ (np.logaddexp(0, z) - y*z) + (slope-GAP_PRIOR)**2/2 + 2*theta@theta
        gradient = np.r_[x@diff + slope-GAP_PRIOR, design.T @ diff + 4*theta]
        return loss, gradient
    result = minimize(objective, np.r_[GAP_PRIOR, np.zeros(len(ids))], jac=True,
                      method='L-BFGS-B', bounds=[(.03, 2.5)]+[(None,None)]*len(ids),
                      options={'ftol':1e-13,'gtol':1e-7,'maxiter':300})
    if not result.success:
        raise ValueError(result.message)
    def profile(handles):
        five = lineup(handles)
        shared = [ids[t] for t in triples(five) if t in ids]
        overlap = {str(n):sum(v for team, v in counts.items() if len(team & five)==n) for n in (3,4,5)}
        theta = result.x[1:]
        return dict(roster=handles, matchesByOverlap=overlap,
                    residual=round(sum(theta[k] for k in shared)/math.sqrt(10), 9))
    return dict(asOf=cutoff.isoformat(), firstMatch=min(r['day'] for r in eligible),
                lastMatch=max(r['day'] for r in eligible), series=len(y), distinctTriples=len(ids),
                nuisanceVrsSlope=round(result.x[0],9), teams={n:profile(five) for n,five in entrants.items()})


def build():
    dates = read('strategy_v4/models.json')
    rosters = {**{k:v['rosters'] for k,v in read('history24/fixtures.json').items()},
               **read('datajob/stage_rosters.json')}
    groups = defaultdict(list)
    with gzip.open(ROOT / 'strategy_v4/series.csv.gz', 'rt', encoding='utf8', newline='') as f:
        for r in csv.DictReader(f):
            groups[r['event']].append(r)
    return {k:model(groups[k], date.fromisoformat(dates[k]['asOf']), entrants)
            for k,entrants in rosters.items()}


if __name__=='__main__':
    result = build()
    target = HERE / 'ratings.json'
    if '--check' in sys.argv:
        saved=json.loads(target.read_text(encoding='utf8'))
        for k,row in result.items():
            for name,team in row['teams'].items():
                old=saved[k]['teams'][name]
                assert abs(old['residual']-team['residual'])<1e-6
                assert old['matchesByOverlap']==team['matchesByOverlap'] and old['roster']==team['roster']
            assert row['series']==saved[k]['series'] and row['lastMatch']==saved[k]['lastMatch']
    else:
        target.write_text(json.dumps(result, ensure_ascii=False,indent=2)+'\n',encoding='utf8')
