"""Fit one pre-event, swap-symmetric probability model for each feature subset.

Install numpy and scipy, provide ../datajob/build_features.py, then run python fit.py.
CSV with strictly lagged training examples is also written for reproducibility.
One team is one Valve roster. The current snapshot determines match-history coverage;
points and match features for each training row only see date-prior observations.
"""
import csv
import datetime as dt
import json
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path
from itertools import combinations

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit

ROOT = Path(__file__).resolve().parent
PATH = ROOT.parent / 'datajob'
sys.path.insert(0, str(PATH))
import build_features as vrs

def snapshot_days(asof):
    days = [asof-dt.timedelta(days=i) for i in range(230,-1,-1)
            if (asof-dt.timedelta(days=i)).weekday()==0 and (asof-dt.timedelta(days=i)).day<=7]
    # November 2024 invitation ratings were actually published on the sixth.
    return [dt.date(2024,11,6) if d==dt.date(2024,11,4) else d for d in days]

@lru_cache(None)
def table(day):
    return vrs.parse_standings(vrs.snapshot_path(day))

def make_examples(event, asof):
    days = snapshot_days(asof)
    with ThreadPoolExecutor(8) as pool:
        tables = dict(zip(days, pool.map(table, days)))
    teams = vrs.sampled_teams(tables[asof], event)
    evidence = vrs.match_evidence(asof, teams)
    games = dict(vrs.rated_games(evidence, tables))
    # Index each actual historical five by its ten three-player cores. Multiple shared
    # triples identify the same side, which is counted only once per later lineup.
    by_core = defaultdict(set)
    perf = []
    for (day, mid), (_, a, b) in games.items():
        for (side, own), (_, other) in ((a,b),(b,a)):
            p = vrs.elo_expectation(own['points'],other['points'])
            index = len(perf)
            perf.append((day, p, side['y']-p))
            for triple in combinations(sorted(side['players']), 3):
                by_core[triple].add(index)

    def summarize(day, lineup):
        ids = set()
        for triple in combinations(sorted(lineup), 3):
            ids.update(by_core[triple])
        history = [perf[i] for i in sorted(ids) if 0 < (day-perf[i][0]).days <= 90]
        def feat(rows):
            return sum(row[2] for row in rows)/(len(rows)+5)
        features = [feat(history),feat([r for r in history if r[1]<=.35]),
                    feat([r for r in history if r[1]>=.65])]
        return np.array(features), len(history)

    rows = []
    for (day, mid), (_, (a, ra), (b, rb)) in games.items():
        if not 0 <= (asof-day).days < 85:
            continue
        fa, na = summarize(day, a['players'])
        fb, nb = summarize(day, b['players'])
        rows.append([day.isoformat(),mid,a['name'],b['name'],a['y'],(ra['points']-rb['points'])/100,
                     *list(fa-fb),na,nb,'|'.join(sorted(a['players'])),'|'.join(sorted(b['players']))])
    print(event,'training series',len(rows),'of',len(evidence),'dual-reported series',flush=True)
    return rows


def fit(x,y,mask):
    idx=[0]+[i+1 for i in range(3) if mask & (1<<i)]
    design=x[:,idx]
    # Weak zero-centered shrinkage on residual features; a broad prior for the VRS slope.
    center=np.array([np.log(10)/4]+[0.]*(len(idx)-1))
    precision=np.array([1.]+[1.]*(len(idx)-1))
    def objective(beta):
        eta=design@beta
        penalty=beta-center
        return (np.logaddexp(0,eta)-y*eta).sum()+.5*np.sum(precision*penalty**2), design.T@(expit(eta)-y)+precision*penalty
    sol=minimize(objective,center,jac=True,method='L-BFGS-B',bounds=[(.03,2.5)]+[(None,None)]*(len(idx)-1),options={'gtol':1e-8})
    if not sol.success:raise RuntimeError(sol.message)
    beta=np.zeros(4);beta[idx]=sol.x
    return beta

def metrics(y,p):
    p=np.clip(p,1e-9,1-1e-9)
    return dict(brier=round(float(np.mean((p-y)**2)),5), logLoss=round(float(-np.mean(y*np.log(p)+(1-y)*np.log(1-p))),5),
                hitRate=round(float(np.mean((p>=.5)==y)),5))

def main():
    models={}
    allrows=[]
    for key,(s,_) in vrs.EVENTS.items():
        day=dt.date.fromisoformat(s)
        rows=make_examples(key,day)
        if len(rows)<50: raise ValueError(f'{key} too few usable training series: {len(rows)}')
        allrows+= [[key,*r] for r in rows]
        date=np.array([r[0] for r in rows])
        y=np.array([r[4] for r in rows])
        x=np.array([r[5:9] for r in rows])
        split=(day-dt.timedelta(days=20)).isoformat()
        train=date<split
        target=dict(asOf=s,method='regularized-logistic-core3-v2',n=len(rows),firstMatch=min(date).item(),lastMatch=max(date).item(),validationStart=split,
                    validationN=int(sum(~train)),trainingScope='Snapshot top 100 plus Stage 1 entrants. Both actual fives verified against earlier standings. 85-day cohort, direct three-player overlap in all lagged team features.',masks={})
        for m in range(8):
            final=fit(x,y,m)
            cv=fit(x[train],y[train],m)
            target['masks'][str(m)]=dict(beta=np.round(final,7).tolist(),validation=metrics(y[~train],expit(x[~train]@cv)))
        models[key]=target
        (ROOT/'models.json').write_text(json.dumps(models,indent=2,ensure_ascii=False)+'\n')
        with (ROOT/'fit_examples.csv').open('w') as f:
            writer=csv.writer(f,lineterminator='\n')
            writer.writerow(['event','date','matchInSnapshot','teamA','teamB','y','vrsPer100','formDiff','strongDiff','weakDiff','historicalN_A','historicalN_B','lineupA','lineupB'])
            writer.writerows(allrows)
        print(key,target['n'],target['masks']['7'], flush=True)

if __name__=='__main__': main()
