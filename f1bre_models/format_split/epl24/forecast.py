"""Rebuild Katowice's seven-map BO3 probabilities from the frozen map-learning pipeline."""
import argparse
from datetime import date
from itertools import combinations
import json
from pathlib import Path
import sys

import numpy as np

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT))
from f1bre_models import ml, ml_prepare as base
from lineup_pairs.field import sha, save


def forecast(archive,ektarr,ranks):
    assert ml.xgb.__version__=='3.0.2'
    field=json.loads((HERE/'field.json').read_bytes())
    cutoff=field['cutoffExclusive']
    day=base.ordinal(cutoff)
    releases=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    tables=base.sources.release_tables(ranks,[r for r in releases if r['published'][:10]<cutoff])
    history=base.History(base.parse_games(archive,ektarr,cutoff_exclusive=cutoff),tables)
    path=ROOT/'f1bre_models/ml-data.npz'
    meta=json.loads(path.with_suffix('.json').read_bytes())
    with np.load(path,allow_pickle=False) as dataset:
        keep=(dataset['day']>=day-365)&(dataset['ready']<=day)
        x,y,days,ready,events,series,maps=(dataset[k][keep] for k in ('x','y','day','ready','event','series','map'))
    raw={(g[2],g[4]):g for g in history.games}
    assert len(raw)==len(history.games)
    for i,(sid,mp) in enumerate(zip(series,maps)):
        when,available,_,event,_,won,fives,points=raw[meta['series'][sid],mp]
        assert (when,available,event,int(won))==(days[i],ready[i],meta['events'][events[i]],y[i])
        assert when<day and available<=day
        features,_=history.vectors(when,fives,points)
        np.testing.assert_array_equal(features[mp].astype(np.float32),x[i])
    dates=np.unique(days)
    split=dates[int(.85*len(dates))]
    calibration=days>=split
    train=(ready<=split)&~np.isin(events,np.unique(events[calibration]))
    assert ready[train].max()<=days[calibration].min() and not np.intersect1d(series[train],series[calibration]).size
    teams=field['teams']
    five=[base.sources.roster(t['roster'],t['name']) for t in teams]
    indices=[base.MAPS.index(name) for name in field['mapPool']]
    queries,weights=[],[]
    for i,j in combinations(range(16),2):
        q,w=history.vectors(day,[five[i],five[j]],[teams[i]['points'],teams[j]['points']])
        queries.append(q[indices]);weights.append(w[indices])
    pred=ml.predict_variant(x,y,days,train,calibration,day,np.asarray(queries,np.float32),np.asarray(weights,np.float64))
    iso=lambda n:date.fromordinal(int(n)).isoformat()
    return dict(id=field['id'],cutoffExclusive=cutoff,model='full-map-xgboost',teams=[t['name'] for t in teams],
                pool=field['mapPool'],mapProbabilities=pred['mapProbabilities'],mapWeights=np.asarray(weights).tolist(),
                bo3=pred['bo3'],tree=int(train.sum()),calibration=int(calibration.sum()),excluded=int((~train&~calibration).sum()),
                lastTrainingDay=iso(days[train].max()),calibrationStart=iso(split),lastMap=iso(days.max()),
                latestAvailable=iso(ready.max()),inputs={p.name:sha(p) for p in
                (HERE/'field.json',Path(__file__),archive,ektarr,path,ROOT/'f1bre_models/ml.py',ROOT/'f1bre_models/ml_prepare.py')})


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    for name in ('hltvy','ektarr','ranks'):
        ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(HERE/'ml.json',forecast(args.hltvy,args.ektarr,args.ranks),args.check)
