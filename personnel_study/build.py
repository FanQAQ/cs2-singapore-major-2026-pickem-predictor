"""Build the dated personnel report and compare two independently trained signals."""
import argparse
from collections import Counter, defaultdict
import csv
from functools import lru_cache
import gzip
import json
import math
from pathlib import Path

from extract import HERE, ROOT, handle

SPLIT = '2026-09-01'
DEMO_RELEASE = '2026-05-02'
GROUPS = ['copenhagen','shanghai','austin','budapest','cologne','singapore']
SOURCES = {
    'rosters':'https://news.pglesports.com/news/1794219566606-pgl-major-singapore-2026-team-rosters',
    'boxscores':'https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11',
    'awards':'https://www.hltv.org/news/33884/rain-claims-pgl-major-antwerp-mvp-award',
    'demo':'https://huggingface.co/datasets/blanchon/opencs2_dataset_demo/tree/912a363098feec3f220e41d68634d2f71676c28b',
    'griffin':'https://github.com/Griffinxaxa/scrape-hltv-data/tree/f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58/2026-data/archive',
    'coachRule':'https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md'
}


def read(path):
    b=path.read_bytes()
    return json.loads(gzip.decompress(b) if path.suffix=='.gz' else b)


AWARDS=read(HERE/'awards.json')


@lru_cache(None)
def awards(day):
    return Counter(handle(a['player']) for a in AWARDS if a['day']<day)


def verified_series(through='singapore'):
    by_stage=defaultdict(list)
    with gzip.open(ROOT/'strategy_v4/series.csv.gz','rt',encoding='utf8') as f:
        for r in csv.DictReader(f):
            a,b=(frozenset(handle(x) for x in r[k].split('|')) for k in ('lineupA','lineupB'))
            assert len(a)==len(b)==5 and not a&b
            form='unknown' if not r['scores'] else ('BO3' if '|' in r['scores'] else 'BO1')
            by_stage[r['event']].append((r['day'],a,b,int(r['winner']),float(r['gap'])*math.log(10)/4,form))
    seen=set()
    def key(r):
        return r[0],frozenset((r[1],r[2]))
    out=[]
    for field in GROUPS:
        out += [r for r in by_stage[field] if key(r) not in seen]
        seen.update(key(r) for r in by_stage[field])
        if field==through:
            break
    return sorted(out,key=lambda r:r[0])


def peak_classifier():
    candidates=[]
    for row in read(HERE/'demo_players.json.gz'):
        kills=row['kills']
        top=max(kills.values())
        if row['maps']<4 or row['series']<2 or sum(kills.values())<50 or list(kills.values()).count(top)!=1:
            continue
        candidates.append((frozenset(row['roster']),row['maps'],max(kills,key=kills.get),top/sum(kills.values())))
    @lru_cache(None)
    def classify(players):
        options=[((len(players&r),maps),share) for r,maps,leader,share in candidates
                 if len(players&r)>=3 and leader in players]
        if not options:
            return None
        best=max(rank for rank,_ in options)
        values=[share for rank,share in options if rank==best]
        return values[0] if len(values)==1 else None
    return classify


def make_cases(rows,feature):
    out=[]
    for day,a,b,y,offset,form in rows:
        left,right=feature(a,day),feature(b,day)
        if left is not None and right is not None:
            out.append((day,y,offset,left-right,form))
    return out


def probability(z):
    return 1/(1+math.exp(-z))


def fit(rows):
    if sum(abs(x)>1e-10 for _,_,_,x,_ in rows)<50:
        return 0.
    beta=0.
    for _ in range(30):
        grad,curvature=-4*beta,4.
        for _,y,z,x,_ in rows:
            q=probability(z+beta*x)
            grad+=x*(y-q)
            curvature+=x*x*q*(1-q)
        step=grad/curvature
        beta+=step
        if abs(step)<1e-10:
            return beta
    raise ValueError('Fit failed')


def score(rows,beta):
    vals=defaultdict(float)
    n=len(rows)
    for _,y,z,x,_ in rows:
        for k,b in [('base',0.),('candidate',beta)]:
            p=probability(z+x*b)
            vals[k+'Brier']+=(p-y)**2
            vals[k+'LogLoss']-=math.log(p if y else 1-p)
    return dict(n=n,**{k:round(vals[k]/n,6) if n else None
                        for k in ('baseBrier','candidateBrier','baseLogLoss','candidateLogLoss')})


def test(cases):
    train=[r for r in cases if r[0]<SPLIT]
    holdout=[r for r in cases if r[0]>=SPLIT]
    beta=fit(train)
    affected=[r for r in holdout if abs(r[3])>1e-10]
    return dict(split=SPLIT,train=dict(n=len(train),affected=sum(abs(r[3])>1e-10 for r in train)),
                coefficient=round(beta,7),adjustmentPP=round(100*(probability(beta)-.5),3),
                holdout=dict(all=score(holdout,beta),affected=score(affected,beta),
                             byFormat={k:score([r for r in holdout if r[4]==k],beta) for k in ('BO1','BO3','unknown')},
                             first=min(r[0] for r in holdout),last=max(r[0] for r in holdout)))


def player_stats(rows,roster):
    kills=Counter()
    for r in rows:
        kills.update(r['kills'])
    total=sum(kills.values())
    rounds=sum(r['rounds'] for r in rows)
    players=[dict(name=p,kills=kills[handle(p)],share=round(kills[handle(p)]/total,5),kpr=round(kills[handle(p)]/rounds,5))
             for p in roster] if rows else []
    players.sort(key=lambda p:(-p['kills'],p['name']))
    series=len({r['series'] for r in rows})
    leader=players[0]['name'] if len(rows)>=4 and series>=2 and players[0]['kills']>players[1]['kills'] else None
    return dict(maps=len(rows),series=series,first=min((r['day'] for r in rows),default=None),
                last=max((r['day'] for r in rows),default=None),rounds=rounds,leader=leader,players=players)


def card_summary(stages):
    first=stages[:5]
    assert [r['id'] for r in first]==GROUPS[:5]
    extra=stages[-1]
    def total(key,rows):
        return sum(r[key] for r in rows)
    def passes(key,rows):
        return sum(r[key]>=5 for r in rows)
    trials=list(zip(*(s['trials'] for s in first)))
    deltas=[passes('candidate',t)-passes('base',t) for t in trials]
    return dict(stages=[dict(id=s['id'],base=s['trials'][0]['base'],candidate=s['trials'][0]['candidate']) for s in first],
                firstStages=dict(baseHits=total('base',trials[0]),candidateHits=total('candidate',trials[0]),
                                 basePasses=passes('base',trials[0]),candidatePasses=passes('candidate',trials[0]),
                                 passMore=sum(d>0 for d in deltas),passSame=deltas.count(0),passFewer=sum(d<0 for d in deltas)),
                extra=dict(id=extra['id'],base=extra['trials'][0]['base'],candidate=extra['trials'][0]['candidate'],
                           basePassingSeeds=passes('base',extra['trials']),candidatePassingSeeds=passes('candidate',extra['trials']),
                           seeds=len(extra['trials'])))


def build():
    field=read(ROOT/'datajob/stage_rosters.json')['singapore']
    coaches=read(HERE/'coaches.json')
    assert set(field)==set(coaches)
    history=read(ROOT/'experience/history.json')
    assert [r['id'] for r in AWARDS]==[e['id'] for e in history['events']]
    assert [r['day'] for r in AWARDS]==[e['endDate'] for e in history['events']]
    event_day='2026-11-24'
    boxscores=read(HERE/'recent_maps.json.gz')
    teams={}
    for name,roster in field.items():
        subset=[r for r in boxscores if r['team']==name]
        assert all(set(r['kills'])==set(map(handle,roster)) for r in subset)
        names=[dict(name=p,count=awards(event_day)[handle(p)]) for p in roster if awards(event_day)[handle(p)]]
        teams[name]=dict(**coaches[name],roster=roster,majorMvps=names,recent=player_stats(subset,roster))
    cases=verified_series()
    peak=peak_classifier()
    def had_mvp(roster,day):
        return int(any(awards(day)[p] for p in roster))
    def peak_units(roster,day):
        share=peak(roster)
        return 10*share if day>DEMO_RELEASE and share is not None else None
    mvp_cases=make_cases(cases,had_mvp)
    firepower_cases=make_cases(cases,peak_units)
    fits={}
    stage_cards=read(ROOT/'research_cards/conditionalSeed.json')['stages']
    stage_cards=stage_cards+[read(ROOT/'research_cards/conditionalSeed-shanghai.json')]
    for stage in stage_cards:
        field_id=stage['id'].split('-')[0]
        cutoff=stage['asOf']
        train=make_cases([row for row in verified_series(field_id) if row[0]<cutoff],had_mvp)
        if stage['id']=='shanghai-2024-elimination':
            squads={t['name']:t['roster'] for t in read(ROOT/'holdout_shanghai/field.json')['teams']}
        elif field_id in ('copenhagen','shanghai'):
            squads={t['name']:t['roster'] for t in read(ROOT/'history24/models.json')[field_id]['teams']}
        else:
            squads=read(ROOT/'datajob/stage_rosters.json')[field_id]
        fits[stage['id']]=dict(asOf=cutoff,n=len(train),affected=sum(abs(r[3])>1e-10 for r in train),
                              coefficient=fit(train),hasPriorMvp={t:had_mvp(set(map(handle,players)),cutoff) for t,players in squads.items()})
    official=read(ROOT/'forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json')
    matrix_file=official['matrixReference']
    matrix=read(ROOT/matrix_file['file'])[matrix_file['field']]
    name='100 Thieves'
    i=next(k for k,t in enumerate(official['teams']) if t['team']==name)
    j=i+8 if i<8 else i-8
    assert official['teams'][j]['team']=='Chinggis Warriors' and official['categoryOrder'][official['card'][i]]=='3-1 / 3-2'
    s,advance,_,_=official['probabilities'][i]
    focus_maps=read(HERE/'focus_maps.json.gz')
    fresh=player_stats([r for r in focus_maps if r['overlap']==5],field[name])
    fresh['overlap']={str(k):sum(r['overlap']==k for r in focus_maps) for k in (3,4,5)}
    fresh['source']=SOURCES['griffin']
    fresh['latestMap']=focus_maps[-1]['url']
    focus=dict(team=name,opponent=official['teams'][j]['team'],igl='Gizmy',fresh=fresh,
               frozen=dict(slot='普通晋级',sweep=s,ordinary=advance,advance=s+advance,bo1=matrix['bo1'][i][j]),
               notes=['11 月 9 日报名名单中 gla1ve 是教练，他也登记为替补。Gizmy 接替 rain 担任场上指挥。',
                      'device 曾两获 Major MVP，rain 曾获安特卫普 Major MVP。gla1ve 的四次 Major 冠军均是选手时期成绩。2025 年 12 月接手 100 Thieves 是其首份教练工作。',
                      'Valve 允许教练在热身、半场和战术暂停时与队员沟通。本届首场前能确认报名身份，现场出席及暂停效果待赛后核实。'],
               sources=[dict(title='PGL 报名名单 · 11 月 9 日',url=SOURCES['rosters']),
                        dict(title='HLTV 核对报名替补',url='https://www.hltv.org/news/45950/pgl-reveals-singapore-major-rosters'),
                        dict(title='rain 谈更换指挥 · 8 月 10 日',url='https://www.hltv.org/news/45268/rain-on-moving-away-from-igling-i-think-my-personality-is-maybe-a-little-bit-too-chill'),
                        dict(title='100 Thieves 任命 gla1ve 执教',url='https://www.hltv.org/news/43479/100-thieves-unveil-gla1ve-as-head-coach'),
                        dict(title='HLTV Major MVP 档案',url=SOURCES['awards']),dict(title='Valve 教练沟通规则',url=SOURCES['coachRule']),
                        dict(title='首轮 BO1 与出场五人',url='https://www.hltv.org/matches/2400497/100-thieves-vs-chinggis-warriors-pgl-major-singapore-2026-stage-1')])
    result=dict(asOf='2026-11-21',teams=teams,focus=focus,test=test(mvp_cases),firepowerTest=test(firepower_cases),
                stageFits=fits,sources=SOURCES)
    if (HERE/'cards.json').is_file():
        result['cardReplay']=card_summary(read(HERE/'cards.json'))
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--check',action='store_true')
    cfg=p.parse_args()
    report=build()
    path=HERE/'report.json'
    if cfg.check:
        assert read(path)==report
    else:
        path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    for study in ('test','firepowerTest'):
        print(study,report[study])
    print(report['focus']['fresh'])
