"""Describe contemporaneous official regional distributions and global representation."""
import argparse
import gzip
import json
from collections import defaultdict
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REGIONS = ('europe', 'americas', 'asia')
LABELS = {'europe':'欧洲', 'americas':'美洲', 'asia':'亚洲', 'global':'全球'}


def summarize(day, tables, provenance):
    global_rows = tables.get('global')
    ranked = {tuple(roster):(i,pts) for i,(pts,_,roster) in enumerate(global_rows or [],1)}
    listed = defaultdict(list)
    for reg in REGIONS:
        for points, _, roster in tables[reg]:
            key = tuple(roster)
            listed[key].append(reg)
            if global_rows is not None:
                assert ranked[key][1] == points
    if global_rows is not None:
        assert set(listed) == set(ranked)
    stats = {}
    for reg in REGIONS:
        rows = tables[reg]
        assert len(rows) >= 11 and all(rows[i][0] >= rows[i+1][0] for i in range(len(rows)-1))
        top = [{'rank':i, 'points':pts, 'name':name, 'roster':roster,
                'worldRank':ranked[tuple(roster)][0] if global_rows else None}
               for i,(pts,name,roster) in enumerate(rows[:11],1)]
        entry = {'teams':len(rows), 'top10MedianPoints':median(r[0] for r in rows[:10]),
                 'medianPoints':median(r[0] for r in rows), 'top11':top}
        for k in (10,30,50):
            value = None if not global_rows else sum(1/len(listed[tuple(r)]) for _,_,r in global_rows[:k] if reg in listed[tuple(r)])
            entry[f'top{k}World'] = value
        stats[reg] = entry
    if global_rows:
        for k in (10,30,50):
            assert abs(sum(r[f'top{k}World'] for r in stats.values()) - min(k,len(global_rows))) < 1e-8
    shared = None if not global_rows else sum(len(listed[tuple(r)])>1 for _,_,r in global_rows[:30])
    return {'asOf':day, 'officialGlobal':global_rows is not None, 'globalTeams':len(global_rows) if global_rows else None,
            'sharedTop30':shared,'regions':stats,
            'sources':[{'title':f'Valve {day} {LABELS[k]}榜', 'url':provenance[k]['url']} for k in provenance]}


def generate():
    tables = json.loads(gzip.decompress((HERE/'tables.json.gz').read_bytes()))
    provenance = json.loads((HERE/'sources.json').read_text())
    monthly = {d:summarize(d,t,provenance[d]) for d,t in tables.items()}
    anchors = json.loads((ROOT/'region_risk/anchor.json').read_text())
    events = {eid:monthly[event['asOf']] for eid,event in anchors.items()}
    return {'snapshots.json':monthly, 'events.json':events}


if __name__ == '__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    for filename, obj in generate().items():
        body=json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n'
        if args.check:
            assert (HERE/filename).read_text() == body
        else:
            (HERE/filename).write_text(body)
        print(filename,len(obj))
