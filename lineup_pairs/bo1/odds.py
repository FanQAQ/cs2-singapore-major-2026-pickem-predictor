"""Freeze both Shanghai RMR B forecasts before importing any scores from the field."""
import argparse
import json
import re
from datetime import date
from pathlib import Path

import numpy as np
from inputs import DIR, EVENT, START
from field import ROOT, dated_records, save, sha
from model import HOLDOUT_EXCLUSIONS, PAIRS, PairHistory, base, ml, read


def past_maps(archive):
    for day, raw in dated_records(archive,base.FIRST_CS2,'2024-11-19'):
        event=raw.get('event','')
        assert event!=EVENT
        if event in HOLDOUT_EXCLUSIONS or base.sources.EXCLUDE.search(
                ' '.join(str(raw.get(k,'')) for k in ('event','stage','format','url'))):
            continue
        maps=[m for m in raw.get('maps',[]) if m.get('status')=='played']
        halves=[re.match(r'^\((\d+):(\d+)',m.get('half_scores','')) for m in maps]
        if not all(h and sum(map(int,h.groups()))==12 for h in halves):
            continue
        try:
            g=base.sources.hltvy.normalize(raw)
        except (TypeError,ValueError,OverflowError):
            continue
        if not g or not g['lineupA'] or not g['lineupB'] or not all(base.sources.valid_mr12(a,b) for _,a,b in g['maps']):
            continue
        for m,(label,a,b) in zip(maps,g['maps']):
            by_name={base.sources.hltvy.key(m[s]['name']):m['players'][s] for s in ('team1','team2')}
            stats=[base.players(by_name[base.sources.hltvy.key(g[k])],g[k],a+b,'hltv') for k in ('a','b')]
            yield day,0,'hltv:'+str(g['mid']),event,label,a,b,stats


def fit(archive,ranks):
    assert ml.xgb.__version__=='3.0.2'
    field=json.loads((DIR/'field.json').read_bytes())
    cutoff=base.ordinal(field['start'])
    releases=[r for r in read('tail_calibration/training-releases.json') if r['published'][:10]<START]
    history=base.History(past_maps(archive),base.sources.release_tables(ranks,releases))
    weighted=PairHistory(history)
    indexed={(g[2],g[4]):g for g in history.games}
    assert len(indexed)==len(history.games)
    meta=read('ml_allocation/ml-training.json')
    with np.load(ROOT/'ml_allocation/ml-training.npz',allow_pickle=False) as src:
        old,y,days,ready,events,sids,map_ids=[src[k] for k in ('x','y','day','ready','event','series','map')]
    eligible=(days>=cutoff-365)&(ready<=cutoff)
    observed=np.unique(days[eligible])
    split=observed[int(len(observed)*.85)]
    calibration=eligible&(days>=split)
    train=eligible&(ready<=split)&~np.isin(events,np.unique(events[calibration]))
    assert (eligible.sum(),train.sum(),calibration.sum())==(11271,8823,1699)
    assert ready[train].max()<=days[calibration].min()
    assert not np.intersect1d(sids[train],sids[calibration]).size and not np.intersect1d(events[train],events[calibration]).size
    assert EVENT not in {meta['events'][i] for i in np.unique(events[eligible])}
    new=np.empty_like(old)
    for i in np.flatnonzero(eligible):
        sid,mp=meta['series'][sids[i]],int(map_ids[i])
        day,av,_,event,_,won,fives,points=indexed[sid,mp]
        assert (day,av,event,int(won))==(days[i],ready[i],meta['events'][events[i]],y[i])
        before,after,_=weighted.vectors(day,fives,points)
        np.testing.assert_array_equal(before[mp].astype(np.float32),old[i])
        new[i]=after[mp]
    fixed=[0,*range(8,16)]
    np.testing.assert_array_equal(old[eligible][:,fixed],new[eligible][:,fixed])
    teams=field['teams']
    fives=[base.sources.roster(t['roster'],t['name']) for t in teams]
    counts=[weighted.team(f,cutoff)[2].tolist() for f in fives]
    assert [sum(c) for c in counts]==[history.profile(f,cutoff)[4] for f in fives]
    pos=[base.MAPS.index(m) for m in field['pool']]
    original_queries,change_queries,draw=[],[],[]
    for i,j in PAIRS:
        before,after,w=weighted.vectors(cutoff,[fives[i],fives[j]],[teams[i]['points'],teams[j]['points']])
        original_queries.append(before[pos]);change_queries.append(after[pos]);draw.append(w[pos])
    weights=np.asarray(draw,dtype=np.float64)
    arms={}
    for arm,x,q in [('baseline',old,original_queries),('candidate',new,change_queries)]:
        pred=ml.predict_variant(x,y,days,train,calibration,cutoff,np.asarray(q,np.float32),weights)
        arms[arm]={fmt:[pred[fmt][i][j] for i,j in PAIRS] for fmt in ('bo1','bo3')}
        arms[arm]['maps']=pred['mapProbabilities']
    iso=lambda d:date.fromordinal(int(d)).isoformat()
    a_idx=meta['events'].index('Perfect World Shanghai Major 2024 Europe RMR A')
    inputs=['lineup_pairs/bo1/field.json','lineup_pairs/bo1/inputs.py','lineup_pairs/bo1/odds.py','lineup_pairs/bo1/PROTOCOL.md',
            'lineup_pairs/model.py','f1bre_models/ml.py','f1bre_models/ml_prepare.py','ml_allocation/ml-training.json','ml_allocation/ml-training.npz']
    return dict(cutoff=START,teams=[t['name'] for t in teams],coreMaps=counts,pool=field['pool'],draw=(weights/weights.sum(axis=1,keepdims=True)).round(8).tolist(),
                arms=arms,inputs={s:sha(ROOT/s) for s in inputs},archive=sha(archive),seed=42,retention=[.3,.6,1.],
                training=dict(available=int(eligible.sum()),tree=int(train.sum()),calibration=int(calibration.sum()),
                              excluded=int((eligible&~train&~calibration).sum()),earlierRmrAMaps=int((calibration&(events==a_idx)).sum()),
                              lastTreeDay=iso(days[train].max()),calibrationStart=iso(split),lastMapDay=iso(days[eligible].max()),lastAvailable=iso(ready[eligible].max())))


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--hltvy',type=Path,required=True)
    ap.add_argument('--ranks',type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(DIR/'odds.json',fit(args.hltvy,args.ranks),args.check)
