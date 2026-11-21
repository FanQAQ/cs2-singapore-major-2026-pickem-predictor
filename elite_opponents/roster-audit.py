"""Audit opening map lineups of the 13 completed Major Swiss stages against the sealed ML input."""
import argparse
import collections
import gzip
import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime,timezone
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
sys.path.insert(0,str(ROOT))
from map_veto_data.extract_archive import SHA256, ARCHIVE_URL
from experience.build_history import normalize, TEAM_ALIASES

EVENT={
 'copenhagen':'PGL CS2 Major Copenhagen 2024 Opening Stage','copenhagen-2024-2':'PGL CS2 Major Copenhagen 2024',
 'shanghai':'Perfect World Shanghai Major 2024 Opening Stage','shanghai-2024-2':'Perfect World Shanghai Major 2024',
 'austin':'BLAST.tv Austin Major 2025 Stage 1','austin-2025-2':'BLAST.tv Austin Major 2025 Stage 2',
 'austin-2025-3':'BLAST.tv Austin Major 2025','budapest':'StarLadder Budapest Major 2025 Stage 1',
 'budapest-2025-2':'StarLadder Budapest Major 2025 Stage 2','budapest-2025-3':'StarLadder Budapest Major 2025'}
COLOGNE=('cologne','cologne-2026-2','cologne-2026-3')
ORGS={'bb':'betboom','betboomteam':'betboom','futesports':'fut','teamliquid':'liquid','teamfalcons':'falcons',
      'fazeclan':'faze','navi':'natusvincere','nip':'ninjasinpyjamas','mongolz':'themongolz','lynnvisiongaming':'lynnvision',
      'sinnersesports':'sinners','9zteam':'9z','paingaming':'pain','g2esports':'g2','teamspirit':'spirit'}
EXTRA={'v$m':'vsm','hunter-':'hunter','dav1d':'dav1deus','rmn':'roman'}


def read(file):
    raw=file.read_bytes();return json.loads(gzip.decompress(raw) if file.suffix=='.gz' else raw)


def save(name,obj,write):
    file=HERE/name
    raw=(json.dumps(obj,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    if file.suffix=='.gz':raw=gzip.compress(raw,mtime=0)
    if write:file.write_bytes(raw)
    else: assert raw==file.read_bytes(),file


def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()


def org(n):
    s=re.sub(r'[^a-z0-9]','',n.lower());return ORGS.get(s,s)


def five(lineup,team):
    aliases=TEAM_ALIASES.get(normalize(team),{})
    raw=[normalize(n) for n in lineup]
    f={aliases.get(n,EXTRA.get(n,n)) for n in raw}
    assert len(lineup)==len(f)==5,(team,lineup)
    return f


def extract(args):
    assert sha(args.archive)==SHA256
    source={v:k for k,v in EVENT.items()}
    by={id:[] for id in [*EVENT,*COLOGNE]}
    with gzip.open(args.archive,'rt',encoding='utf8') as src:
        for r in json.load(src):
            key=source.get(r.get('event'))
            if not key or r['stage'].strip().casefold()!='swiss round 1':continue
            names=[r['team1'],r['team2']]
            maps=[]
            winners=[0,0]
            for g in r['maps']:
                if g['status']!='played': continue
                actual={org(g[s]['name']):sorted((p['name'] for p in g['players'][s]),key=str.casefold)
                        for s in ('team1','team2')}
                scores={org(g[s]['name']):int(g[s]['score']) for s in ('team1','team2')}
                assert all(n.strip() for f in actual.values() for n in f)
                lineups=[actual[org(n)] for n in names]
                for n,f in zip(names,lineups):five(f,n)
                score=[scores[org(n)] for n in names];assert max(score)>=13 and min(score)>=0 and score[0]!=score[1]
                winners[int(score[0]<score[1])]+=1
                maps.append(dict(map=g['map'],score=score,fives=lineups))
            assert len(maps)==1 and [r['team1score'],r['team2score']] in (maps[0]['score'],winners)
            by[key].append(dict(id=r['match-id'],teams=names,day=datetime.fromtimestamp(r['date']/1000,timezone.utc).date().isoformat(),
                    url=r['url'].replace('https://hltv.org/','https://www.hltv.org/'),maps=maps))
    feed_meta={}
    for idx,k in enumerate(COLOGNE):
        file=args.cologne[idx];sheets=read(file)['data']
        for p in sheets:
            if p['author']!='CS2_PostMatchThreads':continue
            m=re.fullmatch(r'(.+) vs (.+) / IEM Cologne Major 2026(?: Stage [12])? - Swiss Round 1 / Post-Match Discussion',p['title'])
            if not m:continue
            names=[m[1],m[2]];body=p['selftext']
            match=re.search(r'https://www\.hltv\.org/matches/(\d+)/[\w-]+',body)
            assert match
            headings=list(re.finditer(r'^(?:# (\w+) Stats:|## Map \d+: (\w+))\s*$',body,re.M))
            assert len(headings) in ([1] if idx<2 else [2,3])
            maps=[]
            for i,start in enumerate(headings):
                mp=start[1] or start[2]
                chunk=body[start.end():headings[i+1].start() if i+1<len(headings) else len(body)]
                detailed=re.search(r'https://www\.hltv\.org/stats/matches/mapstatsid/(\d+)/[\w-]+',chunk)
                assert detailed,(k,match[1],mp)
                # Parse only the per-map scoreboard that binds a named side and player's ID.
                fives={}; ids={}; score={};side=None
                for line in chunk.splitlines():
                    team=re.match(r'^\[.*?\]\(#[^)]*-logo\) \*\*([^*]+)\*\* \|\s*$',line)
                    rounds=re.match(r'^\|\[.*?\]\(#[^)]*-logo\) \*\*([^*]+)\*\* \|(?:\s*\d+\s*\|){2,}\s*(\d+)\s*\|?\s*$',line)
                    player=re.search(r'\[([^\]]+)\]\(https://www\.hltv\.org/player/(\d+)/[^)]+\)\s*\|\s*\d+-\d+\s*\|',line)
                    if rounds:score[org(rounds[1])]=int(rounds[2])
                    if team:
                        side=org(team[1]);assert side not in fives
                        fives[side]=[];ids[side]=[]
                    if player:
                        assert side is not None
                        fives[side].append(player[1]);ids[side].append(int(player[2]))
                lineups=[fives[org(n)] for n in names];pids=[ids[org(n)] for n in names]
                for n,v in zip(names,lineups):five(v,n)
                assert len(set(pids[0]+pids[1]))==10
                scores=[score[org(n)] for n in names]
                assert max(scores)>=13 and min(scores)>=0 and scores[0]!=scores[1],(k,match[1],mp,scores)
                maps.append(dict(map=mp,fives=lineups,score=scores,playerIds=pids,statsUrl=detailed[0]))
            by[k].append(dict(id=int(match[1]),teams=names,url=match[0],
                    day=datetime.fromtimestamp(p['created_utc'],timezone.utc).date().isoformat(),
                    thread='https://www.reddit.com'+p['permalink'],maps=maps))
        feed_meta[k]=sha(file)
    from cologne_veto.official_blast import MAPS as BLAST_MAPS, matches as blast_matches
    from veto_ml.cologne_outcomes import team as blast_org
    html=args.blast.read_text(encoding='utf8')
    for n,k in enumerate(COLOGNE,1):
        bl={frozenset(org(blast_org(g[x]['name'])) for x in ('teamA','teamB')):g
            for g in blast_matches(html,'Stage '+str(n))}
        for fixture in by[k]:
            sides=list(map(org,fixture['teams']))
            game=bl[frozenset(sides)]
            reverse=sides[0]!=org(blast_org(game['teamA']['name']))
            played=[m for m in game['maps'] if m['teamAScore']!=m['teamBScore']]
            actual=[(BLAST_MAPS[m['name'][3:]], [m['teamBScore'],m['teamAScore']] if reverse else
                    [m['teamAScore'],m['teamBScore']]) for m in played]
            assert actual==[(m['map'],m['score']) for m in fixture['maps']],(k,fixture['id'])
            fixture['blastId']=game['id']
    for k,events in by.items():
        events.sort(key=lambda s:s['id'])
        assert len(events)==len({e['id'] for e in events})==8
        assert len({org(n) for e in events for n in e['teams']})==16
    return dict(sources=dict(hltvy=ARCHIVE_URL,hltvySha256=SHA256,cologneFeedSha256=feed_meta,
        blastIndex='https://blast.tv/cs/tournaments/iem-cologne-major-2026?view=results',
        blastIndexSha256=sha(args.blast)),fields=by)


def expected_opening():
    out={}
    early=read(ROOT/'history24/fixtures.json')
    more=read(ROOT/'fixtures/fixtures.json')
    for k in ('copenhagen','shanghai','austin','budapest','cologne'):
        f=(early if k in early else more)[k]
        out[k]={frozenset(org(n) for n in m) for m in f['rounds'][0]}
    for f in read(ROOT/'multi_stage/inputs.json'):
        names=[t['name'] for t in f['teams']]
        out[f['id']]={frozenset((org(names[i]),org(names[j]))) for i,j in f['rounds'][0]}
    return out


def build(evidence):
    infile=ROOT/'f1bre_models/major-fields.json';ml=read(infile)['fields']
    stages=[k for k in ml if k!='singapore']
    assert set(stages)==set(evidence['fields']) and len(stages)==13
    fixtures=expected_opening();results={};overall=collections.Counter()
    for key in stages:
        f=ml[key];games=evidence['fields'][key]
        ref={org(t['name']):t for t in f['teams']}
        assert len(ref)==16
        fixtures_found={frozenset(org(n) for n in g['teams']) for g in games}
        assert fixtures[key]==fixtures_found
        rows=[];counts=collections.Counter()
        for g in games:
            for i,display in enumerate(g['teams']):
                t=ref[org(display)];name=t['name']
                pred=five(t['roster'],name);vrs=five(t['vrsRoster'],name)
                inputs=[r['fives'][i] for r in g['maps']]
                actual=[five(line,name) for line in inputs]
                diff=[dict(map=r['map'],forecastOnly=sorted(pred-v),actualOnly=sorted(v-pred))
                      for r,v in zip(g['maps'],actual) if v!=pred]
                assert abs(t['seed']-ref[org(g['teams'][1-i])]['seed'])==8
                vrs_overlap=min(len(vrs & v) for v in actual)
                names_only=lambda xs:{unicodedata.normalize('NFKC',n).strip().casefold() for n in xs}
                alias=any(names_only(v)!=names_only(t['roster']) and actual[j]==pred for j,v in enumerate(inputs))
                r=dict(team=name,seed=t['seed'],predicted=t['roster'],matchId=g['id'],opponent=g['teams'][1-i],
                       maps=[m['map'] for m in g['maps']],actualOpening=inputs[0],
                       verifiedAllMaps=all(len(v)==5 for v in actual),matchOnAllMaps=not diff,aliasNormalization=alias,
                       actualChangedBetweenMaps=any(v!=actual[0] for v in actual),differences=diff,
                       vrsMinOverlap=vrs_overlap,vrsRoster=t['vrsRoster'])
                if diff:r['classification']='unresolved_pending_pre_event_evidence'
                rows.append(r)
                counts['teamAppearances']+=1;counts['completeTeams']+=r['verifiedAllMaps'];counts['exactTeams']+=not diff
                counts['teamMapAppearances']+=len(inputs);counts['exactTeamMapAppearances']+=len(inputs)-len(diff)
                counts['aliasEquivalentTeams']+=alias;counts['betweenMapChanges']+=r['actualChangedBetweenMaps']
                counts['vrsFiveDiffers']+=vrs_overlap<5
        assert len(rows)==len({r['team'] for r in rows})==16
        counts['series']=len(games);counts['playedMaps']=sum(len(g['maps']) for g in games)
        overall.update(counts)
        results[key]=dict(start=f['start'],strengthSnapshot=f['pointsAsOf'],counts=dict(counts),
                          teams=sorted(rows,key=lambda r:r['seed']),sources={str(g['id']):g['url'] for g in games})
    return dict(modelInputSha256=sha(infile),evidenceSha256=sha(HERE/'roster-audit-evidence.json.gz'),
                counts=dict(overall),fields=results)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',type=Path)
    p.add_argument('--cologne',type=Path,nargs=3,metavar=('S1_FEED','S2_FEED','S3_FEED'))
    p.add_argument('--blast',type=Path,help='Archived BLAST Cologne event results HTML')
    p.add_argument('--write',action='store_true')
    a=p.parse_args()
    if a.archive or a.cologne or a.blast:
        if not all((a.archive,a.cologne,a.blast)):p.error('Specify --archive, all three --cologne files and --blast.')
        save('roster-audit-evidence.json.gz',extract(a),a.write)
    output=build(read(HERE/'roster-audit-evidence.json.gz'))
    save('roster-audit.json',output,a.write)
    print(output['counts'])
    for k,stage in output['fields'].items():
        print(k,stage['counts']['exactTeams'],stage['counts']['vrsFiveDiffers'],[r['team'] for r in stage['teams'] if r['differences']])
