"""Evaluate a repeatable Major residual using only previously finished CS2 Majors."""
import argparse
import json
import math
from collections import Counter
from datetime import date
from pathlib import Path
from statistics import fmean
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from major_form.prepare import identities, read
HALF_LIFE = 540
EDITION_CAP = 4
PRIOR_INFORMATION = 2.0   # Fisher information of eight pre-match 50:50 series.
MAX_TEAM_SHIFT = 0.4


def profile(team, roster, as_of, prior):
    field = identities(roster,team)
    score, information = 0., PRIOR_INFORMATION
    buckets = []
    for ed in prior:
        assert ed['end'] < as_of
        samples, counts, clubs = [], Counter(), set()
        for row in ed['matches']:
            for key, y, p in [('A',row['y'],row['p']), ('B',1-row['y'],1-row['p'])]:
                overlap = len(field.intersection(row['roster'+key]))
                if overlap < 3:
                    continue
                samples.append((y,p,(overlap/5)**2))
                counts[overlap]+=1
                clubs.add(row[key.lower()])
        if not samples:
            continue
        # Apply an edition cap to games before lineup quality, so a new two-player
        # addition cannot acquire the same weight as an unchanged five by going deep.
        age = (date.fromisoformat(as_of)-date.fromisoformat(ed['end'])).days
        scale = min(1,EDITION_CAP/len(samples))*2**(-age/HALF_LIFE)
        contribution = sum(q*(y-p) for y,p,q in samples)
        score += scale*contribution
        information += scale*sum(q*p*(1-p) for _,p,q in samples)
        buckets.append(dict(id=ed['id'],label=ed['label'],end=ed['end'],teams=sorted(clubs),
            series=len(samples),wins=sum(y for y,_,_ in samples),expectedWins=sum(p for _,p,_ in samples),
            weightedResidual=contribution,overlapCounts={str(n):counts[n] for n in (3,4,5)}))
    estimate = max(-MAX_TEAM_SHIFT,min(MAX_TEAM_SHIFT,score/information))
    concordant = sum(ed['weightedResidual']*estimate>0 for ed in buckets)
    repeat = concordant>=2
    return dict(roster=roster,editions=len(buckets),series=sum(ed['series'] for ed in buckets),
        wins=sum(ed['wins'] for ed in buckets),expectedWins=sum(ed['expectedWins'] for ed in buckets),
        byEdition=buckets,estimate=estimate,logit=estimate if repeat else 0.,repeat=repeat,agreeingEditions=concordant)


def loss(rows, key):
    if not rows: return None,None
    brier = fmean((r[key]-r['y'])**2 for r in rows)
    log_loss = -fmean(math.log(r[key] if r['y'] else 1-r[key]) for r in rows)
    return brier,log_loss


def validation(folds):
    folds = [(key,rows) for key,rows in folds if rows]
    rows = [r for _,fold in folds for r in fold]
    old, old_log = loss(rows,'p')
    new, new_log = loss(rows,'candidate')
    by_edition = []
    for key, fold in folds:
        b0,l0 = loss(fold,'p')
        b1,l1 = loss(fold,'candidate')
        by_edition.append(dict(id=key,n=len(fold),baseBrier=b0,candidateBrier=b1,
                               baseLogLoss=l0,candidateLogLoss=l1))
    better = sum(r['candidateBrier']<r['baseBrier'] for r in by_edition)
    passed = len(rows)>=30 and len(folds)>=2 and better>len(folds)/2 and new<old and new_log<old_log
    return dict(n=len(rows),editions=len(folds),betterEditions=better,baseBrier=old,candidateBrier=new,
                baseLogLoss=old_log,candidateLogLoss=new_log,passed=passed,byEdition=by_edition)


def generate():
    editions=read('major_form/evidence.json')['editions']
    anchors=read('region_risk/anchor.json')
    stages=read('extra_validation/stages.json')
    later_fields=read('extra_validation/strengths.json')
    links=read('experience/history.json')['sources']['cs2']
    events, later, folds = {},{},[]
    for eid, anchor in sorted(anchors.items(),key=lambda e:e[1]['asOf']):
        cutoff=anchor['asOf']
        prior=[ed for ed in editions.values() if ed['end']<cutoff]
        val=validation([(key,fold) for key,fold in folds if editions[key]['end']<cutoff])
        info=dict(asOf=cutoff,priorEditions=len(prior),sourceCount=sum(len(e['matches']) for e in prior),
                  latest=prior[-1]['end'] if prior else None,validation=val,
                  sources=[dict(title='CS2 Major 逐场成绩和出场选手',url=links['url'])])
        def make(teams):
            return dict(info,teams={t:profile(t,roster,cutoff,prior) for t,roster in teams.items()})
        main=make({team:t['roster'] for team,t in anchor['teams'].items()})
        events[eid]=main
        by_stage={1:main}
        for key, stage in stages.items():
            if stage['parent']!=eid: continue
            sr=make({t:later_fields[eid]['teams'][t]['roster'] for t in stage['entrants']})
            later[key]=sr
            by_stage[stage['stage']]=sr
        if eid in editions:
            fold=[]
            for r in editions[eid]['matches']:
                teams=by_stage[r['stage']]['teams']
                delta=teams[r['a']]['logit']-teams[r['b']]['logit']
                if delta==0: continue
                p=r['p']
                candidate=1/(1+math.exp(-(math.log(p/(1-p))+delta)))
                fold.append(dict(y=r['y'],p=p,candidate=candidate))
            folds.append((eid,fold))
    return {'events.json':events,'later.json':later}


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    for name, value in generate().items():
        path=HERE/name
        blob=json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n'
        if args.check: assert path.read_text()==blob
        else: path.write_text(blob)
    for name,item in value.items():
        assert len(item['teams'])==16
