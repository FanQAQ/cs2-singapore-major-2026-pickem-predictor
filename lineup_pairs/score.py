"""Attach observed scores only to the two already locked sets of probabilities."""
import argparse
import itertools
import json
import math
import re
import subprocess
from pathlib import Path
from field import HERE, ROOT, ID, FISSURE, dated_records, key, save, sha

LOCKS = {'holdout':'acad4ae87861da7fe7440045c96d10b77c9308cc184163880d1582f37a042611',
         'development':'4011abed79a8fdb1e47a020258984a8a956af6670c4f74a4a066751394cea126'}


def actual_holdout(archive, field):
    teams={t['name']:{key(p) for p in t['roster']} for t in field['teams']}
    games=[]
    for day,r in dated_records(archive,'2025-09-12','2025-09-17'):
        rd=re.search(r'Swiss round ([1-5])',r.get('stage',''))
        if r['event']!=FISSURE or not rd:
            continue
        assert r['format'].startswith('Best of 3')
        names=[r['team1'],r['team2']]
        score=[r['team1score'],r['team2score']]
        assert max(score)==2 and min(score) in (0,1)
        played=[m for m in r['maps'] if m['status']=='played']
        assert len(played)==sum(score)
        map_winners=[]
        for m in played:
            for side in ('team1','team2'):
                # The order in the map box can differ from the series heading.
                roster={key(p['name']) for p in m['players'][side]}
                assert roster==teams[m[side]['name']], (r['match-id'],m[side]['name'],roster)
            left,right=m['team1'],m['team2']
            assert left['score']!=right['score']
            map_winners.append(left['name'] if int(left['score'])>int(right['score']) else right['name'])
        assert [map_winners.count(n) for n in names]==score
        url=r['url']
        if url.startswith('/'):
            url='https://www.hltv.org'+url
        games.append(dict(id=r['match-id'],day=day,round=int(rd[1]),bo=3,teams=names,
                          winner=names[score.index(2)],score=score,source=url))
    return sorted(games,key=lambda g:(g['round'],g['id']))


def metric(games):
    out={'n':len(games)}
    for arm in ('baseline','candidate'):
        ps=[g[arm] for g in games]  # always oriented towards the observed winner
        out[arm]=dict(brier=sum((1-p)**2 for p in ps)/len(ps),logLoss=-sum(map(math.log,ps))/len(ps)) if ps else None
    return out


def evaluate(field,raw):
    teams=field['teams']
    pairs=list(itertools.combinations(range(16),2))
    assert len(raw)==len({g['id'] for g in raw})==33
    rows=[]
    rounds=[[] for _ in range(5)]
    for g in raw:
        a,b=[teams.index(n) for n in g['teams']]
        w=teams.index(g['winner'])
        assert g['day']>=field['cutoff'] and w in (a,b)
        rounds[g['round']-1].append([w,b if a==w else a])
        i,j=sorted((a,b))
        k=pairs.index((i,j))
        pred={arm:(v if w==i else 1-v) for arm,grids in field['arms'].items()
              for v in [grids['bo'+str(g['bo'])][k]]}
        rows.append(dict(id=g['id'],round=g['round'],teams=g['teams'],winner=g['winner'],bo=g['bo'],
                         affected=any(sum(field['coreMaps'][n][:2]) for n in (a,b)),**pred))
    js=("require('./engine/engine.js');const r=CS.replay(JSON.parse(require('fs').readFileSync(0)));"
        "require('node:assert/strict').deepEqual(r.rounds.map(x=>x.matched),[8,8,8,6,3]);"
        "console.log(JSON.stringify(r.actual));")
    replay=subprocess.run(['node','-e',js],input=json.dumps(rounds),text=True,capture_output=True,check=True,cwd=ROOT)
    result=dict(bo1=metric([r for r in rows if r['bo']==1]),bo3=metric([r for r in rows if r['bo']==3]),
                affected=metric([r for r in rows if r['bo']==3 and r['affected']]),
                actual=json.loads(replay.stdout),winnerProbabilities=rows)
    return result


def score(archive,check):
    fields={}
    for cohort,h in LOCKS.items():
        file=HERE/(cohort+'-matrices.json')
        assert sha(file)==h, file
        fields.update(json.loads(file.read_bytes())['fields'])
    truth=json.loads((ROOT/'elite_opponents/truth-development.json').read_bytes())
    field=json.loads((HERE/'field.json').read_bytes())
    if archive:
        holdout=actual_holdout(archive,field)
        save(HERE/'holdout-results.json',holdout,check)
    else:
        holdout=json.loads((HERE/'holdout-results.json').read_bytes())
    truth[ID]=holdout
    results={k:evaluate(f,truth[k]) for k,f in fields.items()}
    metrics=results[ID]
    assert metrics['bo3']['n']==33 and metrics['affected']['n']>0
    gate=all(metrics['bo3']['candidate'][m]<metrics['bo3']['baseline'][m] and
             metrics['affected']['candidate'][m]<=metrics['affected']['baseline'][m] for m in ('brier','logLoss'))
    result=dict(lockedInputSha256=LOCKS,gatePassed=gate,fields=results)
    save(HERE/'scores.json',result,check)
    for k,r in results.items():
        print(k,json.dumps({k:r[k] for k in ('bo1','bo3','affected')}))
    print('External gate:',gate)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--hltvy',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    score(args.hltvy,args.check)
