"""Time-forward check of player ADR in elimination BO3s with a directly shared core."""
import argparse
import csv
import hashlib
import json
import math
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parent))
from experience.build_history import ALIASES as VERIFIED_ALIASES
SHA='d99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972'
ALIASES={**VERIFIED_ALIASES,'rmn':'roman','dav1d':'dav1deus','dav1deu$':'dav1deus'}

def handle(name):
    tag=unicodedata.normalize('NFKC',name).strip().casefold().split('@')[0]
    return ALIASES.get(tag,tag)

def match_data(file):
    assert hashlib.sha256(file.read_bytes()).hexdigest()==SHA
    fixtures=json.loads(subprocess.check_output(['node',str(HERE/'fixtures.cjs')]))
    groups=defaultdict(list)
    ids={g['id'] for g in fixtures}
    with file.open(encoding='utf-8-sig',newline='') as src:
        for row in csv.DictReader(src):
            if row['is_total']=='True' and row['match_id'] in ids:groups[row['match_id']].append(row)
    observations=[]
    missing=Counter()
    for g in fixtures:
        r,=groups[g['id']]
        assert r['datetime'][:10]==g['day'] and float(r['bestOf'])==3
        for s in g['sides']:
            k='team1' if (float(r['score1_match'])>float(r['score2_match']))==s['won'] else 'team2'
            players=[handle(re.split(r'\s*[,(/]',r[f'{k}_player{i}'],maxsplit=1)[0]) for i in range(1,6)]
            actual=frozenset(map(handle,s['actual']))
            registered=frozenset(map(handle,s['registered']))
            if set(players)!=actual:
                missing['unmatchedLineupSides']+=1
                continue
            for i,player in enumerate(players,1):
                pid=r[f'{k}_player{i}_id']
                adr=r[f'{k}_player{i}_adr']
                if not pid or pid=='0' or not adr or not math.isfinite(float(adr)) or float(adr)<=0:
                    missing['missingPlayerStats']+=1
                    continue
                observations.append(dict(edition=g['edition'],stage=g['stage'],id=g['id'],
                    pid=pid,adr=float(adr),pressure=s['pressure'],five=actual,registered=registered,
                    onRoster=player in registered))
    return fixtures,observations,dict(missing)

def summarize(rows):
    if not rows:return {'playerSeries':0,'players':0,'series':0}
    return dict(playerSeries=len(rows), players=len({r[0]['pid'] for r in rows}),
                series=len({r[0]['id'] for r in rows}),baselineMAE=round(mean(r[1] for r in rows),5),
                candidateMAE=round(mean(r[2] for r in rows),5))

def run(file):
    fixtures,rows,missing=match_data(file)
    dates={g['edition']:g['start'] for g in reversed(sorted(fixtures,key=lambda g:g['start']))}
    history=defaultdict(list)
    prior=[]
    all_scores=[]
    scores={}
    for edition in sorted(dates,key=dates.get):
        current=[r for r in rows if r['edition']==edition]
        results=[]
        if prior:
            mu=mean(prior)
            for r in current:
                if not r['pressure'] or not r['onRoster']:continue
                previous=[p for p in history[r['pid']] if len(p['five']&r['registered'])>=3]
                baseline=(5*mu+sum(p['adr'] for p in previous))/(5+len(previous))
                high=[p['adr'] for p in previous if p['pressure']]
                normal=[p['adr'] for p in previous if not p['pressure']]
                n=min(len(high),len(normal))
                change=(mean(high)-mean(normal))*n/(n+5) if n>=3 else 0.
                results.append((r,abs(r['adr']-baseline),abs(r['adr']-baseline-change),n>=3))
        scores[edition]=dict(all=summarize(results),eligible=summarize([x for x in results if x[3]]))
        all_scores.extend(results)
        for r in current:history[r['pid']].append(r)
        prior.extend(r['adr'] for r in current)
    eligible=summarize([r for r in all_scores if r[3]])
    improving=sum(x.get('candidateMAE',0)<x.get('baselineMAE',0) for x in [s['eligible'] for s in scores.values()])
    return dict(sourceSHA256=SHA,bo3=len(fixtures),observedPlayerSeries=len(rows),missing=missing,
                editions=scores,all=summarize(all_scores),eligible=eligible,improvingEditions=improving,
                passed=eligible['playerSeries']>=50 and improving>=2 and eligible['candidateMAE']<eligible['baselineMAE'])

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ektarr',required=True,type=Path)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    report=run(args.ektarr)
    target=HERE/'scores.json'
    text=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
    if args.check:assert target.read_text(encoding='utf8')==text
    else:target.write_text(text,encoding='utf8')
    print(json.dumps(report,ensure_ascii=False))
