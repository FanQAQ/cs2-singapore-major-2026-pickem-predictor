"""Train a chronological XGBoost map model and project each hypothetical series."""
import argparse
import gzip
import hashlib
import itertools
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import numpy as np
import xgboost as xgb

HERE=Path(__file__).resolve().parent
TRIPLES=list(itertools.permutations(range(7),3))
PARAMS=dict(objective='binary:logistic',eval_metric='logloss',tree_method='hist',device='cpu',
            max_depth=4,eta=.03,subsample=.8,colsample_bytree=.8,min_child_weight=10,
            gamma=.1,reg_alpha=.1,reg_lambda=1,seed=42,nthread=1,verbosity=0)


def symmetric(model,x):
    shape=x.shape[:-1]
    x=np.ascontiguousarray(x.reshape(-1,x.shape[-1]))
    a=model.inplace_predict(x).astype(np.float64)
    b=model.inplace_predict(-x).astype(np.float64)
    return ((1+a-b)/2).reshape(shape)


def isotonic(p,y):
    """Pool adjacent violators over unique predictions, with equal weight per observation."""
    values,inv=np.unique(p,return_inverse=True)
    wins=np.bincount(inv,y); n=np.bincount(inv)
    blocks=[]
    for i in range(len(values)):
        blocks.append((i,i+1,wins[i],n[i]))
        while len(blocks)>1:
            a,b=blocks[-2:]
            if a[2]*b[3]<=b[2]*a[3]:break
            blocks[-2:]=[(a[0],b[1],a[2]+b[2],a[3]+b[3])]
    rates=np.empty(len(values))
    for lo,hi,w,c in blocks:rates[lo:hi]=w/c
    return values,rates


def map_and_series(probs,weights):
    assert probs.shape==weights.shape==(120,7)
    weights=weights/weights.sum(axis=1,keepdims=True)
    bo1=(weights*probs).sum(axis=1)
    bo3=np.zeros(120);mass=np.zeros(120)
    for a,b,c in TRIPLES:
        w=weights[:,a]*weights[:,b]/(1-weights[:,a])*weights[:,c]/(1-weights[:,a]-weights[:,b])
        p,q,r=probs[:,a],probs[:,b],probs[:,c]
        bo3+=w*(p*q+p*r+q*r-2*p*q*r)
        mass+=w
    assert np.max(abs(mass-1))<1e-10
    def matrix(ps):
        m=np.full((16,16),.5)
        for (a,b),p in zip(itertools.combinations(range(16),2),ps):
            m[a,b]=round(float(p),10);m[b,a]=round(1-m[a,b],10)
        return m.tolist()
    return dict(bo1=matrix(bo1),bo3=matrix(bo3))


def predict_variant(x,y,day,rows,cal,cutoff,query,weights):
    fitx=x[rows];fity=y[rows]
    importance=np.exp2((day[rows]-cutoff)/60)
    xmirror=np.concatenate([fitx,-fitx]);ymirror=np.concatenate([fity,1-fity])
    training=xgb.DMatrix(xmirror,label=ymirror,weight=np.tile(importance,2),nthread=1)
    model=xgb.train(PARAMS,training,num_boost_round=160,verbose_eval=False)
    held=symmetric(model,x[cal])
    xp,yp=isotonic(np.r_[held,1-held],np.r_[y[cal],1-y[cal]])
    proj=symmetric(model,query)
    mapped=np.clip((1+np.interp(proj,xp,yp)-np.interp(1-proj,xp,yp))/2,.05,.95)
    return {**map_and_series(mapped,weights),'mapProbabilities':np.round(mapped,8).tolist(),
            'calibrationKnots':len(xp),'treeCount':model.num_boosted_rounds()}


def field_fit(data,meta,key):
    f=meta['fields'][key];cutoff=date.fromisoformat(f['cutoffExclusive']).toordinal()
    x,y,day,ready,event=(data[k] for k in ['x','y','day','ready','event'])
    eligible=(day>=cutoff-365)&(ready<=cutoff)
    observed=np.unique(day[eligible]);split=observed[int(len(observed)*.85)]
    cal=eligible&(day>=split)
    cal_events=np.unique(event[cal])
    train=eligible&(ready<=split)&~np.isin(event,cal_events)
    assert train.sum()>100 and cal.sum()>30 and max(ready[train])<=min(day[cal])
    assert len(np.intersect1d(event[train],event[cal]))==0
    assert len(np.intersect1d(data['series'][train],data['series'][cal]))==0
    assert all('cluj' not in meta['events'][v].casefold() or '2026' not in meta['events'][v] for v in np.unique(event[eligible]))
    query=data['x_'+key];weights=data['w_'+key]
    out={}
    for name,stop in [('full',x.shape[1]),('ablation',8),('teamOnly',5)]:
        pred=predict_variant(x[:,:stop],y,day,train,cal,cutoff,query[:,:,:stop],weights)
        if name=='full':out.update(pred)
        else:out[name]=pred
    isodate=lambda n:date.fromordinal(int(n)).isoformat()
    out.update(f)
    out['training']=dict(windowStart=isodate(cutoff-365),firstObserved=isodate(day[eligible].min()),
          lastObserved=isodate(day[eligible].max()),latestAvailability=isodate(ready[eligible].max()),
          calibrationStart=isodate(split),eligibleMaps=int(eligible.sum()),treeMaps=int(train.sum()),
          calibrationMaps=int(cal.sum()),excludedAtSplit=int(eligible.sum()-train.sum()-cal.sum()),
          treeEvents=int(np.unique(event[train]).size),calibrationEvents=int(cal_events.size),
          treeSeries=int(np.unique(data['series'][train]).size),calibrationSeries=int(np.unique(data['series'][cal]).size),
          treeLastDay=isodate(day[train].max()),calibrationFirstDay=isodate(day[cal].min()),
          ratingPresentInTreeMaps=int(np.isfinite(x[train,13]).sum()),
          ratingPresentInCalibrationMaps=int(np.isfinite(x[cal,13]).sum()))
    return key,out


def run(check=False,jobs=4):
    meta=json.loads((HERE/'ml-data.json').read_text(encoding='utf8'))
    archive=HERE/'ml-data.npz'
    with np.load(archive,allow_pickle=False) as src:data={k:src[k] for k in src.files}
    assert len(meta['fields'])==15 and len(meta['features'])==16
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        fields=dict(pool.map(lambda key:field_fit(data,meta,key),meta['fields']))
    out=dict(xgboostVersion=xgb.__version__,features=meta['features'],seed=42,
             inputSha256=hashlib.sha256(archive.read_bytes()).hexdigest(),fields=fields)
    raw=(json.dumps(out,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode()
    dest=HERE/'ml.json.gz'
    if check: assert gzip.decompress(dest.read_bytes())==raw
    else:
        with dest.open('wb') as f,gzip.GzipFile(filename='',fileobj=f,mode='wb',mtime=0) as z:z.write(raw)
    for k,f in fields.items():
        t=f['training'];print(k,t['treeMaps'],t['calibrationMaps'],min(f['priorCoreMaps']),sum(f['ratingCoveredPlayers']))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true');parser.add_argument('--jobs',type=int,default=4)
    args=parser.parse_args();run(args.check,args.jobs)
