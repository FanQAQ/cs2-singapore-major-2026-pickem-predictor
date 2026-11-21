"""Retrain the frozen map model on the two withheld Elisa trials and three earlier EPL transfer tests."""
import argparse
import gzip
import hashlib
import itertools
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from f1bre_models import ml as model
from ml_prepare import HOLDOUT_EVENTS, IDS


def read(file, directory=HERE):
    return json.loads((directory / file).read_text(encoding='utf8'))


def archive(file, directory=HERE):
    with np.load(directory / file, allow_pickle=False) as npz:
        return {key: npz[key] for key in npz.files}


def fit(data, meta, fields, queries, key):
    f = fields[key]
    cutoff = date.fromisoformat(f['cutoffExclusive']).toordinal()
    x, y, day, ready, event = (data[k] for k in ('x', 'y', 'day', 'ready', 'event'))
    eligible = (day >= cutoff - 365) & (ready <= cutoff)
    observed = np.unique(day[eligible])
    split = observed[int(len(observed) * .85)]
    cal = eligible & (day >= split)
    cal_events = np.unique(event[cal])
    train = eligible & (ready <= split) & ~np.isin(event, cal_events)
    assert int(train.sum()) > 100 and int(cal.sum()) > 30
    assert ready[train].max() <= day[cal].min() and ready[eligible].max() <= cutoff
    assert not np.intersect1d(event[train], event[cal]).size
    assert not np.intersect1d(data['series'][train], data['series'][cal]).size
    event_ids = {name: i for i, name in enumerate(meta['events'])}

    def count_event(name):
        return int(np.count_nonzero(eligible & (event == event_ids.get(name, -1))))

    assert all(n not in event_ids for n in HOLDOUT_EVENTS)
    assert count_event(f['targetLabel']) == 0
    q, w = queries['x_' + key], queries['w_' + key]
    pred = model.predict_variant(x, y, day, train, cal, cutoff, q, w)
    unavailable = {tuple(pair) for pair in f['noVrsPairs']}
    if unavailable:
        no_vrs = model.predict_variant(x[:, 1:], y, day, train, cal, cutoff, q[:, :, 1:], w)
        for i, (a, b) in enumerate(itertools.combinations(range(16), 2)):
            assert (not np.isfinite(q[i, 0, 0])) == ((a, b) in unavailable)
            if (a, b) not in unavailable:
                continue
            pred['mapProbabilities'][i] = no_vrs['mapProbabilities'][i]
            for fmt in ('bo1', 'bo3'):
                pred[fmt][a][b], pred[fmt][b][a] = no_vrs[fmt][a][b], no_vrs[fmt][b][a]
        pred['noVrsCalibrationKnots'] = no_vrs['calibrationKnots']

    def iso(n):
        return date.fromordinal(int(n)).isoformat()

    pred['training'] = dict(windowStart=iso(cutoff - 365), firstObserved=iso(day[eligible].min()),
                            lastObserved=iso(day[eligible].max()), latestAvailability=iso(ready[eligible].max()),
                            treeLastDay=iso(day[train].max()), calibrationStart=iso(split),
                            eligibleMaps=int(eligible.sum()), treeMaps=int(train.sum()), calibrationMaps=int(cal.sum()),
                            omittedAtSplit=int(eligible.sum()-train.sum()-cal.sum()),
                            treeSeries=int(np.unique(data['series'][train]).size),
                            calibrationSeries=int(np.unique(data['series'][cal]).size),
                            treeEvents=int(np.unique(event[train]).size), calibrationEvents=int(cal_events.size),
                            targetStageMapsAvailable=count_event(f['targetLabel']),
                            precedingStageMapsAvailable=(count_event(f['precedingLabel']) if f['precedingLabel'] else None),
                            ratingPresentInTreeMaps=int(np.isfinite(x[train,13]).sum()),
                            ratingPresentInCalibrationMaps=int(np.isfinite(x[cal,13]).sum()))
    pred.update(f)
    return key, pred


def verify_series(fields, queries):
    # Independent triple-set probability using unordered selections and explicit permutations.
    for key, f in fields.items():
        p = np.array(f['mapProbabilities'])
        w = queries['w_' + key].copy()
        w /= w.sum(axis=1, keepdims=True)
        q = np.zeros(120)
        for i,j,k in itertools.combinations(range(7),3):
            mass = sum(w[:,a]*w[:,b]/(1-w[:,a])*w[:,c]/(1-w[:,a]-w[:,b])
                       for a,b,c in itertools.permutations((i,j,k)))
            q += mass*(p[:,i]*p[:,j] + (1-p[:,i])*p[:,j]*p[:,k]+p[:,i]*(1-p[:,j])*p[:,k])
        for fmt, expected in [('bo1', (p*w).sum(axis=1)), ('bo3', q)]:
            matrix = np.array(f[fmt])
            assert matrix.shape == (16,16)
            np.testing.assert_allclose(matrix + matrix.T, 1, atol=1e-10, rtol=0)
            np.testing.assert_allclose(matrix[np.triu_indices(16,1)], expected, atol=2e-8, rtol=0)


def run(check, jobs, directory=HERE, ids=IDS):
    assert model.xgb.__version__ == '3.0.2'
    meta = read('ml-training.json', directory)
    fields = read('ml-queries.json', directory)['fields']
    data, queries = archive('ml-training.npz', directory), archive('ml-queries.npz', directory)
    assert len(meta['features']) == 16 and set(fields) == set(ids)
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        out = dict(pool.map(lambda key: fit(data, meta, fields, queries, key), ids))
    verify_series(out, queries)
    inputs = {f: hashlib.sha256((directory / f).read_bytes()).hexdigest() for f in (
        'ml-training.json', 'ml-training.npz', 'ml-queries.json', 'ml-queries.npz')}
    payload = dict(xgboostVersion=model.xgb.__version__, seed=42, inputs=inputs,
                   features=meta['features'], excludedElisaMaps=meta['excludedRawMaps'], fields=out)
    raw = (json.dumps(payload, separators=(',', ':'), ensure_ascii=False, allow_nan=False)+'\n').encode()
    dest = directory / 'ml.json.gz'
    if check:
        assert gzip.decompress(dest.read_bytes()) == raw
    else:
        with dest.open('wb') as fd, gzip.GzipFile(filename='', fileobj=fd, mode='wb', mtime=0) as gz:
            gz.write(raw)
    for key, f in out.items():
        print(key, f['training']['treeMaps'], f['training']['calibrationMaps'],
              f['training']['precedingStageMapsAvailable'], 'noVrs:', f['noVrsTeams'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--jobs', type=int, default=3)
    args = parser.parse_args()
    run(args.check, args.jobs)
