"""Score sealed pair distributions against the actual planned sets, including unused deciders."""
import argparse
import gzip
import json
import math
import re
import statistics
from datetime import datetime, timezone

from profiles import HERE, ROOT, core, fields, read, sha, store
from map_veto_data.extract_archive import normalize, SHA256

EVENTS = {
    'copenhagen':'PGL CS2 Major Copenhagen 2024 Opening Stage','copenhagen-2024-2':'PGL CS2 Major Copenhagen 2024',
    'shanghai':'Perfect World Shanghai Major 2024 Opening Stage','shanghai-2024-2':'Perfect World Shanghai Major 2024',
    'austin':'BLAST.tv Austin Major 2025 Stage 1','austin-2025-2':'BLAST.tv Austin Major 2025 Stage 2',
    'austin-2025-3':'BLAST.tv Austin Major 2025','budapest':'StarLadder Budapest Major 2025 Stage 1',
    'budapest-2025-2':'StarLadder Budapest Major 2025 Stage 2','budapest-2025-3':'StarLadder Budapest Major 2025',
    'epl23-stage2':'ESL Pro League Season 23 Stage 2','cluj-2026':'PGL Cluj-Napoca 2026',
    'bucharest-2025-april':'PGL Bucharest 2025','astana-2025':'PGL Astana 2025'}
ALIASES={'mongolz':'themongolz','navi':'natusvincere','nip':'ninjasinpyjamas','lv':'lynnvision',
         'lynnvisiongaming':'lynnvision','heroicgg':'heroic','teamfalcons':'falcons','teamliquid':'liquid',
         'teamspirit':'spirit','fazeclan':'faze','3dmaxgaming':'3dmax','teamvitality':'vitality',
         'betboomteam':'betboom','complexitygaming':'complexity','9zteam':'9z','g2esports':'g2',
         'futesports':'fut','sinnersesports':'sinners','paingaming':'pain','auroragaming':'aurora',
         'ninjasinpyjamascs':'ninjasinpyjamas','heroicesports':'heroic','gamerlegioncs':'gamerlegion',
         'furiagg':'furia','teamnrg':'nrg'}


def key(name):
    s=re.sub('[^a-z0-9]','',name.lower())
    return ALIASES.get(s,s)


def packaged_truth(rows):
    byid={int(r['id']):r for r in read(HERE/'astana-results.json')['matches']}
    for g in rows['astana-2025']:
        other=byid[g['id']]
        assert g['steps']==other['steps'] and g['winner']==other['teams'][int(other['w']==other['b'])]
    for k,source in [('cologne-2026-3','cologne-outcomes.json'),('cologne','cologne1-outcomes.json')]:
        rows[k]=[]
        for g in read(HERE/source)['rows']:
            assert g['bo']==3 and g['played']
            steps=[['ab'[g['teams'].index(r['team'])] if r['team'] else None,r['action'],r['map']] for r in g['steps']]
            played=[m['map'] for m in g['maps'] if m['score'][0]!=m['score'][1]]
            assert len(played)==sum(g['score']) and all(m['score'][0]!=m['score'][1] or m['score']==[0,0] for m in g['maps'])
            rows[k].append(dict(id=g['id'],day=g['day'],teams=g['teams'],winner=g['winner'],
                  steps=steps,playedMaps=played,sourceUrl=g['sourceUrl']))
    rows['cologne-2026-2']=[]
    actual={r['stage2Id']:r for r in read(ROOT/'cologne_veto/official-blast.json')['matches']}
    for g in read(ROOT/'cologne_veto/ledger.json')['matches']:
        if g['bo']!=3: continue
        truth=actual[g['hltvId']]
        names=[g['a'],g['b']]
        steps=[['ab'[names.index(r['team'])] if r['team'] else None,r['action'],r['map']] for r in g['actions']]
        w=['a','b'][int(truth['score'][0]<truth['score'][1])]
        rows['cologne-2026-2'].append(dict(id=g['hltvId'],day=g['day'],teams=names,winner=truth[w],
              steps=steps,playedMaps=[m[0] for m in truth['maps']],sourceUrl=g['sources'][-1]))


def archive_truth(archive):
    assert sha(archive)==SHA256
    reverse={v:k for k,v in EVENTS.items()}
    rows={k:[] for k in EVENTS}
    with gzip.open(archive,'rt',encoding='utf8') as f:raw=json.load(f)
    for src in raw:
        k=reverse.get(src['event'])
        if k is None or 'swiss' not in src['stage'].lower() or not src['format'].lower().startswith('best of 3'):continue
        m=normalize(src)
        names=[src['team1'],src['team2']]
        winner=names[int(src['team1score']<src['team2score'])]
        assert sorted([src['team1score'],src['team2score']]) in ([0,2],[1,2])
        day=datetime.fromtimestamp(src['date']/1000,timezone.utc).date().isoformat()
        maps=[r['map'] for r in src['maps'] if r['status']=='played']
        rows[k].append(dict(id=src['match-id'],day=day,teams=names,winner=winner,
            steps=m['steps'] if m else None,five=[m['lineupA'],m['lineupB']] if m else None,
            playedMaps=maps,sourceUrl=src['url'].replace('https://hltv.org/','https://www.hltv.org/'),
            reason=None if m else 'Unverified seven-step record or map results'))
    packaged_truth(rows)
    for k,games in rows.items():
        n=33 if k in ('epl23-stage2','cluj-2026','bucharest-2025-april','astana-2025','cologne-2026-3') else 13
        assert len(games)==len({r['id'] for r in games})==n,(k,len(games),n)
        games.sort(key=lambda r:(r['day'],r['id']))
    deps=[HERE/'astana-results.json',HERE/'cologne-outcomes.json',HERE/'cologne1-outcomes.json',
          ROOT/'cologne_veto/official-blast.json',ROOT/'cologne_veto/ledger.json']
    return dict(fields=rows,sources=dict(hltvy=SHA256,**{p.relative_to(ROOT).as_posix():sha(p) for p in deps}))


def score(k, model, games, rosters):
    names=model['teams']; tables={tuple(sorted(t)):i for i,t in enumerate(model['triples'])}
    pairs={(r['a'],r['b']):r for r in model['pairs']}
    def find(name,five):
        seen=[i for i,n in enumerate(names) if key(name)==key(n)]
        if len(seen)==1:return seen[0]
        if five:
            match=core(five,name)
            seen=[i for i,t in enumerate(names) if len(match & rosters[t])>=3]
        assert len(seen)==1,(k,name,seen,names)
        return seen[0]
    rows=[]
    for g in games:
        given=g.get('five') or (None,None)
        x,y=[find(n,five) for n,five in zip(g['teams'],given)]
        a,b=sorted((x,y));pair=pairs[a,b]
        # The official roster or organization can vary across two source displays;
        # the original winning team (or its unambiguous alias) must be a participant.
        winners=[v for n,v in zip(g['teams'],(x,y)) if key(n)==key(g['winner'])]
        assert len(winners)==1,(k,g['teams'],g['winner'])
        row=dict(id=g['id'],day=g['day'],teams=[names[a],names[b]],a=a,b=b,winner=winners[0],
                 planned=None,playedMaps=g['playedMaps'],sourceUrl=g['sourceUrl'],eligible=False,
                 originalMass=None,vetoMass=None,actualSetBo3=None)
        ss=g['steps']
        reason=g.get('reason')
        if ss:
            actors=''.join('A' if s[0]==ss[0][0] else 'B' for s in ss[:6])
            planned=[s[2] for s in ss if s[1] in ('pick','left')]
            if ([s[1] for s in ss]!=['ban','ban','pick','pick','ban','ban','left'] or
                    ss[-1][0] is not None or {s[2] for s in ss}!=set(model['pool']) or
                    any(s[0] not in ('a','b') for s in ss[:-1])):
                reason='Invalid actors or a different seven-map pool'
            elif actors!=model['rules']:
                reason=f'Observed role order {actors} disagrees with pre-stage {model["rules"]}'
            elif g['playedMaps']!=planned[:len(g['playedMaps'])] or len(g['playedMaps']) not in (2,3):
                reason='Actual played maps do not confirm the planned pick order'
            else:
                pos=tables[tuple(sorted(planned))]
                m,n,o=[pair['maps'][model['pool'].index(z)] for z in planned]
                row.update(eligible=True,planned=planned,originalMass=pair['original'][pos],
                           vetoMass=pair['veto'][pos],actualSetBo3=m*n+m*o+n*o-2*m*n*o)
        if not row['eligible']:row['reason']=reason or 'Missing verified seven-step veto'
        rows.append(row)
    complete=[r for r in rows if r['eligible']]
    def meanloss(key):
        return statistics.mean(-math.log(r[key]) for r in complete) if complete else None
    return dict(eligible=len(complete),played=len(rows),expectedBO3=len(games),
                unplayedDeciders=sum(len(r['playedMaps'])==2 for r in complete),
                originalLogLoss=meanloss('originalMass'),vetoLogLoss=meanloss('vetoMass'),rows=rows)


def main(args):
    from pathlib import Path
    if args.archive:
        store(HERE/'truth.json.gz',archive_truth(Path(args.archive)),args.check)
    tape=read(HERE/'truth.json.gz')['fields']
    base=fields()
    base['epl23-stage2']=read(ROOT/'epl_transfer/rosters.json')
    models=read(HERE/'models.json.gz')['fields']
    assert set(models)==set(tape)|{'singapore'}
    result={}
    for k,games in tape.items():
        clubs={t['name']:core(t['roster'],t['name']) for t in base[k]['teams']}
        s=score(k,models[k],games,clubs); result[k]=s
        print(k,s['eligible'],s['originalLogLoss'],s['vetoLogLoss'])
    store(HERE/'sets.json',dict(sources={'models.json.gz':sha(HERE/'models.json.gz'),
          'truth.json.gz':sha(HERE/'truth.json.gz')},fields=result),args.check)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',help='Re-extract truth from the pinned raw HLTvy archive')
    p.add_argument('--check',action='store_true')
    main(p.parse_args())
