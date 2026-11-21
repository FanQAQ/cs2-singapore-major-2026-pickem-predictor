"""Describe the frozen predictions and recoverable BO5 history. No new model or card is scored."""
import argparse
from collections import Counter
from datetime import date, timedelta
import gzip
import json
from pathlib import Path
from statistics import mean, median
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
sys.path.insert(0,str(ROOT))
from experience.build_history import AMBIGUOUS, TEAM_ALIASES, normalize


def load(path):
    raw=path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix=='.gz' else raw)


def eligible(rows, start):
    end=date.fromisoformat(start)
    lower=(end-timedelta(days=90)).isoformat()
    latest=(end-timedelta(days=2)).isoformat()
    return [r for r in rows if r['id'].startswith('hltv:') and lower<=r['day']<=latest]


def core(roster, name):
    aliases={'v$m':'vsm','hunter-':'hunter','dav1d':'dav1deus','rmn':'roman',
             **TEAM_ALIASES.get(normalize(name),{})}
    return {aliases.get(normalize(p),normalize(p)) for p in roster}-AMBIGUOUS


def matching_games(team, rows):
    five=core(team['roster'],team['name'])
    for r in rows:
        sides=[s for s in ('A','B') if len(five.intersection(r['five'+s]))>=3]
        if len(sides)==1:
            s=sides[0]
            n=sum((x>y)==(s=='A') for _,x,y in r['maps'])
            yield r,n,len(r['maps'])-n


def history(teams, rows, ranks):
    result={}
    pred={}
    if ranks is not None:
        from tail_calibration.training import rank_for, release_tables
        tables=release_tables(ranks)
        def audit_game(g):
            table=max((t for t in tables if t['published'][:10]<g['day']),key=lambda t:t['published'])
            ranked=[rank_for(g['five'+s],table) for s in 'AB']
            if not all(ranked) or ranked[0][0] is ranked[1][0]:
                return None
            return [{k:r[0][k] for k in ('team','p')}|{'overlap':r[1],'rankDay':table['rankDay']} for r in ranked]
    for t in teams:
        games=list(matching_games(t,rows))
        long=[(g,w,l) for g,w,l in games if g['bo']==5]
        result[t['name']]=dict(series=len(games),wins=sum(w>l for _,w,l in games),
                               bo5Series=len(long),bo5WinMaps=sum(w for _,w,l in long),
                               bo5LostMaps=sum(l for _,w,l in long),bo5Ids=[g['id'] for g,_,_ in long])
        if ranks is not None:
            for g,_,_ in long:
                if g['id'] not in pred:
                    pred[g['id']]=audit_game(g)
    return result,pred


def main(ranks):
    cards=load(HERE/'cards.json')
    ml=load(HERE/'astana-ml/ml.json.gz')['fields']['astana-2025']
    field=load(HERE/'astana-field.json')
    frozen=next(f for f in cards['fields'] if f['id']=='astana-2025')
    actual=frozen['actualRecord']
    original=frozen['methods']['original']
    rows=load(ROOT/'f1bre_models/elo-data.json.gz')['rows']
    observations,pred=history(field['teams'],eligible(rows,field['start']),ranks)
    train_ids=set(load(HERE/'astana-ml/ml-training.json')['series'])
    assert ml['teams']==field['entrants']==frozen['teams']
    for i,t in enumerate(field['teams']):
        name=t['name']
        h=observations[name]
        assert set(h['bo5Ids']).isdisjoint(train_ids)
        marginal=original['main']['teams'][i]
        probabilities=[v for j,v in enumerate(ml['bo3'][i]) if i!=j]
        print(name, 'seed',t['seed'],'rank',t['seedRank'],t['rank'],'points',t['points'],
              'coreMaps',ml['priorCoreMaps'][i],'seriesMean',round(mean(probabilities),4),
              'favoredOpponents',sum(v>.5 for v in probabilities),'p03',round(marginal['zero'],4),
              'pAdvance',round(marginal['qualified'],4),'selected03',sum(r['card'][i]==2 for r in original['runs']),
              'result',*actual[i],'series90',h['wins'],h['series'],'BO5mapW/L',h['bo5WinMaps'],h['bo5LostMaps'])
    ni=ml['teams'].index('Ninjas in Pyjamas')
    print('Other 15 median ML core maps:',median(ml['priorCoreMaps'][:ni]+ml['priorCoreMaps'][ni+1:]))
    print('Source BO5 series IDs + both as-of ranks, if requested:',observations['Ninjas in Pyjamas']['bo5Ids'],
          {k:pred[k] for k in observations['Ninjas in Pyjamas']['bo5Ids'] if k in pred})
    all_ids={mid for t in observations.values() for mid in t['bo5Ids']}
    print('BO5 all teams:',sum(t['bo5Series'] for t in observations.values()),'team-series,',len(all_ids),
          'distinct series,',sum(t['bo5WinMaps']+t['bo5LostMaps'] for t in observations.values()),'team-maps')
    if ranks is not None:
        print('both sides VRS matched:',sum(v is not None for v in pred.values()),'/',len(all_ids))
    counts=Counter()
    editions={f['id']:f for f in cards['fields']}
    for f in cards['fields']:
        if not f['actual']:
            continue
        selected=[(name,tuple(f['actualRecord'][j])) for j,name in enumerate(f['teams'])
                  if f['methods']['original']['main']['card'][j]==2]
        assert len(selected)==2
        label='Major' if f['group'] in ('S1','S2','S3') else 'Other'
        for name,(wins,losses) in selected:
            counts[label,'slots']+=1
            counts[label,'zero']+=wins==0
            counts[label,'advanced']+=wins==3
        print('0-3 slots:',f['id'],selected)
        previous=f['id'].split('-')[0]
        if f['group']=='S2' and previous in editions:
            earlier=editions[previous]
            for name,(wins,_) in selected:
                if wins==3 and name in earlier['teams']:
                    print('Advanced from the preceding stage:',name,earlier['id'],
                          earlier['actualRecord'][earlier['teams'].index(name)])
    print('All card slots by group:',dict(counts))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ranks',type=Path,help='Optional verified Valve release cache for checking both sides of BO5')
    main(parser.parse_args().ranks)
