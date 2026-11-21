"""One intervention on team-level map evidence, with original inputs verified for every fit."""
import argparse
import gzip
import itertools
import json
import re
from datetime import date
from pathlib import Path

import numpy as np
from field import HERE, ROOT, ID, FISSURE, FISSURE_START, dated_records, save, sha
from f1bre_models import ml, ml_prepare as base
from map_strength.build import POOLS

STAGES = ['austin-2025-3', 'budapest-2025-3', 'cologne-2026-3']
HOLDOUT_EXCLUSIONS = {'Elisa Invitational Spring 2024','Elisa Invitational Fall 2024'}
PAIRS = list(itertools.combinations(range(16),2))
RETAINED = np.array([0.,0.,0.,.3,.6,1.])


def holdout_games(archive):
    for day, raw in dated_records(archive,base.FIRST_CS2,'2025-09-10'):
        event = raw.get('event','')
        assert event != FISSURE
        if event in HOLDOUT_EXCLUSIONS or base.sources.EXCLUDE.search(
                ' '.join(str(raw.get(k,'')) for k in ('event','stage','format','url'))):
            continue
        played = [m for m in raw.get('maps',[]) if m.get('status')=='played']
        halves = [re.match(r'^\((\d+):(\d+)',m.get('half_scores','')) for m in played]
        if not all(h and sum(map(int,h.groups()))==12 for h in halves):
            continue
        try:
            series = base.sources.hltvy.normalize(raw)
        except (TypeError,ValueError,OverflowError):
            continue
        if not series or not series['lineupA'] or not series['lineupB']:
            continue
        if not all(base.sources.valid_mr12(a,b) for _,a,b in series['maps']):
            continue
        for m,(label,a,b) in zip(played,series['maps']):
            by_name = {base.sources.hltvy.key(m[s]['name']):m['players'][s] for s in ('team1','team2')}
            stats = [base.players(by_name[base.sources.hltvy.key(series[k])],series[k],a+b,'hltv') for k in ('a','b')]
            yield day,0,'hltv:'+str(series['mid']),event,label,a,b,stats


class PairHistory:
    def __init__(self, original):
        self.original = original
        self.day = None
        self.cache = {}

    def team(self, five, day):
        if day != self.day:
            self.cache.clear()
            self.day = day
        five = tuple(sorted(five))
        if five in self.cache:
            return self.cache[five]
        h = self.original
        rosters = set().union(*(h.triples[t] for t in h.keys(five)))
        valid = set(five)-base.sources.AMBIGUOUS
        indices, shared = [], []
        for past in sorted(rosters):
            prior = h.cores.prior(past,day)
            indices.extend(prior)
            shared.extend([len(valid.intersection(past))]*len(prior))
        rows = h.sf[indices]
        keep = rows[:,0]>=day-365
        rows, n = rows[keep], np.asarray(shared,dtype=int)[keep]
        assert (n>=3).all() and (n<=5).all()
        by_core = np.bincount(n,minlength=6)[3:6]
        w = np.exp2((rows[:,0]-day)/30)*RETAINED[n]
        mp = rows[:,1].astype(int)
        mass = np.bincount(mp,w,minlength=len(base.MAPS))
        wins = np.bincount(mp,w*rows[:,2],minlength=len(base.MAPS))
        share = np.bincount(mp,w*rows[:,3],minlength=len(base.MAPS))
        total = w.sum()
        team = np.array([(1+w@rows[:,2])/(2+total),(1+w@rows[:,3])/(2+total),
                         w@rows[:,4]/total if total else np.nan,np.log1p(total)])
        maps = np.column_stack(((1+wins)/(2+mass),(1+share)/(2+mass),np.log1p(mass)))
        self.cache[five] = team,maps,by_core
        return self.cache[five]

    def vectors(self, day, fives, points):
        old, draw = self.original.vectors(day,fives,points)
        a,b = [self.team(f,day) for f in fives]
        new = old.copy()
        new[:,1:5],new[:,5:8] = a[0]-b[0],a[1]-b[1]
        if not any(x[2][:2].sum() for x in (a,b)):
            np.testing.assert_array_equal(old.astype(np.float32),new.astype(np.float32))
        return old,new,draw


def read(relative):
    path = ROOT/relative
    return json.loads(gzip.decompress(path.read_bytes()) if path.suffix=='.gz' else path.read_bytes())


def make_fit(args):
    assert ml.xgb.__version__=='3.0.2'
    holdout = args.cohort=='holdout'
    fields = {ID:read('lineup_pairs/field.json')} if holdout else {k:v for k,v in
              read('f1bre_models/major-fields.json')['fields'].items() if k in STAGES}
    latest = max(v['cutoffExclusive'] for v in fields.values())
    releases = [r for r in read('tail_calibration/training-releases.json') if r['published'][:10]<latest]
    if holdout:
        raw, archive_name = holdout_games(args.hltvy),'ml_allocation/ml-training'
    else:
        assert args.ektarr, 'Supply the v11 Ektarr source for Cologne'
        raw = (g for g in base.parse_games(args.hltvy,args.ektarr,cutoff_exclusive=latest)
               if base.ordinal(g[0])+g[1]+2<=base.ordinal(latest))
        archive_name = 'f1bre_models/ml-data'
    original = base.History(raw,base.sources.release_tables(args.ranks,releases))
    h = PairHistory(original)
    facts = {(g[2],g[4]):g for g in original.games}
    assert len(facts)==len(original.games) and max(g[1] for g in facts.values())<=base.ordinal(latest)
    metadata = read(archive_name+'.json')
    with np.load(ROOT/(archive_name+'.npz'),allow_pickle=False) as data:
        old = data['x']
        days,ready,events,sids,mapidx,y = [data[k] for k in ('day','ready','event','series','map','y')]
        windows = {}
        active = np.zeros(len(old),dtype=bool)
        for key,field in fields.items():
            cutoff = base.ordinal(field['cutoffExclusive'])
            elig = (days>=cutoff-365)&(ready<=cutoff)
            split = np.unique(days[elig])[int(len(np.unique(days[elig]))*.85)]
            cal = elig&(days>=split)
            train = elig&(ready<=split)&~np.isin(events,np.unique(events[cal]))
            assert ready[train].max()<=days[cal].min() and not np.intersect1d(sids[train],sids[cal]).size
            assert not np.intersect1d(events[train],events[cal]).size
            if holdout:
                assert (int(elig.sum()),int(train.sum()),int(cal.sum()))==(13642,11007,2425)
                assert FISSURE not in {metadata['events'][i] for i in np.unique(events[elig])}
            windows[key] = cutoff,elig,train,cal
            active |= elig
        new = np.empty_like(old)
        for i in np.flatnonzero(active):
            sid,mp = metadata['series'][sids[i]],int(mapidx[i])
            day,av,_,event,_,won,five,points = facts[(sid,mp)]
            assert (day,av,event,int(won)) == (days[i],ready[i],metadata['events'][events[i]],y[i])
            before,after,_ = h.vectors(day,five,points)
            np.testing.assert_array_equal(before[mp].astype(np.float32),old[i])
            new[i]=after[mp]
        np.testing.assert_array_equal(old[active][:,[0,*range(8,16)]],new[active][:,[0,*range(8,16)]])
        frozen = {} if holdout else read('f1bre_models/ml.json.gz')['fields']
        locked = {}
        for key,field in fields.items():
            cutoff,elig,train,cal = windows[key]
            teams=field['teams']
            fives=[base.sources.roster(t['roster'],t['name']) for t in teams]
            pool=field['pool'] if holdout else POOLS[key.split('-')[0]][0].split()
            pos=[base.MAPS.index(m) for m in pool]
            q0,q1,draw = [],[],[]
            for i,j in PAIRS:
                o,n,w = h.vectors(cutoff,[fives[i],fives[j]],[teams[i]['points'],teams[j]['points']])
                q0.append(o[pos]);q1.append(n[pos]);draw.append(w[pos])
            q0,q1,w=np.array(q0,np.float32),np.array(q1,np.float32),np.array(draw,np.float64)
            if not holdout:
                np.testing.assert_array_equal(data['x_'+key],q0)
                np.testing.assert_array_equal(data['w_'+key],w)
            counts=[h.team(f,cutoff)[2].tolist() for f in fives]
            assert [sum(c) for c in counts]==[original.profile(f,cutoff)[4] for f in fives]
            names=[t['name'] for t in teams]
            pred={}
            for arm,x,q in [('baseline',old,q0),('candidate',new,q1)]:
                out=ml.predict_variant(x,y,days,train,cal,cutoff,q,w)
                if not holdout and arm=='baseline':
                    for fmt in ('bo1','bo3','mapProbabilities'):
                        np.testing.assert_array_equal(out[fmt],frozen[key][fmt])
                pred[arm]={fmt:[out[fmt][i][j] for i,j in PAIRS] for fmt in ('bo1','bo3')}
            iso=lambda v:date.fromordinal(int(v)).isoformat()
            locked[key]=dict(cutoff=iso(cutoff),teams=names,coreMaps=counts,pool=pool,
                             tree=int(train.sum()),calibration=int(cal.sum()),available=int(elig.sum()),
                             lastTreeDay=iso(days[train].max()),firstCalibrationDay=iso(days[cal].min()),
                             lastMapDay=iso(days[elig].max()),latestAvailable=iso(ready[elig].max()),arms=pred)
            print(key,locked[key]['tree'],locked[key]['calibration'],'maps, 120 locked pairs',flush=True)
    return dict(features=base.FEATURES,weights=RETAINED[3:].tolist(),seed=42,
                inputs={s:sha(ROOT/s) for s in [archive_name+'.npz',archive_name+'.json',
                    'lineup_pairs/field.json' if holdout else 'f1bre_models/major-fields.json',
                    'lineup_pairs/model.py','f1bre_models/ml_prepare.py','f1bre_models/ml.py']},
                fields=locked)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('cohort',choices=['holdout','development'])
    for arg in ('hltvy','ranks','ektarr'):
        p.add_argument('--'+arg,type=Path,required=arg!='ektarr')
    p.add_argument('--check',action='store_true')
    args=p.parse_args()
    save(HERE/(args.cohort+'-matrices.json'),make_fit(args),args.check)
