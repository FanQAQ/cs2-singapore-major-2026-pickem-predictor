"""Reconstruct v33's paired logistic model on the 4 May source cohort."""
import argparse
import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

from field import HERE
from lineup_pairs.field import save,sha
from history24.build import SERIES_SHA
from strategy_v4 import build,prepare

def strength(archive,series_file,*,directory=HERE,rank_day=None):
    assert sha(archive)==SERIES_SHA
    proofs=json.loads((directory/'series-sources.json').read_bytes())
    assert sha(series_file)==proofs['seriesSHA256']
    field=json.loads((directory/'field.json').read_bytes())
    assert sha(directory/'field.json')==proofs['fieldSHA256']
    asof=rank_day or field['strengthRelease']['rankDay']
    with archive.open(encoding='utf-8-sig',newline='') as src:
        maps=prepare.complete_scores(r for r in csv.DictReader(src) if r['datetime'][:10]<=asof)
    rows=[];training=set();use=Counter()
    for day,mid,a,b,y,pa,pb,fa,fb in json.loads(series_file.read_bytes()):
        assert day<=asof<field['start']
        matched=maps.get((day,frozenset(fa),frozenset(fb),y),[])
        link,score=matched[0] if len(matched)==1 else ('',[])
        rows.append(dict(day=day,id=mid,lineupA='|'.join(fa),lineupB='|'.join(fb),winner=y,
                         gap=(pa-pb)/100,mapSeriesId=link,scores='|'.join(f'{x}-{y}' for x,y in score)))
        if link:use[link]+=1
        if (date.fromisoformat(asof)-date.fromisoformat(day)).days<85:training.add(mid)
    for row in rows:
        if use[row['mapSeriesId']]!=1:row['scores']=''
    entrants={t['name']:t['roster'] for t in field['teams']}
    result,_=build.event_model(rows,training,{'asOf':asof},entrants,{})
    return dict(id=field['id'],fieldSHA256=sha(directory/'field.json'),seriesSHA256=sha(series_file),v4Model=result)

if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--ektarr',type=Path,required=True);a.add_argument('--series',type=Path,required=True)
    a.add_argument('--check',action='store_true');args=a.parse_args()
    save(HERE/'v4-strength.json',strength(args.ektarr,args.series),args.check)
