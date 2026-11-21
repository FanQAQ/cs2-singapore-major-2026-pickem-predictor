"""Extract the five completed Swiss rounds. This file has no dependency on modelling data."""
import argparse
from collections import Counter
from datetime import datetime
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from map_veto_data.extract_archive import ARCHIVE_URL, SHA256, normalize

OFFICIAL = 'https://www.pglesports.com/_next/static/chunks/app/cs2/pgl-cluj-napoca-2025/page-57328c2d57fb9ba3.js'
OFFICIAL_HASH = 'ac9e479c9cbcaa00d34b8c4259e66998acc14992b363b2d56105d6ddd6cae92b'
GROUP_PAGE = 'https://www.pglesports.com/cs2/pgl-cluj-napoca-2025/'
CLUBS = {'the_mongolz':'The MongolZ','virtus_pro':'Virtus.pro','faze_clan':'FaZe',
         'made_in_brazil':'MIBR','pain_gaming':'paiN','astralis':'Astralis','3dmax':'3DMAX',
         'big':'BIG','mouz':'MOUZ','saw':'SAW','complexity':'Complexity','falcons':'Falcons',
         'wildcard':'Wildcard','flyquest':'FlyQuest','eternal_fire':'Eternal Fire','imperial_valkyries':'Imperial Valkyries'}


def source_bytes(p, expected):
    b = p.read_bytes()
    assert hashlib.sha256(b).hexdigest() == expected, p
    return b


def extract(archive, official):
    with gzip.open(archive,'rt',encoding='utf-8') as f:
        raws = [r for r in json.load(f) if r.get('event')=='PGL Cluj-Napoca 2025' and r.get('stage','').startswith('Swiss round')]
    by_pair = {frozenset((r['team1'],r['team2'])):r for r in raws}
    assert len(by_pair)==len(raws)==33
    # JS bundle contains one array for groups and one for playoffs.
    group_text = official.decode().split('h=[{leftTeam',1)[1]
    more = re.sub(r'([{,])([a-zA-Z]+):',r'\1"\2":','[{leftTeam'+group_text)
    rows, _ = json.JSONDecoder().raw_decode(more)
    assert len(rows)==33
    records = {club:[0,0] for club in CLUBS.values()}
    results, map_disagreements = [], []
    for g in rows:
        assert g['format']=='BO3' and g['status']=='end'
        a,b = (CLUBS[g[pos+'TeamKey']] for pos in ('left','right'))
        raw = by_pair.pop(frozenset((a,b)))
        h = normalize(raw)
        assert h and h['bo']==3,raw['match-id']
        assert raw['team1'] in (a,b)
        flip = raw['team1']!=a
        def orient(pair):
            return list(reversed(pair)) if flip else list(pair)
        rd = 1 if g['round'].startswith('opening round') else int(re.match(r'round (\d)',g['round'])[1])
        assert int(re.search(r'Swiss round (\d)',raw['stage'])[1])==rd
        day = datetime.strptime(g['date'],'%d.%m.%Y').date().isoformat()
        assert day==h['day']
        score = [g['leftScore'],g['rightScore']]
        assert score==orient((raw['team1score'],raw['team2score'])) and max(score)==2 and min(score) in (0,1)
        w,l = (a,b) if score[0]>score[1] else (b,a)
        assert records[w]==records[l] and max(records[w])<3 and sum(records[w])==rd-1
        records[w][0]+=1
        records[l][1]+=1
        rounds = [[mp,*orient((x,y))] for mp,x,y in h['maps']]
        assert len(rounds)==sum(score) and score[0]==sum(x>y for _,x,y in rounds)
        organizer = []
        for m in g['maps']:
            assert [m[s+'TeamKey'] for s in ('left','right')]==[g[s+'TeamKey'] for s in ('left','right')]
            if m['leftScore'] or m['rightScore']:
                map_name=m['map'].lower().replace(' ','')
                organizer.append([map_name[3:] if map_name.startswith('de_') else map_name,m['leftScore'],m['rightScore']])
        if [[mp.lower(),x,y] for mp,x,y in rounds]!=organizer:
            map_disagreements.append(dict(id=h['mid'],official=organizer,observed=rounds,source=h['url']))
        five_a,five_b=orient((h['lineupA'],h['lineupB']))
        assert len(set(five_a))==len(set(five_b))==5
        results.append(dict(id=h['mid'],round=rd,day=day,bo=3,played=True,a=a,b=b,w=w,l=l,
                            score=score,maps=rounds,fiveA=five_a,fiveB=five_b,
                            source=h['url'],officialRound=g['round'],officialKeys=[g['leftTeamKey'],g['rightTeamKey']]))
    assert not by_pair and sorted(Counter(m['round'] for m in results).values())==[3,6,8,8,8]
    assert len(results)==len({r['id'] for r in results})==33
    assert Counter(tuple(r) for r in records.values())=={(3,0):2,(3,1):3,(3,2):3,(2,3):3,(1,3):3,(0,3):2}
    return dict(id='cluj-2025',name='PGL Cluj-Napoca 2025',stage='Swiss',start='2025-02-14',end='2025-02-18',
                officialPage=GROUP_PAGE,official=OFFICIAL,officialSha256=OFFICIAL_HASH,
                matchArchive=ARCHIVE_URL,matchArchiveSha256=SHA256,records=records,
                perfect=sorted(n for n,r in records.items() if r==[3,0]),matches=results,mapDisagreements=map_disagreements)


def development(archive):
    stages={'BLAST.tv Austin Major 2025':'austin-2025-3','StarLadder Budapest Major 2025':'budapest-2025-3'}
    result={v:[] for v in stages.values()}
    with gzip.open(archive,'rt',encoding='utf-8') as f:
        for r in json.load(f):
            if r.get('event') not in stages or not r.get('stage','').startswith('Swiss round'):
                continue
            g=normalize(r)
            assert g and g['bo'] in (1,3)
            maps=g['maps']
            wins=sum(x>y for _,x,y in maps)
            result[stages[r['event']]].append(dict(id=g['mid'],day=g['day'],bo=g['bo'],
                round=int(re.search(r'Swiss round (\d)',r['stage'])[1]),teams=[g['a'],g['b']],
                winner=g['a'] if wins>len(maps)/2 else g['b'],score=[wins,len(maps)-wins],maps=maps,source=g['url']))
    for key,rows in result.items():
        rows.sort(key=lambda g:(g['round'],g['id']))
        assert Counter(g['bo'] for g in rows)=={1:20,3:13},key
    cologne=json.loads((HERE.parent/'veto_ml/cologne-outcomes.json').read_bytes())['rows']
    result['cologne-2026-3']=[dict(id=g['id'],day=g['day'],round=g['round'],bo=g['bo'],teams=g['teams'],winner=g['winner'],
        score=g['score'],maps=[[m['map'],*m['score']] for m in g['maps'] if any(m['score'])],source=g['sourceUrl']) for g in cologne]
    assert Counter(g['bo'] for g in result['cologne-2026-3'])=={3:33}
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive',required=True,type=Path)
    parser.add_argument('--official',required=True,type=Path)
    parser.add_argument('--write',action='store_true')
    args=parser.parse_args()
    source_bytes(args.archive,SHA256)
    data=extract(args.archive,source_bytes(args.official,OFFICIAL_HASH))
    for filename,obj in [('truth.json',data),('truth-development.json',development(args.archive))]:
        dest=HERE/filename
        if args.write:
            dest.write_bytes((json.dumps(obj,ensure_ascii=False,indent=2)+'\n').encode())
        else:
            assert json.loads(dest.read_bytes())==obj
    print('Verified',len(data['matches']),'external BO3 against both sources, and 99 actual development series')
