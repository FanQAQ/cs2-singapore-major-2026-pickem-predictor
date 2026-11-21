"""Rebuild the last-complete-day snapshot; trained coefficients stay at the base cutoff."""
import argparse
import csv
import gzip
import json
import sys
from collections import defaultdict
from datetime import date
from itertools import groupby
import numpy as np
from scipy.special import expit
from settings import HERE, ROOT, START, close_day

sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/'map_veto_data'))
from strategy_v4 import build as v4
from map_strength import build as strength
from map_veto_data.build import FIELDS
from map_veto_data.prepare import choices

SOURCE_LINKS = {
    'griffin':dict(title='新加坡近况 · 11月20日公开比赛存档',
        url='https://github.com/Griffinxaxa/scrape-hltv-data/tree/f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58/2026-data/archive'),
    'hltvy':dict(title='历史临赛赛果与禁选 · 公开比赛存档',
        url='https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187'),
}

def read(s):
    return json.loads((ROOT/s).read_text())


def source_rows(s):
    with gzip.open(ROOT/s,'rt') as f:
        return list(csv.DictReader(f))


def check_extra(r,base,end,entry,pool):
    day=date.fromisoformat(r['day'])
    assert base<day<=end and r['id']>0
    assert r['url'].startswith(f"https://www.hltv.org/matches/{r['id']}/")
    lineups=[strength.roster(f) for f in r['lineups']]
    assert len(lineups)==2 and not lineups[0]&lineups[1]
    by_side=[strength.team_for(f,entry) for f in lineups]
    assert any(by_side) and (not all(by_side) or by_side[0][0]!=by_side[1][0])
    ranks=r.get('rank')
    if ranks:
        assert date.fromisoformat(ranks['day'])<day
        for f, ranked in zip(lineups,ranks['lineups'],strict=True):
            assert len(f & strength.roster(ranked))>=3
    maps=r['maps']
    assert len(set(m for m,_,_ in maps))==len(maps) and all(m in pool for m,_,_ in maps)
    assert all(a!=b and min(a,b)>=0 and max(a,b)>=13 for _,a,b in maps)
    assert all(m in [mp for _,act,mp in r['steps'] if act in ('pick','left')] for m,_,_ in maps)
    wins=sum(a>b for _,a,b in maps)
    assert r['bo'] in (1,3) and (wins==1+r['bo']//2) != (len(maps)-wins==1+r['bo']//2)
    assert len(maps)<=r['bo']
    return by_side


def profiles(original, extra, end, entrants, baseline):
    # Keep the original calibration on original dates. For late matches use the
    # base-period slope and round slope: only a subset of the circuit is observed late.
    history=v4.AppearanceHistory()
    observations=sorted(original,key=lambda r:(r['day'],r['id']))
    gaps,labels=[],[]
    cross=squared=0.
    for stamp, group in groupby(observations,key=lambda r:r['day']):
        day=date.fromisoformat(stamp).toordinal()
        slope=v4.calibrated_slope(gaps,labels)
        round_slope=cross/(squared+1)
        for r in group:
            gap=float(r['gap'])
            y=int(r['winner'])
            result=v4.margin(r['scores'])
            p=float(expit(slope*gap))
            residual=None
            if result is not None:
                residual=result-float(np.clip(round_slope*gap,-1,1))
                cross+=gap*result
                squared+=gap*gap
            for i,side in enumerate('AB'):
                history.add(day,v4.lineup(r['lineup'+side].split('|')), y if not i else 1-y,
                            p if not i else 1-p, residual if not i or residual is None else -residual)
            gaps.append(gap)
            labels.append(y)
    base_day=date.fromisoformat(baseline['asOf']).toordinal()
    for name,five in entrants.items():
        old=history.profile(base_day+1,five)
        for key,x in old.items():
            assert abs(x-baseline['teams'][name][key])<1e-12, (name,key,x)
    round_slope=cross/(squared+1)
    for r in extra:
        if 'rank' not in r:
            continue
        day=date.fromisoformat(r['day']).toordinal()
        gap=(r['rank']['points'][0]-r['rank']['points'][1])/100
        p=float(expit(baseline['calibrationSlope']*gap))
        maps=r['maps']
        y=int(sum(a>b for _,a,b in maps)>len(maps)/2)
        result=sum((a-b)/(a+b) for _,a,b in maps)/len(maps)
        residual=result-float(np.clip(round_slope*gap,-1,1))
        for side,five in enumerate(r['lineups']):
            history.add(day,v4.lineup(five),y if side==0 else 1-y,p if side==0 else 1-p,
                        residual if side==0 else -residual)
    return {name:history.profile(end.toordinal()+1,five) for name,five in entrants.items()}


def map_profiles(original, extra, end, entrants, old):
    seen=set()
    game_counts=defaultdict(list)
    series=set()
    pool=old['pool']
    def add(day,series_id,game_id,name,sides,points,winner,bo):
        age=(end-date.fromisoformat(day)).days
        if not 0<=age<90:
            return
        assert game_id not in seen and name in pool
        seen.add(game_id)
        series.add(series_id)
        p=strength.map_prior(points[0]-points[1],bo)
        for i,f in enumerate(sides):
            match=strength.team_for(f,entrants)
            if match:
                team,n=match
                game_counts[team].append(dict(series=series_id,map=name,date=day,
                    y=winner if i==0 else 1-winner,prior=p if i==0 else 1-p,
                    weight=(n/5)*.5**(age/45)))
    for r in original:
        add(r['day'],r['series'],r['gameId'],r['map'],[strength.roster(r[k].split('|')) for k in ('fiveA','fiveB')],
            [int(r['pointsA']),int(r['pointsB'])],int(r['winnerA']),int(r['bo']))
    for r in extra:
        if 'rank' not in r:
            continue
        sid='hltv:'+str(r['id'])
        for name,a,b in r['maps']:
            add(r['day'],sid,sid+'/'+name,name,[strength.roster(x) for x in r['lineups']],
                r['rank']['points'],int(a>b),r['bo'])
    return {**old,'asOf':end.isoformat(),'teams':{name:strength.profile(pool,game_counts[name]) for name in entrants},
            'series':len(series),'uniqueMaps':len(seen)}


def veto_profiles(original, extra, end, entrants, old, links):
    pool=old['pool']
    teams={name:{fmt:{'n':0,**{key:dict.fromkeys(pool,0) for key in FIELDS}}
                 for fmt in ('bo1','bo3')} for name in entrants}
    seen=set()
    days=[]
    def add(mid,stamp,team,fmt,counts):
        if not 0<=(end-date.fromisoformat(stamp)).days<90:
            return
        assert (mid,team) not in seen
        seen.add((mid,team))
        days.append(stamp)
        group=teams[team][fmt]
        group['n']+=1
        for field,values in zip(FIELDS, counts,strict=True):
            for name,n in zip(pool,values,strict=True):
                group[field][name]+=n
    for r in original:
        add(r['hltvId'],r['date'],r['team'],r['format'],r['counts'])
    for r in extra:
        table=choices(r,pool)
        assert table is not None
        for side,f in zip('ab',r['lineups'],strict=True):
            match=strength.team_for(strength.roster(f),entrants)
            if match:
                add(r['id'],r['day'],match[0],'bo'+str(r['bo']),[table[side][k] for k in FIELDS])
    return {**old,'asOf':end.isoformat(),'teams':teams,'series':len({mid for mid,_ in seen}),
            'first':min(days,default=None),'last':max(days,default=None),
            'coverage':{fmt:sum(t[fmt]['n']>0 for t in teams.values()) for fmt in ('bo1','bo3')},
            'sources':old['sources']+[link for link in links if link['url'] not in {s['url'] for s in old['sources']}]}


def build():
    fields=strength.entries()
    base_models=read('strategy_v4/models.json')
    old_maps=read('map_strength/events.json')
    old_veto=read('map_veto_data/veto.json')
    with gzip.open(HERE/'observations.json.gz','rt') as f:
        rows=json.load(f)
    assert len(rows)==len(set((r['event'],r['id']) for r in rows))
    with gzip.open(ROOT/'map_veto_data/evidence.json.gz','rt') as f:
        old_evidence=json.load(f)
    old_series=source_rows('strategy_v4/series.csv.gz')
    old_map_rows=source_rows('map_strength/maps.csv.gz')
    results={}
    for event,(base,entry) in fields.items():
        end=close_day(event)
        new=[r for r in rows if r['event']==event]
        by_team={name:{'series':0,'bo1':0,'bo3':0,'scoredSeries':0,'latestMatch':None} for name in entry}
        assert base<=end<START[event]
        for r in new:
            matches=check_extra(r,base,end,entry,old_maps[event]['pool'])
            for who in matches:
                if who:
                    stats=by_team[who[0]]
                    stats['series']+=1
                    stats['bo'+str(r['bo'])]+=1
                    stats['scoredSeries']+=int('rank' in r)
                    stats['latestMatch']=max(stats['latestMatch'] or r['day'],r['day'])
        links=[SOURCE_LINKS[key] for key in sorted({r['source'] for r in new})]
        for fmt in (1,3):
            candidates=[r for r in new if r['bo']==fmt]
            if candidates:
                x=max(candidates,key=lambda r:(r['day'],r['id']))
                links.append(dict(title='临赛 BO%d · %s 与 %s · %s'%(fmt,*x['teams'],x['day']),url=x['url']))
        if end==base:
            assert not new
            profile=base_models[event]['teams']
            maps=old_maps[event]
            veto=old_veto[event]
        else:
            profile=profiles([r for r in old_series if r['event']==event],new,end,entry,base_models[event])
            maps=map_profiles([r for r in old_map_rows if r['event']==event],new,end,entry,old_maps[event])
            veto=veto_profiles([r for r in old_evidence if r['event']==event],new,end,entry,old_veto[event],links)
        results[event]=dict(baseAsOf=base.isoformat(),asOf=end.isoformat(),stageStart=START[event].isoformat(),
                latestMatch=max((r['day'] for r in new),default=None),addedSeries=len(new),
                bo1=sum(r['bo']==1 for r in new),bo3=sum(r['bo']==3 for r in new),
                scoredSeries=sum('rank' in r for r in new),teamsCovered=sum(t['series']>0 for t in by_team.values()),
                rmrSeries=sum('rmr' in r['url'] for r in new),byTeam=by_team,
                profiles=profile,mapStrength=maps,mapVeto=veto,sources=links)
    return results


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--check',action='store_true')
    actions=p.parse_args()
    result=build()
    path=HERE/'events.json'
    raw=json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n'
    if actions.check:
        assert path.read_text()==raw
    else:
        temp=path.with_suffix('.tmp')
        temp.write_text(raw)
        temp.replace(path)
    for e,s in result.items():
        print(e,s['asOf'],s['addedSeries'],s['scoredSeries'],s['teamsCovered'])
