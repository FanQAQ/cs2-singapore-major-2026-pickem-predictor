"""Predict the within-series ADR change on a verified played decider."""
import argparse
import csv
import gzip
import hashlib
import json
import re
import subprocess
from collections import Counter, defaultdict
from datetime import date,timedelta
from pathlib import Path
from statistics import mean

import numpy as np
from evaluate import HERE, SHA, handle
from format_model.build import norm

ROOT=HERE.parent
def read(path):
    raw=(ROOT/path).read_bytes()
    return json.loads(gzip.decompress(raw) if str(path).endswith('.gz') else raw)

def team(name):
    n=norm(name)
    return {'nip':'ninjasinpyjamas','mongolz':'themongolz','lv':'lynnvision','b8esports':'b8',
            'amkalesports':'amkal','nemigagaming':'nemiga','team3dmax':'3dmax','futesports':'fut'}.get(n,n)

def material(file):
    assert hashlib.sha256(file.read_bytes()).hexdigest()==SHA
    verified=read('veto_ml/sets.json')['fields']
    odds=read('veto_ml/models.json.gz')['fields']
    fields=read('f1bre_models/major-fields.json')['fields']
    fields['cluj-2026']=read('f1bre_models/cluj-field.json')
    fixtures=json.loads(subprocess.check_output(['node',str(HERE/'fixtures.cjs')]))
    stakes={(r['id'],s['won']):s['pressure'] for r in fixtures for s in r['sides']}
    losses=[0]*16
    cluj_stakes={}
    for stage_round in read('f1bre_models/cluj-results.json')['rounds']:
        for w,l,_ in stage_round:
            for i in (w,l):cluj_stakes[(w,l,i)]=losses[i]==2
            losses[l]+=1
    series=defaultdict(lambda:defaultdict(list))
    with file.open(encoding='utf-8-sig',newline='') as src:
        for r in csv.DictReader(src):
            if r['is_total']=='False' and r['bestOf'] and float(r['bestOf'])==3:
                k=(r['datetime'][:10],frozenset(team(r[t]) for t in ('team1','team2')))
                series[k][r['match_id']].append(r)
    coverage=defaultdict(Counter)
    obs=[]
    map_names=sorted({m for f in odds.values() for m in f['pool']})
    for key,f in fields.items():
        if key not in verified:continue
        group='cluj-2026' if key=='cluj-2026' else key.split('-')[0]
        model=odds[key]
        assert model['teams']==[t['name'] for t in f['teams']]
        pairs={(p['a'],p['b']):p['maps'] for p in model['pairs']}
        for g in verified[key]['rows']:
            c=coverage[group];c['series']+=1
            if not g['eligible'] or len(g['playedMaps'])!=3:continue
            c['playedDecider']+=1
            maps=g['planned']
            assert maps==g['playedMaps'] and len(set(maps))==3
            names=frozenset(map(team,g['teams']))
            if key=='cologne' and 'sharks' in names:names=(names-{'sharks'})|{'dendele'}
            byid=series.get((g['day'],names),{})
            if not byid and group!='cluj-2026':
                # Allow a UTC date boundary only for an independently archived Major fixture.
                nearby=[(date.fromisoformat(g['day'])+timedelta(days=n)).isoformat() for n in (-1,1)]
                byid={i:rr for d in nearby for i,rr in series.get((d,names),{}).items() if (i,True) in stakes}
            if len(byid)!=1:c['missingSeries']+=1;continue
            mid,rows=next(iter(byid.items()))
            bymap={r['map_name']:r for r in rows}
            if len(rows)!=3 or set(bymap)!=set(maps):c['incompleteMaps']+=1;continue
            p=pairs[g['a'],g['b']]
            diff=p[model['pool'].index(maps[2])]-mean(p[model['pool'].index(m)] for m in maps[:2])
            w=g['winner'];l=next(i for i in (g['a'],g['b']) if i!=w)
            records=[]; verified_sides=0
            for idx in (g['a'],g['b']):
                name=team(model['teams'][idx])
                if key=='cologne' and name=='sharks':name='dendele'
                registered=frozenset(handle(v) for v in f['teams'][idx]['roster'])
                stats=[]; wins=[]
                for m in maps:
                    r=bymap[m]
                    k='team1' if team(r['team1'])==name else 'team2'
                    assert team(r[k])==name
                    scores=[float(r['score1_game']),float(r['score2_game'])]
                    wins.append((scores[0]>scores[1])==(k=='team1'))
                    s={}
                    for j in range(1,6):
                        col=f'{k}_player{j}'
                        tag=handle(re.split(r'\s*[,(/]',r[col],maxsplit=1)[0])
                        pid,adr=r[col+'_id'],r[col+'_adr']
                        if tag and pid and pid!='0' and adr and np.isfinite(float(adr)) and float(adr)>0:
                            s[pid]=(tag,float(adr))
                    stats.append(s)
                assert wins[:2].count(True)==1 and wins[2]==(idx==w)
                if any(len(s)!=5 or {i:t[0] for i,t in s.items()}!={i:t[0] for i,t in stats[0].items()} for s in stats):
                    c['missingMapStatsSides']+=1;continue
                five=frozenset(t[0] for t in stats[0].values())
                if len(five & registered)<3:c['unmatchedSides']+=1;continue
                verified_sides+=1
                pressure=cluj_stakes[(w,l,idx)] if group=='cluj-2026' else stakes[(mid,idx==w)]
                design=[1.,diff if idx==g['a'] else -diff]
                design.extend(float(m==maps[2])-.5*float(m in maps[:2]) for m in map_names)
                for pid,(tag,_) in stats[0].items():
                    if tag not in registered:continue
                    delta=stats[2][pid][1]-mean(s[pid][1] for s in stats[:2])
                    records.append((group,g['day'],mid,pid,five,registered,pressure,design,delta))
            if verified_sides==2:
                obs.extend(records);c['verifiedDeciders']+=1
    return obs,coverage

def measure(rows):
    out=dict(n=len(rows),players=len({r[0][3] for r in rows}),series=len({r[0][2] for r in rows}))
    if rows:out.update(base=round(float(mean(x[1] for x in rows)),4),adjusted=round(float(mean(x[2] for x in rows)),4))
    return out

def run(file):
    obs,coverage=material(file)
    periods=sorted(coverage,key=lambda k:min(r[1] for r in obs if r[0]==k))
    past=[]; result={};all_scored=[]
    for period in periods:
        current=[r for r in obs if r[0]==period];scored=[]
        if past:
            assert max(r[1] for r in past)<min(r[1] for r in current)
            x=np.array([r[7] for r in past]);y=np.array([r[8] for r in past])
            # Zero-centered shrinkage equivalent to five observations for each slope.
            penalty=np.eye(x.shape[1])*5;penalty[0,0]=0
            beta=np.linalg.solve(x.T@x+penalty,x.T@y)
            residuals=defaultdict(list)
            for r,err in zip(past,y-x@beta):residuals[r[3]].append((r[4],err))
            for r in current:
                diffs=[d for s,d in residuals[r[3]] if len(s&r[5])>=3]
                base=np.dot(r[7],beta);eligible=len(diffs)>=3
                adj=sum(diffs)/(len(diffs)+5) if eligible else 0.
                scored.append((r,abs(r[8]-base),abs(r[8]-base-adj),eligible))
        active=[x for x in scored if x[3]]
        result[period]=dict(all=measure(scored),eligible=measure(active),twoLosses=measure([x for x in active if x[0][6]]))
        if period!='cluj-2026':past.extend(current);all_scored.extend(active)
    total=measure(all_scored); holdout=result['cluj-2026']['eligible']
    gains=sum(v['eligible'].get('adjusted',0)<v['eligible'].get('base',0) for k,v in result.items() if k!='cluj-2026')
    passed=total['n']>=50 and gains>=2 and total['adjusted']<total['base'] and holdout['n']>0 and holdout['adjusted']<=holdout['base']
    return dict(coverage=coverage,periods=result,eligibleMajors=total,improvingMajors=gains,passed=bool(passed))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--ektarr',type=Path,required=True);p.add_argument('--check',action='store_true')
    a=p.parse_args();data=run(a.ektarr);raw=json.dumps(data,indent=2)+'\n';file=HERE/'decider-scores.json'
    if a.check:assert file.read_text(encoding='utf-8')==raw
    else:file.write_bytes(raw.encode())
    print(data['eligibleMajors'],data['periods']['cluj-2026']['eligible'],data['passed'])
