"""Verify all 99 donor Stage 2 series, dated rosters, scores and prior Valve points."""
import argparse
import gzip
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from experience.build_history import normalize, TEAM_ALIASES
from map_veto_data import extract_archive as hltvy

ROSTER_SPELLING = {'hunter-':'hunter', 'v$m':'vsm', 'dav1d':'dav1deus'}
START_RATINGS = {'austin':'2025-06-02', 'budapest':'2025-11-03', 'cologne':'2026-06-01'}
BLAST_IDS = {'austin':'austin-major-2025-finals','budapest':'budapest-major-finals-2025'}


def read(file):
    return json.loads(file.read_text(encoding='utf8'))


def names(players, org):
    aliases = TEAM_ALIASES.get(normalize(org), {})
    result = []
    for p in players:
        nick = normalize(p)
        nick = aliases.get(nick, nick)
        result.append(ROSTER_SPELLING.get(nick, nick))
    return frozenset(result)


def lookup(five, rows):
    candidates = sorted(((len(five & other), name, points) for other,name,points in rows),reverse=True)
    n,label,points = candidates[0]
    if n < 3 or n == candidates[1][0]:
        return None,None,n
    return label,points,n


def ranking_tables(cache):
    hashes=read(ROOT/'stage3_maps/inputs-snapshots.json')
    tables={}
    for day in sorted(set(START_RATINGS.values()) | {'2025-12-01'}):
        file=cache/('standings_global_'+day.replace('-','_')+'.md')
        raw=file.read_bytes()
        assert hashlib.sha256(raw).hexdigest()==hashes[day],file
        rows=[]
        for ln in raw.decode('utf8').splitlines():
            cells=[s.strip() for s in ln.split('|')]
            if len(cells)>5 and cells[1].isdigit():
                five=names(cells[4].split(', '),cells[3])
                if len(five)==5:
                    rows.append((five,cells[3],int(cells[2])))
        assert len(rows)>100
        tables[day]=rows
    return tables


def source_series(cache):
    archive=cache/'results.json.gz'
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==hltvy.SHA256
    target_suffixes={'blasttv-austin-major-2025-stage-2':'austin',
                     'starladder-budapest-major-2025-stage-2':'budapest'}
    result={e:[] for e in START_RATINGS}
    with gzip.open(archive,'rt',encoding='utf8') as f:
        for raw in json.load(f):
            event=next((e for suffix,e in target_suffixes.items() if raw['url'].endswith(suffix)),None)
            if not event:
                continue
            m=hltvy.normalize(raw)
            assert m and m['lineupA'] and m['lineupB'],raw['url']
            selected=[mp for _,action,mp in m['steps'] if action in ('pick','left')]
            assert [mp for mp,_,_ in m['maps']]==selected[:len(m['maps'])]
            utc=datetime.fromtimestamp(int(raw['date'])/1000,timezone.utc)
            result[event].append(dict(id='hltv:'+str(m['mid']),day=m['day'],startUtc=utc.isoformat(),bo=m['bo'],a=m['a'],b=m['b'],
                fiveA=m['lineupA'],fiveB=m['lineupB'],maps=m['maps'],sourceUrl=m['url']))
    for r in read(ROOT/'cologne_veto/official-blast.json')['matches']:
        result['cologne'].append(dict(id='hltv:'+str(r['stage2Id']),day=r['day'],bo=r['bo'],
            a=r['a'],b=r['b'],fiveA=r['fiveA'],fiveB=r['fiveB'],maps=r['maps'],sourceUrl=r['sourceUrl']))
    return result


def valid_mr12(x,y):
    high,low=max(x,y),min(x,y)
    return (high==13 and 0<=low<=11) or (high>=16 and (high-16)%3==0 and high-4<=low<=high-2)


def team_key(name):
    key=re.sub(r'[^a-z0-9]', '', name.casefold())
    return {'teamsprout':'sprout','teamm80':'m80','teamliquid':'liquid','teamfalcons':'falcons',
            'bbteam':'betboom','betboomteam':'betboom','teamspirit':'spirit','g2esports':'g2',
            '9zteam':'9z','futesports':'fut','paingaming':'pain','b8esports':'b8','lgcy':'legacy',
            'lynnvisiongaming':'lynnvision','navi':'natusvincere','nip':'ninjasinpyjamas',
            'teamog':'og','nemigagaming':'nemiga','fazeclan':'faze'}.get(key,key)


def blast_scores(file, tournament, stage_end):
    # Read just the Stage 2 map records from BLAST's public, indexed match list.
    html=file.read_text(encoding='utf8')
    cells=[]
    for chunk in re.findall(r'streamController\.enqueue\((.+?)\);</script>',html):
        part=json.loads(chunk)
        values=json.loads(part.split(':',1)[1] if part.startswith('P') else part)
        if isinstance(values,list):
            cells.extend(values)
    keys={v:'_'+str(i) for i,v in enumerate(cells) if isinstance(v,str)}

    def get(obj,key):
        idx=obj[keys[key]]
        return cells[idx] if idx>=0 else None

    checked=[]
    for v in cells:
        if not isinstance(v,dict) or not all(keys[k] in v for k in ('maps','teamAScore','stage')):
            continue
        if get(get(v,'stage'),'name')!='Stage 2' or get(get(v,'tournament'),'id')!=tournament:
            continue
        a,b=(get(get(v,side),'name') for side in ('teamA','teamB'))
        games=[]
        for idx in get(v,'maps'):
            game=cells[idx]
            scheduled=get(game,'scheduledAt')
            if not isinstance(scheduled,str) or scheduled[:10]>stage_end:
                continue
            x,y=get(game,'teamAScore'),get(game,'teamBScore')
            if x is not None and y is not None and x!=y:
                name=get(game,'name')
                assert name.startswith('de_')
                games.append([name[3:],x,y])
        checked.append((a,b,games))
    assert len(checked)==33
    return checked


def compare_scores(result,cache,cologne_cache):
    for stage,field in result['fields'].items():
        event=stage.split('-')[0]
        if event in BLAST_IDS:
            checked=blast_scores(cache/(event+'-blast.html'), BLAST_IDS[event],field['stage2End'])
        else:
            checked=[]
            refs=read(ROOT/'cologne_veto/official-crosscheck.json')['matches']
            for r in refs:
                slug=r['sourceUrl'].rsplit('/',1)[1]
                a,b=slug.split('-iem-cologne-2026-')[0].split('-vs-')
                page=cologne_cache/('r-'+slug+'.html')
                if page.exists():
                    text=page.read_text(encoding='utf8')
                    games=[[mp,int(x),int(y)] for mp,x,y in re.findall(
                        r'<b>([a-z0-9]+)</b><span class="es-ms">(\d+)–(\d+)',text)]
                else:
                    # Same publicly indexed match page as the saved veto fallback.
                    assert r['stage2Id']==2394865 and (a,b)==('team-spirit','betboom')
                    games=[['mirage',13,5]]
                checked.append((a,b,games))
        assert len(checked)==33
        lookup_by_pair={frozenset((team_key(s['a']),team_key(s['b']))):s for s in field['series']}
        seen=set()
        for a,b,maps in checked:
            pair=frozenset((team_key(a),team_key(b)))
            assert pair not in seen and pair in lookup_by_pair,(event,a,b)
            seen.add(pair)
            row=lookup_by_pair[pair]
            forward=team_key(a)==team_key(row['a'])
            expected=[[m.lower(),x if forward else y,y if forward else x] for m,x,y in row['maps']]
            if event=='austin' and pair=={'pain','nemiga'}:
                # BLAST's BO1 row links its maps to June 13 (after the target
                # cutoff). The June 7 Dust2 Brasil match report verifies 13–7.
                assert not maps and expected==[['dust2',13,7]]
            else:
                assert sorted(maps)==sorted(expected),(event,a,b,maps,expected)
        assert seen==set(lookup_by_pair)
        print(stage,'33/33 cross-source per-map round scores, with both team orientations checked')


def build(cache):
    sources=source_series(cache)
    standings=ranking_tables(cache)
    editions=read(ROOT/'major_form/all_stages.json')['editions']
    stages=read(ROOT/'multi_stage/inputs.json')
    out={}
    for event,games in sources.items():
        donor=next(s for s in stages if s['parent']==event and s['stage']==2)
        target=next(s for s in stages if s['parent']==event and s['stage']==3)
        starts=START_RATINGS[event]
        roster=[names(t['roster'],t['name']) for t in donor['teams']]
        assert len(set(roster))==16
        order={}
        for rr,rounds in enumerate(donor['rounds'],1):
            for pos,(w,l) in enumerate(rounds):
                key=frozenset((w,l))
                assert key not in order
                order[key]=(rr,pos,w,donor['formats'][rr-1][pos])
        assert len(order)==33
        known={}
        for g in editions[event]['matches']:
            if g['stage']==2:
                p,q=names(g['rosterA'],g['a']),names(g['rosterB'],g['b'])
                key=frozenset((p,q))
                assert key not in known
                known[key]=(g,p,q)
        assert len(known)==33
        series=[]
        for game in games:
            day=game['day']
            assert starts<donor['date']<=day<=donor['endDate']<target['date']
            a,b=names(game['fiveA'],game['a']),names(game['fiveB'],game['b'])
            assert len(a)==len(b)==5 and a.isdisjoint(b)
            matched=known.get(frozenset((a,b)))
            assert matched,(event,day,game['a'],a,game['b'],b)
            ref,rA,rB=matched
            if day!=ref['day']:
                # All secondary date differences fall across midnight at UTC+3.
                # Keep the observed UTC epoch and the secondary date separately.
                utc=datetime.fromisoformat(game['startUtc'])
                assert event=='austin' and (utc+timedelta(hours=3)).date().isoformat()==ref['day']
            i,j=roster.index(a),roster.index(b)
            rr,pos,winner,bo=order[frozenset((i,j))]
            assert bo==game['bo']==ref['bo']
            maps=game['maps']
            assert len(maps)==len({m for m,_,_ in maps}) and all(valid_mr12(x,y) for _,x,y in maps)
            wins=sum(x>y for _,x,y in maps)
            score=[wins,len(maps)-wins]
            assert max(score)==bo//2+1 and (i if score[0]>score[1] else j)==winner
            assert (a if score[0]>score[1] else b)==(rA if ref['y'] else rB)
            ranked=max(d for d in standings if d<day)
            field=dict(game,round=rr,position=pos+1,score=score,
                a=donor['teams'][i]['name'],b=donor['teams'][j]['name'],
                # Keep stable identities from the independent full-roster match archive.
                fiveA=ref['rosterA'] if a==rA else ref['rosterB'],
                fiveB=ref['rosterB'] if a==rA else ref['rosterA'],
                verifierSeriesId=ref['id'],verifierDay=ref['day'],rankDay=ranked,stageStartRankDay=starts)
            for side,five in [('A',a),('B',b)]:
                _,field['points'+side],field['rankOverlap'+side]=lookup(five,standings[ranked])
                _,field['stageStartPoints'+side],_=lookup(five,standings[starts])
            series.append(field)
        series.sort(key=lambda g:(g['round'],g['position']))
        assert len({g['id'] for g in series})==len({g['verifierSeriesId'] for g in series})==len(series)==33
        assert Counter(g['bo'] for g in series)=={1:20,3:13}
        out[target['id']]=dict(id=target['id'],donorStage=2,start=target['date'],stage2Start=donor['date'],
                                stage2End=donor['endDate'],series=series)
    return dict(fields=out)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,required=True,help='HLTV gzip and dated Valve monthly files')
    parser.add_argument('--write',action='store_true')
    parser.add_argument('--check-other-scores',type=Path,metavar='COLOGNE_RELOADER_CACHE',
                        help='also check 2025 BLAST indexes in --cache and 2026 Reloader HTML map results')
    args=parser.parse_args()
    result=build(args.cache)
    if args.check_other_scores:
        compare_scores(result,args.cache,args.check_other_scores)
    output=HERE/'major-inputs.json'
    text=json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n'
    if args.write:
        output.write_bytes(text.encode('utf8'))
    else:
        assert output.read_bytes()==text.encode('utf8')
    for sid,s in result['fields'].items():
        games=s['series']
        print(sid,len(games),'series',sum(len(g['maps']) for g in games),'maps',
              sum(max(a,b)>13 for g in games for _,a,b in g['maps']),'overtime maps',
              sum(g[k] is None for g in games for k in ('pointsA','pointsB')),'unmatched sides')
