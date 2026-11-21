"""Freeze original Elo and map-ML probabilities for the Shanghai Europe RMR A holdout."""
import argparse
import gzip
import itertools
import json
import re
from datetime import date
from pathlib import Path

import numpy as np
from field_a import HERE,ROOT,START,EVENT
from f1bre_models import elo,elo_inputs,ml,ml_prepare as base
from lineup_pairs.field import dated_records,save,sha

PAIRS=list(itertools.combinations(range(16),2))


def historical_maps(archive,series):
    for day,raw in dated_records(archive,base.FIRST_CS2,elo.iso(START,-2)):
        event=raw['event']
        assert event!=EVENT
        if not elo.independent(event):
            continue
        try:
            g=elo_inputs.hltv_game(raw)
        except (ValueError,KeyError,TypeError,OverflowError):
            g=None
        if g:
            series.append(g)
        if base.sources.EXCLUDE.search(' '.join(str(raw.get(k,'')) for k in ('event','stage','format','url'))):
            continue
        played=[m for m in raw.get('maps',[]) if m.get('status')=='played']
        halves=[re.match(r'^\((\d+):(\d+)',m.get('half_scores','')) for m in played]
        if not all(h and sum(map(int,h.groups()))==12 for h in halves):
            continue
        try:
            g=base.sources.hltvy.normalize(raw)
        except (ValueError,TypeError,OverflowError):
            continue
        if not g or not g['lineupA'] or not g['lineupB'] or not all(base.sources.valid_mr12(a,b) for _,a,b in g['maps']):
            continue
        for m,(label,a,b) in zip(played,g['maps']):
            players={base.sources.hltvy.key(m[s]['name']):m['players'][s] for s in ('team1','team2')}
            stats=[base.players(players[base.sources.hltvy.key(g[k])],g[k],a+b,'hltv') for k in ('a','b')]
            yield day,0,'hltv:'+str(g['mid']),event,label,a,b,stats


def elo_forecast(field,series,tables,cache):
    unique=[]
    seen={}
    for g in sorted(series,key=lambda g:(g['day'],g['time'],g['id'])):
        a,b=map(tuple,(g['fiveA'],g['fiveB']))
        maps=tuple(sorted((m.casefold(),x,y) if a<b else (m.casefold(),y,x) for m,x,y in g['maps']))
        identity=tuple(sorted((a,b)))+maps
        if identity in seen and g['day']<=elo.iso(seen[identity],1):
            continue
        unique.append(g)
        seen[identity]=g['day']
    anchor=elo.iso(START,-180)
    table=max((r for r in tables if r['published'][:10]<anchor),key=lambda r:r['published'])
    population={}
    for file in table['files']:
        for line in (cache/table['sha']/Path(file['path']).name).read_text(encoding='utf8').splitlines():
            c=[v.strip() for v in line.strip().strip('|').split('|')]
            if len(c)>=4 and c[0].isdigit():
                population[c[2].casefold()]=max(int(c[1]),population.get(c[2].casefold(),0))
    table={**table,'population':list(population.values())}
    posts=json.loads(gzip.decompress((ROOT/'f1bre_models/player-priors.json.gz').read_bytes()))['rows']
    prior=[g for g in posts if g['day']<anchor and g['availableAt'][:10]<anchor]
    source={'snapshots':[table],'rows':unique,'hltvRatingPublished':elo_inputs.ARCHIVE_PUBLISHED}
    out=elo.field(field,source,prior)
    assert out['ranking']['rankDay']==table['rankDay'] and out['coverage']['lastDay']<START
    return out


def forecast(archive,ranks):
    assert ml.xgb.__version__=='3.0.2'
    field=json.loads((HERE/'field.json').read_bytes())
    releases=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    tables=base.sources.release_tables(ranks,[r for r in releases if r['published'][:10]<START])
    series=[]
    h=base.History(historical_maps(archive,series),tables)
    cutoff=base.ordinal(START)
    with np.load(ROOT/'f1bre_models/ml-data.npz',allow_pickle=False) as z:
        days,ready=z['day'],z['ready']
        keep=(days>=cutoff-365)&(ready<=cutoff)
        days,ready=days[keep],ready[keep]
        x,y,events,ids,map_ids=[z[k][keep] for k in ('x','y','event','series','map')]
    meta=json.loads((ROOT/'f1bre_models/ml-data.json').read_bytes())
    assert EVENT not in {meta['events'][i] for i in np.unique(events)}
    rows={(g[2],g[4]):g for g in h.games}
    assert len(rows)==len(h.games)
    for i,(sid,mp) in enumerate(zip(ids,map_ids)):
        day,av,_,event,_,won,fives,points=rows[meta['series'][sid],mp]
        assert (day,av,event,int(won))==(days[i],ready[i],meta['events'][events[i]],y[i])
        before,_=h.vectors(day,fives,points)
        np.testing.assert_array_equal(before[mp].astype(np.float32),x[i])
    observed=np.unique(days)
    split=observed[int(len(observed)*.85)]
    cal=days>=split
    train=(ready<=split)&~np.isin(events,np.unique(events[cal]))
    assert ready[train].max()<=days[cal].min() and not np.intersect1d(ids[train],ids[cal]).size
    teams=field['teams']
    fives=[base.sources.roster(t['roster'],t['name']) for t in teams]
    pos=[base.MAPS.index(m) for m in field['pool']]
    queries,draw=[],[]
    for i,j in PAIRS:
        q,w=h.vectors(cutoff,[fives[i],fives[j]],[teams[i]['points'],teams[j]['points']])
        queries.append(q[pos]);draw.append(w[pos])
    pred=ml.predict_variant(x,y,days,train,cal,cutoff,np.asarray(queries,np.float32),np.asarray(draw,np.float64))
    replay=elo_forecast(field,series,tables,ranks)
    upper=lambda mat:[mat[i][j] for i,j in PAIRS]
    iso=lambda d:date.fromordinal(int(d)).isoformat()
    files=['f1bre_models/format_split/rmr_a/field_a.py','f1bre_models/format_split/rmr_a/field.json','f1bre_models/format_split/rmr_a/forecast_a.py',
           'f1bre_models/format_split/CONVERGENCE.md','f1bre_models/ml.py','f1bre_models/ml_prepare.py','f1bre_models/elo.py',
           'f1bre_models/elo_inputs.py','f1bre_models/ml-data.npz','f1bre_models/ml-data.json','f1bre_models/player-priors.json.gz']
    return dict(id=field['id'],cutoff=START,teams=[t['name'] for t in teams],
                mlBO1=upper(pred['bo1']),eloBO1=upper(replay['bo1']),mlBO3=upper(pred['bo3']),
                eloCoverage=replay['coverage'],eloAnchor=replay['ranking'],eloRatings=[t['elo'] for t in replay['entrants']],
                mlTraining=dict(available=len(x),tree=int(train.sum()),calibration=int(cal.sum()),
                                excluded=int((~train&~cal).sum()),lastTree=iso(days[train].max()),split=iso(split),
                                lastMap=iso(days.max()),latestAvailable=iso(ready.max())),
                archive=sha(archive),inputSHA256={s:sha(ROOT/s) for s in files})


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--hltvy',type=Path,required=True)
    ap.add_argument('--ranks',type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(HERE/'odds.json',forecast(args.hltvy,args.ranks),args.check)
