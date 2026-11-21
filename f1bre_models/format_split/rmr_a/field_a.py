"""Reconcile the announced RMR A field against the final pre-event Valve standings."""
import argparse
import json
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT))
from lineup_pairs.field import dated_records,normalize,key,save,sha
from latent_form.bucharest import read_ranks

START='2024-11-17'
EVENT='Perfect World Shanghai Major 2024 Europe RMR A'
BOOK='https://www.hltv.org/news/40041/pw-shanghai-major-rmr-rosters-revealed'
DRAW='https://www.hltv.org/news/40068/perfect-world-confirm-opening-rmr-matchups'
CHANGES={'SAW':('arrozdoce','Ag1l'),'Falcons':('SunPayus','s1mple'),'fnatic':('afro','nawwk'),
         'GamerLegion':('aNdu','Tauson'),'Cloud9':('Perfecto','interz')}

def build(archive,seeds,points):
    prior=json.loads((ROOT/'lineup_pairs/bo1/field.json').read_bytes())
    reg=json.loads((HERE/'registration.json').read_bytes())
    for src,p in [(prior['seeds'],seeds),(prior['globalPoints'],points)]:
        assert sha(p)==src['sha256'] and src['published'][:10]<START
    a,b=[read_ranks({'files':[s]},p) for s,p in [(prior['seeds'],seeds),(prior['globalPoints'],points)]]
    assert [t['name'] for t in a if t['name'] in reg]==list(reg)
    evidence={}
    for day,r in dated_records(archive,'2024-09-15','2024-11-16'):
        if not any(r[k] in reg for k in ('team1','team2')):continue
        g=normalize(r)
        if not g:continue
        for s in 'AB':
            name,five=g[s.lower()],g['lineup'+s]
            if name in reg and five and (day,g['mid'])>evidence.get(name,('',0))[:2]:
                evidence[name]=(day,g['mid'],five,g['url'])
    teams=[]
    for i,(name,registered) in enumerate(reg.items()):
        five=registered.copy()
        day,mid,played,url=evidence[name]
        if name in CHANGES:
            out,incoming=CHANGES[name]
            five[five.index(out)]=incoming
        ids=set(map(key,five))
        if name not in ('Vitality','UNiTY'):assert ids==set(map(key,played)),name
        overlaps=[(len(ids & set(map(key,t['roster']))),t) for t in b]
        best=max(n for n,_ in overlaps)
        t,=[v for n,v in overlaps if n==best]
        assert best>=3 and t['name']==name,(name,best,t)
        teams.append(dict(name=name,seed=i+1,roster=five,points=t['points'],vrsRoster=t['roster'],shared=best,
                          witness=dict(date=day,matchId=mid,five=played,url=url)))
    assert len({key(p) for t in teams for p in t['roster']})==80
    return dict(id='shanghai-europe-rmr-a-2024',start=START,cutoffExclusive=START,event=EVENT,teams=teams,allBo3=False,
                pool=prior['pool'],opening=list(zip(list(reg)[:8],list(reg)[8:])),registration=BOOK,draw=DRAW,
                seedRelease=prior['seeds'],strengthRelease=prior['globalPoints'])

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    for k in ('hltvy','seeds','points'):ap.add_argument('--'+k,type=Path,required=True)
    args=ap.parse_args();save(HERE/'field.json',build(args.hltvy,args.seeds,args.points))
