"""Calibrate how far to move a VRS-only forecast towards the mixed-to-BO split.

Use only matches before each stage snapshot. Inputs are frozen CSVs, and no
Major fixture outcomes or stage predictions are opened by this program.
"""
import csv
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from fitting.fit import fit
from build_features import roster_key
from format_model.build import global_scales, team_contrast, prob

BO_SHARE = {1: 20/33, 3: 13/33}


def read_groups(name):
    groups = defaultdict(list)
    with (ROOT / name).open(encoding='utf-8', newline='') as source:
        for row in csv.DictReader(source):
            groups[row['event']].append(row)
    return groups


def rebuild_fold(train, eligible, historical, start, stop):
    previous = [g for g in train if g['date'] < start]
    x = np.array([[float(g['vrsPer100']),0.,0.,0.] for g in previous])
    y = np.array([int(g['y']) for g in previous])
    beta = fit(x, y, 0)[0]
    earlier = [s for s in eligible if s['day'] < start]
    if not earlier:
        raise ValueError('Fold has no format-labelled training series')
    values = [(s['day'], s['bestOf'], s['x'], s['y']) for s in earlier]
    base, share3, scales = global_scales(values)
    min_day = (date.fromisoformat(start) - timedelta(days=90)).isoformat()
    observations = []
    for g in historical:
        if min_day <= g['day'] < start:
            observations.append((g['aRoster'],g['bestOf'],g['x'],g['y']))
            observations.append((g['bRoster'],g['bestOf'],-g['x'],1-g['y']))
    tilts = {}
    def tilt(players):
        if players not in tilts:
            rows = [(f,x,y) for lineup,f,x,y in observations if len(lineup & players) >= 3]
            tilts[players] = team_contrast(rows,scales,base)['tilt']
        return tilts[players]

    forecasts = []
    for g in eligible:
        if not start <= g['day'] < stop:
            continue
        best_of = g['bestOf']
        term = (int(best_of==3)-share3)*(tilt(g['aRoster'])-tilt(g['bRoster']))
        log_odds = beta*g['x']
        forecasts.append((g['day'],best_of,g['y'],prob(log_odds),prob(scales[best_of]*log_odds+term)))
    return forecasts


def reliability(forecasts):
    counts = Counter(f for _,f,*_ in forecasts)
    if not all(counts[f] for f in BO_SHARE):
        return 0., 'missingFormat'
    daily = defaultdict(lambda: [0.,0.])
    covariance = squared_shift = 0.
    for day, f, y, p, split in forecasts:
        share = BO_SHARE[f] / counts[f]
        shift = split-p
        benefit = (y-p)*shift
        covariance += share*benefit
        squared_shift += share*shift*shift
        daily[day][0] += share*benefit
        daily[day][1] += share
    if squared_shift <= 1e-12 or len(daily)<2:
        return 0., 'insufficientVariation'
    # Standard error of the directional improvement at the pooled forecast.
    # The cluster is the UTC match date; each forecast has fixed format weight.
    n_days = len(daily)
    se = math.sqrt(n_days/(n_days-1)*sum((value-amount*covariance)**2 for value,amount in daily.values()))
    weight = max(0.,min(1.,(covariance-se) / squared_shift))
    return weight, ('oneSEAllowsAdjustment' if weight else 'directionUncertain')


def scores(rows, weight):
    result = {'n':len(rows)}
    for f in BO_SHARE:
        games = [r for r in rows if r[1] == f]
        if not games:
            result[f'bo{f}'] = {'n':0}
            continue
        def brier(w):
            return sum((p+w*(split-p)-y)**2 for _,_,y,p,split in games)/len(games)
        result[f'bo{f}'] = {'n':len(games),'pooled':round(brier(0.),7),'full':round(brier(1.),7),'weighted':round(brier(weight),7)}
    if all(result[f'bo{f}']['n'] for f in BO_SHARE):
        result['majorMix'] = {
            k:round(sum(share*result[f'bo{f}'][k] for f,share in BO_SHARE.items()),7)
            for k in ['pooled','full','weighted']}
    return result


def main():
    training = read_groups('fitting/fit_examples.csv')
    source = read_groups('styles_model/series.csv')
    labels = read_groups('format_model/labels.csv')
    cutoffs = json.loads((ROOT/'datajob/features.json').read_text())
    output = {}
    for event, targets in training.items():
        day = date.fromisoformat(cutoffs[event]['asOf'])
        fmt = {(r['date'],r['matchInSnapshot']):int(r['bestOf']) for r in labels[event]}
        history = {}
        for r in source[event]:
            key = r['date'],r['id']
            best_of = fmt.get(key)
            a_roster = roster_key(r['lineupA'].split('|'))
            b_roster = roster_key(r['lineupB'].split('|'))
            if best_of is not None and a_roster and b_roster and not a_roster & b_roster:
                history[key] = dict(day=r['date'],bestOf=best_of,a=r['a'],b=r['b'],
                    aRoster=a_roster,bRoster=b_roster,
                    x=(int(r['pointsA'])-int(r['pointsB']))/100,y=int(r['y']))
        eligible = []
        for row in targets:
            key = row['date'],row['matchInSnapshot']
            if key not in history:
                continue
            item = history[key]
            fit_a, fit_b = (roster_key(row[k].split('|')) for k in ('lineupA', 'lineupB'))
            if ((item['a'],item['b'],item['y']) != (row['teamA'],row['teamB'],int(row['y']))
                    or item['aRoster'] != fit_a or item['bRoster'] != fit_b):
                raise ValueError('Inconsistent series join')
            eligible.append(item)
        folds = []
        for begin,end in [(60,40),(40,20),(20,-1)]:
            lo = (day-timedelta(days=begin)).isoformat()
            hi = (day-timedelta(days=end)).isoformat()
            forecast = rebuild_fold(targets, eligible, history.values(), lo, hi)
            if not forecast or max(g[0] for g in forecast)>day.isoformat():
                raise ValueError('Invalid prediction dates')
            folds.append(forecast)
        calibration = folds[0]+folds[1]
        weight, reason = reliability(calibration)
        output[event] = dict(asOf=day.isoformat(),weight=round(weight,7),reason=reason,
            calibration=scores(calibration,weight),holdout=scores(folds[2],weight),
            calibrationStart=min(g[0] for g in calibration),holdoutStart=(day-timedelta(days=20)).isoformat())
        print(event,output[event])
    (HERE/'format_weight.json').write_text(json.dumps(output,indent=2)+'\n')


if __name__=='__main__':
    main()
