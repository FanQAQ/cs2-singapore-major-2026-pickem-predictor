"""Score the locked draw and map forecasts against verified Shanghai RMR B rounds."""
import argparse
import itertools
import json
import re
from pathlib import Path

from inputs import DIR, EVENT, START, identities
from field import dated_records, save, sha
from map_veto_data.extract_archive import MAPS
from round_form.major_inputs import valid_mr12
from score import evaluate, metric

LOCK='2d38c9a6f7c97942a5d7e2f7107371dbb4016782199abfd8725561fb6dfabc35'


def actual(archive,field):
    rosters={t['name']:identities(t['name'],t['roster']) for t in field['teams']}
    games=[]
    for day,r in dated_records(archive,START,'2024-11-24'):
        if r['event']!=EVENT:
            continue
        round_match=re.search(r'Swiss round ([1-5])',r['stage'])
        assert round_match or r['stage'].startswith('7th place decider')
        rd=int(round_match[1]) if round_match else 6
        fmt=int(re.fullmatch(r'Best of ([13]) \(LAN\)',r['format'])[1])
        sides=[r['team1'],r['team2']]
        maps=[]
        for m in r['maps']:
            if m.get('status')!='played':
                continue
            runs={}
            for key in ('team1','team2'):
                name=m[key]['name']
                assert name in sides and name not in runs
                assert identities(name,[p['name'] for p in m['players'][key]])==rosters[name], (r['match-id'],name)
                runs[name]=int(m[key]['score'])
            a,b=[runs[n] for n in sides]
            assert valid_mr12(a,b)
            maps.append([MAPS[m['map'].casefold()],a,b])
        a=sum(x>y for _,x,y in maps)
        score=[a,len(maps)-a]
        assert max(score)==fmt//2+1 and (score==[r['team1score'],r['team2score']] or
               (fmt==1 and maps[0][1:]==[r['team1score'],r['team2score']]))
        games.append(dict(id=r['match-id'],day=day,round=rd,bo=fmt,teams=sides,winner=sides[score.index(max(score))],
                          score=score,maps=maps,source=r['url']))
    games.sort(key=lambda g:(g['round'],g['id']))
    assert len(games)==len({g['id'] for g in games})==34
    assert [g['teams'] for g in games if g['round']==1]==field['opening']
    assert [[sum(g['bo']==bo and g['round']==rd for g in games) for bo in (1,3)] for rd in range(1,7)]==[[8,0],[8,0],[4,4],[0,6],[0,3],[0,1]]
    return games


def assess(archive,check):
    assert sha(DIR/'odds.json')==LOCK
    forecast=json.loads((DIR/'odds.json').read_bytes())
    if archive:
        games=actual(archive,json.loads((DIR/'field.json').read_bytes()))
        save(DIR/'matches.json',games,check)
    else:
        games=json.loads((DIR/'matches.json').read_bytes())
    swiss=[g for g in games if g['round']<6]
    result=evaluate(forecast,swiss)
    by_id={g['id']:g for g in swiss}
    pairs=list(itertools.combinations(range(16),2))
    conditional=[]
    for row in result['winnerProbabilities']:
        if row['bo']!=1:
            continue
        g=by_id[row['id']]
        label=g['maps'][0][0]
        a,b=sorted(forecast['teams'].index(n) for n in g['teams'])
        k=pairs.index((a,b))
        m=forecast['pool'].index(label)
        left_won=forecast['teams'][a]==g['winner']
        probabilities={arm:v['maps'][k][m] if left_won else 1-v['maps'][k][m] for arm,v in forecast['arms'].items()}
        conditional.append(dict(id=g['id'],map=label,actualMapDrawWeight=forecast['draw'][k][m],**probabilities))
    score=result['bo1']
    assert score['n']==20 and result['bo3']['n']==13 and len(conditional)==20
    passed=all(score['candidate'][m]<score['baseline'][m] for m in ('brier','logLoss'))
    out=dict(lockedForecastSHA256=LOCK,gatePassed=passed,bo1=score,bo1ActualMap=metric(conditional),bo3=result['bo3'],
             actual=result['actual'],winnerProbabilities=result['winnerProbabilities'],actualMapProbabilities=conditional,
             extraDecider=[g['id'] for g in games if g['round']==6])
    save(DIR/'scores.json',out,check)
    print(json.dumps({k:out[k] for k in ('gatePassed','bo1','bo1ActualMap','bo3')},indent=2))


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--hltvy',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    assess(args.hltvy,args.check)
