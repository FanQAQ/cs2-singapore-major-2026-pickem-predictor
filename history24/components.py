"""Fit the optional 2024 series models to the same dated, two-lineup feature archive."""
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from datajob.build_features import roster_key
from format_model.build import global_scales, prob, team_contrast
from model_v3 import build as rolling
from model_v3 import fit_format_weight as weight
from styles_model import build as h2h


def identity(row):
    return row['date'], str(row['matchInSnapshot'])


def fives(row):
    pair = tuple(roster_key(row[key].split('|')) for key in ('lineupA', 'lineupB'))
    if not all(pair) or pair[0] & pair[1]:
        raise ValueError(f'Invalid series lineups for {identity(row)}')
    return pair


def format_fits(teams, train, history, day):
    def labelled(rows):
        results = []
        for row in rows:
            fmt = int(row.get('bestOf') or 0)
            if fmt not in (1, 3):
                continue
            a,b = fives(row)
            results.append(dict(day=row['date'], bestOf=fmt, x=float(row['vrsPer100']),
                                y=int(row['y']), aRoster=a, bRoster=b))
        return results

    eligible = labelled(train)
    historical = labelled(history)
    if not eligible:
        return None, None
    values = [(g['day'], g['bestOf'], g['x'], g['y']) for g in eligible]
    base, share, scales = global_scales(values)
    counts = Counter(g['bestOf'] for g in eligible)
    lower = (day - timedelta(days=89)).isoformat()
    team_formats = {}
    for t in teams:
        lineup = roster_key(t['roster'])
        sides = []
        for g in historical:
            if g['day'] < lower:
                continue
            if len(lineup & g['aRoster']) >= 3:
                sides.append((g['bestOf'], g['x'], g['y']))
            elif len(lineup & g['bRoster']) >= 3:
                sides.append((g['bestOf'], -g['x'], 1-g['y']))
        team_formats[t['name']] = team_contrast(sides,scales,base)
    folds = []
    for left,right in [(60,40),(40,20),(20,-1)]:
        start = (day - timedelta(days=left)).isoformat()
        stop = (day - timedelta(days=right)).isoformat()
        preds = (weight.rebuild_fold(train, eligible, historical, start, stop)
                 if any(g['day'] < start for g in eligible) else [])
        folds.append(preds)
    calibration = folds[0] + folds[1]
    coefficient, reason = weight.reliability(calibration)
    fmt = dict(asOf=day.isoformat(), shareBO3=round(share,7),
               scale={f'bo{k}':round(v,7) for k,v in scales.items()},
               nBO1=counts[1], nBO3=counts[3], teams=team_formats)
    confidence = dict(asOf=day.isoformat(), weight=round(coefficient,7), reason=reason,
                      calibration=weight.scores(calibration,coefficient),
                      holdout=weight.scores(folds[2],coefficient))
    return fmt, confidence


def rolling_fit(teams, train, history, day):
    series = []
    for row in history:
        # RollingForm uses only the difference of its two integer rating inputs.
        # Convert the archived per-100 difference back to the original point units.
        raw_points = float(row['vrsPer100']) * 100
        delta = round(raw_points)
        if abs(delta - raw_points) > 1e-6:
            raise ValueError('Expected a difference between two integer VRS scores')
        series.append(dict(row, id=str(row['matchInSnapshot']), pointsA=delta, pointsB=0))
    form = rolling.RollingForm()
    observed = form.observed(series)
    x, y, days = [], [], []
    for row in train:
        a, b, residual = observed[identity(row)]
        if fives(row) != (a,b):
            raise ValueError(f'Rolling model roster mismatch for {identity(row)}')
        x.append([float(row[k]) for k in rolling.COLS] + [residual])
        y.append(int(row['y']))
        days.append(row['date'])
    x, y = np.array(x), np.array(y)
    weights = rolling.time_weights(days, day)
    masks = {m: rolling.train_model(x,y,m,weights).round(8).tolist() for m in range(8)}
    keys = [roster_key(t['roster']) for t in teams]
    return dict(masks=masks, asOf=day.isoformat(), historyN=len(observed), trainingN=len(train),
                lineupValues={rolling.lineup_id(k):round(form.lineup_value(day,k),8) for k in keys})


def matchup_fit(teams, train, history, day):
    games = []
    indexed = {}
    for row in history:
        a,b = fives(row)
        game = h2h.Match(date.fromisoformat(row['date']), a,b,int(row['y']),
                         prob(rolling.VRS_SLOPE * float(row['vrsPer100'])))
        key = row['date'], row['matchInSnapshot']
        indexed[key] = ((h2h.name_key(row['teamA']),h2h.name_key(row['teamB'])),game)
        games.append(game)
    split = (day - timedelta(days=20)).isoformat()
    if any(row['date'] < split for row in train) and any(row['date'] >= split for row in train):
        calibration = h2h.calibrate(train, games, indexed, day)
    else:
        calibration = dict(weight=0., prior=h2h.PRIOR, validation=dict(n=0,passed=False))
    pairs = h2h.prepare_snapshots({'teams':teams}, {'seeds':[t['name'] for t in teams]}, games, day)
    return dict(asOf=day.isoformat(), **calibration, pairs=pairs)


def build(teams, training, history, asof):
    day = date.fromisoformat(asof) if isinstance(asof,str) else asof
    if not training or len(history) < len(training):
        raise ValueError('Expected dated training rows and their historical source series')
    identities = {identity(r) for r in history}
    train_ids = {identity(r) for r in training}
    if len(identities) != len(history) or len(train_ids) != len(training) or not train_ids <= identities:
        raise ValueError('Duplicate series or missing historical source for a training row')
    if max(r['date'] for r in history) > day.isoformat():
        raise ValueError('Historical evidence crosses the forecast cutoff')
    fmt, confidence = format_fits(teams, training, history, day)
    return dict(formatModel=fmt, formatWeight=confidence,
                rollingModel=rolling_fit(teams, training, history, day),
                matchups=matchup_fit(teams, training, history, day))
