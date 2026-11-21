"""Build pre-Opening Stage probabilities for the two 2024 CS2 Majors.

The regional snapshots before August were published at the root of the Valve
repository. Their Git revisions matter: the files were overwritten at each release.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from functools import lru_cache
from itertools import combinations
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from scipy.special import expit

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'fitting'))
from fit import fit

REPO = 'ValveSoftware/counter-strike_regional_standings'
REV24 = 'f8c55f250fdef796d708aa32814587932154fa04'
REGIONAL = {
    '2023-08-29':'421a212f96b884c4561466c1ef8bf7e845a2a27c',
    '2023-10-11':'db55d1824431d48e93f923169084b9283448522e',
    '2023-11-03':'f93335430ecf5d95f5026c982ff167c4ec9eff33',
    '2023-12-11':'5d8a145c17ed66be82dd5e2ab379487ade162320',
    '2023-12-18':'6941a94460029270edccc7b25da553f1aa77c7b1',
    '2024-03-04':'99a0ba5fff938345d10d500f8b29cd297076573e',
    '2024-05-06':'560f043e8e38323312a5207f21433a9b639e60ff',
    '2024-05-29':'204e7988a14102829c788837f1e34ef2a8b227bd',
    '2024-06-10':'a7183e584d4fc532918ba2c779b5806e316c8ca9',
    '2024-06-18':'4db3400ea2534f2817502cea2cbf3cbac3355f88',
    '2024-07-11':'f99f3a4822b0aa58322f8b9f927b5c9db9b433d7',
    '2024-07-17':'65440b1ee195cbe8515651149ff871c084d5c347',
    '2024-07-24':'49af9b1e734ab94953fa9d683304b69b8b56d908',
    '2024-07-31':'8c0f350002fc6d8b2d6389410f87e5a0b75192ab',
}
GLOBAL = ['2024-08-06','2024-09-04','2024-10-02','2024-11-06']
CUTOFF = {'copenhagen':'2024-03-04', 'shanghai':'2024-11-06'}
SERIES_SOURCE = 'https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11'
SERIES_SHA = 'd99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972'
COLS = ['vrsPer100','formDiff','strongDiff','weakDiff']
PRIOR = 5

def normalize(name):
    return unicodedata.normalize('NFKC', name).strip().casefold()

def raw_url(revision, path):
    return f'https://raw.githubusercontent.com/{REPO}/{revision}/{path}'

def sources():
    out = [(day,region,raw_url(rev,'standings_'+region+'.md')) for day,rev in REGIONAL.items()
           for region in ['americas','asia','europe']]
    for day in GLOBAL+['2024-11-25']:
        table = 'live' if day == '2024-11-25' else 'invitation'
        out.append((day,'global',raw_url(REV24,f'{table}/2024/standings_global_{day.replace("-","_")}.md')))
    return out

def load_tables(cache):
    cache.mkdir(parents=True,exist_ok=True)
    def load(job):
        day,region,url = job
        local = cache / (day+'-'+region+'.md')
        if not local.exists():
            local.write_bytes(urlopen(url,timeout=60).read())
        text = local.read_text(encoding='utf-8')
        if day not in text[:120]:
            raise ValueError(f'Ranking publication date mismatch: {url}')
        result=[]
        for line in text.splitlines():
            cells=[c.strip() for c in line.strip('|').split('|')]
            if line.startswith('|') and len(cells)>=4 and cells[0].isdigit():
                rank,points,club,raw = cells[:4]
                five=[p.strip() for p in raw.split(',')]
                if len(five)==len(set(map(normalize,five)))==5:
                    result.append(dict(rank=int(rank),points=int(points),name=club,roster=five,region=region))
        if not result: raise ValueError('Empty standings '+url)
        return day,result
    rows=defaultdict(list)
    with ThreadPoolExecutor(12) as pool:
        for day, region_rows in pool.map(load,sources()):
            rows[day].extend(region_rows)
    return rows

# Verified player aliases already used for Major experience; rmn is roman of SAW.
ALIAS = {'ahang':'l1hang','snowzin':'snow','rmn':'roman','dev1ce':'device'}
def canonical(n):
    n=normalize(n)
    return ALIAS.get(n,n)

class Ranking:
    def __init__(self, rows):
        self.rows=[]
        self.index=defaultdict(list)
        seen=set()
        for r in rows:
            ids=frozenset(map(canonical,r['roster']))
            key=(ids,r['points'])
            if len(ids)!=5 or key in seen: continue
            seen.add(key)
            for player in ids:self.index[player].append(len(self.rows))
            self.rows.append(r)

    def lookup(self, lineup):
        ids=set(map(canonical,lineup))
        if len(ids)!=5: return None,0
        counts=Counter(i for name in ids for i in self.index[name])
        best=counts.most_common(2)
        if not best or best[0][1]<3 or (len(best)==2 and best[0][1]==best[1][1]):return None,0
        i,n=best[0]
        return self.rows[i],n

def load_series(path):
    content=path.read_bytes()
    if hashlib.sha256(content).hexdigest()!=SERIES_SHA:
        raise ValueError('Expected version 11 ektarr series export')
    return list(csv.DictReader(io.StringIO(content.decode('utf-8-sig'))))

def alias_catalog(raw, cutoff):
    names=defaultdict(set)
    # The provider leaves ID 943 blank even in the February RMR. The four
    # named teammates and the event's public RMR scorecard identify stadodo.
    # This correction was knowable before both forecast cutoffs.
    if cutoff > '2024-02-16':
        names['943'].add('stadodo')
    for r in raw:
        if r['datetime'][:10]>cutoff:continue
        for s in ['1','2']:
            for i in range(1,6):
                field=f'team{s}_player{i}'
                nick=normalize(re.split(r'\s*[,(/]',r[field],maxsplit=1)[0])
                if nick and r[field+'_id']:names[r[field+'_id']].add(nick)
    return names

def five(r,side,catalog):
    players=[]
    for i in range(1,6):
        field=f'team{side}_player{i}'
        pid=r[field+'_id']
        name=normalize(re.split(r'\s*[,(/]',r[field],maxsplit=1)[0])
        if not name and len(catalog[pid])==1:
            name=next(iter(catalog[pid]))
        if not pid or pid=='0' or not name:return ()
        players.append(name)
    if len(set(players))!=5:return ()
    return tuple(sorted(players))

def verified(raw,rankings,cutoff):
    days=sorted(rankings)
    first=(date.fromisoformat(cutoff)-timedelta(days=174)).isoformat()
    catalog=alias_catalog(raw,cutoff)
    out={}
    for r in raw:
        d=r['datetime'][:10]
        if r['is_total']!='True' or not first<=d<=cutoff:continue
        if 'showmatch' in (r['team1']+' '+r['team2']+' '+r['tournament']).casefold():continue
        try:
            a,b=int(float(r['score1_match'])),int(float(r['score2_match']))
            bo=int(float(r['bestOf']))
        except ValueError:continue
        if bo not in (1,3,5) or a==b or not r['match_id'] or max(a,b)!=bo//2+1:continue
        before=[x for x in days if x<d]
        if not before:continue
        lineups=[five(r,s,catalog) for s in (1,2)]
        if not all(lineups) or set(lineups[0]) & set(lineups[1]):continue
        ratings=[rankings[before[-1]].lookup(l)[0] for l in lineups]
        if not all(ratings):continue
        mid=r['match_id']
        if mid in out:raise ValueError('Duplicate match '+mid)
        g=(ratings[0]['points']-ratings[1]['points'])/100
        out[mid]=dict(date=d, matchInSnapshot=mid,bestOf=bo,y=int(a>b),teamA=r['team1'],teamB=r['team2'],
                      lineupA='|'.join(lineups[0]),lineupB='|'.join(lineups[1]),vrsPer100=g)
    return sorted(out.values(),key=lambda x:(x['date'],x['matchInSnapshot']))

class Form:
    def __init__(self, games):
        self.by_core=defaultdict(set)
        self.obs=[]
        for row in games:
            p=expit(np.log(10)*row['vrsPer100']/4)
            for s,win,expect in [('A',row['y'],p),('B',1-row['y'],1-p)]:
                ids=frozenset(map(canonical,row['lineup'+s].split('|')))
                if len(ids)!=5:continue
                for core in combinations(sorted(ids),3):self.by_core[core].add(len(self.obs))
                self.obs.append((date.fromisoformat(row['date']),win,expect,ids))

    def lookup(self, team, day, include_day=False):
        team=frozenset(map(canonical,team))
        ids=set()
        for core in combinations(sorted(team),3):ids.update(self.by_core[core])
        chosen=[self.obs[i] for i in sorted(ids) if int(not include_day)<=(day-self.obs[i][0]).days<=90-int(include_day)]
        groups=[chosen,[r for r in chosen if r[2]<=.35],[r for r in chosen if r[2]>=.65]]
        m=[sum(y-p for _,y,p,_ in g)/(len(g)+PRIOR) for g in groups]
        return m,[len(g) for g in groups],Counter(len(r[3]&team) for r in chosen)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--cache',type=Path,default=HERE/'cache')
    ap.add_argument('--series',type=Path,required=True,help='cs2_all_tiers_games.csv from the pinned v11 archive')
    ap.add_argument('--features-only',action='store_true',help='produce intermediate training and team evidence')
    arg=ap.parse_args()
    ranks={d:Ranking(rows) for d,rows in load_tables(arg.cache).items()}
    catalog=load_series(arg.series)
    fixtures=json.loads((HERE/'fixtures.json').read_text())
    models={}; allrows=[]
    for event,cut in CUTOFF.items():
        stage=fixtures[event]
        dt=date.fromisoformat(cut)
        hist=verified(catalog,ranks,cut)
        form=Form(hist)
        for r in hist:
            fa,na,_=form.lookup(r['lineupA'].split('|'),date.fromisoformat(r['date']))
            fb,nb,_=form.lookup(r['lineupB'].split('|'),date.fromisoformat(r['date']))
            r.update(dict(zip(COLS[1:],np.subtract(fa,fb).tolist())),historicalN_A=na[0],historicalN_B=nb[0])
        train=[r for r in hist if (dt-date.fromisoformat(r['date'])).days<85]
        if not train:raise ValueError('No date-prior data '+event)
        x=np.array([[r[c] for c in COLS] for r in train]);y=np.array([r['y'] for r in train])
        masks={str(m):dict(beta=fit(x,y,m).round(7).tolist()) for m in range(8)}
        teams=[]
        fresh={}
        for name in stage['seeds']:
            roster=stage['rosters'][name]
            rating,n=ranks[cut].lookup(roster)
            if not rating:raise ValueError(f'{event}: no verified Valve points for {name}: {roster}')
            stats,counts,retained=form.lookup(roster,dt,True)
            teams.append(dict(name=name,roster=roster,points=rating['points'],rank=rating['rank'],
                              rankScope=rating['region'],vrsRoster=rating['roster'],vrsCoreOverlap=n,
                              **dict(zip(['form','strong','weak'],stats)),**dict(zip(['n','ns','nw'],counts)),
                              coreAudit=dict(retained={str(k):retained[k] for k in (3,4,5)})))
            if event=='shanghai':
                f,over=ranks['2024-11-25'].lookup(roster)
                if f:fresh[name]=dict(points=f['points'],rank=f['rank'],roster=f['roster'],overlap=over)
        recent=dict(asOf='2024-11-25',teams=fresh,available=True) if fresh else None
        result=dict(asOf=cut,teams=teams, model=dict(n=len(train),masks=masks),recentRating=recent)
        out=arg.cache/(event+'-inputs.json')
        out.write_text(json.dumps(dict(teams=teams,training=train,history=hist,asof=cut),ensure_ascii=False))
        if not arg.features_only:
            from components import build
            result.update(build(teams,train,hist,cut))
        models[event]=result;allrows.extend(dict(event=event,**r) for r in train)
        print(event,len(hist),len(train),counts,[(t['name'],t['points'],t['n']) for t in teams],flush=True)
    with (HERE/'fit_examples.csv').open('w',newline='') as f:
        wr=csv.DictWriter(f,allrows[0].keys(),lineterminator='\n');wr.writeheader();wr.writerows(allrows)
    if not arg.features_only:
        (HERE/'models.json').write_text(json.dumps(models,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':
    main()
