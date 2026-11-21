"""Construct strictly lagged map-level training features from two pinned fact archives."""
import argparse
import bisect
import csv
import gzip
import hashlib
import itertools
import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from tail_calibration import training as sources
from history24.build import SERIES_SHA
from map_strength.build import POOLS

MAPS = sorted(sources.hltvy.MAPS.values())
FIRST_CS2 = '2023-09-27'
RATING_RELEASE = date(2026,3,25).toordinal()
TEAM = ['vrs','allWin','allRoundShare','allOpponentVrs','allVolume']
MAP = ['mapWin','mapRoundShare','mapVolume']
PLAYER = ['meanADR','bestADR','meanKAST','meanKPR','bestKPR','meanRating','bestRating','ratingDispersion']
FEATURES = TEAM + MAP + PLAYER
ordinal = lambda s: date.fromisoformat(s).toordinal()


def number(value):
    try:
        v = float(str(value).replace('%',''))
        return v if math.isfinite(v) else np.nan
    except (TypeError,ValueError):
        return np.nan


def players(rows, name, rounds, source):
    data = {}
    for raw in rows:
        if source=='hltv':
            who = raw['name']
            kills = number(str(raw.get('kd','')).split('-')[0])
            adr,kast,rating = map(number,[raw.get('adr'),raw.get('kast'),raw.get('rating')])
        else:
            who,adr,kast,kills = raw
            adr,kast,kills = map(number,[adr,kast,kills])
            rating = np.nan
        nick = sources.roster([who],name)[0]
        data[nick] = [adr if 0<=adr<=400 else np.nan,kast/100 if 0<=kast<=100 else np.nan,
                      kills/rounds if 0<=kills<=5*rounds else np.nan,rating if 0<rating<=4 else np.nan]
    return data


def parse_games(archive,ektarr,*,ektarr_sha=SERIES_SHA,cutoff_exclusive='2026-11-21'):
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==sources.hltvy.SHA256
    with gzip.open(archive,'rt',encoding='utf8') as f:
        hltv=json.load(f)
    for raw in hltv:
        day=datetime.fromtimestamp(int(raw['date'])/1000,timezone.utc).date().isoformat()
        if not FIRST_CS2<=day<=sources.LAST_ARCHIVE_DAY:continue
        event=raw.get('event','')
        if 'cluj' in event.casefold() and '2026' in event:continue
        if sources.EXCLUDE.search(' '.join(str(raw.get(k,'')) for k in ('event','stage','format','url'))):continue
        rr=[g for g in raw.get('maps',[]) if g.get('status')=='played']
        half=[re.match(r'^\((\d+):(\d+)',g.get('half_scores','')) for g in rr]
        if not all(m and sum(map(int,m.groups()))==12 for m in half):continue
        try:m=sources.hltvy.normalize(raw)
        except (ValueError,TypeError,OverflowError):continue
        if not m or not m.get('lineupA') or not m.get('lineupB'):continue
        if not all(sources.valid_mr12(x,y) for _,x,y in m['maps']):continue
        sides=[m['a'],m['b']]
        for rawmap,(label,x,y) in zip(rr,m['maps']):
            by_name={sources.hltvy.key(rawmap[side]['name']):rawmap['players'][side] for side in ('team1','team2')}
            stats=[players(by_name[sources.hltvy.key(n)],n,x+y,'hltv') for n in sides]
            yield (day,0,'hltv:'+str(m['mid']),event,label,x,y,stats)
    del hltv
    # Restrict the later source to the disjoint post-HLTvy period before retaining any rows.
    assert hashlib.sha256(ektarr.read_bytes()).hexdigest()==ektarr_sha
    groups=defaultdict(list)
    with ektarr.open(encoding='utf-8-sig',newline='') as f:
        for r in csv.DictReader(f):
            day=r['datetime'][:10]
            if r['is_total']!='False' or not sources.shifted(sources.LAST_ARCHIVE_DAY,1)<day<cutoff_exclusive:continue
            if sources.EXCLUDE.search(r['tournament']) or 'cluj' in r['tournament'].lower() and '2026' in r['tournament']:continue
            groups[r['match_id']].append(r)
    mapids=Counter(g['game_id'] for rr in groups.values() for g in rr)
    for mid,rr in groups.items():
        if not sources.validated(rr) or any(mapids[g['game_id']]!=1 for g in rr):continue
        if not all(sources.valid_mr12(int(float(g['score1_game'])),int(float(g['score2_game']))) for g in rr):continue
        for g in rr:
            label=sources.hltvy.MAPS.get(g['map_name'].lower())
            if not label:continue
            x,y = [int(float(g['score'+str(s)+'_game'])) for s in [1,2]]
            sides=[]
            for s in [1,2]:
                box=[]
                for i in range(1,6):
                    k=f'team{s}_player{i}'
                    nick=re.split(r'\s*[,(/]',g[k],maxsplit=1)[0]
                    box.append([nick,g[k+'_adr'],g[k+'_kast'],g[k+'_kills']])
                sides.append(players(box,g['team'+str(s)],x+y,'ektarr'))
            if any(sum(np.nan_to_num(v[2]) for v in side.values())<=0 for side in sides):continue
            yield (g['datetime'][:10],1,'ektarr:'+mid,g['tournament'],label,x,y,sides)


class Timelines:
    def __init__(self):
        self.lists=defaultdict(list)
        self.times={}

    def finalize(self,availability):
        for key,ind in self.lists.items():
            self.times[key]=[availability[i] for i in ind]
            assert self.times[key]==sorted(self.times[key])

    def prior(self,key,day):
        t=self.times.get(key)
        if t is None:return []
        return self.lists[key][bisect.bisect_left(t,day-365):bisect.bisect_right(t,day)]


class History:
    def __init__(self,raw,tables):
        self.cores=Timelines()
        self.members=Timelines()
        self.triples=defaultdict(set)
        pub=[r['published'][:10] for r in tables]
        self.games=[]
        sidefacts=[];personfacts=[];persondates=[];personavail=[]
        sideavail=[]; map_seen=set(); self.start=None
        ordered=sorted(raw,key=lambda g:(ordinal(g[0])+g[1]+2,g[2],g[4]))
        for day,uncertainty,mid,event,mp,x,y,sides in ordered:
            earliest=ordinal(day)-uncertainty; available=ordinal(day)+uncertainty+2
            rid=bisect.bisect_left(pub,date.fromordinal(earliest).isoformat())-1
            if rid<0 or any(len(s)!=5 for s in sides) or set(sides[0])&set(sides[1]):continue
            if (mid,mp) in map_seen:raise ValueError('Repeated map '+mid)
            map_seen.add((mid,mp))
            five=[tuple(sorted(s)) for s in sides]
            matches=[sources.rank_for(v,tables[rid]) for v in five]
            if any(q is None for q in matches):continue
            ranks=[q[0] for q in matches]
            if ranks[0] is ranks[1]:continue
            points=[r['p'] for r in ranks]
            index=MAPS.index(mp)
            self.games.append((earliest,available,mid,event,index,x>y,five,points))
            for s in [0,1]:
                names=five[s]
                if names not in self.cores.lists:
                    for tri in self.keys(names):self.triples[tri].add(names)
                self.cores.lists[names].append(len(sidefacts));sideavail.append(available)
                sidefacts.append((earliest,index,float((x>y)==(s==0)),(x if s==0 else y)/(x+y),points[1-s]))
                for name,values in sides[s].items():
                    if name in sources.AMBIGUOUS:continue
                    self.members.lists[name].append(len(personfacts))
                    personfacts.append(values);persondates.append(earliest);personavail.append(available)
        self.cores.finalize(sideavail);self.members.finalize(personavail)
        self.sf=np.asarray(sidefacts);self.pf=np.asarray(personfacts);self.pday=np.asarray(persondates)
        self.cache={}; self.profiles={}

    @staticmethod
    def keys(five):
        return itertools.combinations(sorted(set(five)-sources.AMBIGUOUS),3)

    def profile(self,five,day):
        if day!=self.start:
            self.start=day;self.profiles.clear();self.cache.clear()
        five=tuple(sorted(five))
        if five in self.profiles:return self.profiles[five]
        rosters=set().union(*(self.triples[t] for t in self.keys(five)))
        ids=[i for r in sorted(rosters) for i in self.cores.prior(r,day)]
        rows=self.sf[ids]; rows=rows[rows[:,0]>=day-365]
        w=2**((rows[:,0]-day)/30)
        maps=rows[:,1].astype(int); L=len(MAPS)
        mass=np.bincount(maps,w,minlength=L)
        wins=np.bincount(maps,w*rows[:,2],minlength=L)
        share=np.bincount(maps,w*rows[:,3],minlength=L)
        total=w.sum()
        team=[(1+w@rows[:,2])/(2+total),(1+w@rows[:,3])/(2+total),
              w@rows[:,4]/total if total else np.nan, np.log1p(total)]
        mapvars=np.column_stack(((1+wins)/(2+mass),(1+share)/(2+mass),np.log1p(mass)))
        personal=[]
        for n in five:
            if n not in self.cache:
                ii=self.members.prior(n,day);ii=np.asarray(ii,dtype=int)
                ii=ii[self.pday[ii]>=day-365]
                ww=2**((self.pday[ii]-day)/30)
                vals=self.pf[ii]
                den=ww@np.isfinite(vals)
                means=np.divide(ww@np.nan_to_num(vals),den,out=np.full(4,np.nan),where=den>0)
                if day<RATING_RELEASE:means[3]=np.nan
                self.cache[n]=means
            personal.append(self.cache[n])
        v=np.asarray(personal)
        def statistic(col,fn):
            xs=v[:,col];xs=xs[np.isfinite(xs)]
            return fn(xs) if len(xs) else np.nan
        perf=[statistic(0,np.mean),statistic(0,np.max),statistic(1,np.mean),statistic(2,np.mean),
              statistic(2,np.max),statistic(3,np.mean),statistic(3,np.max),statistic(3,np.std)]
        self.profiles[five]=(np.array(team),mapvars,np.array(perf),mass,len(rows),int(np.isfinite(v[:,3]).sum()))
        return self.profiles[five]

    def vectors(self,day,fives,points):
        a,b=[self.profile(f,day) for f in fives]
        head=np.asarray([points[0]-points[1],*(a[0]-b[0])])
        return np.column_stack((np.tile(head,(len(MAPS),1)),a[1]-b[1],np.tile(a[2]-b[2],(len(MAPS),1)))),np.sqrt((1+a[3])*(1+b[3]))


def build(archive,ektarr,ranks,check=False):
    fields=json.loads((HERE/'major-fields.json').read_text(encoding='utf8'))['fields']
    cluj=json.loads((HERE/'cluj-field.json').read_text(encoding='utf8'))
    fields[cluj['id']]=cluj
    h=History(parse_games(archive,ektarr),sources.release_tables(ranks))
    arrays={};features=[];labels=[];days=[];ready=[];events=[];mids=[];mapnames=[];meta={}
    ids={};seriesids={}
    for day,av,mid,event,mp,y,five,points in h.games:
        x,_=h.vectors(day,five,points)
        features.append(x[mp]);labels.append(int(y));days.append(day);ready.append(av)
        events.append(ids.setdefault(event,len(ids)));mids.append(seriesids.setdefault(mid,len(seriesids)));mapnames.append(mp)
    arrays.update(x=np.asarray(features,np.float32),y=np.asarray(labels,np.int8),day=np.asarray(days,np.int32),
                  ready=np.asarray(ready,np.int32),event=np.asarray(events,np.int32),series=np.asarray(mids,np.int32),
                  map=np.asarray(mapnames,np.int8))
    for key,field in fields.items():
        pool=POOLS['cologne' if key=='cluj-2026' else key.split('-')[0]][0].split()
        pos=[MAPS.index(m) for m in pool]; cutoff=ordinal(field['cutoffExclusive'])
        teams=field['teams']; fives=[sources.roster(t['roster'],t['name']) for t in teams]
        ps=[t['points'] for t in teams]; query=[];weights=[]
        for i,j in itertools.combinations(range(16),2):
            x,w=h.vectors(cutoff,[fives[i],fives[j]],[ps[i],ps[j]])
            query.append(x[pos]);weights.append(w[pos])
        arrays['x_'+key]=np.asarray(query,np.float32);arrays['w_'+key]=np.asarray(weights,np.float64)
        coverage=[h.profile(f,cutoff)[-2:] for f in fives]
        meta[key]=dict(start=field['start'],cutoffExclusive=field['cutoffExclusive'],pool=pool,
                       teams=[t['name'] for t in teams],priorCoreMaps=[r[0] for r in coverage],
                       ratingCoveredPlayers=[r[1] for r in coverage])
    metadata=dict(features=FEATURES,events=list(ids),series=list(seriesids),mapNames=MAPS,fields=meta)
    if check:
        assert metadata==json.loads((HERE/'ml-data.json').read_text(encoding='utf8'))
        with np.load(HERE/'ml-data.npz',allow_pickle=False) as frozen:
            assert set(arrays)==set(frozen.files)
            for k,value in arrays.items():np.testing.assert_array_equal(value,frozen[k])
    else:
        np.savez_compressed(HERE/'ml-data.npz',**arrays)
        (HERE/'ml-data.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(len(labels),'map labels',len(seriesids),'series',len(ids),'events',len(fields),'fields',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for arg in ['hltvy','ektarr','ranks']:parser.add_argument('--'+arg,type=Path,required=True)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args();build(args.hltvy,args.ektarr,args.ranks,args.check)
