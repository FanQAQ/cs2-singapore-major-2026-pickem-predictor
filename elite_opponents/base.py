"""Combine the strictly pre-Cluj ML with three existing, independently reproduced Stage 3 baselines."""
import argparse
import gzip
import hashlib
import itertools
import json
from pathlib import Path

import numpy as np

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
MAIN=('austin-2025-3','budapest-2025-3','cologne-2026-3')
KEY='cluj-2025'


def read(file):
    b=file.read_bytes()
    return json.loads(gzip.decompress(b) if file.suffix=='.gz' else b)


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def build(check):
    original=ROOT/'f1bre_models/ml.json.gz'
    replay=ROOT/'bo5_history/models.json.gz'
    ext=HERE/'cluj-ml/ml.json.gz'
    older=read(original)['fields']
    prior=read(replay)['fields']
    fields={}
    for key,f in [(k,older[k]) for k in MAIN]+[(KEY,read(ext)['fields'][KEY])]:
        if key in MAIN:
            assert all(f[k]==prior[key]['baseline'][k] for k in ('bo1','bo3','mapProbabilities'))
            assert f['teams']==prior[key]['teams'] and f['pool']==prior[key]['pool']
        else:
            spec=read(HERE/'field.json')
            assert f['teams']==spec['entrants'] and f['rosters']==[t['roster'] for t in spec['teams']]
            assert f['training']['targetStageMapsAvailable']==0
        fields[key]={k:f[k] for k in ('start','cutoffExclusive','teams','pool','bo1','bo3','mapProbabilities','training',
                                       'priorCoreMaps','ratingCoveredPlayers')}
        if key==KEY:fields[key]['rosters']=f['rosters']
    # Check the unrounded W from each original archive, independently summing
    # the 6 possible orders per unordered triple.
    max_error=0.
    for file,keys in [(ROOT/'f1bre_models/ml-data.npz',MAIN),(HERE/'cluj-ml/ml-queries.npz',(KEY,))]:
        with np.load(file,allow_pickle=False) as x:
            for key in keys:
                f=fields[key];p=np.asarray(f['mapProbabilities']);w=x['w_'+key]
                assert len(set(f['teams']))==16 and len(set(f['pool']))==7 and p.shape==(120,7)
                w=w/w.sum(axis=1,keepdims=True);series=np.zeros(120);mass=np.zeros(120)
                for i,j,k in itertools.combinations(range(7),3):
                    m=sum(w[:,a]*w[:,b]*w[:,c]/((1-w[:,a])*(1-w[:,a]-w[:,b]))
                          for a,b,c in itertools.permutations((i,j,k)))
                    a,b,c=p[:,i],p[:,j],p[:,k]
                    series+=m*(a*b+(a*(1-b)+(1-a)*b)*c);mass+=m
                np.testing.assert_allclose(mass,1,rtol=0,atol=1e-12)
                for name,target in [('bo1',(p*w).sum(axis=1)),('bo3',series)]:
                    matrix=np.asarray(f[name]);assert matrix.shape==(16,16) and np.all(np.diag(matrix)==.5)
                    np.testing.assert_allclose(matrix+matrix.T,1,rtol=0,atol=1e-10)
                    max_error=max(max_error,float(np.max(abs(matrix[np.triu_indices(16,1)]-target))))
    assert max_error<2e-8
    files=[original,replay,ext,ROOT/'f1bre_models/ml-data.npz',HERE/'field.json',
           HERE/'cluj-ml/source.json',HERE/'cluj-ml/build.py',HERE/'base.py',
           *[HERE/'cluj-ml'/i for i in ('ml-training.json','ml-training.npz','ml-queries.json','ml-queries.npz')]]
    out=dict(version=1,fields=fields,sources={f.relative_to(ROOT).as_posix():sha(f) for f in files},
             audit=dict(stage3MatchedBO1=360,stage3MatchedBO3=360,stage3MatchedMapProbabilities=2520,
                        independentlyRecalculatedSeries=960,maxSeriesRoundingError=max_error))
    raw=(json.dumps(out,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode()
    file=HERE/'base.json.gz'
    if check:assert gzip.decompress(file.read_bytes())==raw
    else:file.write_bytes(gzip.compress(raw,mtime=0))
    print(out['audit'],sha(file))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--check',action='store_true')
    build(p.parse_args().check)
