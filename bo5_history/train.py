"""Train baseline and BO5-history XGBoost with the same original labels, split, and map weights."""
import argparse
import hashlib
import struct
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import numpy as np
from prepare import GROUPS, HERE, ROOT, base, read, sha, store, variants
from f1bre_models import ml


def train_group(group, names, coverage, frozen, queries, workers):
    meta_path,data_path=GROUPS[group]
    meta=read(ROOT/meta_path)
    with np.load(ROOT/data_path,allow_pickle=False) as f:
        data={k:f[k] for k in ('x','y','day','ready','event','series','map')}
    with np.load(HERE/(group+'-features.npz'),allow_pickle=False) as f:
        candidate=f['x']
    assert candidate.shape==data['x'].shape
    original=data['x'];y=data['y'];days=data['day'];ready=data['ready'];events=data['event']
    def one(key):
        cov=coverage[key];cut=base.ordinal(cov['cutoffExclusive'])
        raw=names[key]['teams']
        assert cov['teamOrder']==[r['name'] for r in raw]
        assert cov['rosters']==[base.sources.roster(r['roster'],r['name']) for r in raw]
        assert cov['points']==[r['points'] for r in raw]
        eligible=(days>=cut-365)&(ready<=cut)
        observed=np.unique(days[eligible]);split=observed[int(len(observed)*.85)]
        cal=eligible&(days>=split)
        train=eligible&(ready<=split)&~np.isin(events,np.unique(events[cal]))
        assert ready[train].max()<=min(days[cal]) and ready[eligible].max()<=cut
        assert not np.intersect1d(events[train],events[cal]).size and not np.intersect1d(data['series'][train],data['series'][cal]).size
        assert all('cluj' not in meta['events'][i].casefold() or '2026' not in meta['events'][i] for i in events[eligible])
        qs={k:queries[k+'_x_'+key] for k in ('baseline','candidate')}
        w=queries['baseline_w_'+key]
        f=dict(teams=cov['teamOrder'],pool=cov['pool'],start=cov['start'],cutoffExclusive=cov['cutoffExclusive'])
        for name,x in [('baseline',original),('candidate',candidate)]:
            v=ml.predict_variant(x,y,days,train,cal,cut,qs[name],w)
            f[name]={label:v[label] for label in ('mapProbabilities','bo1','bo3')}
            if name=='baseline' and key in frozen:
                for label,t in f[name].items():
                    assert t==frozen[key][label],(key,label,'baseline differs from the archived forecast')
        def digest(mask):
            h=hashlib.sha256()
            for i in np.flatnonzero(mask):
                mid=meta['series'][data['series'][i]].encode()
                h.update(mid+b'\0'+struct.pack('>BBii',data['map'][i],y[i],days[i],ready[i]))
            return h.hexdigest()
        def changed(a,b):
            return int(np.count_nonzero(np.any(~((a==b)|(np.isnan(a)&np.isnan(b))),axis=-1)))
        for feature in (0,13,14,15):
            np.testing.assert_array_equal(qs['baseline'][:,:,feature],qs['candidate'][:,:,feature])
        supervised={meta['events'][i] for i in np.unique(events[eligible])}
        if key=='masters-bucharest-2025':assert 'PGL Masters Bucharest 2025' not in supervised
        frozen_stats=frozen.get(key,{}).get('training',{})
        if frozen_stats:assert [int(train.sum()),int(cal.sum())]==[frozen_stats['treeMaps'],frozen_stats['calibrationMaps']]
        f['training']=dict(treeMaps=int(train.sum()),calibrationMaps=int(cal.sum()),eligibleMaps=int(eligible.sum()),
            heldAtSplit=int(eligible.sum()-train.sum()-cal.sum()),treeSha256=digest(train),calibrationSha256=digest(cal),
            treeFirstDay=date.fromordinal(int(days[train].min())).isoformat(),
            treeLastDay=date.fromordinal(int(days[train].max())).isoformat(),
            calibrationStart=date.fromordinal(int(split)).isoformat(),lastObserved=date.fromordinal(int(days[eligible].max())).isoformat(),
            originalReproduced=key in frozen,newBO5LabelCount=0,
            changedTreeVectors=changed(original[train],candidate[train]),
            changedCalibrationVectors=changed(original[cal],candidate[cal]),
            changedQueries=changed(qs['baseline'],qs['candidate']))
        # Releasing updated playing-frequency weights changes a second mechanism.
        # Report its size separately, never use these probabilities for the primary cards.
        alt_weight=queries['candidate_w_'+key]
        alt=ml.map_and_series(np.asarray(f['candidate']['mapProbabilities']),alt_weight)
        f['openWeightsDiagnostic']={}
        for bo in ('bo1','bo3'):
            delta=np.abs(np.asarray(alt[bo])-np.asarray(f['candidate'][bo]))[np.triu_indices(16,1)]
            f['openWeightsDiagnostic'][bo]=dict(meanAbsoluteDifference=float(np.mean(delta)),
                                                maxAbsoluteDifference=float(np.max(delta)))
        print(key,len(f['teams']),f['training']['treeMaps'],f['training']['changedTreeVectors'],flush=True)
        return key,f
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(pool.map(one,names))


def run(args):
    assert ml.xgb.__version__=='3.0.2'
    groups,frozen=variants()
    coverage=read(HERE/'coverage.json.gz')['fields']
    with np.load(HERE/'queries.npz',allow_pickle=False) as z:queries=dict(z)
    out={}
    for k,v in groups.items():out.update(train_group(k,v,coverage,frozen,queries,args.jobs))
    assert len(out)==21
    files=[ROOT/r for refs in GROUPS.values() for r in refs]
    files.extend(ROOT/f for f in ('f1bre_models/ml.py','f1bre_models/ml_prepare.py','f1bre_models/ml.json.gz',
        'veto_ml/astana-ml/ml.json.gz','latent_form/bucharest-ml/ml.json.gz','ml_allocation/ml.json.gz',
        'f1bre_models/major-fields.json','tail_calibration/training-releases.json'))
    files.extend(HERE/f for f in ('bo5-maps.json.gz','coverage.json.gz','queries.npz','major-features.npz',
              'external-features.npz','masters-field.json','inputs.py','prepare.py','train.py'))
    store(HERE/'models.json.gz',dict(version=1,xgboostVersion=ml.xgb.__version__,
        sources={p.relative_to(ROOT).as_posix():sha(p) for p in files},fields=out),args.check)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--jobs',type=int,default=3)
    p.add_argument('--check',action='store_true')
    run(p.parse_args())
