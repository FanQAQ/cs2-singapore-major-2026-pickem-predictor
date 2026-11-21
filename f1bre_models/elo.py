"""Reproducible, chronological, roster-inheriting adaptation of F1bre's Elo."""
import argparse
import gzip
import hashlib
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from itertools import combinations
from pathlib import Path
from statistics import mean, pstdev

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
sys.path.insert(0,str(ROOT))
from experience.build_history import AMBIGUOUS, TEAM_ALIASES, normalize

OUTPUT=HERE/'elo.json.gz'
HISTORY=HERE/'elo-data.json.gz'
PRIOR=HERE/'player-priors.json.gz'
ALIASES={'v$m':'vsm','hunter-':'hunter','dav1d':'dav1deus','rmn':'roman','dev1ce':'device'}


def iso(day, shift=0):
    return (date.fromisoformat(day)+timedelta(days=shift)).isoformat()


def age(newer,older):
    return (date.fromisoformat(newer)-date.fromisoformat(older)).days


def five(raw,org):
    specific=TEAM_ALIASES.get(normalize(org),{})
    result=[]
    for x in raw:
        p=normalize(x)
        result.append(specific.get(p,ALIASES.get(p,p)))
    assert len(set(result))==len(result) and '' not in result
    return tuple(sorted(result))


def keys(f):
    return combinations(sorted(set(f)-AMBIGUOUS),3)


def independent(g):
    title=g.casefold().replace('-',' ')
    return not ('cluj' in title and '2026' in title)


def verified_window(g,lo,cutoff):
    slack=int(g['id'].startswith('ektarr:'))
    return iso(g['day'],-slack)>=lo and iso(g['day'],slack+1)<cutoff


def odds(a,b):
    return 1/(1+10**((b-a)/400))


def percentile5(points):
    values=sorted(points)
    fraction=(len(values)-1)*.05
    i=int(fraction)
    return values[i]+(fraction-i)*(values[min(i+1,len(values)-1)]-values[i])


class Ratings:
    def __init__(self,data,posts,anchor):
        lo=iso(anchor,-180)
        self.sides=[]
        self.by_core=defaultdict(list)
        taken=set()
        observations=[]
        for g in posts:
            if (lo<=g['day']<anchor and g['availableAt'][:10]<anchor and
                    independent(g['event'])):
                observations.append((g['seriesId'],g['teams'],g['sourceUrl'],g['availableAt']))
        if data['hltvRatingPublished'][:10]<anchor:
            for g in data['rows']:
                if (not g['id'].startswith('hltv:') or not verified_window(g,lo,anchor) or
                        not independent(g['event']) or any(r is None for r in g['ratings'])): continue
                sides=[{'name':g[col],'roster':g['five'+col.upper()],'rating':g['ratings'][i]} for i,col in enumerate('ab')]
                observations.append((g['id'],sides,'https://www.hltv.org/matches/'+g['id'].split(':')[1],data['hltvRatingPublished']))
        for match,sides,url,available in observations:
            identity=str(match).removeprefix('hltv:')
            assert identity.isdigit() and len(sides)==2
            if identity in taken:continue
            taken.add(identity)
            for side in sides:
                group=five(side['roster'],side['name']); rating=side['rating']
                assert len(group)==5 and 0<=rating<=4
                idx=len(self.sides)
                self.sides.append((identity,rating,url,available))
                for key in keys(group):self.by_core[key].append(idx)
        self.average=mean(s[1] for s in self.sides) if self.sides else 1.
        self.n=len(taken)

    def prior(self,group):
        found=sorted({i for key in keys(group) for i in self.by_core.get(key,())})
        rows=[self.sides[i] for i in found]
        n=len(rows)
        if not n:return 1.,[],None
        assert len({r[0] for r in rows})==n
        w=1. if n>=30 else .25+(n-5)*.75/25 if n>=5 else max(.1,n*.25/5)
        result=w*mean(r[1] for r in rows)+(1-w)*self.average
        return result,[r[0] for r in rows],max(r[3] for r in rows)


class Replay:
    def __init__(self,snapshot,rates):
        points=snapshot['population']
        self.mu=mean(points); self.std=pstdev(points)
        self.floor=max(400,self.vrs_elo(percentile5(points)))
        self.rates=rates
        self.state=[]
        self.owner={}
        self.contested={}
        claims=defaultdict(list)
        for t in snapshot['records']:
            f=five(t['five'],t['team'])
            i=self.new(t['team'],f,t['p'],snapshot['rankDay'])
            for p in set(f)-AMBIGUOUS:claims[p].append(i)
        # Keep competing rank lines until an actual five distinguishes the unique best core.
        self.ambiguous=sum(len(indices)>1 for indices in claims.values())
        for p,indices in claims.items():
            if len(indices)==1:self.owner[p]=indices[0]
            else:self.contested[p]=set(indices)

    def vrs_elo(self,p):
        return min(1600,max(400,1000+200*(p-self.mu)/self.std))

    def new(self,name,f,points,day):
        rating,prior_ids,prior_published=self.rates.prior(f)
        if points is not None:
            z=(points-self.mu)/self.std
            trust=min(1,max(.2,(z+1)/2))
            adj=min(60,max(-60,(rating-1)*150*trust))
            initial=.7*self.vrs_elo(points)+.3*(1000+adj)
        else:
            influence=40 if len(prior_ids)<10 else 25 if len(prior_ids)<30 else 15
            initial=self.floor+min(influence,max(-influence,(rating-1)*influence*10))
        i=len(self.state)
        self.state.append({'elo':initial,'initialElo':initial,'anchorTeam':name,'firstSeen':day,'anchorPoints':points,
            'anchorFive':f,'ratingPrior':rating,'ratingSeries':prior_ids,'ratingAvailableThrough':prior_published,
            'games':0,'maps':0,'byBestOf':Counter(),'lastFive':f,'lastMatch':None,'renames':[],'everNames':[name]})
        return i

    def lookup(self,f):
        votes=Counter(self.owner[p] for p in f if p in self.owner and p not in AMBIGUOUS)
        for p in f:votes.update(self.contested.get(p,()))
        good=votes.most_common(2)
        if not good or good[0][1]<3 or (len(good)>1 and good[0][1]==good[1][1]):return None,0
        u,c=good[0]
        assert len(set(f)&set(self.state[u]['lastFive'])-AMBIGUOUS)>=c
        return u,c

    def match(self,g,cutoff):
        f=[five(g['fiveA'],g['a']),five(g['fiveB'],g['b'])]
        ids=[self.lookup(side)[0] for side in f]
        if ids[0] is not None and ids[0]==ids[1]:raise ValueError('Shared active roster on opposing sides')
        for j,col in enumerate('ab'):
            if ids[j] is None:ids[j]=self.new(g[col],f[j],None,g['day'])
        a,b=[self.state[i] for i in ids]
        def known(t):
            n=t['games']+15*(t['anchorPoints'] is not None)
            return n>=15 or (n>=5 and abs(t['elo']-1000)>50)
        reliable=int(known(a))+int(known(b))
        k=40*{1:.8,3:1.,5:1.2}[g['bo']]*math.exp(-age(cutoff,g['day'])/50)*(.5+.25*reliable)
        wins=sum(x>y for _,x,y in g['maps'])
        won=wins>len(g['maps'])-wins
        delta=k*(int(won)-odds(a['elo'],b['elo']))
        a['elo']+=delta; b['elo']-=delta
        for j,col in enumerate('ab'):
            t=self.state[ids[j]]
            for p in t['lastFive']:
                if self.owner.get(p)==ids[j]:del self.owner[p]
                if p in self.contested:self.contested[p].discard(ids[j])
            for p in set(f[j])-AMBIGUOUS:
                self.contested.pop(p,None)
                self.owner[p]=ids[j]
            if g[col] not in t['everNames']:
                t['everNames'].append(g[col]);t['renames'].append({'name':g[col],'day':g['day'],'id':g['id']})
            t['games']+=1;t['maps']+=len(g['maps']);t['byBestOf'][str(g['bo'])]+=1
            t['lastFive']=f[j];t['lastMatch']={'day':g['day'],'id':g['id']}


def marginal(ra,rb,scale,noise):
    # Integrate the difference of independent N(0, noise²) match-day perturbations.
    grid=[(i/8,math.exp(-.5*(i/8)**2)) for i in range(-64,65)]
    return sum(w*odds(scale*(ra-rb)+math.sqrt(2)*noise*z,0) for z,w in grid)/sum(w for _,w in grid)


def field(metadata,data,posts):
    cutoff=metadata['cutoffExclusive']; anchor=iso(cutoff,-180)
    table=max((s for s in data['snapshots'] if s['published'][:10]<anchor),key=lambda s:s['published'])
    priors=Ratings(data,posts,anchor)
    replay=Replay(table,priors)
    eligible=[g for g in data['rows'] if independent(g['event']) and verified_window(g,anchor,cutoff)]
    for g in eligible:replay.match(g,cutoff)
    summaries=[]; team_ids=[]
    for t in metadata['teams']:
        f=five(t['roster'],t['name'])
        i,c=replay.lookup(f)
        if i is None:i=replay.new(t['name'],f,None,cutoff)
        team_ids.append(i)
        summaries.append({'name':t['name'],'seed':t['seed'],'roster':f,'lastCoreOverlap':c,**replay.state[i]})
    assert len(team_ids)==len(set(team_ids))==16
    fid=metadata['id']
    stage=int(fid[-1]) if fid[-2:] in ('-2','-3') else 1
    scale=.5 if stage==1 else .65
    elo=[s['elo'] for s in summaries]
    matrices={}
    for key,noise in [('bo1',60),('bo3',35)]:
        matrix=[[.5]*16 for _ in elo]
        for i in range(16):
            for j in range(i+1,16):
                p=marginal(elo[i],elo[j],scale,noise)
                matrix[i][j]=p;matrix[j][i]=1-p
        matrices[key]=matrix
    return {'id':fid,'start':metadata['start'],'cutoffExclusive':cutoff,'anchor':anchor,
        'teams':[t['name'] for t in summaries],'entrants':summaries,'allBo3':metadata['allBo3'],**matrices,
        'scale':scale,'ranking':{**{k:table[k] for k in ('rankDay','sha','published')},'population':len(table['population']),
           'mean':replay.mu,'sd':replay.std,'noVrsElo':replay.floor,'ambiguousPlayerClaims':replay.ambiguous},
        'coverage':{'series':len(eligible),'maps':sum(len(g['maps']) for g in eligible),
          'byBestOf':dict(Counter(str(g['bo']) for g in eligible)),'bySource':dict(Counter(g['id'].split(':')[0] for g in eligible)),
          'firstDay':eligible[0]['day'],'lastDay':eligible[-1]['day'],'vrsAnchoredEntrants':sum(s['anchorPoints'] is not None for s in summaries),
          'entrantsWithReplay':sum(s['games']>0 for s in summaries),'entrantsWithRatingPrior':sum(bool(s['ratingSeries']) for s in summaries),
          'priorPopulationSeries':priors.n}}


def load(path):
    raw=path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix=='.gz' else raw)


def run():
    data=load(HISTORY); prior=load(PRIOR)['rows']
    catalog=load(HERE/'major-fields.json')['fields']
    cluj=load(HERE/'cluj-field.json');catalog[cluj['id']]=cluj
    assert len(catalog)==15
    return {'model':'F1bre roster Elo','inputSha256':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in
                  (HISTORY,PRIOR,HERE/'major-fields.json',HERE/'cluj-field.json')},
            'fields':{key:field(t,data,prior) for key,t in catalog.items()}}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    result=run()
    encoded=json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
    if args.check:assert gzip.decompress(OUTPUT.read_bytes())==encoded
    else:
        with OUTPUT.open('wb') as dest,gzip.GzipFile(filename='',mode='wb',fileobj=dest,mtime=0) as stream:
            stream.write(encoded)
    for k,f in result['fields'].items():print(k,f['coverage'])
