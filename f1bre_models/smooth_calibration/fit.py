"""Lock two BO3 calibration curves with identical chronological tree inputs."""
import argparse
from datetime import date
import gzip
import json
from pathlib import Path
import sys

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import expit, logit

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[1]))
from f1bre_models import ml
from lineup_pairs.field import save, sha

FIELDS=('austin-2025-3','budapest-2025-3','cologne-2026-3')


def fit(key,data,meta,reference):
    cutoff=date.fromisoformat(meta['fields'][key]['cutoffExclusive']).toordinal()
    x,y,day,ready,event=(data[k] for k in ('x','y','day','ready','event'))
    eligible=(day>=cutoff-365)&(ready<=cutoff)
    days=np.unique(day[eligible])
    split=days[int(.85*len(days))]
    cal=eligible&(day>=split)
    train=eligible&(ready<=split)&~np.isin(event,np.unique(event[cal]))
    assert not np.intersect1d(data['series'][train],data['series'][cal]).size
    assert train.sum()==reference['training']['treeMaps'] and cal.sum()==reference['training']['calibrationMaps']
    weights=np.exp2((day[train]-cutoff)/60)
    mirror=ml.xgb.DMatrix(np.concatenate([x[train],-x[train]]),label=np.r_[y[train],1-y[train]],
                           weight=np.tile(weights,2),nthread=1)
    tree=ml.xgb.train(ml.PARAMS,mirror,num_boost_round=160,verbose_eval=False)
    held=ml.symmetric(tree,x[cal])
    proj=ml.symmetric(tree,data['x_'+key])
    map_weights=data['w_'+key]
    xp,yp=ml.isotonic(np.r_[held,1-held],np.r_[y[cal],1-y[cal]])
    original=np.clip((1+np.interp(proj,xp,yp)-np.interp(1-proj,xp,yp))/2,.05,.95)
    assert ml.map_and_series(original,map_weights)['bo3']==reference['bo3']
    logits=logit(held)
    assert np.all(np.isfinite(logits)) and np.all((proj>0)&(proj<1))
    def loss(slope):
        z=slope*logits
        return np.mean(np.logaddexp(0,z)-y[cal]*z)
    result=minimize_scalar(loss,bounds=(0,20),method='bounded')
    assert result.success and 1e-4<result.x<19.9999
    calibrated=np.clip(expit(result.x*logit(proj)),.05,.95)
    return dict(teams=meta['fields'][key]['teams'],cutoffExclusive=date.fromordinal(cutoff).isoformat(),
                calibrationMaps=int(cal.sum()),slope=float(result.x),bo3=ml.map_and_series(calibrated,map_weights)['bo3'])


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    assert ml.xgb.__version__=='3.0.2'
    root=HERE.parent
    meta=json.loads((root/'ml-data.json').read_bytes())
    ref=json.loads(gzip.decompress((root/'ml.json.gz').read_bytes()))['fields']
    with np.load(root/'ml-data.npz',allow_pickle=False) as src:
        data={k:src[k] for k in src.files if k in ('x','y','day','ready','event','series') or
              k in {prefix+key for key in FIELDS for prefix in ('x_','w_')}}
    fields={key:fit(key,data,meta,ref[key]) for key in FIELDS}
    save(HERE/'odds.json',dict(inputSHA256=sha(root/'ml-data.npz'),fields=fields),args.check)
