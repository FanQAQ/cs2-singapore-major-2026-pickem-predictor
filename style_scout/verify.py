"""Check dated style evidence, first-map samples and raw player-kill totals."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'map_veto_data'))
from extract_singapore_csv import load


def names(roster):
    return {player.casefold() for player in roster}


def check(condition, detail):
    if not condition:
        raise ValueError(detail)


def read(path):
    return json.loads(path.read_bytes())


def verify(archive):
    profiles = read(HERE / 'singapore.json')
    cutoff = profiles['asOf']
    squads = read(ROOT / 'datajob/stage_rosters.json')['singapore']
    samples = read(HERE / 'flash_examples.json')
    fallback = {str(r['id']): r for r in read(HERE / 'm80_flash.json')}
    check(set(squads) == set(samples) == set(profiles['teams']), 'Expected identical team sets')
    archive_maps = {}
    archive_series = {}
    archive_stats = defaultdict(list)
    if archive:
        archive_maps = {r['map_stats_id']: r for r in load(archive, 'maps') if r['map_stats_id']}
        archive_series = {r['hltv_match_id']: r for r in load(archive, 'series')}
        for row in load(archive, 'player_stats'):
            if row['side'] == 'both' and row['map_stats_id']:
                key = row['hltv_match_id'], row['map_stats_id'], row['team_id']
                archive_stats[key].append(row)

    counts = Counter()
    maps = set()
    for team, squad in squads.items():
        evidence = profiles['teams'][team]
        roster = names(evidence['roster'])
        overlap = len(roster & names(squad))
        check(len(roster) == 5 and 3 <= overlap == evidence['overlap'], (team, 'scouting roster'))
        check(evidence['date'] <= cutoff, (team, 'source date'))
        check(names(evidence['requiredPlayers']) <= (roster & names(squad)), (team, 'required players'))
        check(evidence['url'].startswith('https://') and evidence['rosterUrl'].startswith('https://'), team)
        rows = samples[team]
        check(len(rows) == len({r['seriesId'] for r in rows}) == 2, (team, 'series count'))
        for row in rows:
            mid, sid = str(row['id']), str(row['seriesId'])
            context = (team, mid)
            maps.add(mid)
            sample_roster = names(row['roster'])
            core = len(sample_roster & names(squad))
            check(len(sample_roster) == 5 and core >= 3, (context, 'sample roster'))
            check(row['day'] <= cutoff and '/mapstatsid/' + mid + '/' in row['url'], context)
            for key in ['rounds','kills','headshots','assists','flashAssists','openingKills','openingDeaths']:
                check(isinstance(row[key], int) and row[key] >= 0, (context, key))
            check(row['kills'] and row['headshots'] <= row['kills'], (context, 'headshots'))
            check(row['flashAssists'] <= row['assists'], (context, 'flash assists'))
            check(row['openingKills'] + row['openingDeaths'] <= row['rounds'], (context, 'opening duels'))
            counts['observations'] += 1
            counts['rounds'] += row['rounds']
            counts['flashAssists'] += row['flashAssists']
            counts['core_' + str(core)] += 1
            if mid in fallback:
                reference = fallback[mid]
                check(team == 'M80' and sid == str(reference['seriesId']), (context, 'fallback series'))
                individual = reference['firstMapPlayerKills']
                check(names(individual) == sample_roster, (context, 'fallback roster'))
                check(sum(individual.values()) == row['kills'], (context, 'fallback kills'))
                check(sum(map(int, reference['score'].split('-'))) == row['rounds'], (context, 'fallback rounds'))
                counts['hltvMatch'] += 1
                continue
            if not archive:
                continue
            source = archive_maps[mid]
            series = archive_series[sid]
            check(source['hltv_match_id'] == sid and source['map_ordinal'] == '1', (context, 'first map'))
            check(source['map_name'] == row['map'] and source['played_status'] == 'played', (context, 'map'))
            check(series['scheduled_start_utc'][:10] == row['day'], (context, 'source date'))
            check(int(source['team1_rounds']) + int(source['team2_rounds']) == row['rounds'], (context, 'rounds'))
            teams = {series['team1_name']: series['team1_id'], series['team2_name']: series['team2_id']}
            check(set(teams) == {row['sideName'],row['opponent']}, (context, 'team identity'))
            players = archive_stats[sid, mid, teams[row['sideName']]]
            check(len(players) == 5 and names(r['nickname'] for r in players) == sample_roster, (context, 'CSV roster'))
            check(sum(int(r['kills']) for r in players) == row['kills'], (context, 'CSV kills'))
            counts['griffinCSV'] += 1
    counts['distinctMaps'] = len(maps)
    counts['teams'] = len(squads)
    print(json.dumps(dict(sorted(counts.items())), indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Directory with verified Griffin CSV files')
    verify(parser.parse_args().archive)
