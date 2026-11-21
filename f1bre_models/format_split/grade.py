"""Join the previously frozen forecasts to the verified 35 played MRQ series."""
import argparse
import itertools
import json
import math
import re
import subprocess
from pathlib import Path

from mrq import HERE,ROOT,START,EVENT,NAMES
from lineup_pairs.field import dated_records,key,save,sha
from f1bre_models import elo_inputs

LOCK='b675ea9bf244197becfff5837e51034770b96302a5787a749136e95fae30cb22'
CORRECTED='2d216bd3bacd39bbb6230c6baf87867ab56e076c5c13157bb29fd498520f8ede'
PAIRS=list(itertools.combinations(range(16),2))


def matches(archive,field,correction):
    expected={t['name']:elo_inputs.source.roster(t['roster'],t['name']) for t in field['teams']}
    expected[correction['team']]=elo_inputs.source.roster(correction['roster'],correction['team'])
    games=[]
    for day,raw in dated_records(archive,START,'2025-04-17'):
        if raw['event']!=EVENT:
            continue
        g=elo_inputs.hltv_game(raw)
        assert g,raw['match-id']
        rd=re.match(r'Swiss round ([1-5])',raw['stage'])
        placement=re.match(r'(6th|8th) place decider',raw['stage'])
        assert bool(rd)!=bool(placement)
        names=[NAMES[key(g[side])] for side in 'ab']
        assert [g['fiveA'],g['fiveB']]==[expected[n] for n in names],(g['id'],names)
        won=sum(a>b for _,a,b in g['maps'])
        score=[won,len(g['maps'])-won]
        games.append(dict(id=raw['match-id'],day=day,round=int(rd[1]) if rd else None,placement=placement[1] if placement else None,
                          bo=g['bo'],teams=names,winner=names[score.index(max(score))],score=score,maps=g['maps'],source=raw['url']))
    games.sort(key=lambda g:(g['round'] or 6,g['id']))
    assert len(games)==len({g['id'] for g in games})==35
    swiss=[g for g in games if g['round']]
    assert {frozenset(g['teams']) for g in swiss if g['round']==1}==set(map(frozenset,field['opening']))
    assert [[sum(g['round']==rd and g['bo']==bo for g in swiss) for bo in (1,3)] for rd in range(1,6)]==[[8,0],[8,0],[4,4],[0,6],[0,3]]
    assert {g['placement'] for g in games if g['round'] is None}=={'6th','8th'}
    return games


def losses(values):
    return dict(n=len(values),brier=sum((1-p)**2 for p in values)/len(values),logLoss=-sum(map(math.log,values))/len(values))


def evaluate(games,f):
    rounds=[[] for _ in range(5)]
    rows=[]
    for g in games:
        if g['round'] is None:
            continue
        a,b=sorted(f['teams'].index(n) for n in g['teams'])
        w=f['teams'].index(g['winner'])
        k=PAIRS.index((a,b))
        rounds[g['round']-1].append([w,b if w==a else a])
        baseline=f['mlBO1' if g['bo']==1 else 'mlBO3'][k]
        hybrid=f['eloBO1' if g['bo']==1 else 'mlBO3'][k]
        rows.append(dict(id=g['id'],bo=g['bo'],round=g['round'],teams=g['teams'],winner=g['winner'],
                         baseline=baseline if w==a else 1-baseline,hybrid=hybrid if w==a else 1-hybrid))
    js=("require('./engine/engine.js');const r=CS.replay(JSON.parse(require('fs').readFileSync(0)));"
        "require('node:assert/strict').deepEqual(r.rounds.map(v=>v.matched),[8,8,8,6,3]);"
        "console.log(JSON.stringify(r.actual));")
    played=subprocess.run(['node','-e',js],input=json.dumps(rounds),text=True,capture_output=True,check=True,cwd=ROOT)
    metrics={str(bo):{arm:losses([r[arm] for r in rows if r['bo']==bo]) for arm in ('baseline','hybrid')} for bo in (1,3)}
    assert metrics['3']['baseline']==metrics['3']['hybrid']
    gate=all(metrics['1']['hybrid'][m]<metrics['1']['baseline'][m] for m in ('brier','logLoss'))
    return dict(gatePassed=gate,metrics=metrics,actual=json.loads(played.stdout),winnerProbabilities=rows)


def grade(archive,check):
    assert sha(HERE/'odds.json')==LOCK and sha(HERE/'correction.json')==CORRECTED
    f=json.loads((HERE/'odds.json').read_bytes())
    correction=json.loads((HERE/'correction.json').read_bytes())
    if archive:
        games=matches(archive,json.loads((HERE/'field.json').read_bytes()),correction)
        save(HERE/'matches.json',games,check)
    else:
        games=json.loads((HERE/'matches.json').read_bytes())
    initial=evaluate(games,f)
    for row in correction['changes']:
        for k in ('mlBO1','mlBO3','eloBO1'):
            f[k][row['pair']]=row[k]
    final=evaluate(games,f)
    assert final['actual']==initial['actual']
    for before,after in zip(initial['winnerProbabilities'],final['winnerProbabilities']):
        assert before['id']==after['id']
        if correction['team'] not in before['teams']:
            assert before==after
    summary=dict(lockedForecastSHA256=LOCK,correctionSHA256=CORRECTED,gatePassed=initial['gatePassed'] and final['gatePassed'],
                 initial=initial,corrected=final,deciders=[g['id'] for g in games if g['round'] is None])
    save(HERE/'scores.json',summary,check)
    print('Gate',summary['gatePassed'],'initial',json.dumps(initial['metrics']),'corrected',json.dumps(final['metrics']))


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--hltvy',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    grade(args.hltvy,args.check)
