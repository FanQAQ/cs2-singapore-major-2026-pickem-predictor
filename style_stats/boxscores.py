"""Optionally extract the original CSV; the freeze/check step itself is offline."""
import argparse
import csv
from collections import defaultdict
from datetime import date, timedelta
import gzip
import hashlib
import json
from pathlib import Path
import re

from extract import handle

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
SHA='d99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972'
URL='https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11'
ENDS={'singapore':'2026-11-20'}


def series_rosters():
    return json.loads((ROOT/'datajob/stage_rosters.json').read_bytes())


def extract(csv_file):
    if hashlib.sha256(csv_file.read_bytes()).hexdigest()!=SHA:
        raise ValueError('Expected Ektarr v11 CSV')
    date_windows=[((date.fromisoformat(end)-timedelta(days=89)).isoformat(),end) for end in ENDS.values()]
    output=[]
    seen=set()
    with csv_file.open(encoding='utf8',newline='') as src:
        for row in csv.DictReader(src):
            day=row['datetime'][:10]
            if row['is_total']!='False' or not any(start<=day<=end for start,end in date_windows):
                continue
            try:
                rounds=sum(int(float(row[k])) for k in ['score1_game','score2_game'])
                if not row['game_id'] or row['game_id'] in seen or rounds<13:
                    continue
                info=[]
                all_ids=set()
                for side in (1,2):
                    columns=[f'team{side}_player{i}' for i in range(1,6)]
                    roster=[handle(re.split(r'\s*[,(/]',row[c],maxsplit=1)[0]) for c in columns]
                    ids={row[c+'_id'] for c in columns}
                    if len(set(roster))!=5 or '' in roster or len(ids)!=5 or ids&{'','0'} or ids&all_ids:
                        break
                    all_ids.update(ids)
                    kills=[int(float(row[c+'_kills'])) for c in columns]
                    assists=[int(float(row[c+'_assists'])) for c in columns]
                    if min(kills+assists)<0 or not sum(kills):
                        break
                    info.append(dict(roster=sorted(roster),kills=sum(kills),leadKills=max(kills),assists=sum(assists)))
                if len(info)!=2 or set(info[0]['roster'])&set(info[1]['roster']):
                    continue
            except (ValueError,TypeError):
                continue
            seen.add(row['game_id'])
            output.append(dict(day=day,match=row['match_id'],map=row['game_id'],teams=info))
    output.sort(key=lambda m:(m['day'],m['map']))
    raw=json.dumps(output,ensure_ascii=False,separators=(',',':')).encode()
    (HERE/'boxscores.json.gz').write_bytes(gzip.compress(raw,mtime=0))


def summarize(obs):
    total=sum(t['kills'] for m,t in obs)
    return dict(maps=len(obs),series=len({m['match'] for m,t in obs}),
                firstMatch=obs[0][0]['day'] if obs else None,lastMatch=obs[-1][0]['day'] if obs else None,
                kills=total, assists=sum(t['assists'] for m,t in obs), leadKills=sum(t['leadKills'] for m,t in obs),
                assistRate=round(sum(t['assists'] for m,t in obs)/total,5) if total else None,
                leadShare=round(sum(t['leadKills'] for m,t in obs)/total,5) if total else None)


def build():
    rows=json.loads(gzip.decompress((HERE/'boxscores.json.gz').read_bytes()))
    results={}
    for event,names in series_rosters().items():
        if event not in ENDS:
            continue
        end=ENDS[event]
        start=(date.fromisoformat(end)-timedelta(days=89)).isoformat()
        observations=[(m,t) for m in rows if start<=m['day']<=end for t in m['teams']]
        exact=defaultdict(list)
        for m,t in observations:
            exact[tuple(t['roster'])].append((m,t))
        reference=[summarize(obs) for obs in exact.values() if len(obs)>=4 and len({m['match'] for m,t in obs})>=2]
        outcomes={}
        for name,roster in names.items():
            roster=set(map(handle,roster))
            obs=[(m,t) for m,t in observations if len(roster.intersection(t['roster']))>=3]
            row=summarize(obs)
            row.update(windowStart=start,windowEnd=end,source=URL,referenceFives=len(reference))
            row['coreOverlap']={str(i):sum(len(roster.intersection(t['roster']))==i for m,t in obs) for i in [3,4,5]}
            if len(obs)>=4 and row['series']>=2 and reference:
                for k in ['assistRate','leadShare']:
                    row[k+'Percentile']=round(sum((r[k]<row[k])+0.5*(r[k]==row[k]) for r in reference)/len(reference),4)
                pct=row['leadSharePercentile']
                concentration='逐图击杀较集中' if pct>=.7 else '逐图击杀较均衡' if pct<=.3 else '逐图击杀集中度居中'
                ap=row['assistRatePercentile']
                row['label']=concentration+(' · 助攻占比较高' if ap>=.7 else ' · 助攻占比较低' if ap<=.3 else '')
            else:
                row['label']='样本偏少' if obs else '未收录有效地图'
            outcomes[name]=row
        results[event]=outcomes
    return results


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--csv',type=Path)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    if args.csv:
        extract(args.csv)
    content=build()
    file=HERE/'recent.json'
    if args.check:
        assert json.loads(file.read_bytes())==content
    else:
        file.write_bytes((json.dumps(content,ensure_ascii=False,separators=(',',':'))+'\n').encode())
    print([(n,r['maps'],r['series'],r['label']) for n,r in content['singapore'].items()])
