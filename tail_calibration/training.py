"""Build pre-target, population-wide, roster-verified observations for VRS calibration."""
import argparse
import bisect
import gzip
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(ROOT/'map_strength'))
from map_veto_data import extract_archive as hltvy
from history24.build import load_series
from map_strength.prepare import validated
from experience.build_history import AMBIGUOUS, normalize, TEAM_ALIASES
from round_form.major_inputs import valid_mr12

LAST_ARCHIVE_DAY='2026-03-23'
FIRST_CS2='2023-09-27'
AS_OF='2026-11-21'
CACHE_VERSION='https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11'
EXCLUDE=re.compile(r'\b(show[ -]?match|exhibition|charity|forfeit(?:ed)?|walk[ -]?over|'
                   r'disqualif\w*|default win|technical (?:loss|win)|map advantage)\b',re.I)
ALIASES={'v$m':'vsm','hunter-':'hunter','dav1d':'dav1deus','rmn':'roman'}


def read(file):
    return json.loads(file.read_text(encoding='utf8'))


def shifted(day,days):
    return (date.fromisoformat(day)+timedelta(days=days)).isoformat()


def roster(raw,org):
    specific=TEAM_ALIASES.get(normalize(org),{})
    out=[]
    for nick in raw:
        n=normalize(nick)
        out.append(specific.get(n,ALIASES.get(n,n)))
    return sorted(out)


def release_tables(cache,releases=None):
    def safe_ids(raw):
        return frozenset(p for p in raw if p and p not in AMBIGUOUS)
    result=[]
    if releases is None:
        releases=read(HERE/'training-releases.json')
    for i,r in enumerate(releases):
        records={}
        for file in r['files']:
            raw=(cache/r['sha']/Path(file['path']).name).read_bytes()
            assert hashlib.sha256(raw).hexdigest()==file['sha256']
            lines=raw.decode('utf8').splitlines()
            assert r['rankDay'] in lines[0].replace('_','-')
            for ln in lines:
                cells=[s.strip() for s in ln.strip().strip('|').split('|')]
                if len(cells)<4 or not cells[0].isdigit(): continue
                group=roster(cells[3].split(', '),cells[2])
                if len(set(group))!=5: continue
                key=(tuple(group),int(cells[1]))
                records.setdefault(key,dict(team=cells[2],p=int(cells[1]),five=group))
        assert records
        items=list(records.values())
        idx=defaultdict(list)
        for j,row in enumerate(items):
            for p in safe_ids(row['five']): idx[p].append(j)
        result.append(dict(records=items,index=idx,release=i,**r))
    return result


def rank_for(five,table):
    indexes=Counter(i for p in five if p not in AMBIGUOUS for i in table['index'].get(p,()))
    best=indexes.most_common(2)
    if not best or best[0][1]<3 or (len(best)>1 and best[0][1]==best[1][1]):return None
    i,n=best[0]
    return table['records'][i],n


def target_windows():
    edt=read(ROOT/'major_form/all_stages.json')['editions']
    starts={e:v['start'] for e,v in edt.items()}
    starts.update({s['id']:s['date'] for s in read(ROOT/'multi_stage/inputs.json')})
    starts.update({'epl21-stage2':'2025-03-07','epl22-stage2':'2025-10-04','epl23-stage2':'2026-03-06',
                   'singapore':'2026-11-24'})
    assert len(starts)==17
    windows={}
    for k,day in sorted(starts.items(),key=lambda v:v[1]):
        cutoff=min(AS_OF,day)
        first=(date.fromisoformat(cutoff)-timedelta(days=180)).isoformat()
        windows[k]=dict(start=day,windowStart=first,cutoffExclusive=cutoff)
    return windows


def source_games(archive,csv_path,low,high,log):
    def reject(day,reason):
        log[(day,reason)]+=1
    assert hashlib.sha256(archive.read_bytes()).hexdigest()==hltvy.SHA256
    with gzip.open(archive,'rt',encoding='utf8') as f:
        raw_hltv=json.load(f)
    for r in raw_hltv:
        day=datetime.fromtimestamp(int(r['date'])/1000,timezone.utc).date().isoformat()
        if not max(low,FIRST_CS2)<=day<high or day>LAST_ARCHIVE_DAY:continue
        if not str(r.get('format','')).lower().startswith('best of 3'):continue
        if EXCLUDE.search(' '.join(str(r.get(k,'')) for k in ('event','stage','format','url'))):
            reject(day,'explicitExhibitionOrAdministrative');continue
        if not all(re.match(r'^\((\d+):(\d+)',m.get('half_scores','')) and
                   sum(map(int,re.match(r'^\((\d+):(\d+)',m['half_scores']).groups()))==12
                   for m in r.get('maps',[]) if m.get('status')=='played'):
            reject(day,'unverifiedMR12');continue
        try:
            m=hltvy.normalize(r)
        except (TypeError,ValueError,OverflowError):
            m=None
        if not m or not m['lineupA'] or not m['lineupB'] or not all(valid_mr12(a,b) for _,a,b in m['maps']):
            reject(day,'incompleteMatchOrFives');continue
        yield dict(id='hltv:'+str(m['mid']),day=day,earliestUtcDay=day,latestUtcDay=day,
                   bo=3,event=r['event'],a=m['a'],b=m['b'],
                   fiveA=roster(m['lineupA'],m['a']),fiveB=roster(m['lineupB'],m['b']),
                   maps=m['maps'],sourceUrl=m['url'])

    grouped=defaultdict(list)
    mapids=Counter()
    for row in load_series(csv_path):
        day=row['datetime'][:10]
        if row['is_total']=='False' and row['match_id'] and LAST_ARCHIVE_DAY<day<high:
            grouped[row['match_id']].append(row)
            mapids[row['game_id']]+=1
    for mid,rows in grouped.items():
        r=rows[0]; day=r['datetime'][:10]
        if r['bestOf'] not in ('3','3.0'):continue
        earliest,latest=shifted(day,-1),shifted(day,1)
        if earliest<=LAST_ARCHIVE_DAY:
            reject(day,'uncertainSourceBoundary');continue
        if EXCLUDE.search(' '.join(r[k] for k in ('team1','team2','tournament'))):
            reject(day,'explicitExhibitionOrAdministrative');continue
        check=validated(rows)
        if not check or any(mapids[g['game_id']]!=1 for g in rows):
            reject(day,'incompleteMatchOrFives');continue
        day,_,(aa,bb),_=check
        maps=[[g['map_name'],int(float(g['score1_game'])),int(float(g['score2_game']))] for g in rows]
        # Actual map participation must be evidenced on both sides. Map
        # victories awarded on paper have no corresponding combat statistics.
        try:
            played=all(sum(int(float(g[f'team{s}_player{i}_kills'])) for i in range(1,6))>0
                       for s in (1,2) for g in rows)
        except (ValueError,TypeError):
            played=False
        if not played or not all(valid_mr12(x,y) for _,x,y in maps):
            reject(day,'unverifiedPlayedMR12');continue
        yield dict(id='ektarr:'+mid,day=day,earliestUtcDay=earliest,latestUtcDay=latest,
                   bo=3,event=r['tournament'],a=r['team1'],b=r['team2'],
                   fiveA=roster(aa,r['team1']),fiveB=roster(bb,r['team2']),maps=maps,sourceUrl=CACHE_VERSION)


def build(archive,csv_path,cache):
    target=target_windows()
    tables=release_tables(cache)
    dates=[r['published'][:10] for r in tables]
    assert dates==sorted(dates)
    log=Counter()
    raw=source_games(archive,csv_path,min(t['windowStart'] for t in target.values()),AS_OF,log)
    kept=[]; ids=set(); last_seen={}
    for g in sorted(raw,key=lambda x:(x['day'],x['id'])):
        day=g['day']
        # The source dates concern starts, not guaranteed completion timestamps.
        # Allow one further whole calendar date for an overnight BO3 to finish.
        eligibleEnd=shifted(g['latestUtcDay'],1)
        if not any(t['windowStart']<=g['earliestUtcDay'] and eligibleEnd<t['cutoffExclusive']
                   for t in target.values()):continue
        assert g['id'] not in ids
        ids.add(g['id'])
        a,b=g['fiveA'],g['fiveB']
        if len(set(a))!=5 or len(set(b))!=5 or set(a)&set(b):
            log[(day,'incompleteMatchOrFives')]+=1;continue
        maps=g['maps']
        scores=tuple(sorted((m,x,y) if a<b else (m,y,x) for m,x,y in maps))
        key=(*sorted((tuple(a),tuple(b))),scores)
        previous=last_seen.get(key)
        if previous and (date.fromisoformat(day)-date.fromisoformat(previous)).days<=1:
            log[(day,'duplicate')]+=1;continue
        last_seen[key]=day
        i=bisect.bisect_left(dates,g['earliestUtcDay'])-1
        assert i>=0
        table=tables[i]
        la,lb=rank_for(a,table),rank_for(b,table)
        if not la or not lb or la[0] is lb[0]:
            log[(day,'vrsMissingOrAmbiguous')]+=1;continue
        ra,nA=la; rb,nB=lb
        won=sum(x>y for _,x,y in maps)
        assert len(maps) in (2,3) and max(won,len(maps)-won)==2
        assert table['rankDay']<=table['published'][:10]<g['earliestUtcDay']
        kept.append(dict(g,pointsA=ra['p'],pointsB=rb['p'],gap=ra['p']-rb['p'],y=int(won==2),
                         rankDay=table['rankDay'],rankPublished=table['published'],release=i,
                         rankTeamA=ra['team'],rankTeamB=rb['team'],overlapA=nA,overlapB=nB))
    for t in target.values():
        lo,hi=t['windowStart'],t['cutoffExclusive']
        indices=[i for i,g in enumerate(kept) if lo<=g['earliestUtcDay'] and shifted(g['latestUtcDay'],1)<hi]
        excluded=Counter()
        for (day,why),n in log.items():
            if lo<=day<hi: excluded[why]+=n
        t.update(indices=indices,n=len(indices),firstDay=kept[indices[0]]['day'] if indices else None,
                 lastDay=kept[indices[-1]]['day'] if indices else None,excluded=dict(sorted(excluded.items())))
    return dict(version=1,asOf=AS_OF,windowDays=180,rows=kept,targets=target)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--hltvy',type=Path,required=True)
    p.add_argument('--ektarr',type=Path,required=True)
    p.add_argument('--ranks',type=Path,required=True)
    p.add_argument('--write',action='store_true')
    args=p.parse_args()
    data=build(args.hltvy,args.ektarr,args.ranks)
    raw=(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n').encode('utf8')
    out=HERE/'training.json.gz'
    if args.write:
        with out.open('wb') as dest,gzip.GzipFile(filename='',mode='wb',fileobj=dest,mtime=0) as z:
            z.write(raw)
    else:
        assert gzip.decompress(out.read_bytes())==raw
    print(len(data['rows']),'unique matched series')
    print({k:v['n'] for k,v in data['targets'].items()})
