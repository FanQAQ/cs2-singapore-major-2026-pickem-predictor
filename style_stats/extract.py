"""Reduce professional match index metadata to per-five, attacking-side counts."""
import argparse
from collections import Counter, defaultdict
import gzip
import json
from pathlib import Path
from statistics import median
import unicodedata

HERE = Path(__file__).resolve().parent
RIFLES = {'ak47', 'm4a1', 'm4a1_silencer', 'galilar', 'famas', 'aug', 'sg556'}
UTILITY = {'hegrenade', 'inferno', 'molotov', 'incgrenade'}


def handle(value):
    return unicodedata.normalize('NFKC', value).strip().casefold()


def aggregate(row):
    rounds = {r['round_num']: r for r in row['rounds']}
    if len(rounds) < 13 or len(row['teams']) != 2:
        return None
    groups = defaultdict(list)
    for k in row['kills']:
        r = rounds.get(k['round_num'])
        if (r and r['freeze_end'] is not None and r['end'] is not None
                and r['freeze_end'] <= k['tick'] <= r['end']
                and {k['attacker_side'], k['victim_side']} == {'ct','t'}
                and k['attacker_steamid'] and k['victim_steamid']):
            groups[r['round_num']].append(k)
    active = {k[key] for g in groups.values() for k in g for key in ['attacker_steamid','victim_steamid']}
    if len(active) != 10:
        return None
    sides = []
    for team in row['teams']:
        ids = {p['steamid']: handle(p['name']) for p in team['players'] if p['steamid'] in active}
        if len(ids) != 5 or len(set(ids.values())) != 5:
            return None
        sides.append(ids)
    if set(sides[0]) & set(sides[1]) or set(sides[0]).union(sides[1]) != active:
        return None
    team_of = {player:i for i, team in enumerate(sides) for player in team}
    contact = {r:min(k['tick'] for k in g) - rounds[r]['freeze_end'] for r,g in groups.items()}
    if not contact:
        return None
    # Within-map reference uses both attacking halves, so it does not require an
    # assumed demo clock rate and partially controls for map and opposition.
    benchmark = median(contact.values())
    observations = [Counter() for _ in sides]
    for number, group in groups.items():
        last_ct_kill = {}
        group = sorted(group, key=lambda k: k['tick'])
        t_teams = {team_of[k['attacker_steamid'] if k['attacker_side']=='t' else k['victim_steamid']] for k in group}
        if len(t_teams) != 1 or any(team_of[k['attacker_steamid']] == team_of[k['victim_steamid']] for k in group):
            return None
        observation = observations[t_teams.pop()]
        observation['roundsT'] += 1
        observation['earlyHalfUnits'] += 2 if contact[number] < benchmark else int(contact[number] == benchmark)
        for k in group:
            if k['attacker_side'] == 'ct':
                last_ct_kill[k['attacker_steamid']] = k['tick']
                continue
            weapon = k['weapon']
            observation['kills'] += 1
            observation['awp'] += weapon == 'awp'
            observation['rifle'] += weapon in RIFLES
            observation['rifleHS'] += int(weapon in RIFLES and bool(k['headshot']))
            observation['utility'] += weapon in UTILITY
            prev = last_ct_kill.get(k['victim_steamid'])
            observation['trades'] += int(prev is not None and 0 < k['tick']-prev <= 320)
    if min(x['roundsT'] for x in observations) < 1:
        return None
    return dict(id=row['row_id'], match=row['match_id'], map=row['map_name'],
                day=row['match_date'].date().isoformat(), matchURL=row['match_url'],
                teams=[dict(roster=sorted(t.values()), **c) for t,c in zip(sides,observations)])


def extract(cache):
    import pyarrow.parquet as pq
    files = sorted(cache.glob('*.parquet'))
    if len(files) != 137:
        raise ValueError('Expected all pinned shards')
    raw, maps = set(), []
    required = ['row_id','map_name','match_id','match_date','match_url','teams','rounds','kills']
    for file in files:
        for row in pq.read_table(file, columns=required).to_pylist():
            if row['row_id'] in raw:
                raise ValueError('Duplicate source map')
            raw.add(row['row_id'])
            item = aggregate(row)
            if item:
                maps.append(item)
    assert len(raw)==1988
    maps.sort(key=lambda x:(x['day'],x['id']))
    print('Accepted',len(maps),'maps of',len(raw))
    binary=json.dumps(maps,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    (HERE/'maps.json.gz').write_bytes(gzip.compress(binary,mtime=0))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory',type=Path)
    extract(parser.parse_args().directory)
