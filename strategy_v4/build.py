"""Fit V4 from the released pre-stage series, without reading Major bracket outcomes."""
import argparse
import csv
import gzip
import json
import math
import unicodedata
from collections import defaultdict
from datetime import date
from itertools import combinations, groupby
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
GAP_PRIOR = math.log(10) / 4
ALIAS = {'rmn': 'roman', 'ahang': 'l1hang', 'snowzin': 'snow', 'dev1ce': 'device'}


def read(relative):
    return json.loads((ROOT/relative).read_text())


def lineup(handles):
    ids = [unicodedata.normalize('NFKC', h).strip().casefold() for h in handles]
    roster = frozenset(ALIAS.get(h, h) for h in ids)
    if len(roster) != 5 or '' in roster:
        raise ValueError('Expected five distinct player handles')
    return roster


def calibrated_slope(gaps, labels):
    if len(gaps) < 15:
        return GAP_PRIOR
    x, y = np.asarray(gaps), np.asarray(labels)
    slope = .3
    for _ in range(20):
        p = expit(slope*x)
        step = (np.dot(p-y, x) + slope-GAP_PRIOR)/(np.dot(p*(1-p), x*x)+1)
        updated = float(np.clip(slope-step, .03, 2.5))
        if abs(slope-updated) < 1e-9:
            return updated
        slope = updated
    return slope


class AppearanceHistory:
    def __init__(self):
        self.series = []
        self.by_core = defaultdict(set)

    def add(self, day, roster, outcome, p, round_residual):
        i = len(self.series)
        self.series.append((day, roster, outcome, p, round_residual))
        for triple in combinations(sorted(roster), 3):
            self.by_core[triple].add(i)

    def profile(self, day, roster):
        keys = set()
        for triple in combinations(sorted(roster), 3):
            keys.update(self.by_core[triple])
        totals = [0., 0., 0.]
        counts = [0, 0, 0]
        round_sum = round_weight = 0.
        n_round = 0
        for i in sorted(keys):
            old, other, y, p, margin = self.series[i]
            age = day-old
            if not 0 < age <= 90:
                continue
            diff = y-p
            totals[0] += diff
            counts[0] += 1
            if p <= .35:
                totals[1] += diff
                counts[1] += 1
            if p >= .65:
                totals[2] += diff
                counts[2] += 1
            if margin is not None:
                weight = len(other & roster)/5 * 2**(-age/45)
                round_sum += weight*margin
                round_weight += weight
                n_round += 1
        feat = [total/(n+5) for total, n in zip(totals, counts)]
        return dict(form=feat[0], strong=feat[1], weak=feat[2], round=round_sum/(round_weight+8),
                    n=counts[0], ns=counts[1], nw=counts[2], nRound=n_round)


def design(gap, slope, a, b):
    p = expit(slope*gap)
    return [gap, a['form']-b['form'], (1-p)*a['strong']-p*b['strong'],
            p*a['weak']-(1-p)*b['weak'],
            a['round']-b['round'] if a['nRound'] and b['nRound'] else 0.]


def fit(X, y, mask):
    columns = [0]+[k+1 for k in range(4) if mask & (1 << k)]
    x = np.asarray(X)[:, columns]
    y = np.asarray(y)
    prior = np.asarray([GAP_PRIOR, 0., 0., 0., 0.])[columns]
    precision = np.asarray([1., 1., 1., 1., .25])[columns]

    def loss(beta):
        z = x@beta
        delta = beta-prior
        return (np.sum(np.logaddexp(0., z)-y*z)+np.sum(precision*delta*delta)/2,
                x.T@(expit(z)-y)+precision*delta)
    bounds = [(.03, 2.5) if k == 0 else (0., 30.) if k == 4 else (None, None)
              for k in columns]
    res = minimize(loss, prior, method='L-BFGS-B', jac=True, bounds=bounds,
                   options={'ftol': 1e-12, 'maxiter': 300})
    if not res.success:
        raise ValueError(f'Fit failed for mask {mask}: {res.message}')
    beta = np.zeros(5)
    beta[columns] = res.x
    return np.round(beta, 9).tolist()


def margin(scores):
    if not scores:
        return None
    maps = [tuple(map(int, score.split('-'))) for score in scores.split('|')]
    return sum((a-b)/(a+b) for a, b in maps)/len(maps)


def event_model(source, training_ids, stage, stage_rosters, extra_rosters):
    cutoff = date.fromisoformat(stage['asOf']).toordinal()
    history = AppearanceHistory()
    seen_ids = set()
    used_days = []
    design_rows, outcomes = [], []
    gaps, labels = [], []
    cross_product = squared_gaps = 0.
    matched = 0
    last_round_match = None
    for stamp, chunk in groupby(source, key=lambda r: r['day']):
        day = date.fromisoformat(stamp).toordinal()
        if day > cutoff:
            raise ValueError('Series after forecast cutoff')
        slope = calibrated_slope(gaps, labels)
        round_slope = cross_product/(squared_gaps+1)
        batch = []
        for r in chunk:
            a = lineup(r['lineupA'].split('|'))
            b = lineup(r['lineupB'].split('|'))
            gap = float(r['gap'])
            y = int(r['winner'])
            if a & b or y not in (0, 1):
                raise ValueError('Invalid verified series')
            rid = r['id']
            if rid in training_ids:
                if rid in seen_ids or cutoff-day >= 85:
                    raise ValueError('Training row must be unique and pre-stage')
                av, bv = history.profile(day, a), history.profile(day, b)
                design_rows.append(design(gap, slope, av, bv))
                outcomes.append(y)
                used_days.append(stamp)
                seen_ids.add(rid)
            batch.append((a,b,gap,y,margin(r['scores'])))
        # A full calendar day is predicted before making any of its results available.
        for a, b, gap, y, m in batch:
            p = expit(slope*gap)
            err = None
            if m is not None:
                err = m-float(np.clip(round_slope*gap, -1, 1))
                cross_product += gap*m
                squared_gaps += gap*gap
                matched += 1
                last_round_match = stamp
            history.add(day, a, y, p, err)
            history.add(day, b, 1-y, 1-p, -err if err is not None else None)
            gaps.append(gap)
            labels.append(y)
    if seen_ids != training_ids:
        raise ValueError('Training sample differs from published pre-event cohort')
    def snapshots(rosters):
        return {name: history.profile(cutoff+1, lineup(players)) for name, players in rosters.items()}
    field = snapshots(stage_rosters)
    extra = snapshots(extra_rosters)
    n = len(outcomes)
    if len(field) != 16:
        raise ValueError('Expected 16 teams in Stage 1')
    return (dict(asOf=stage['asOf'], n=n, firstMatch=min(used_days), lastMatch=max(used_days),
                 calibrationSlope=round(calibrated_slope(gaps, labels), 9), linkedRoundSeries=matched,
                 lastRoundMatch=last_round_match,
                 nRoundTraining=sum(abs(r[4]) > 0 for r in design_rows),
                 masks={str(m): dict(beta=fit(design_rows, outcomes, m)) for m in range(16)},
                 teams=field), extra)


def build():
    base = {**read('history24/models.json'), **read('datajob/features.json')}
    rosters = {**{k:v['rosters'] for k,v in read('history24/fixtures.json').items()},
               **read('datajob/stage_rosters.json')}
    later = read('extra_validation/strengths.json')
    training = defaultdict(set)
    for f in ['history24/fit_examples.csv','fitting/fit_examples.csv']:
        with (ROOT/f).open() as src:
            for r in csv.DictReader(src):
                training[r['event']].add(r['matchInSnapshot'])
    by_event = defaultdict(list)
    with gzip.open(HERE/'series.csv.gz', 'rt') as source:
        for row in csv.DictReader(source):
            by_event[row['event']].append(row)
    models, extra = {}, {}
    for key, stage in base.items():
        ext = {n:v['roster'] for n,v in later.get(key,{}).get('teams',{}).items()}
        if key in later and later[key]['date'] != stage['asOf']:
            raise ValueError(f'{key}: strength snapshot cutoff mismatch')
        rows = sorted(by_event[key], key=lambda r: (r['day'],r['id']))
        models[key], more = event_model(rows, training[key], stage, rosters[key], ext)
        if ext:
            extra[key] = more
    return models, extra


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='verify the published files without modifying them')
    args = parser.parse_args()
    for name, obj in zip(['models.json', 'later_teams.json'], build()):
        output = HERE/name
        data = json.dumps(obj, ensure_ascii=False, separators=(',',':'), allow_nan=False)+'\n'
        if args.check:
            if output.read_text() != data:
                raise SystemExit(f'{name}: trained values differ')
        else:
            output.write_text(data)
