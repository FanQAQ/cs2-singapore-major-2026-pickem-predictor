"""Count team-picked BO3 maps with an explicit link between veto and played-map evidence."""
import argparse
import csv
import gzip
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from strategy_v4.build import lineup


def generate():
    meta = json.loads((ROOT/'map_strength/events.json').read_text())
    vetoes = json.load(gzip.open(ROOT/'map_veto_data/evidence.json.gz','rt'))
    rows = defaultdict(list)
    with gzip.open(ROOT/'map_strength/maps.csv.gz','rt') as src:
        for rec in csv.DictReader(src):
            if rec['bo'] == '3':
                rows[rec['event'],rec['series'],rec['map']].append(rec)
    teams = {e:{t:0 for t in v['teams']} for e,v in meta.items()}
    unique = defaultdict(set)
    for r in vetoes:
        if r['format'] != 'bo3':
            continue
        match = re.search(r'\bEktarr (\d+)\b', r['rosterSource'])
        if not match:
            continue
        eid = r['event']
        m = meta[eid]['pool'][r['counts'][1].index(1)]
        maps = rows.get((eid,match[1],m), [])
        if len(maps) != 1:
            continue
        played = maps[0]
        five = lineup(r['roster'])
        if not (played['rankDay'] < played['day'] == r['date'] <= meta[eid]['asOf']):
            continue
        if five not in [lineup(played['fiveA'].split('|')),lineup(played['fiveB'].split('|'))]:
            continue
        unique[eid].add(match[1])
        teams[eid][r['team']] += 1
    return {e:dict(asOf=meta[e]['asOf'],field=len(counts),series=len(unique[e]),teamPicks=sum(counts.values()),
                   covered=sum(n>0 for n in counts.values()),withFive=sum(n>=5 for n in counts.values()),
                   teams=counts) for e,counts in teams.items()}


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    result = generate()
    data = json.dumps(result,ensure_ascii=False,allow_nan=False,separators=(',',':'))+'\n'
    target = HERE/'pick_coverage.json'
    if parser.parse_args().check:
        assert target.read_text() == data
    else:
        target.write_text(data)
    for name,row in result.items():
        print(name,row['series'],row['teamPicks'],row['covered'],row['withFive'])
