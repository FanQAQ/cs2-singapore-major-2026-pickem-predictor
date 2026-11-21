"""Fit and validate transport across regions on completed international LANs only."""
import argparse
import csv
import gzip
import itertools
import json
import math
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from functools import lru_cache
from pathlib import Path
from types import SimpleNamespace

from scipy.special import expit, logit

HERE=Path(__file__).resolve().parent
REGS=('americas','asia','europe')
REG_PAIRS=list(itertools.combinations(REGS,2))
PRIOR=math.log(10)/4
WINDOW=365
TEAM_WINDOW=180


def numdate(d):return date.fromisoformat(d).toordinal()


def logistic_offset(zs, ys, precision, prior=0.,limit=.65):
    intercept=prior
    for _ in range(25):
        ps=expit([z+intercept for z in zs])
        h=sum(p*(1-p) for p in ps)+precision
        diff=(sum(y-p for y,p in zip(ys,ps))-precision*(intercept-prior))/h
        intercept=max(prior-limit,min(prior+limit,intercept+diff))
        if abs(diff)<1e-8:break
    return intercept,float(1/math.sqrt(h))


class Corpus:
    def __init__(self):
        self.schedule={(r['year'],r['event']):(numdate(r['first']),numdate(r['last'])) for r in json.loads((HERE/'schedule.json').read_text())}
        self.events=defaultdict(list)
        self.by_core=defaultdict(list)
        with gzip.open(HERE/'evidence.csv.gz','rt') as f:
            for row in csv.DictReader(f):
                la=tuple(row['a'].split('|'));lb=tuple(row['b'].split('|'))
                key=(row['day'][:4],row['tournament'])
                r=SimpleNamespace(day=numdate(row['day']),g=key,a=la,b=lb,ra=row['ra'],rb=row['rb'],bo=int(row['bo']),
                                  gap=(float(row['pointsA'])-float(row['pointsB']))/100,y=int(row['y']),id=int(row['id']))
                assert numdate(row['snapshot'])<r.day and len(set(la)|set(lb))==10
                self.events[key].append(r)
                for side,team in enumerate((la,lb)):
                    for core in itertools.combinations(team,3):
                        self.by_core[core].append((r,side))
        self.international={key for key,rows in self.events.items() if len({region for r in rows for region in (r.ra,r.rb)})>=2}

    def eligible(self,cut):
        return sorted((k for k in self.international if self.schedule[k][0]>cut-WINDOW and self.schedule[k][1]<=cut),
                      key=lambda k:(self.schedule[k][0],k))

    def history(self,five,day):
        found={}
        for core in itertools.combinations(sorted(five),3):
            for r,side in self.by_core.get(core,()):
                if day-TEAM_WINDOW < r.day<=day and self.schedule[r.g][1]<=day:
                    found[r.id]=(r,side)
        return sorted(found.values(),key=lambda z:(z[0].day,z[0].id))


def fit_base(rows):
    slopes={}
    for bo in (1,3):
        matches=[r for r in rows if r.bo==bo]
        b=PRIOR
        for _ in range(20):
            residual=4*(PRIOR-b)
            information=4.
            for r in matches:
                p=float(expit(b*r.gap))
                residual+=r.gap*(r.y-p)
                information+=r.gap**2*p*(1-p)
            step=residual/information
            b=max(.03,min(1.5,b+step))
            if abs(step)<1e-8:break
        slopes[bo]=b
    return slopes


def pair_key(a,b):return '-'.join(sorted((a,b)))


def fit_pairs(rows,slopes):
    result={}
    for a,b in REG_PAIRS:
        sample=[r for r in rows if {r.ra,r.rb}=={a,b}]
        sign=[1 if r.ra==a else -1 for r in sample]
        z=[s*slopes[r.bo]*r.gap for s,r in zip(sign,sample)]
        y=[r.y if s==1 else 1-r.y for s,r in zip(sign,sample)]
        delta,se=logistic_offset(z,y,6.25)
        result[pair_key(a,b)]=dict(n=len(sample),logit=float(delta),se=se)
    return result


def pair_delta(pairs,ra,rb):
    if ra==rb or ra not in REGS or rb not in REGS:return 0.
    pair=pairs[pair_key(ra,rb)]
    return (1 if ra<rb else -1)*pair['logit'] if pair['n']>=10 else 0.


def profile(corpus,roster,cut,slopes,pairs):
    roster=tuple(sorted(roster))
    residual=[0.,0.]; info=[0.,0.]
    counts=[0,0];overlaps=Counter()
    for r,side in corpus.history(roster,cut):
        cross=int(r.ra!=r.rb)
        sign=1 if side==0 else -1
        overlap=len(set(roster).intersection(r.a if side==0 else r.b))
        p=float(expit(slopes[r.bo]*r.gap+pair_delta(pairs,r.ra,r.rb)))
        w=2**(-(cut-r.day)/90.)*(overlap/5)
        residual[cross]+=w*sign*(r.y-p)
        info[cross]+=w*p*(1-p)
        counts[cross]+=1;overlaps[overlap]+=1
    # The team's cross-LAN residual is centered on its own all-LAN residual,
    # which keeps general form from being counted again as a regional effect.
    h=sum(info)
    contrast_info=info[0]*info[1]/h if h else 0.
    numerator=residual[1]-info[1]*sum(residual)/h if h else 0.
    sd=1/math.sqrt(4+contrast_info)
    shift=max(-.4,min(.4,numerator/(4+contrast_info)))
    level='high' if min(counts)<3 else 'medium' if min(counts)<12 else 'low'
    return dict(intraN=counts[0],crossN=counts[1],coreMatches=sum(counts),fullFive=overlaps[5],
                overlapCounts={str(i):overlaps[i] for i in (3,4,5)},shift=shift,
                uncertainty=dict(scale=sd,level=level))


def gate_group(rows, train_n, minimum):
    def loss(ps,key):
        if not ps:return None
        if key=='brier':return sum((y-p)**2 for p,y in ps)/len(ps)
        return -sum(math.log(p if y else 1-p) for p,y in ps)/len(ps)
    a=[(a,y) for g,a,b,y in rows]; b=[(b,y) for g,a,b,y in rows]
    groups=defaultdict(list)
    for key,old,new,y in rows:groups[key].append(((old-y)**2-(new-y)**2))
    wins=sum(sum(v)>1e-10 for v in groups.values())
    b0,b1=loss(a,'brier'),loss(b,'brier')
    l0,l1=loss(a,'log'),loss(b,'log')
    valid=(train_n>=35 and len(rows)>=minimum and len(groups)>=4 and wins>len(groups)/2
           and b1<b0 and l1<l0)
    return dict(n=len(rows),events=len(groups),betterEvents=wins,trainingN=train_n,
                baseBrier=b0,adjustedBrier=b1,baseLogLoss=l0,adjustedLogLoss=l1,passed=bool(valid))


def evaluate_region(corpus, hold, slopes, pairs):
    rows=[]
    @lru_cache(maxsize=None)
    def previous(roster,cut):
        return profile(corpus,roster,cut,slopes,pairs)['shift']
    for key in hold:
        cut=corpus.schedule[key][0]-1
        for r in corpus.events[key]:
            if r.ra==r.rb:continue
            base=slopes[r.bo]*r.gap
            offset=pair_delta(pairs,r.ra,r.rb)
            if pairs[pair_key(r.ra,r.rb)]['n']>=10:
                offset+=previous(r.a,cut)-previous(r.b,cut)
            p0=float(expit(base));p1=float(expit(base+max(-.7,min(.7,offset))))
            rows.append((key,p0,p1,r.y))
    return rows


def skill(z):
    return float(expit(z))


def fitted_scale(rows,slopes,pairs,region_on):
    # Estimate positive covariance in adjacent, different-day residuals for the
    # exact same five, against different opponents, within one international LAN.
    traces=defaultdict(list)
    for r in rows:
        p=skill(slopes[r.bo]*r.gap+(pair_delta(pairs,r.ra,r.rb) if region_on else 0.))
        for team,opp,sign in [(r.a,r.b,1),(r.b,r.a,-1)]:
            traces[r.g,team].append((r.day,opp,sign*(r.y-p),p*(1-p)))
    numerator=0.;denom=0.;n=0
    for trace in traces.values():
        trace.sort(key=lambda row:row[0])
        for prev,cur in zip(trace,trace[1:]):
            if prev[0]==cur[0] or prev[1]==cur[1]:continue
            numerator+=prev[2]*cur[2]
            denom+=prev[3]*cur[3];n+=1
    # Fixed half-logit upper bound; four units of neutral information shrink noisy estimates.
    return min(.5, math.sqrt(max(0.,numerator/(denom+4.)))),n


def joint(base,scale):
    low,high=float(logit(base))-2*scale,float(logit(base))+2*scale
    for _ in range(35):
        mid=(low+high)/2
        p=(2*skill(mid)+skill(mid+2*scale)+skill(mid-2*scale))/4
        if p<base:low=mid
        else:high=mid
    k=(low+high)/2
    return [skill(k),skill(k-2*scale),skill(k+2*scale),skill(k)]


def evaluate_state(corpus,hold,scale,slopes,pairs,region_on):
    scored=[]
    for key in hold:
        posterior=defaultdict(float)
        seen=set()
        for _,day in itertools.groupby(sorted(corpus.events[key],key=lambda r:(r.day,r.id)),key=lambda r:r.day):
            updates=defaultdict(float);played=set()
            for r in day:
                p=skill(slopes[r.bo]*r.gap+(pair_delta(pairs,r.ra,r.rb) if region_on else 0.))
                weightsA=[1-skill(posterior[r.a]),skill(posterior[r.a])]
                weightsB=[1-skill(posterior[r.b]),skill(posterior[r.b])]
                cond=joint(p,scale)
                learned=sum(weightsA[i]*weightsB[j]*cond[2*i+j] for i in range(2) for j in range(2))
                if r.a in seen or r.b in seen:scored.append((key,p,learned,r.y))
                likelihood=[x if r.y else 1-x for x in cond]
                a=[sum(weightsB[j]*likelihood[2*i+j] for j in range(2)) for i in range(2)]
                b=[sum(weightsA[i]*likelihood[2*i+j] for i in range(2)) for j in range(2)]
                updates[r.a]+=math.log(a[1]/a[0]);updates[r.b]+=math.log(b[1]/b[0])
                played.update((r.a,r.b))
            for team,delta in updates.items():posterior[team]+=delta
            seen.update(played)
    return scored


def build_event(corpus,anchor):
    cut=numdate(anchor['asOf'])
    competitions=corpus.eligible(cut)
    keep=max(1, len(competitions)*2//3)
    hold=competitions[keep:]
    boundary=corpus.schedule[hold[0]][0] if hold else cut+1
    train=[g for g in competitions[:keep] if corpus.schedule[g][1]<boundary]
    rows=lambda groups:[r for g in groups for r in corpus.events[g]]
    train_rows=rows(train); all_rows=rows(competitions)
    slopes=fit_base(train_rows);pairs=fit_pairs(train_rows,slopes)
    cross_train=sum(r.ra!=r.rb for r in train_rows)
    validation=gate_group(evaluate_region(corpus,hold,slopes,pairs),cross_train,30)
    validation['holdoutStart']=date.fromordinal(boundary).isoformat() if hold else None
    validation['trainEvents']=len(train)
    train_scale,n_pairs=fitted_scale(train_rows,slopes,pairs,False)
    state=gate_group(evaluate_state(corpus,hold,train_scale,slopes,pairs,False),n_pairs,40)
    state['trainingScale']=train_scale
    final_slopes=fit_base(all_rows);final_pairs=fit_pairs(all_rows,final_slopes)
    final_scale,n_pairs=fitted_scale(all_rows,final_slopes,final_pairs,False)
    state['scale']=final_scale if state['passed'] else 0.
    state['fittedScale']=final_scale;state['fitPairs']=n_pairs
    state['passed']=bool(state['passed'] and final_scale>0 and train_scale>0)
    teams={}
    for name,t in anchor['teams'].items():
        roster=[unicodedata.normalize('NFKC',n).strip().casefold() for n in t['roster']]
        teams[name]={**t,**profile(corpus,tuple(roster),cut,final_slopes,final_pairs)}
    first=min((r.day for r in all_rows),default=None);last=max((r.day for r in all_rows),default=None)
    return dict(asOf=anchor['asOf'],teams=teams,regionPairs=final_pairs,validation=validation,sharedState=state,
                training=dict(windowDays=WINDOW,teamWindowDays=TEAM_WINDOW,events=len(competitions),series=len(all_rows),
                              cross=sum(r.ra!=r.rb for r in all_rows),first=date.fromordinal(first).isoformat() if first else None,
                              last=date.fromordinal(last).isoformat() if last else None),
                sources=[dict(title='Valve 地区积分档案',url='https://github.com/ValveSoftware/counter-strike_regional_standings'),
                         dict(title='历史 LAN 赛果与出场名单',url='https://github.com/zugzugs/hltvy/tree/1a00ba2893a63646f0d940e626b6da95d342a187'),
                         dict(title='2026 LAN 比赛与逐图名单',url='https://github.com/Griffinxaxa/scrape-hltv-data/tree/f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58/2026-data/archive')])


if __name__=='__main__':
    arg=argparse.ArgumentParser(description=__doc__);arg.add_argument('--check',action='store_true');args=arg.parse_args()
    corpus=Corpus()
    result={k:build_event(corpus,e) for k,e in json.loads((HERE/'anchor.json').read_text()).items()}
    js=json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n'
    if args.check:assert (HERE/'events.json').read_text()==js
    else:(HERE/'events.json').write_text(js)
    for eid,e in result.items():
        v,s=e['validation'],e['sharedState']
        print(eid,e['training']['series'],v['n'],v['events'],v['passed'],s['n'],s['events'],s['passed'],s['scale'])
