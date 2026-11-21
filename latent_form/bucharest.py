"""Reconstruct the April 2025 Swiss field from the pre-event draw, lineups and Valve rankings."""
import argparse
import gzip
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from map_veto_data.extract_archive import ARCHIVE_URL, SHA256, key, normalize
from round_form.epl22_inputs import ranking, utc_day

ID, NAME, START = 'bucharest-2025-april', 'PGL Bucharest 2025', '2025-04-06'
DRAW = 'https://x.com/pglesports/status/1906646339301105947'
# The announcement gives eight matchups. Its broadcast order does not establish tournament seeds.
OPENING = [('The MongolZ','3DMAX'),('Virtus.pro','Rare Atom'),('G2','GamerLegion'),('Falcons','Complexity'),
           ('Aurora','paiN'),('Liquid','Legacy'),('FaZe','Astralis'),('FURIA','Apogee')]
NEWS = {'Aurora':'https://www.hltv.org/news/41357/aurora-sign-eternal-fire-roster-in-shock-move',
        'Liquid':'https://www.hltv.org/news/41325/official-siuhy-joins-liquid-on-loan',
        'paiN':'https://www.dust2.com.br/noticias/59065/pain-coloca-kauez-no-banco-e-testara-jogador'}
SWAPS = {'Liquid':('jks','siuhy'), 'paiN':('kauez','deemO')}

def canonical(name):
    return {'Betclic':'Apogee','Betclic Apogee':'Apogee'}.get(name,name)

def read_ranks(release, ranks_path):
    info, = release['files']
    raw_ranks = ranks_path.read_bytes()
    assert hashlib.sha256(raw_ranks).hexdigest() == info['sha256']
    ranks = []
    for line in raw_ranks.decode().splitlines():
        cells = [c.strip() for c in line.split('|')]
        if len(cells)>=5 and cells[1].isdigit():
            five = cells[4].split(', ')
            if len(set(map(key,five)))==5:
                ranks.append(dict(name=cells[3], rank=int(cells[1]), points=int(cells[2]), roster=five))
    return ranks

def build_field(records, ranks_path, seed_path):
    releases = json.loads((ROOT/'tail_calibration/training-releases.json').read_text(encoding='utf8'))
    release = max((r for r in releases if r['published'][:10] < START), key=lambda r:r['published'])
    seeding, = [r for r in releases if r['rankDay']=='2025-02-03']
    info, = release['files']
    ranks, seed_ranks = read_ranks(release,ranks_path), read_ranks(seeding,seed_path)
    past = sorted((r for r in records if '2025-02-01' <= utc_day(r) < START), key=lambda r:int(r['date']), reverse=True)
    teams = []
    for name in sorted(n for pair in OPENING for n in pair):
        old_name = 'Eternal Fire' if name=='Aurora' else name
        witness = None
        for r in past:
            if old_name not in [canonical(r.get(k)) for k in ('team1','team2')]:continue
            g = normalize(r)
            if not g:continue
            five = g['lineupA'] if canonical(g['a'])==old_name else g['lineupB']
            if five and len(five)==5:
                witness = dict(day=g['day'],url=g['url'],team=old_name,roster=five)
                break
        assert witness, name
        five = list(witness['roster'])
        if name in SWAPS:
            previous,arrival=SWAPS[name]
            assert previous in five
            five[five.index(previous)] = arrival
        rank = ranking(five,ranks)
        seed_rank=ranking(five,seed_ranks)
        teams.append(dict(name=name, roster=five, witness=witness, announcement=NEWS.get(name),
                          seedRank=seed_rank['rank'],seedRoster=seed_rank['roster'],seedOverlap=seed_rank['overlap'],
                          points=rank['points'], vrsRoster=rank['roster'], rank=rank['rank'], overlap=rank['overlap']))
    assert len({t['rank'] for t in teams})==16
    assert len({key(p) for t in teams for p in t['roster']})==80
    order=sorted(range(16),key=lambda i:teams[i]['seedRank'])
    assert len({t['seedRank'] for t in teams})==16
    assert {frozenset((teams[order[i]]['name'],teams[order[i+8]]['name'])) for i in range(8)}==set(map(frozenset,OPENING))
    seed_info,=seeding['files']
    return dict(id=ID, label=NAME, start=START, teams=teams, seedOrder=order,openingPairs=OPENING,openingSource=DRAW,
                seedPublishedAt=seeding['published'],seedSha256=seed_info['sha256'],
                seedSource='https://github.com/ValveSoftware/counter-strike_regional_standings/blob/'+seeding['sha']+'/'+seed_info['path'],
                rankPublishedAt=release['published'], rankSha256=info['sha256'], archiveSha256=SHA256,
                rankSource='https://github.com/ValveSoftware/counter-strike_regional_standings/blob/'+release['sha']+'/'+info['path'],
                archiveSource=ARCHIVE_URL)

def build_truth(records, field):
    teams=field['teams']
    position={t['name']:i for i,t in enumerate(teams)}
    matches, rounds = [],[[] for _ in range(5)]
    for r in sorted((g for g in records if g.get('event')==NAME and START<=utc_day(g)<='2025-04-10'),key=lambda r:int(r['date'])):
        stage=int(re.search(r'Swiss round (\d)',r['stage'])[1])
        g=normalize(r)
        assert g and g['bo']==3,(r['match-id'],r['stage'])
        a,b=(position[canonical(g[k])] for k in ('a','b'))
        wins=sum(x>y for _,x,y in g['maps'])
        loss=len(g['maps'])-wins
        assert max(wins,loss)==2 and [wins,loss]==[r['team1score'],r['team2score']]
        w,l=(a,b) if wins>loss else (b,a)
        overlaps=[]
        for i,five in [(a,g['lineupA']),(b,g['lineupB'])]:
            overlaps.append(len(set(map(key,five))&set(map(key,teams[i]['roster']))))
        assert overlaps==[5,5],(g['mid'],overlaps)
        rounds[stage-1].append([w,l])
        matches.append(dict(id=g['mid'], day=g['day'], round=stage,w=w,l=l,bo=3,overlap=overlaps,
                            a=a,b=b,rosterA=g['lineupA'],rosterB=g['lineupB'],maps=g['maps'],url=g['url']))
    assert [len(r) for r in rounds]==[8,8,8,6,3] and len({m['id'] for m in matches})==33
    assert {frozenset(pair) for pair in rounds[0]}=={frozenset(map(position.get,p)) for p in OPENING}
    # Validate the full Swiss records without making assumptions about a tiebreak.
    w,l=[0]*16,[0]*16
    seen=set()
    for pairs in rounds:
        assert {i for p in pairs for i in p}=={i for i in range(16) if max(w[i],l[i])<3}
        for a,b in pairs:
            pair=frozenset((a,b))
            assert (w[a],l[a])==(w[b],l[b]) and pair not in seen
            seen.add(pair);w[a]+=1;l[b]+=1
    actual=[(0 if l[i]==0 else 1) if w[i]==3 else (2 if w[i]==0 else 3) for i in range(16)]
    assert [actual.count(i) for i in range(4)]==[2,6,2,6]
    official=[[list(map(field['seedOrder'].index,match)) for match in matches] for matches in rounds]
    js="require('./engine/engine.js');const r=CS.replay(JSON.parse(require('fs').readFileSync(0,'utf8')));require('assert/strict').equal(r.matched,33);console.log(JSON.stringify(r.rounds.map(s=>s.matched)))"
    checked=subprocess.run(['node','-e',js],input=json.dumps(official),cwd=ROOT,text=True,capture_output=True,check=True)
    return dict(id=ID,rounds=rounds,matches=matches,actual=actual,matchedByRound=json.loads(checked.stdout),archiveSha256=SHA256)

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('archive',type=Path);ap.add_argument('ranks',type=Path);ap.add_argument('seed_ranks',type=Path)
    ap.add_argument('--write',action='store_true')
    args=ap.parse_args()
    assert hashlib.sha256(args.archive.read_bytes()).hexdigest()==SHA256
    with gzip.open(args.archive,'rt',encoding='utf8') as stream:records=json.load(stream)
    field=build_field(records,args.ranks,args.seed_ranks)
    for k,v in [('field',field),('results',build_truth(records,field))]:
        file=HERE/('bucharest-'+k+'.json')
        content=(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()
        if args.write:file.write_bytes(content)
        else:assert file.read_bytes()==content
