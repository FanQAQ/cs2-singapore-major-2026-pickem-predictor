"""Freeze six additional Major stages. Only the entrants and stage seeds enter the forecasts."""
import argparse
import csv
from collections import defaultdict
from datetime import date
import html
import importlib.util
import json
from pathlib import Path
import re
import tempfile
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SLUGS = {"austin": "austin-2025", "budapest": "budapest-2025", "cologne": "cologne-2026"}
COMPETITIONS = {"austin": "BLAST/Major/2025/Austin", "budapest": "StarLadder/2025/Major",
                "cologne": "Intel Extreme Masters/2026/Cologne"}
FORMAT_SOURCE = "https://www.kaggle.com/datasets/pushbuild/open-data/versions/1"

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT/filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def cached_text(url, path):
    if not path.exists():
        path.parent.mkdir(exist_ok=True,parents=True)
        path.write_bytes(urlopen(url,timeout=60).read())
    return path.read_text(encoding='utf8')

def fixtures(cache, fmt):
    # Pinned Kaggle version and checksum verified in label_rows before using the series extract.
    series = list(fmt.read_csv(cache / fmt.SOURCES["pushbuild"][1]))
    aliases = {'nemigagaming':'nemiga','futesports':'fut'}
    def name(x):
        key = fmt.norm(x)
        return aliases.get(key,key)
    stages = {}
    for event,slug in SLUGS.items():
        for number in (2,3):
            code = slug + '-' + str(number)
            url = f"https://fragcharts.com/pickem/{slug}/{number}"
            page = cached_text(url,cache/(code+'.html'))
            seed_rows = re.findall(r'<td class="pk-seed">(\d+)</td>\s*<td class="pk-team">.*?class="pk-tname">([^<]+)</span>',page,re.S)
            seeds = [html.unescape(t) for _,t in seed_rows]
            assert [int(n) for n,_ in seed_rows] == list(range(1,17)), code
            idx = {name(t):i for i,t in enumerate(seeds)}
            series_tag = COMPETITIONS[event] + '/Stage ' + str(number)
            games = sorted((r for r in series if r['event']==series_tag), key=lambda r:r['date_utc'])
            assert len(games) == 33
            counts = [0]*16
            rounds = [[] for _ in range(5)]
            formats = [[] for _ in range(5)]
            for r in games:
                a,b = idx[name(r['team1'])], idx[name(r['team2'])]
                w = idx[name(r['winner'])]
                assert w in (a,b) and counts[a]==counts[b]
                n = counts[a]
                rounds[n].append([w,b if w==a else a])
                formats[n].append(int(r['best_of']))
                counts[a]+=1
                counts[b]+=1
            assert [len(rr) for rr in rounds] == [8,8,8,6,3]
            stages[code] = dict(parent=event, stage=number, entrants=seeds, start=games[0]['date_utc'][:10],
                rounds=rounds,formats=formats,seedSource=url,
                resultsSource='https://liquipedia.net/counterstrike/'+series_tag.replace(' ','_'),
                scoreArchive=FORMAT_SOURCE)
    return stages

def freeze(cache, vrs_caches):
    fmt = module('formatbuilder','format_model/build.py')
    vrs = module('vrsbuilder','datajob/build_features.py')
    labels = fmt.label_rows(cache)
    stages = fixtures(cache,fmt)
    registered = vrs.stage_rosters()
    later = json.loads((HERE/'entrants.json').read_text())
    anchors, specs = {}, {}
    for event in SLUGS:
        first = registered[event]
        entrants = {team for s in stages.values() if s['parent'] == event for team in s['entrants']}
        if set(later[event]) != entrants - first.keys():
            raise ValueError(f'Incomplete later-stage roster coverage for {event}')
        anchors[event] = {**first, **later[event]}
        specs[event] = vrs.EVENTS[event][0], '|'.join(sorted(anchors[event]))
    get = vrs.fetch
    def fetch_cached(path):
        for folder in vrs_caches:
            local = folder/path
            if local.is_file(): return local.read_text(encoding='utf8')
        return get(path)
    vrs.fetch=fetch_cached
    vrs.CACHE=cache/'vrs'
    with tempfile.TemporaryDirectory() as temp:
        vrs.HERE=Path(temp)
        vrs.build(specs, anchors)
        feats = json.loads((vrs.HERE/'features.json').read_text())
        history = list(fmt.read_csv(vrs.HERE/'history.csv'))
    original_history=list(fmt.read_csv(ROOT/'datajob/history.csv'))
    training = list(fmt.read_csv(ROOT/'fitting/fit_examples.csv'))
    def id_(r): return r['event'],r['date'],r['matchInSnapshot']
    known = {id_(r):int(r['bestOf']) for r in fmt.read_csv(ROOT/'format_model/labels.csv')}
    existing = {id_(r) for r in [*original_history,*training]}
    ids_by_pair=defaultdict(set)
    for rows, a, b in [(training,'teamA','teamB'),(original_history+history,'historicalTeam','opponent')]:
        for r in rows: ids_by_pair[r['event'],r['date'],*sorted([fmt.norm(r[a]),fmt.norm(r[b])])].add(r['matchInSnapshot'])
    def get_label(row,a,b):
        if id_(row) in existing:
            return known.get(id_(row))
        key = row['date'], *sorted((fmt.norm(a),fmt.norm(b)))
        if len(ids_by_pair[row["event"],*key]) != 1: return None
        lab = labels.get(key)
        return lab[0] if lab and lab[1] == fmt.norm(a if int(row['y']) else b) else None
    output={}
    for e, snap in feats.items():
        global_series = []
        for r in training:
            if r['event']!=e:continue
            f = get_label(r,r['teamA'],r['teamB'])
            if f:global_series.append((r['date'],f,float(r['vrsPer100']),int(r['y'])))
        base,share3,scales = fmt.global_scales(global_series)
        teams={}
        for t in snap['teams']:
            rrs = fmt.lineup_series(history, e, t, get_label)
            entry = {k:t[k] for k in ['name', 'points', 'rank', 'roster', 'vrsRoster', 'vrsCoreOverlap',
                                        'form', 'strong', 'weak', 'n', 'coreAudit']}
            if entry['points'] is None or entry['vrsCoreOverlap'] < 3:
                raise ValueError(f"No verified ranking for {e}/{t['name']} in this historical evaluation")
            entry['format']=fmt.team_contrast(rrs,scales,base)
            teams[t['name']] = entry
        output[e]={'date':snap['asOf'],'source':snap['source'],'teams':teams}
        expected=json.loads((ROOT/'format_model/model.json').read_text())[e]
        assert round(share3,7)==expected['shareBO3']
        assert all(round(scales[f],7)==expected['scale'][f'bo{f}'] for f in (1,3))
        for t in json.loads((ROOT/'datajob/features.json').read_text())[e]['teams']:
            if t['name'] in teams:
                for k in ['points','roster','vrsRoster','form','strong','weak','n','coreAudit']:
                    assert teams[t['name']][k]==t[k]
                assert teams[t['name']]['format']==expected['teams'][t['name']]
    for s in stages.values(): assert output[s['parent']]['date'] < s['start']
    (HERE/'stages.json').write_text(json.dumps(stages,ensure_ascii=False,indent=2)+'\n')
    (HERE/'strengths.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')

if __name__ == "__main__":
    p=argparse.ArgumentParser()
    p.add_argument('--cache',type=Path,default=HERE/'cache')
    p.add_argument('--vrs-cache',type=Path,action='append',default=[])
    args=p.parse_args()
    freeze(args.cache,args.vrs_cache)
