"""Normalize the Singapore pre-cutoff portion of the pinned Griffin CSV archive.

Pass its archive directory and a temporary output JSON. Reads match identity,
published veto and per-map lineups; ignores scrape-time rankings and ratings.
"""
import argparse
import csv
import hashlib
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from extract_archive import key, normalize

COMMIT = 'f5e3e90fb56fef8adc19bd5e5e898d2741d0ff58'
ARCHIVE_URL = f'https://raw.githubusercontent.com/Griffinxaxa/scrape-hltv-data/{COMMIT}/2026-data/archive/'
HASHES = {
    'series': 'c0aa3c7a6aca549f1d7451165308e9f11d640439c20c96d58de72de497e8d59e',
    'maps': '990a6e7e8f98cdec4f1dcc1a0f0cea1e79a7ab655b7127b4f504c5b9a5654a98',
    'lineups': 'f8263d0031b85c232066db68af29d889556661a08b972ce600f5bf334a37050a',
    'player_stats': 'bee804490a43a6b05e8bd4e20a18ddbb73e57ca1f90247d1d0bd59c2ddae52ac',
    'veto_steps': '2b966c98115741668ede2abecd51a81483958ad63820986066082c378ea13e29',
}
CUTOFF = '2026-11-02'


def load(path, name):
    source = path / (name + '.csv')
    if hashlib.sha256(source.read_bytes()).hexdigest() != HASHES[name]:
        raise ValueError(f'Unverified {name} CSV')
    with source.open(encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def build(directory):
    grouped = {}
    for table in ('maps', 'veto_steps', 'lineups'):
        rows = defaultdict(list)
        for row in load(directory, table):
            rows[row['hltv_match_id']].append(row)
        grouped[table] = rows
    players = defaultdict(list)
    for row in load(directory,'player_stats'):
        if row['side'].casefold() == 'both' and row['map_stats_id']:
            players[row['hltv_match_id'],row['map_stats_id'],row['team_id']].append(row['nickname'])

    out = []
    for row in load(directory,'series'):
        mid = row['hltv_match_id']
        if not row['scheduled_start_utc'] or row['scheduled_start_utc'][:10] > CUTOFF:
            continue
        if row['best_of'] not in ('1','3') or any(row[x] != 'False' for x in ('walkover','forfeit','incomplete')):
            continue
        if row['status'] != 'Match over':
            continue
        draft = sorted(grouped['veto_steps'][mid],key=lambda s:int(s['step_order']))
        if len(draft)!=7:
            continue
        slots = {'team1': row['team1_id'], 'team2': row['team2_id']}
        teamnames = {row['team1_id']:row['team1_name'],row['team2_id']:row['team2_name']}
        if any(step['action'] not in ('picked','removed','left_over') or
               (step['action']!='left_over' and step['actor_team_id'] not in teamnames) for step in draft):
            continue
        steps = []
        for step in draft:
            action = step['action']
            actor = teamnames.get(step['actor_team_id'])
            if action=='left_over':
                text = f"{step['map_name']} was left over"
            else:
                text = f"{actor} {action} {step['map_name']}"
            steps.append(f"{step['step_order']}. {text}")
        maps = []
        for played in grouped['maps'][mid]:
            if played['played_status'] != 'played':
                continue
            item = {'status':'played', 'map':played['map_name'], 'players':{}}
            for side in slots:
                name = played['left_team_name' if side=='team1' else 'right_team_name']
                side_id = next((id_ for id_,v in teamnames.items() if key(v)==key(name)),None)
                item[side] = {'name':name,'score':played[side+'_rounds']}
                item['players'][side] = [{'name':p} for p in players[mid,played['map_stats_id'],side_id]]
            maps.append(item)
        obj = normalize({'team1':row['team1_name'],'team2':row['team2_name'],'match-id':int(mid),
                   'format':'Best of '+row['best_of'], 'date':int(datetime.fromisoformat(row['scheduled_start_utc'].replace('Z','+00:00')).timestamp()*1000),
                   'url':row['match_url'],'team1score':int(row['team1_score']),'team2score':int(row['team2_score']),
                   'veto':steps,'maps':maps})
        if obj is None:
            continue
        for side, attr in [('team1','lineupA'),('team2','lineupB')]:
            listed = {key(p['nickname']) for p in grouped['lineups'][mid] if p['team_id']==slots[side]}
            if obj[attr] and {key(p) for p in obj[attr]} != listed:
                obj[attr] = None
        obj['source'] = 'Griffinxaxa/scrape-hltv-data'
        out.append(obj)
    if len({r['mid'] for r in out}) != len(out):
        raise ValueError('Duplicate match IDs')
    return sorted(out,key=lambda r:(r['day'],r['mid']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    rows = build(args.directory)
    args.output.write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n')
    print(len(rows),'series;',sum(bool(r['lineupA'] and r['lineupB']) for r in rows),'with both lineups')
