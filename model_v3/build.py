"""Fit a roster-based opponent-adjusted form term and test it before each stage.

Run from any directory. Requires Python 3, NumPy and SciPy. Only lagged inputs from
the model bundle are read. Major fixtures/results are deliberately excluded.
"""
import csv
import datetime as dt
import json
import math
import sys
from collections import defaultdict
from itertools import groupby
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'fitting'))
from fit import fit
from build_features import roster_key

HERE = Path(__file__).resolve().parent
HALF_LIFE = 45
K = .22
VRS_SLOPE = math.log(10) / 4
COLS = ['vrsPer100', 'formDiff', 'strongDiff', 'weakDiff']
ALL = 7


def read_groups(path):
    groups = defaultdict(list)
    with path.open(encoding='utf-8', newline='') as f:
        for row in csv.DictReader(f):
            groups[row['event']].append(row)
    return groups


def lineup_id(players):
    return '|'.join(sorted(players))


class RollingForm:
    """Keep residuals on the actual five that earned them, including across org changes."""
    def __init__(self):
        self.residuals = {}

    def decayed(self, day, lineup):
        value, last_day = self.residuals.get(lineup, (0., day))
        return value * 2 ** (-(day - last_day).days / HALF_LIFE)

    def lineup_value(self, day, lineup):
        target = roster_key(lineup)
        if not target:
            return 0.
        total = 0.
        for previous in self.residuals:
            shared = len(target & previous)
            if shared >= 3:
                total += self.decayed(day, previous) * shared / 5
        return total

    def observed(self, series):
        index = {}
        for raw_day, date_rows in groupby(sorted(series, key=lambda r:r['date']), key=lambda r:r['date']):
            day = dt.date.fromisoformat(raw_day)
            updates = defaultdict(float)
            for row in date_rows:
                a, b = (roster_key(row[k].split('|')) for k in ('lineupA', 'lineupB'))
                if not a or not b or a & b:
                    continue
                x = self.lineup_value(day, a) - self.lineup_value(day, b)
                diff = (int(row['pointsA']) - int(row['pointsB'])) / 100
                probability = expit(VRS_SLOPE * diff + x)
                delta = K * (int(row['y']) - probability)
                index[(row['date'], row['id'])] = (a, b, x)
                updates[a] += delta
                updates[b] -= delta
            for lineup, change in updates.items():
                self.residuals[lineup] = (self.decayed(day, lineup) + change, day)
        return index


def train_model(x, y, mask, weights, conservative=True):
    idx = [0]+[i+1 for i in range(3) if mask & (1<<i)]+[4]
    design = x[:,idx]
    center = np.array([VRS_SLOPE]+[0.]*(len(idx)-1))
    precision = np.array([1.]+[2.]*(len(idx)-2)+[8.]) if conservative else np.ones(len(idx))
    def objective(beta):
        eta = design@beta
        delta = beta-center
        return weights @ (np.logaddexp(0,eta)-y*eta)+.5*(delta@(precision*delta)), design.T@(weights*(expit(eta)-y))+precision*delta
    bounds = [(.03,2.5)] + [(None,None)]*(len(idx)-2) + [(0., None)]
    sol = minimize(objective, center, jac=True, method='L-BFGS-B', bounds=bounds)
    if not sol.success:
        raise ValueError(sol.message)
    beta = np.zeros(5)
    beta[idx] = sol.x
    return beta


def time_weights(dates, target):
    age = np.array([(target-dt.date.fromisoformat(s)).days for s in dates])
    if min(age) < 0:
        raise ValueError("Training data exceeds prediction date")
    return np.exp2(-age/180.)


def diagnostics(x, y, days, cutoff, prior):
    """Two non-overlapping development blocks, then a final held-out 20-day block."""
    blocks = []
    for start_offset,end_offset in [(60,40),(40,20),(20,-1)]:
        lo = cutoff-dt.timedelta(days=start_offset)
        hi = cutoff-dt.timedelta(days=end_offset)
        train = days < lo.isoformat()
        test = (days >= lo.isoformat()) & (days < hi.isoformat())
        if test.sum()==0 or train.sum()==0:
            raise ValueError('Empty chronological split')
        target = y[test]
        xp = x[test]
        old_x,old_y,old_days = prior
        tx,ty,td = np.vstack([old_x,x[train]]),np.concatenate([old_y,y[train]]),np.concatenate([old_days,days[train]])
        weights = time_weights(td, lo)
        predictions = {
            'vrs': expit(xp[:,:4] @ fit(x[train,:4],y[train],0)),
            'pooled': expit(xp[:,:4] @ fit(x[train,:4],y[train],ALL)),
            'localRolling': expit(xp @ train_model(x[train],y[train],ALL,np.ones(sum(train)),conservative=False)),
            'rolling': expit(xp @ train_model(tx,ty,ALL,weights)),
        }
        scores = {}
        for key,p in predictions.items():
            scores[key] = dict(brier=float(np.mean((target-p)**2)),
                logLoss=float(-np.mean(target*np.log(p)+(1-target)*np.log1p(-p))),
                accuracy=float(np.mean((p>.5)==target)))
        diff = (predictions['rolling']-target)**2 - (predictions['pooled']-target)**2
        blocks.append(dict(start=lo.isoformat(), end=(hi-dt.timedelta(days=1)).isoformat(),
            n=int(test.sum()),trainN=int(train.sum()), scores=scores,
            dayDiffs=[dict(date=day,n=int(sum(days[test]==day)),total=float(diff[days[test]==day].sum()))
                for day in sorted(set(days[test]))]))
    return blocks


def main():
    training = read_groups(ROOT/'fitting/fit_examples.csv')
    histories = read_groups(ROOT/'styles_model/series.csv')
    snapshots = json.loads((ROOT/'datajob/features.json').read_text())
    models = {}
    prior = np.empty((0,5)), np.array([]), np.array([],dtype=str)
    for event, snap in snapshots.items():
        rolling = RollingForm()
        index = rolling.observed(histories[event])
        x, y, days = [], [], []
        matched = 0
        for row in training[event]:
            item = index.get((row['date'],row['matchInSnapshot']))
            difference = 0.
            if item is not None:
                lineups = tuple(roster_key(row[k].split('|')) for k in ('lineupA', 'lineupB'))
                if lineups == item[:2]:
                    difference = item[2]
                elif lineups == (item[1], item[0]):
                    difference = -item[2]
                else:
                    raise ValueError('Series alignment mismatch for the two five-player lineups')
                matched += 1
            x.append([float(row[c]) for c in COLS] + [difference])
            y.append(int(row['y']))
            days.append(row['date'])
        x, y, days = np.array(x), np.array(y), np.array(days)
        day = dt.date.fromisoformat(snap['asOf'])
        if max(days)>snap['asOf'] or max(r['date'] for r in histories[event])>snap['asOf']:
            raise ValueError('Future data in pre-stage fit')
        blocks = diagnostics(x,y,days,day,prior)
        if len(prior[2]) and max(prior[2]) >= min(days):
            raise ValueError("Historical training cohorts overlap")
        prior = np.vstack([prior[0],x]),np.concatenate([prior[1],y]),np.concatenate([prior[2],days])
        weights = time_weights(prior[2],day)
        masks = {mask: train_model(prior[0],prior[1],mask,weights).round(8).tolist() for mask in range(8)}
        stage_lineups = {t['name']: roster_key(t['roster']) for t in snap['teams']}
        observed = set(rolling.residuals)
        lineups = sorted((observed | set(stage_lineups.values())) - {frozenset()}, key=lineup_id)
        values = {lineup_id(lineup): round(rolling.lineup_value(day, lineup), 8) for lineup in lineups}
        residuals = {lineup_id(lineup): rolling.decayed(day, lineup) for lineup in sorted(observed, key=lineup_id)}
        models[event] = dict(asOf=snap['asOf'],teamValues={t: values.get(lineup_id(roster), 0.) for t, roster in stage_lineups.items()},
            lineupValues=values,rosterResiduals=residuals,masks=masks,historyN=len(index),
            trainingN=len(y),trainingAcrossPeriodsN=len(prior[1]),matched=matched,validation=blocks)
        print(event,matched,len(y),'folds',[(b['n'],round(b['scores']['vrs']['brier'],5),round(b['scores']['pooled']['brier'],5),round(b['scores']['rolling']['brier'],5)) for b in blocks])
    (HERE/'model.json').write_text(json.dumps(models,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':
    main()
