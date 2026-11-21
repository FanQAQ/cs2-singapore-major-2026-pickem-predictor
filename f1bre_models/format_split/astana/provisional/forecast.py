"""Freeze the full-map ML arm using only data available at the Astana cutoff."""
import argparse
import itertools
import json
from datetime import date
from pathlib import Path
import numpy as np
from field import HERE,ROOT,START
from f1bre_models import ml,ml_prepare as base
from lineup_pairs.field import save,sha

POOL=['Ancient','Anubis','Dust2','Inferno','Mirage','Nuke','Overpass']

def forecast(archive,ektarr,ranks):
    assert ml.xgb.__version__=='3.0.2'
    f=json.loads((HERE/'field.json').read_bytes())
    releases=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    tables=base.sources.release_tables(ranks,[r for r in releases if r['published'][:10]<START])
    h=base.History(base.parse_games(archive,ektarr,cutoff_exclusive=START),tables)
    day=base.ordinal(START)
    keys=['x','y','day','ready','event','series','map']
    with np.load(ROOT/'f1bre_models/ml-data.npz',allow_pickle=False) as z:
        keep=(z['day']>=day-365)&(z['ready']<=day)
        data={k:z[k][keep] for k in keys}
    x,y,days,ready,events,series,maps=(data[k] for k in keys)
    meta=json.loads((ROOT/'f1bre_models/ml-data.json').read_bytes())
    event_names={meta['events'][i].lower() for i in np.unique(events)}
    related={n for n in event_names if 'astana' in n and '2026' in n}
    assert related<={'pgl astana 2026. закрытая европейская квалификация'},related
    rows={(g[2],g[4]):g for g in h.games}
    assert len(rows)==len(h.games)
    for i,(sid,mp) in enumerate(zip(series,maps)):
        when,available,_,event,_,won,fives,points=rows[meta['series'][sid],mp]
        assert (when,available,event,int(won))==(days[i],ready[i],meta['events'][events[i]],y[i])
        features,_=h.vectors(when,fives,points)
        np.testing.assert_array_equal(features[mp].astype(np.float32),x[i])
    dates=np.unique(days);split=dates[int(.85*len(dates))]
    cal=days>=split;train=(ready<=split)&~np.isin(events,np.unique(events[cal]))
    assert not np.intersect1d(series[train],series[cal]).size and ready[train].max()<=days[cal].min()
    teams=f['teams'];five=[base.sources.roster(t['roster'],t['name']) for t in teams]
    indices=[base.MAPS.index(m) for m in POOL]
    query=[];weights=[]
    for i,j in itertools.combinations(range(16),2):
        q,w=h.vectors(day,[five[i],five[j]],[teams[i]['points'],teams[j]['points']])
        query.append(q[indices]);weights.append(w[indices])
    pred=ml.predict_variant(x,y,days,train,cal,day,np.asarray(query,np.float32),np.asarray(weights,np.float64))
    iso=lambda x:date.fromordinal(int(x)).isoformat()
    return dict(id=f['id'],cutoffExclusive=START,model='full-map-xgboost',teams=[t['name'] for t in teams],
                pool=POOL,mapProbabilities=pred['mapProbabilities'],mapWeights=np.asarray(weights).tolist(),bo3=pred['bo3'],
                tree=int(train.sum()),calibration=int(cal.sum()),excluded=int((~train&~cal).sum()),
                lastTrainingDay=iso(days[train].max()),calibrationStart=iso(split),lastMap=iso(days.max()),
                latestAvailable=iso(ready.max()),inputs={p.name:sha(p) for p in (HERE/'field.json',Path(__file__),
                    archive,ektarr,ROOT/'f1bre_models/ml-data.npz',ROOT/'f1bre_models/ml.py',ROOT/'f1bre_models/ml_prepare.py')})

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    for arg in ('hltvy','ektarr','ranks'):ap.add_argument('--'+arg,type=Path,required=True)
    ap.add_argument('--check',action='store_true');a=ap.parse_args()
    save(HERE/'provisional-ml.json',forecast(a.hltvy,a.ektarr,a.ranks),a.check)
