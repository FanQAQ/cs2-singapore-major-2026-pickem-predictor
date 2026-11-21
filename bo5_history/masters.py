"""Rebuild the October 2025 Masters Bucharest Swiss opening field and independent score file."""
import argparse
from datetime import datetime
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
sys.path.insert(0,str(ROOT))
from latent_form.bucharest import read_ranks
from map_veto_data.extract_archive import ARCHIVE_URL, SHA256, key, normalize
from round_form.epl22_inputs import ranking, utc_day
from veto_ml.astana import rank_reference, signature

ID,NAME,START,END='masters-bucharest-2025','PGL Masters Bucharest 2025','2025-10-26','2025-10-30'
DRAW='https://x.com/pglesports/status/1980198805703385416'
OPENING=[('Legacy','Liquid'),('paiN','Gentle Mates'),('GamerLegion','FlyQuest'),
         ('HEROIC','Ninjas in Pyjamas'),('3DMAX','SAW'),('BetBoom','MIBR'),
         ('Aurora','fnatic'),('Astralis','B8')]
POOL=['Ancient','Dust2','Inferno','Mirage','Nuke','Overpass','Train']
CHANGES={
    'B8': [dict(day='2025-10-12',previousEvent='CS Asia Championships 2025',outgoing='kRaSnaL',
                incoming='kensizor',source='https://www.hltv.org/news/42925/krasnal-to-stand-in-for-b8-at-cac-2025')],
    'HEROIC': [dict(day='2025-10-09',previousEvent='CS Asia Championships 2025',outgoing='hades',
                    incoming='Alkaren',source='https://www.hltv.org/news/42898/heroic-add-hades-as-sub-for-cac-2025')],
    'MIBR': [dict(day='2025-10-22',outgoing='kl1m',incoming='brn$',
                  source='https://www.dust2.com.br/noticias/66899/mibr-tera-desfalque-na-pgl-masters-bucharest',
                  corroboration='https://www.hltv.org/news/43002/media-kl1m-to-miss-pgl-masters-bucharest')],
    'Ninjas in Pyjamas': [
        dict(day='2025-09-30',outgoing='Snappi',incoming='susp',
             source='https://www.hltv.org/news/42749/susp-to-stand-in-for-snappi-at-pgl-masters-bucharest'),
        dict(day='2025-10-22',outgoing='susp',incoming='Snappi',
             source='https://x.com/NIPCS/status/1981027866759348664',
             corroboration='https://www.hltv.org/news/43003/snappi-to-play-for-nip-at-pgl-masters-bucharest')],
}
GROUP_URL='https://www.pglesports.com/_next/static/chunks/app/cs2/pgl-masters-bucharest-2025/page-cf5c007eec90e220.js'
GROUP_SHA='528cd47cf141b742844c4f85814812225f2a097d0a72693ed7892d208895ecbd'


def witnesses(records):
    """Recover the last fully observed five from all the played maps of a prior BO1/3/5."""
    names={t for pair in OPENING for t in pair}
    found={}
    for raw in records:
        day=utc_day(raw)
        assert day<START
        if raw['team1'] not in names and raw['team2'] not in names:
            continue
        fmt=re.fullmatch(r'Best of ([135])(?:\s*\([^)]*\))?',raw.get('format','').strip(),re.I)
        played=[g for g in raw.get('maps',[]) if g.get('status')=='played']
        if not fmt or not played:
            continue
        sides={key(raw[k]):k for k in ('team1','team2')}
        wins={'team1':0,'team2':0}
        lineups={'team1':[],'team2':[]}
        for m in played:
            scores={}
            for side in ('team1','team2'):
                original=sides.get(key(m[side]['name']))
                if original is None or original in scores:
                    break
                scores[original]=int(m[side]['score'])
                five=sorted([p['name'] for p in (m.get('players') or {}).get(side,[])],key=key)
                lineups[original].append(five)
            if len(scores)!=2 or scores['team1']==scores['team2']:
                break
            wins[max(scores,key=scores.get)]+=1
        else:
            if max(wins.values())!=int(fmt[1])//2+1:
                continue
            for side in ('team1','team2'):
                fives=lineups[side]
                if (raw[side] in names and len(set(map(key,fives[0])))==5 and
                    all(f==fives[0] for f in fives) and len(fives)==len(played)):
                    found[raw[side]]=dict(id=raw['match-id'],day=day,roster=fives[0],event=raw['event'],
                                          url=raw['url'].replace('https://hltv.org/','https://www.hltv.org/'))
    assert names==set(found)
    return found


def build_field(before,rank_path,seed_path):
    releases=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    current=max((r for r in releases if r['published'][:10]<START),key=lambda x:x['published'])
    initial,=[r for r in releases if r['rankDay']=='2025-09-01']
    ranks,seeds=read_ranks(current,rank_path),read_ranks(initial,seed_path)
    assert current['rankDay']=='2025-10-06'
    teams=[]
    for name,witness in witnesses(before).items():
        five=set(witness['roster'])
        corrections=CHANGES.get(name,[])
        for change in corrections:
            assert change['day'] < START and change['outgoing'] in five
            if 'previousEvent' in change:
                assert change['previousEvent']==witness['event']
            else:
                assert witness['day'] <= change['day']
            five.remove(change['outgoing'])
            five.add(change['incoming'])
        five=sorted(five,key=key)
        rank,seed=ranking(five,ranks),ranking(five,seeds)
        teams.append(dict(name=name,roster=five,points=rank['points'],rank=rank['rank'],
                          overlap=rank['overlap'],vrsRoster=rank['roster'],ratingTeam=rank['name'],
                          seedRank=seed['rank'],seedRoster=seed['roster'],seedOverlap=seed['overlap'],
                          seedRatingTeam=seed['name'],rosterWitness=witness,changes=corrections))
    teams.sort(key=lambda t:t['seedRank'])
    for seed,t in enumerate(teams,1):
        t['seed']=seed
    assert len({key(p) for t in teams for p in t['roster']})==80
    assert len({t['rank'] for t in teams})==len({t['seedRank'] for t in teams})==16
    names=[t['name'] for t in teams]
    assert {frozenset((names[i],names[i+8])) for i in range(8)}==set(map(frozenset,OPENING))
    return dict(id=ID,label=NAME+' Swiss',start=START,end=END,cutoffExclusive=START,allBo3=True,
                entrants=names,teams=teams,pool=POOL,seedOrder=list(range(16)),openingPairs=OPENING,
                openingSource=DRAW,drawPublishedAt='2025-10-20T09:06:00.251Z',
                invitedSource='https://x.com/pglesports/status/1972613198953230465',
                formatSource='https://www.hltv.org/news/43009/pgl-masters-bucharest-teams-format-schedule-talent-prizes-fantasy',
                rankSnapshot=rank_reference(current),seedSnapshot=rank_reference(initial),
                groupStructure='single_field',invitedViaVrs=16,openQualifierTeams=0,
                coachNews=[dict(team='Ninjas in Pyjamas',day='2025-10-24',absent='Xizt',
                                source='https://www.hltv.org/news/43013/xizt-to-miss-pgl-masters-bucharest')],
                archiveSource=ARCHIVE_URL,archiveSha256=SHA256)


def official_check(matches,source):
    """Read only the public Groups table and align scores to the archive team order."""
    assert hashlib.sha256(source).hexdigest()==GROUP_SHA
    literal=source.decode().split('d=[{leftTeam',1)[1].split('],y=[{leftTeam',1)[0]
    rows=json.loads(re.sub(r'([{,])([A-Za-z]+):',r'\1"\2":','[{leftTeam'+literal+']'))
    clubs={'legacy':'Legacy','gentle_mates':'Gentle Mates','gamerlegion':'GamerLegion',
           'astralis':'Astralis','flyquest':'FlyQuest','fnatic':'fnatic','3dmax':'3DMAX',
           'betboom_team':'BetBoom','aurora_gaming':'Aurora','b8_esports':'B8','pain_gaming':'paiN',
           'made_in_brazil':'MIBR','liquid':'Liquid','ninjas_in_pyjamas':'Ninjas in Pyjamas',
           'saw':'SAW','heroic':'HEROIC'}
    games={frozenset(m['teams']):m for m in matches}
    assert len(rows)==len(games)==33
    differences=[]
    for row in rows:
        assert row['format']=='BO3' and row['status']=='end'
        keys=[row[s+'TeamKey'] for s in ('left','right')]
        teams=[clubs[k] for k in keys]
        m=games.pop(frozenset(teams))
        assert datetime.strptime(row['date'],'%d.%m.%Y').date().isoformat()==m['day']
        rd=1 if row['round'].startswith('opening round') else int(re.match(r'round (\d)',row['round'])[1])
        assert rd==m['round']
        order=m['teams']==teams
        score=[row['leftScore'],row['rightScore']]
        assert m['score']==(score if order else score[::-1]), m['id']
        planned=[]
        scores=[]
        for v in row['maps']:
            assert [v[s+'TeamKey'] for s in ('left','right')]==keys, m['id']
            planned.append(v['map'].removeprefix('de_').replace(' ','').capitalize())
            rounds=[v['leftScore'],v['rightScore']]
            scores.append(rounds if order else rounds[::-1])
        assert m['planned']==planned, (m['id'],m['planned'],planned)
        played=[v[1:] for v in m['maps']]
        assert all(s==[0,0] for s in scores[len(played):])
        for map_name,official,observed in zip(planned,scores,played):
            if official!=observed:
                differences.append(dict(id=m['id'],map=map_name,teams=m['teams'],official=official,
                                        recorded=observed,evidence=m['sourceUrl']))
    assert not games
    assert [(d['id'],d['map'],d['official'],d['recorded']) for d in differences]==[
        (2387100,'Overpass',[13,12],[13,11]),(2387336,'Train',[10,13],[9,13])],differences
    return differences


def build_results(rows,field,source):
    entrants=field['entrants']
    rounds=[[] for _ in range(5)]
    matches=[]
    changes=[]
    for raw in rows:
        g=normalize(raw)
        assert g and g['bo']==3 and {s[2] for s in g['steps']}==set(field['pool']),raw['match-id']
        rd=int(re.search(r'Swiss round (\d)',raw['stage'])[1])
        a,b=entrants.index(g['a']),entrants.index(g['b'])
        score=[raw['team1score'],raw['team2score']]
        assert max(score)==2
        w,l=(a,b) if score[0]==2 else (b,a)
        planned=[s[2] for s in g['steps'] if s[1] in ('left','pick')]
        assert planned[:len(g['maps'])]==[m[0] for m in g['maps']]
        overlap=[]
        for index,five in ((a,g['lineupA']),(b,g['lineupB'])):
            src={key(p):p for p in field['teams'][index]['roster']}
            curr={key(p):p for p in five}
            assert len(src)==len(curr)==5 and len(src.keys() & curr.keys())>=3
            overlap.append(len(src.keys() & curr.keys()))
            if src.keys()!=curr.keys():
                changes.append(dict(id=g['mid'],day=g['day'],round=rd,team=entrants[index],
                            outgoing=[src[k] for k in sorted(src.keys()-curr.keys())],
                            incoming=[curr[k] for k in sorted(curr.keys()-src.keys())]))
        assert rd!=1 or overlap==[5,5]
        rounds[rd-1].append([w,l])
        matches.append(dict(id=g['mid'],day=g['day'],round=rd,a=a,b=b,w=w,l=l,teams=[g['a'],g['b']],
                            bo=3,played=True,coreEligible=True,rosterA=g['lineupA'],rosterB=g['lineupB'],
                            overlap=overlap,score=score,maps=g['maps'],planned=planned,steps=g['steps'],
                            actors=signature(g),sourceUrl=g['url']))
    assert changes==[dict(id=2387344,day='2025-10-30',round=5,team='Astralis',
                         outgoing=['device'],incoming=['ruggah'])],changes
    changes[0]['source']='https://www.hltv.org/news/43062/device-misses-astralis-elimination-match-in-bucharest-due-to-medical-emergency-ruggah-to-stand-in'
    differences=official_check(matches,source)
    assert len(matches)==len({m['id'] for m in matches})==33
    assert [len(rnd) for rnd in rounds]==[8,8,8,6,3]
    wins,losses=[0]*16,[0]*16
    pairs=set()
    for rnd in rounds:
        assert sorted(i for p in rnd for i in p)==[i for i in range(16) if max(wins[i],losses[i])<3]
        for w,l in rnd:
            assert (wins[w],losses[w])==(wins[l],losses[l]) and frozenset((w,l)) not in pairs
            pairs.add(frozenset((w,l)))
            wins[w]+=1
            losses[l]+=1
    actual=[(0 if l==0 else 1) if w==3 else (2 if w==0 else 3) for w,l in zip(wins,losses)]
    assert [actual.count(i) for i in range(4)]==[2,6,2,6]
    js=("require('./engine/engine.js');const r=CS.replay(JSON.parse(require('fs').readFileSync(0,'utf8')));"
        "require('node:assert/strict').equal(r.matched,33);console.log(JSON.stringify(r.rounds.map(s=>s.matched)))")
    replay=subprocess.run(['node','-e',js],cwd=ROOT,input=json.dumps(rounds),text=True,capture_output=True,check=True)
    return dict(id=ID,end=END,entrants=entrants,matches=matches,rounds=rounds,actual=actual,
                matchedByRound=json.loads(replay.stdout),administrativeMatchIds=[],
                midStageRosterChanges=changes,archiveSha256=SHA256,officialScheduleSource=GROUP_URL,
                officialScheduleSha256=GROUP_SHA,mapScoreConflicts=differences)


def emit(label, data, write):
    content=(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode()
    file=HERE/('masters-'+label+'.json')
    if write:
        file.write_bytes(content)
    elif file.read_bytes()!=content:
        raise ValueError('Archived result differs from '+file.name)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for option in ('archive','ranks','seed_ranks'):
        parser.add_argument(option,type=Path)
    parser.add_argument('--field-only',action='store_true')
    parser.add_argument('--official-groups',type=Path)
    parser.add_argument('--write',action='store_true')
    args=parser.parse_args()
    if not args.field_only and not args.official_groups:
        parser.error('--official-groups is required for checking the played Swiss results')
    assert hashlib.sha256(args.archive.read_bytes()).hexdigest()==SHA256
    with gzip.open(args.archive,'rt',encoding='utf8') as f:
        matches=json.load(f)
    before=sorted((r for r in matches if '2025-09-01'<=utc_day(r)<START),key=lambda r:(r['date'],r['match-id']))
    field=build_field(before,args.ranks,args.seed_ranks)
    emit('field',field,args.write)
    if not args.field_only:
        rows=sorted((r for r in matches if r.get('event')==NAME and START<=utc_day(r)<=END),
                    key=lambda r:(r['date'],r['match-id']))
        emit('results',build_results(rows,field,args.official_groups.read_bytes()),args.write)
