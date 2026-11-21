"""Freeze played series and dated ranking snapshots used by the roster Elo replay."""
import argparse
import csv
import gzip
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from experience.build_history import CS2_HOMONYMS, source_rows
from tail_calibration import training as source
from round_form.major_inputs import valid_mr12

SPLIT = source.LAST_ARCHIVE_DAY
EKTARR_SHA = 'd99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972'
ARCHIVE_PUBLISHED = '2026-03-24T14:38:06Z'
FILE = HERE/'elo-data.json.gz'


def check_score(maps, bo, reported):
    if len(set(m[0] for m in maps)) != len(maps) or not maps:
        return False
    if any(not valid_mr12(a,b) for _,a,b in maps):
        return False
    won = sum(a>b for _,a,b in maps)
    final = (won,len(maps)-won)
    return max(final)==bo//2+1 and (final==reported or (bo==1 and tuple(maps[0][1:])==reported))


def names_ok(a,b):
    return len(a)==len(b)==5 and len(set(a+b))==10 and '' not in a+b


def hltv_game(g):
    fmt=re.fullmatch(r'Best of ([135])(?:\s*\([^)]*\))?',str(g.get('format','')).strip(),re.I)
    if not fmt or source.EXCLUDE.search(' '.join(str(g.get(k,'')) for k in ('format','event','stage','url'))):
        return None
    bo=int(fmt[1])
    ordered=[g['team1'],g['team2']]
    teams={source.normalize(n):i for i,n in enumerate(ordered)}
    if len(teams)!=2: return None
    maps=[]; fives=[[],[]]; scores=[[],[]]
    for m in g.get('maps',[]):
        if m.get('status')!='played': continue
        half=re.match(r'^\((\d+):(\d+)',m.get('half_scores',''))
        if not half or sum(map(int,half.groups()))!=12: return None
        sides=[None,None]
        for col in ('team1','team2'):
            team=m[col]; i=teams.get(source.normalize(team['name']))
            if i is None or sides[i] is not None: return None
            sides[i]=int(team['score'])
            players=(m.get('players') or {}).get(col,[])
            fives[i].append(source.roster([p['name'] for p in players],ordered[i]))
            try:
                values=[float(p['rating']) for p in players]
                if len(values)==5 and all(0<=v<=4 for v in values):
                    scores[i].append(mean(values))
            except (KeyError,ValueError,TypeError):
                pass
        maps.append([m['map'],*sides])
    if not check_score(maps,bo,(g['team1score'],g['team2score'])): return None
    if any(not f or any(f[0]!=row for row in f) for f in fives): return None
    a,b=fives[0][0],fives[1][0]
    if not names_ok(a,b): return None
    date=datetime.fromtimestamp(int(g['date'])/1000,timezone.utc)
    rates=[round(mean(v),6) if len(v)==len(maps) else None for v in scores]
    return dict(id='hltv:'+str(g['match-id']),day=date.date().isoformat(),time=date.strftime('%H:%M:%S'),
                event=g['event'],bo=bo,a=ordered[0],b=ordered[1],fiveA=a,fiveB=b,maps=maps,ratings=rates)


def ektarr_game(group):
    first=group[0]
    if first['bestOf'] not in ('1','3','5','1.0','3.0','5.0'): return None
    if source.EXCLUDE.search(' '.join(first[k] for k in ('team1','team2','tournament'))): return None
    bo=int(float(first['bestOf'])); fives=[]; ids=[]; maps=[]
    for g in group:
        if any(g[k]!=first[k] for k in ('team1','team2','bestOf','score1_match','score2_match','tournament')): return None
        if g['datetime'][:10]!=first['datetime'][:10] or not g['map_name']: return None
        roster=[]; player_ids=[]
        for side in (1,2):
            prefix=f'team{side}_player'
            keys=[g[prefix+str(i)+'_id'] for i in range(1,6)]
            if len(set(keys))!=5 or any(x in ('','0') for x in keys): return None
            if sum(float(g[prefix+str(i)+'_kills']) for i in range(1,6))<=0: return None
            names=[CS2_HOMONYMS.get(pid,re.split(r'\s*[,(/]',g[prefix+str(i)],maxsplit=1)[0]) for i,pid in enumerate(keys,1)]
            roster.append(source.roster(names,g[f'team{side}']))
            player_ids.append(sorted(keys))
        if len(set(player_ids[0]+player_ids[1]))!=10 or not names_ok(*roster): return None
        if fives and (fives!=roster or ids!=player_ids): return None
        fives=roster; ids=player_ids
        maps.append([g['map_name'],int(float(g['score1_game'])),int(float(g['score2_game']))])
    final=tuple(int(float(first[k])) for k in ('score1_match','score2_match'))
    if not check_score(maps,bo,final): return None
    return dict(id='ektarr:'+first['match_id'],day=first['datetime'][:10],time=first['datetime'][11:19],
        event=first['tournament'],bo=bo,a=first['team1'],b=first['team2'],fiveA=fives[0],fiveB=fives[1],maps=maps,ratings=[None,None])


def build(hltv,ektarr,ranks):
    assert hashlib.sha256(hltv.read_bytes()).hexdigest()==source.hltvy.SHA256
    assert hashlib.sha256(ektarr.read_bytes()).hexdigest()==EKTARR_SHA
    counts=Counter(); rows=[]
    with gzip.open(hltv,'rt',encoding='utf8') as f: raw=json.load(f)
    for g in raw:
        day=datetime.fromtimestamp(int(g['date'])/1000,timezone.utc).date().isoformat()
        if day<source.FIRST_CS2 or day>SPLIT: continue
        counts['hltvCandidates']+=1
        try: row=hltv_game(g)
        except (ValueError,KeyError,TypeError,OverflowError): row=None
        if row: rows.append(row)
    del raw
    grouped=defaultdict(list); game_ids=Counter()
    with ektarr.open(encoding='utf-8-sig',newline='') as f:
        for r in csv.DictReader(f):
            if r['is_total']=='False' and r['match_id'] and source.shifted(SPLIT,1)<r['datetime'][:10]<source.AS_OF:
                grouped[r['match_id']].append(r); game_ids[r['game_id']]+=1
    for group in grouped.values():
        counts['ektarrCandidates']+=1
        if any(not r['game_id'] or game_ids[r['game_id']]!=1 for r in group): continue
        try: row=ektarr_game(group)
        except (ValueError,KeyError,TypeError,OverflowError): row=None
        if row: rows.append(row)
    unique=[]; last={}; ids=set()
    for g in sorted(rows,key=lambda r:(r['day'],r['time'],r['id'])):
        a,b=g['fiveA'],g['fiveB']
        key=tuple(sorted((tuple(a),tuple(b))))+tuple(sorted((str(m).casefold(),x,y) if a<b else (str(m).casefold(),y,x) for m,x,y in g['maps']))
        if key in last and g['day']<=source.shifted(last[key],1):
            counts['duplicates']+=1; continue
        assert g['id'] not in ids
        ids.add(g['id']); last[key]=g['day']; unique.append(g)
        counts[g['id'].split(':')[0]+'Played']+=1
    fieldfile=source.read(HERE/'major-fields.json')['fields']
    cluj=source.read(HERE/'cluj-field.json')
    anchors={source.shifted(f['cutoffExclusive'],-180) for f in [*fieldfile.values(),cluj]}
    snapshots=[]
    tables=source.release_tables(ranks)
    for table in tables:
        if not any(table is max((s for s in tables if s['published'][:10]<a),key=lambda s:s['published']) for a in anchors): continue
        # Short/incomplete lineups still contribute their points to the population distribution.
        population={}
        for item in table['files']:
            for line in (ranks/table['sha']/Path(item['path']).name).read_text(encoding='utf8').splitlines():
                cells=[s.strip() for s in line.strip().strip('|').split('|')]
                if len(cells)<4 or not cells[0].isdigit(): continue
                name=cells[2].casefold()
                population[name]=max(int(cells[1]),population.get(name,0))
        snapshots.append({**{k:table[k] for k in ('rankDay','sha','published','records')},'population':list(population.values())})
    return dict(hltvRatingPublished=ARCHIVE_PUBLISHED,sources={'hltv':source.hltvy.SHA256,'ektarr':EKTARR_SHA},
                counts=dict(counts),snapshots=snapshots,rows=unique)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for f in ('hltv','ektarr','ranks'): parser.add_argument('--'+f,type=Path)
    parser.add_argument('--fetch',type=Path,metavar='CACHE',help='Fetch and verify the two published match archives')
    parser.add_argument('--check',action='store_true'); args=parser.parse_args()
    if args.fetch:
        args.fetch.mkdir(exist_ok=True,parents=True)
        archive=args.fetch/'results.json.gz'
        if not archive.exists():
            with urlopen(source.hltvy.ARCHIVE_URL,timeout=90) as response: compressed=response.read()
            assert hashlib.sha256(compressed).hexdigest()==source.hltvy.SHA256
            with archive.open('xb') as output: output.write(compressed)
        assert hashlib.sha256(archive.read_bytes()).hexdigest()==source.hltvy.SHA256
        source_rows('cs2',args.fetch)
        print(archive,args.fetch/'cs2_all_tiers_games.csv')
        sys.exit(0)
    if not all((args.hltv,args.ektarr,args.ranks)): parser.error('supply --hltv, --ektarr and --ranks, or use --fetch CACHE')
    result=build(args.hltv,args.ektarr,args.ranks)
    encoded=json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
    if args.check: assert gzip.decompress(FILE.read_bytes())==encoded
    else:
        with FILE.open('wb') as dest,gzip.GzipFile(filename='',mode='wb',fileobj=dest,mtime=0) as stream:
            stream.write(encoded)
    print(result['counts'],len(result['snapshots']))
