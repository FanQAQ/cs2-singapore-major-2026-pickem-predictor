"""Prepare small, offline player inputs from the two pinned public datasets."""
import argparse
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ALIASES = json.loads((ROOT/'experience/history.json').read_bytes())['aliases']


def handle(name):
    value = unicodedata.normalize('NFKC', name.strip()).casefold()
    return ALIASES.get(value, value)


def save(name, value):
    raw = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
    (HERE/name).write_bytes(gzip.compress(raw, mtime=0))


def recent(csv_file):
    expected = 'd99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972'
    if hashlib.sha256(csv_file.read_bytes()).hexdigest() != expected:
        raise ValueError('Unexpected Ektarr v11 CSV')
    field = json.loads((ROOT/'datajob/stage_rosters.json').read_bytes())['singapore']
    squads = {tuple(sorted(map(handle, five))):name for name,five in field.items()}
    result, seen = [], set()
    with csv_file.open(encoding='utf-8',newline='') as stream:
        for row in csv.DictReader(stream):
            day = row['datetime'][:10]
            if row['is_total'] != 'False' or not '2026-08-23' <= day <= '2026-11-20':
                continue
            game = row['game_id']
            if not game or game in seen or not row['match_id']:
                continue
            try:
                scores = [int(float(row[f'score{i}_game'])) for i in (1,2)]
                if max(scores) < 13 or min(scores) < 0 or scores[0] == scores[1]:
                    continue
                teams, players = [], set()
                for side in [1,2]:
                    cols = [f'team{side}_player{i}' for i in range(1,6)]
                    ids = {row[c+'_id'] for c in cols}
                    names = [handle(re.split(r'\s*[,(/]',row[c],maxsplit=1)[0]) for c in cols]
                    kills = [int(float(row[c+'_kills'])) for c in cols]
                    if (len(ids) != 5 or ids & ({'', '0'} | players) or len(set(names)) != 5 or
                            '' in names or min(kills) < 0 or not sum(kills)):
                        break
                    players.update(ids)
                    teams.append((names, kills))
                if len(teams) != 2 or set(teams[0][0]) & set(teams[1][0]):
                    continue
            except (ValueError, TypeError):
                continue
            seen.add(game)
            for names, kills in teams:
                team = squads.get(tuple(sorted(names)))
                if team:
                    result.append(dict(team=team, day=day, series=row['match_id'], map=game,
                                       rounds=sum(scores), kills=dict(zip(names,kills))))
    save('recent_maps.json.gz', sorted(result,key=lambda r:(r['day'],r['map'],r['team'])))


def demo(path):
    import pyarrow.parquet as pq
    verified = {m['id']:m for m in json.loads(gzip.decompress((ROOT/'style_stats/maps.json.gz').read_bytes()))}
    profiles = defaultdict(lambda: {'kills':Counter(), 'maps':0, 'series':set()})
    seen = set()
    for file in sorted(path.glob('*.parquet')):
        for row in pq.read_table(file, columns=['row_id','teams','rounds','kills']).to_pylist():
            rid = row['row_id']
            if rid not in verified:
                continue
            if rid in seen:
                raise ValueError('Duplicate map')
            seen.add(rid)
            item = verified[rid]
            rounds = {r['round_num']:r for r in row['rounds']}
            mapping = {p['steamid']:handle(p['name']) for team in row['teams'] for p in team['players']}
            kills = Counter()
            valid_rosters = [tuple(sorted(map(handle,t['roster']))) for t in item['teams']]
            for k in row['kills']:
                r = rounds.get(k['round_num'])
                if not r or r['freeze_end'] is None or r['end'] is None or not r['freeze_end'] <= k['tick'] <= r['end']:
                    continue
                if {k['attacker_side'],k['victim_side']} != {'t','ct'}:
                    continue
                if k['attacker_steamid'] in mapping and k['victim_steamid'] in mapping:
                    kills[mapping[k['attacker_steamid']]] += 1
            for roster in valid_rosters:
                group = profiles[roster]
                group['maps'] += 1
                group['series'].add(item['match'])
                group['kills'].update({n:kills[n] for n in roster})
    assert seen == set(verified)
    out = [dict(roster=r,kills=dict(p['kills']),maps=p['maps'],series=len(p['series']))
           for r,p in sorted(profiles.items())]
    save('demo_players.json.gz',out)


def focus_maps(directory):
    sys.path.insert(0,str(ROOT/'map_veto_data'))
    from extract_singapore_csv import load
    target = set(map(handle,json.loads((ROOT/'datajob/stage_rosters.json').read_bytes())['singapore']['100 Thieves']))
    series = {r['hltv_match_id']:r for r in load(directory,'series')
              if '2026-10-22' <= r['scheduled_start_utc'][:10] <= '2026-11-20'
              and r['status']=='Match over' and all(r[k]=='False' for k in ('incomplete','forfeit','walkover'))}
    maps = {r['map_stats_id']:r for r in load(directory,'maps') if r['hltv_match_id'] in series and r['map_stats_id']}
    sides = defaultdict(list)
    for row in load(directory,'player_stats'):
        if row['side']=='both' and row['map_stats_id'] in maps:
            sides[row['map_stats_id'],row['team_id']].append(row)
    out = []
    for mid,m in maps.items():
        s=series[m['hltv_match_id']]
        scores=[int(m[k]) for k in ('team1_rounds','team2_rounds') if m[k]]
        if len(scores)!=2 or max(scores)<13 or scores[0]==scores[1]:
            continue
        teams = [sides[mid,s[c+'_id']] for c in ('team1','team2')]
        if any(len(t)!=5 for t in teams) or len({r['player_id'] for t in teams for r in t})!=10:
            continue
        for t in teams:
            kills={handle(r['nickname']):int(r['kills']) for r in t}
            overlap=len(set(kills)&target)
            if overlap>=3 and len(kills)==5:
                out.append(dict(team='100 Thieves',day=s['scheduled_start_utc'][:10],map=mid,series=m['hltv_match_id'],
                                overlap=overlap,rounds=sum(scores),kills=kills,url=m['map_stats_url']))
    save('focus_maps.json.gz',sorted(out,key=lambda m:(m['day'],m['map'])))


if __name__ == '__main__':
    args = argparse.ArgumentParser()
    args.add_argument('--csv',type=Path)
    args.add_argument('--demo',type=Path)
    args.add_argument('--griffin',type=Path)
    cfg = args.parse_args()
    if cfg.csv:
        recent(cfg.csv)
    if cfg.demo:
        demo(cfg.demo)
    if cfg.griffin:
        focus_maps(cfg.griffin)
