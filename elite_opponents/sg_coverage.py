"""Compare actual five-player BO3 coverage in two pre-Singapore archives, without assigning ratings."""
import argparse
import csv
from collections import Counter, defaultdict
from datetime import date
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
sys.path.insert(0,str(ROOT))
from bo5_history.elite_probe import HASHES, known

COMMIT='f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58'
REPO='https://github.com/Griffinxaxa/scrape-hltv-data'
PUBLISHED='2026-11-20T02:47:07Z'
START='2026-05-25'
END='2026-11-21'
BLOBS={'series':'3540ce2b8a2d918b628921610b249f1b6fda4f81','maps':'e7f8690c7f04075cd8f976e13dc98dabf061c969',
       'lineups':'2d32414c9e6a5b2edf9ec5a91860d1706f08eb9b','player_stats':'a9ffdd83b591168a67b878e5831927b4650fbd1e'}
# These two handles are shared by different players within this one dataset.
EXPLICIT={'100 Thieves':{'rain':'8183'},'9z':{'max':'12092'}}
EXCLUDE=re.compile(r'\b(show[ -]?match|exhibition|charity|forfeit(?:ed)?|walk[ -]?over|disqualif\w*|default win|technical (?:loss|win)|map advantage)\b',re.I)

def canonical(people,club):
    return frozenset(known(people,club))

def load_csv(cache,name,hashes):
    raw=(cache/(name+'.csv')).read_bytes()
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==BLOBS[name],name
    hashes[name+'.csv']=hashlib.sha256(raw).hexdigest()
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))

def mr12(x,y):
    hi,lo=sorted((x,y),reverse=True)
    return (hi==13 and 0<=lo<=11) or (hi>=16 and (hi-16)%3==0 and hi-4<=lo<=hi-2)

def matches_target(five,club,raw_players,targets):
    output=[]
    for name,roster in targets.items():
        if five!=roster:continue
        if raw_players is not None:
            expected=EXPLICIT.get(name,{})
            if any(raw_players.get(nick)!=pid for nick,pid in expected.items()):continue
        output.append(name)
    assert len(output)<=1,(five,club)
    return output[0] if output else None

def extract(r,maps,stats,lineups):
    sid=r['hltv_match_id'];clubs=[r['team1_name'],r['team2_name']];tids=[r['team1_id'],r['team2_id']]
    if r['best_of']!='3':return None,'format'
    if r['status']!='Match over' or any(r[k]!='False' for k in ('forfeit','walkover','incomplete')) or EXCLUDE.search(
            ' '.join(r[k] for k in ('event_name','format_notes','match_notes'))):return None,'administrative'
    if not (START<=r['scheduled_start_utc'][:10]<END and r['scheduled_start_utc']<=r['capture_time_utc']<=PUBLISHED<END+'T00:00:00Z'):
        return None,'date'
    assert re.match(r'^https://www\.hltv\.org/matches/'+sid+r'/',r['match_url'])
    played=[m for m in maps if m['played_status']=='played']
    unplayed=[m for m in maps if m['played_status']!='played']
    if any(m['played_status']!='unplayed' or m['map_stats_id'] or m['team1_rounds'] or m['team2_rounds'] for m in unplayed):
        return None,'incomplete map status'
    won=[int(r['team1_score']),int(r['team2_score'])]
    if len(played)!=sum(won) or sorted(won) not in ([0,2],[1,2]):return None,'incomplete series score'
    if sorted(int(m['map_ordinal']) for m in played)!=list(range(1,len(played)+1)):return None,'map order'
    fives=[];nick_ids=[];names=[];pids=[]
    for tid,club in zip(tids,clubs):
        roster=lineups[sid,tid]
        by_id={p['player_id']:p['nickname'] for p in roster}
        if len(roster)!=len(by_id) or len(by_id)!=5:return None,'series five ambiguous'
        fives.append(canonical(by_id.values(),club));pids.append(set(by_id))
        names.append(list(by_id.values()));nick_ids.append({nick.lower():pid for pid,nick in by_id.items()})
    if pids[0]&pids[1]:return None,'overlapping player IDs'
    facts=[];wins=[0,0];unique_maps=set()
    for m in sorted(played,key=lambda a:int(a['map_ordinal'])):
        statid=m['map_stats_id']
        if not statid or statid in unique_maps or [m['left_team_name'],m['right_team_name']]!=clubs:return None,'map identity'
        assert re.match(r'^https://www\.hltv\.org/stats/matches/mapstatsid/'+statid+r'/',m['map_stats_url'])
        unique_maps.add(statid)
        x,y=int(m['team1_rounds']),int(m['team2_rounds'])
        if not mr12(x,y) or sum(int(m['half1_team'+str(t)+'_rounds']) for t in (1,2))!=12:return None,'map score'
        wins[int(y>x)]+=1
        if m['winner_team_id']!=tids[int(y>x)]:return None,'map winner mismatch'
        for tid,club,ids,known_five in zip(tids,clubs,pids,fives):
            roster=stats[sid,statid,tid]
            if len(roster)!=5 or {p['player_id'] for p in roster}!=ids or canonical([p['nickname'] for p in roster],club)!=known_five:
                return None,'per-map actual five absent or changed'
            if any(not p['kills'].isdigit() or not p['deaths'].isdigit() for p in roster) or sum(int(p['kills']) for p in roster)==0:
                return None,'no team combat statistics'
        facts.append(dict(name=m['map_name'],score=[x,y],source=m['map_stats_url']))
    if wins!=won or r['winner_team_id']!=tids[wins.index(2)]:return None,'series winner mismatch'
    return dict(id=sid,event=r['event_name'],startUtc=r['scheduled_start_utc'],captureUtc=r['capture_time_utc'],
        day=r['scheduled_start_utc'][:10],teams=clubs,fives=names,
        playerIds=[[nick_ids[i][p.lower()] for p in five] for i,five in enumerate(names)],score=won,maps=facts,
        source=r['match_url'],keys=fives,nickIds=nick_ids),None

def baseline_row(g):
    return dict(id=g['id'],teams=[g['a'],g['b']],keys=[canonical(g['fiveA'],g['a']),canonical(g['fiveB'],g['b'])],
        day=g['day'],early=g['earliestUtcDay'],late=g['latestUtcDay'],source=g['sourceUrl'],
        maps=[dict(name=m,score=[x,y]) for m,x,y in g['maps']])

def map_signature(row,reverse=False):
    return tuple(sorted((m['name'].lower().replace(' ',''),*(m['score'][::-1] if reverse else m['score'])) for m in row['maps']))

def clubs_key(name):
    clean=re.sub('[^a-z0-9]','',name.casefold()).replace('esports','').replace('gaming','')
    return clean[4:] if clean.startswith('team') else clean

def cross_match(game,archive):
    ds=game['day'];matches={};uncertain={}
    for other in archive:
        nearby=other['early']<=ds<=other['late']
        for order in ([0,1],[1,0]):
            cores=[len(game['keys'][i] & other['keys'][slot]) for i,slot in enumerate(order)]
            orgs=all(clubs_key(game['teams'][i])==clubs_key(other['teams'][j]) for i,j in enumerate(order))
            if not nearby and min(cores)<4:continue
            same_maps=map_signature(game)==map_signature(other,order[0]==1)
            if nearby and cores==[5,5] and same_maps:
                matches[other['id']]='ten players, all map names and round scores'
            elif ds==other['day'] and min(cores)>=4 and max(cores)==5 and same_maps:
                matches[other['id']]='same day, submitted five, at least four opponent players, all map names and round scores'
            elif (nearby and (min(cores)>=3 or (orgs and same_maps))) or (not nearby and min(cores)>=4 and same_maps):
                uncertain[other['id']]='nearby cores with a data discrepancy, or same map fingerprint outside date tolerance'
    if len(matches)==1:return 'overlap',sorted(matches),next(iter(matches.values()))
    elif matches or uncertain:return 'uncertain',sorted(set(matches)|set(uncertain)),'possible duplicate: withheld from combined coverage'
    return 'new',[],None

def run(cache):
    hashes={};tables={k:load_csv(cache,k,hashes) for k in BLOBS}
    sealed=(ROOT/'f1bre_models/singapore-forecast.json').read_bytes()
    assert hashlib.sha256(sealed).hexdigest()=='e1bf48f6bef0b2924ee34632c83558da77099e5e860496c1a470bbf22e963386'
    snap=json.loads(sealed)
    assert snap['sha256']=='1aa45aeb970df7d1ff5b6e17d246b03e9ef36de859204c8279acfe6672664459'
    f=snap['forecast'];assert f['cutoffExclusive']==END
    targets={t['name']:canonical(t['roster'],t['name']) for t in f['teams']};assert all(len(r)==5 for r in targets.values())
    raw=(ROOT/'tail_calibration/training.json.gz').read_bytes()
    assert hashlib.sha256(raw).hexdigest()==HASHES['frozen']
    doc=json.loads(gzip.decompress(raw));window=doc['targets']['singapore']
    assert (window['windowStart'],window['cutoffExclusive'])==(START,END)
    assert (date.fromisoformat(END)-date.fromisoformat(START)).days==180
    baseline=[baseline_row(doc['rows'][i]) for i in window['indices']]
    assert len(baseline)==545
    base_by_team=defaultdict(list)
    for row in baseline:
        for i,club in enumerate(row['teams']):
            t=matches_target(row['keys'][i],club,None,targets)
            if t:base_by_team[t].append(dict(id=row['id'],day=row['day'],opponent=row['teams'][1-i],maps=len(row['maps']),source=row['source']))
    map_index=defaultdict(list);stat_index=defaultdict(list);lineup_index=defaultdict(list)
    for row in tables['maps']:map_index[row['hltv_match_id']].append(row)
    for row in tables['player_stats']:
        if row['side']=='both' and row['map_stats_id']:stat_index[row['hltv_match_id'],row['map_stats_id'],row['team_id']].append(row)
    for row in tables['lineups']:lineup_index[row['hltv_match_id'],row['team_id']].append(row)
    assert len({r['hltv_match_id'] for r in tables['series']})==len(tables['series'])
    seen=set();excluded=Counter();series={};cases=defaultdict(list);partial=defaultdict(list);max_overlap=Counter();near=defaultdict(Counter)
    for s in sorted(tables['series'],key=lambda g:(g['scheduled_start_utc'],g['hltv_match_id'])):
        g,reason=extract(s,map_index[s['hltv_match_id']],stat_index,lineup_index)
        if reason:excluded[reason]+=1;continue
        represented=[]
        for side,club in enumerate(g['teams']):
            for name,roster in targets.items():
                # Even partial-overlap diagnostics distinguish same-spelling opponents.
                ids=g['nickIds'][side];bad={nick for nick,pid in EXPLICIT.get(name,{}).items() if nick in ids and ids[nick]!=pid}
                overlap=len((g['keys'][side]-bad) & roster)
                max_overlap[name]=max(max_overlap[name],overlap)
                if overlap>=3:near[name][overlap]+=1
                if overlap==4 and name in ('Chinggis Warriors','Wildcard','9z'):
                    partial[name].append(dict(seriesId=g['id'],day=g['day'],opponent=g['teams'][1-side],maps=len(g['maps']),
                        observedFive=g['fives'][side],missing=sorted(roster-(g['keys'][side]-bad)),source=g['source']))
            target=matches_target(g['keys'][side],club,g['nickIds'][side],targets)
            if target:represented.append((target,side))
        if not represented:continue
        # Different ids with the same confirmed map results and rosters cannot be counted twice.
        sigs=tuple(sorted((tuple(sorted(g['keys'][i])),map_signature(g,bool(i))) for i in (0,1)))
        sig=(g['day'],sigs)
        assert sig not in seen,'Duplicate Griffin row needs reconciliation'
        seen.add(sig)
        label,ids,why=cross_match(g,baseline)
        if label=='overlap':
            for target,_ in represented:assert ids[0] in {b['id'] for b in base_by_team[target]}
        g.pop('keys');g.pop('nickIds');g.update(classification=label,duplicateIds=ids,matchEvidence=why)
        series[g['id']]=g
        for name,i in represented:
            cases[name].append(dict(seriesId=g['id'],day=g['day'],opponent=g['teams'][1-i],maps=len(g['maps']),
                source=g['source'],classification=label,duplicateId=ids[0] if label=='overlap' else None))
    teams=[]
    for team in f['teams']:
        name=team['name'];counts=Counter(g['classification'] for g in cases[name]);b=base_by_team[name]
        assert counts['overlap']==len({r['duplicateId'] for r in cases[name] if r['classification']=='overlap'})
        teams.append(dict(name=name,roster=team['roster'],baseline=len(b),griffin=len(cases[name]),overlap=counts['overlap'],
            new=counts['new'],combined=len(b)+counts['new'],uncertain=counts['uncertain'],maxOverlap=max_overlap[name],
            griffinCoreThree=near[name][3],griffinCoreFour=near[name][4],selectedLowCoverageFourPlayerCases=partial[name],baselineCases=b,cases=cases[name]))
    n=Counter(g['classification'] for g in series.values());unique_base={g['id'] for rows in base_by_team.values() for g in rows}
    assert len(unique_base)>=n['overlap'] and len(series)==sum(n.values())
    assert n['overlap']==len({g['duplicateIds'][0] for g in series.values() if g['classification']=='overlap'})
    totals=dict(baseline=len(unique_base),griffin=len(series),overlap=n['overlap'],new=n['new'],uncertain=n['uncertain'],combined=len(unique_base)+n['new'])
    dates=[g['scheduled_start_utc'] for g in tables['series']]
    return dict(cutoffExclusive=END,windowStart=START,snapshot=dict(commit=COMMIT,publishedUtc=PUBLISHED,url=REPO+'/tree/'+COMMIT+'/2026-data/archive',
        metadataUrl=REPO+'/commit/'+COMMIT,gitBlobs=BLOBS,hashes=hashes,firstScheduledUtc=min(dates),lastScheduledUtc=max(dates),
        archiveSeries=len(dates),eligibleBO3=len(dates)-sum(excluded.values()),excluded=dict(excluded)),
        baselineSha256=HASHES['frozen'],teams=teams,series=series,totals=totals)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--archive',required=True,type=Path);p.add_argument('--check',action='store_true')
    args=p.parse_args();out=run(args.archive);content=(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    dest=HERE/'sg-coverage.json'
    if args.check:assert content==dest.read_bytes()
    else:dest.write_bytes(content)
    print(out['totals'])
