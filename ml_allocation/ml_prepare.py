"""Prepare strictly pre-stage XGBoost observations and pair queries with both Elisa trials withheld."""
import argparse
import itertools
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from f1bre_models import ml_prepare as base

HOLDOUT_EVENTS = {'Elisa Invitational Spring 2024', 'Elisa Invitational Fall 2024'}
LAST_CUTOFF = base.ordinal('2026-03-06')
IDS = ('elisa-spring-2024', 'elisa-fall-2024', 'epl21-stage2', 'epl22-stage2', 'epl23-stage2')
POOLS = {IDS[0]: 'copenhagen', IDS[1]: 'shanghai', IDS[2]: 'austin', IDS[3]: 'budapest', IDS[4]: 'cologne'}
TARGET_LABELS = {IDS[0]: 'Elisa Invitational Spring 2024', IDS[1]: 'Elisa Invitational Fall 2024',
                 IDS[2]: 'ESL Pro League Season 21', IDS[3]: 'ESL Pro League Season 22',
                 IDS[4]: 'ESL Pro League Season 23 Stage 2'}
PRIOR_LABELS = {IDS[0]: TARGET_LABELS[IDS[0]] + ' Contenders', IDS[1]: TARGET_LABELS[IDS[1]] + ' Contenders',
                **{IDS[i]: f'ESL Pro League Season {19+i} Stage 1' for i in (2,3,4)}}


def read(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def store(name, meta, arrays, check, directory=HERE):
    d = directory / (name + '.json')
    a = directory / (name + '.npz')
    if check:
        assert meta == read(d)
        with np.load(a, allow_pickle=False) as saved:
            assert set(saved.files) == set(arrays)
            for key, value in arrays.items():
                np.testing.assert_array_equal(saved[key], value)
    else:
        d.write_text(json.dumps(meta, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')
        np.savez_compressed(a, **arrays)


def clean_history(args, cutoff=LAST_CUTOFF, parse_options=None, releases=None):
    dropped = Counter()

    def allowed():
        for g in base.parse_games(args.hltvy, args.ektarr, **(parse_options or {})):
            day, uncertainty, _, event, *_ = g
            if base.ordinal(day) + uncertainty + 2 > cutoff:
                continue
            if event in HOLDOUT_EVENTS:
                dropped[event] += 1
                continue
            yield g

    tables = base.sources.release_tables(args.ranks, releases)
    h = base.History(allowed(), tables)
    if cutoff == LAST_CUTOFF:
        assert set(dropped) == HOLDOUT_EVENTS
    assert not any(g[3] in HOLDOUT_EVENTS for g in h.games)
    return h, dropped


def training(h, dropped, check, directory=HERE, last_availability='2026-03-06'):
    arrays = {k: [] for k in ('x', 'y', 'day', 'ready', 'event', 'series', 'map')}
    events, series = {}, {}
    for day, ready, mid, event, mp, y, five, points in h.games:
        v, _ = h.vectors(day, five, points)
        arrays['x'].append(v[mp])
        arrays['y'].append(y)
        arrays['day'].append(day)
        arrays['ready'].append(ready)
        arrays['map'].append(mp)
        arrays['event'].append(events.setdefault(event, len(events)))
        arrays['series'].append(series.setdefault(mid, len(series)))
    types = {'x': np.float32, 'y': np.int8, 'map': np.int8}
    arrays = {k: np.asarray(rows, dtype=types.get(k, np.int32)) for k, rows in arrays.items()}
    meta = dict(features=base.FEATURES, excludedRawMaps=dict(dropped), events=list(events), series=list(series),
                mapNames=base.MAPS, lastAvailability=last_availability, maps=len(arrays['y']))
    store('ml-training', meta, arrays, check, directory)
    print('Shared training archive:', meta['maps'], 'maps;', dict(dropped), 'withheld at raw source', flush=True)


def field_inputs():
    spring = read(HERE / 'holdout-spring-field.json')
    fall = read(HERE / 'holdout-fall-field.json')
    epl21 = read(ROOT / 'tail_calibration/epl21-field.json')
    epl22 = read(ROOT / 'round_form/epl22-inputs.json')['target']
    epl23 = read(ROOT / 'epl_transfer/field.json')
    epl23['teams'] = read(ROOT / 'epl_transfer/rosters.json')['teams']
    return (spring, fall, epl21, epl22, epl23)


def queries(h, check, targets=None, directory=HERE):
    arrays, fields = {}, {}
    for f in field_inputs() if targets is None else targets:
        key = f['id']
        cutoff = f.get('cutoffExclusive', f['start'])[:10]
        assert cutoff <= f['start'][:10]
        day = base.ordinal(cutoff)
        teams = f['teams']
        names = [t['name'] for t in teams]
        assert len(names) == len(set(names)) == 16
        if 'entrants' in f:
            assert names == f['entrants']
        fives = [base.sources.roster(t['roster'], t['name']) for t in teams]
        assert all(3 <= len(set(r)) == len(r) <= 5 for r in fives)
        points = [t.get('points') for t in teams]
        assert all(p is None or isinstance(p, (int, float)) and p > 0 for p in points)
        pool = base.POOLS[POOLS[key]][0].split() if targets is None else f['pool']
        assert len(pool) == len(set(pool)) == 7 and set(pool) <= set(base.MAPS)
        if 'pool' in f:
            assert set(f['pool']) == set(pool)
        pos = [base.MAPS.index(m) for m in pool]
        vectors, weights, missing = [], [], []
        for i, j in itertools.combinations(range(16), 2):
            ps = [np.nan if points[t] is None else points[t] for t in (i, j)]
            v, w = h.vectors(day, (fives[i], fives[j]), ps)
            vectors.append(v[pos])
            weights.append(w[pos])
            if not np.isfinite(ps).all():
                missing.append([i, j])
        arrays['x_' + key] = np.asarray(vectors, np.float32)
        arrays['w_' + key] = np.asarray(weights, np.float64)
        coverage = [h.profile(five, day)[-2:] for five in fives]
        basic_counts = [sum(bool(np.isfinite(h.cache[n][:3]).all()) for n in five) for five in fives]
        fields[key] = dict(start=f['start'][:10], cutoffExclusive=cutoff, teams=names, pool=pool,
                           rosterSizes=list(map(len, fives)), priorCoreMaps=[c[0] for c in coverage],
                           ratingCoveredPlayers=[c[1] for c in coverage], basicStatsCoveredPlayers=basic_counts,
                           noVrsTeams=[names[i] for i,p in enumerate(points) if p is None],
                           noVrsPairs=missing,
                           targetLabel=TARGET_LABELS[key] if targets is None else f['targetLabel'],
                           precedingLabel=PRIOR_LABELS[key] if targets is None else f['precedingLabel'])
        if targets is not None:
            fields[key].update(rosters=[t['roster'] for t in teams], points=points)
    if targets is None:
        assert set(fields) == set(IDS)
    store('ml-queries', {'fields': fields}, arrays, check, directory)
    print('Field pair queries:', ', '.join(fields), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ('hltvy', 'ektarr', 'ranks'):
        parser.add_argument('--' + arg, type=Path, required=True)
    parser.add_argument('--part', choices=('training', 'queries', 'all'), default='all')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    history, withheld = clean_history(args)
    if args.part in ('training', 'all'):
        training(history, withheld, args.check)
    if args.part in ('queries', 'all'):
        queries(history, args.check)
