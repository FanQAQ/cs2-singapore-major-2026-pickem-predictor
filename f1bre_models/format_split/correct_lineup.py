"""Rerun the frozen estimators with fnatic's April 11 announcement, keeping the original lock."""
import argparse
import json
from pathlib import Path

import numpy as np
from mrq import HERE,ROOT,START
from forecast import PAIRS,base,elo_forecast,historical_maps,ml
from lineup_pairs.field import key,save,sha

ORIGINAL='b675ea9bf244197becfff5837e51034770b96302a5787a749136e95fae30cb22'
ANNOUNCEMENT='https://fnatic.com/community/5801-cs2-update'
POST='https://x.com/FNATICCS2/status/1910636997065982341'


def run(archive,ranks):
    assert sha(HERE/'odds.json')==ORIGINAL
    old=json.loads((HERE/'odds.json').read_bytes())
    f=json.loads((HERE/'field.json').read_bytes())
    ix=old['teams'].index('fnatic')
    team=f['teams'][ix]
    assert team['name']=='fnatic' and team['overlap']==5
    team['roster'][team['roster'].index('KRIMZ')]='b0RUP'
    team['roster'].sort(key=str.casefold)
    team['overlap']=len(set(map(key,team['roster'])) & set(map(key,team['vrsRoster'])))
    assert team['overlap']==4
    releases=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    tables=base.sources.release_tables(ranks,[r for r in releases if r['published'][:10]<START])
    actual=base.sources.roster(team['roster'],team['name'])
    ranked,shared=base.sources.rank_for(actual,tables[-1])
    assert ranked['p']==team['points'] and shared==4
    series=[]
    history=base.History(historical_maps(archive,series),tables)
    cutoff=base.ordinal(START)
    fives=[base.sources.roster(t['roster'],t['name']) for t in f['teams']]
    positions=[base.MAPS.index(m) for m in f['pool']]
    query,draw=[],[]
    for a,b in PAIRS:
        q,w=history.vectors(cutoff,[fives[a],fives[b]],[f['teams'][i]['points'] for i in (a,b)])
        query.append(q[positions]);draw.append(w[positions])
    with np.load(ROOT/'f1bre_models/ml-data.npz',allow_pickle=False) as z:
        keep=(z['day']>=cutoff-365)&(z['ready']<=cutoff)
        data={k:z[k][keep] for k in ('x','y','day','ready','event','series')}
    data['x_'+f['id']]=np.asarray(query,np.float32)
    data['w_'+f['id']]=np.asarray(draw,np.float64)
    meta=json.loads((ROOT/'f1bre_models/ml-data.json').read_bytes())
    meta['fields']={f['id']:f}
    _,maps=ml.field_fit(data,meta,f['id'])
    e=elo_forecast(f,series,tables,ranks)
    assert e['coverage']['series']==old['eloCoverage']['series']
    t=maps['training']
    assert (t['eligibleMaps'],t['treeMaps'],t['calibrationMaps'])==tuple(old['mlTraining'][k] for k in ('available','tree','calibration'))
    forecasts={'mlBO1':maps['bo1'],'mlBO3':maps['bo3'],'eloBO1':e['bo1']}
    changes=[]
    for k,(a,b) in enumerate(PAIRS):
        p={name:m[a][b] for name,m in forecasts.items()}
        if ix in (a,b):
            changes.append(dict(pair=k,**p))
        else:
            assert all(v==old[name][k] for name,v in p.items())
    assert len(changes)==15
    return dict(originalSHA256=ORIGINAL,team='fnatic',roster=team['roster'],vrsOverlap=team['overlap'],points=team['points'],
                publishedUTC='2025-04-11T10:12:12Z',source=ANNOUNCEMENT,post=POST,
                codeSHA256=sha(HERE/'correct_lineup.py'),protocolSHA256=sha(HERE/'ROSTER.md'),changes=changes)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--hltvy',type=Path,required=True)
    ap.add_argument('--ranks',type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(HERE/'correction.json',run(args.hltvy,args.ranks),args.check)
