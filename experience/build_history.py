"""Extract completed Valve Majors from two published historical data releases."""
import argparse
import csv
import hashlib
import io
import json
import re
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
CHAMPIONSHIPS = 'https://en.wikipedia.org/wiki/Counter-Strike_Major_Championships'
SOURCES = {
    'csgo': ('matheusnbrega/players-stats-all-csgo-majors', 1, 'major-stats.csv',
             '9fbd85033f6a9d7ef58c9272441a157ba22e704a499f494cb342c119b624ab76', 'CC0-1.0'),
    'cs2': ('ektarr/counter-strike-pro-matches', 11, 'cs2_all_tiers_games.csv',
            'd99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972', 'CC-BY-SA-4.0'),
}
# Final dates, winning organizations, participating teams (excluding withdrawals).
# Group size checks include Boston, where 23 teams actually played.
GO = [
    ('DreamHack Winter 2013', '2013-11-30', 'fnatic', 16),
    ('EMS One Katowice 2014', '2014-03-16', 'Virtus.pro', 16),
    ('ESL One Cologne 2014', '2014-08-17', 'Ninjas in Pyjamas', 16),
    ('DreamHack Winter 2014', '2014-11-29', 'LDLC', 16),
    ('ESL One Katowice 2015', '2015-03-15', 'fnatic', 16),
    ('ESL One Cologne 2015', '2015-08-23', 'fnatic', 16),
    ('DreamHack Open Cluj-Napoca 2015', '2015-11-01', 'Envy', 16),
    ('MLG Columbus 2016', '2016-04-03', 'Luminosity', 16),
    ('ESL One Cologne 2016', '2016-07-10', 'SK', 16),
    ('ELEAGUE Major 2017', '2017-01-29', 'Astralis', 16),
    ('PGL Major Krakow 2017', '2017-07-23', 'Gambit', 16),
    ('ELEAGUE Major 2018', '2018-01-28', 'Cloud9', 23),
    ('FACEIT Major 2018', '2018-09-23', 'Astralis', 24),
    ('IEM Katowice 2019', '2019-03-03', 'Astralis', 24),
    ('StarLadder Major Berlin 2019', '2019-09-08', 'Astralis', 24),
    ('PGL Major Stockholm 2021', '2021-11-07', 'Natus Vincere', 24),
    ('PGL Major Antwerp 2022', '2022-05-22', 'FaZe', 24),
    ('IEM Rio Major 2022', '2022-11-13', 'Outsiders', 24),
    ('BLAST.tv Paris Major 2023', '2023-05-21', 'Vitality', 24),
]
# Series with these IDs are separately staged exhibition matches.
CS2 = [
    ('PGL Major Copenhagen 2024', '2024-03-31', 'Natus Vincere', 24, '10068980'),
    ('Perfect World Shanghai Major 2024', '2024-12-15', 'Team Spirit', 24, '10077005'),
    ('BLAST.tv Austin Major 2025', '2025-06-22', 'Team Vitality', 32, '10083083'),
    ('StarLadder Budapest Major 2025', '2025-12-14', 'Team Vitality', 32, '10088240'),
    ('IEM Cologne Major 2026', '2026-06-21', 'Team Falcons', 32, '10094318'),
]
# Current spellings; punctuation is otherwise preserved. Each confirmed source
# variant here is attached to the same person (see HISTORY.md).
ALIASES = {'jotta': 'jottaaa', 'chay': 'chayjesus', 'ahang': 'l1hang',
           'jeorgesnorts': 'jeorge', 'piriaz1n': 'piriajr', 'snowzin': 'snow', 'dev1ce': 'device',
           'martinez': 'martinezsa'}
AMBIGUOUS = {'adren', 'alex', 'lucky', 'niko', 'steel', 'zero'}
COUNTRIES = {
    'United States': 'us', 'Kazakhstan': 'kz', 'United Kingdom': 'gb', 'Spain': 'es',
    'France': 'fr', 'Denmark': 'dk', 'Bosnia and Herzegovina': 'ba',
    'Brazil': 'br', 'Canada': 'ca', 'Slovakia': 'sk'
}
# Stable Ektarr identifier when the unqualified handle is historically ambiguous.
CS2_HOMONYMS = {'26': 'niko@ba', '153': 'niko@dk', '656': 'lucky@fr',
                '1689': 'lucky@dk', '773': 'alex@es'}
TEAM_ALIASES = {'tyloo': {'zero': 'zero@cn'}, '3dmax': {'lucky': 'lucky@fr'},
                'team 3dmax': {'lucky': 'lucky@fr'}, 'falcons': {'niko': 'niko@ba'},
                'team falcons': {'niko': 'niko@ba'}}


def normalize(name):
    raw = unicodedata.normalize('NFKC', name).strip().casefold()
    return ALIASES.get(raw, raw)


def source_rows(group, cache):
    dataset, version, name, digest, _ = SOURCES[group]
    path = cache / name
    if path.exists():
        raw = path.read_bytes()
    else:
        url = f'https://www.kaggle.com/api/v1/datasets/download/{dataset}/{name}?datasetVersionNumber={version}'
        with urlopen(url, timeout=45) as result:
            raw = result.read()
        if raw.startswith(b'PK'):
            raw = zipfile.ZipFile(io.BytesIO(raw)).read(name)
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError(f'Unexpected source content: {group}')
        cache.mkdir(exist_ok=True, parents=True)
        path.write_bytes(raw)
    if hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError(f'Input digest mismatch for {name}')
    return csv.DictReader(io.StringIO(raw.decode('utf-8-sig')), delimiter=';' if group == 'csgo' else ',')


def edition(name, end, team, teams, players, winners, source, **evidence):
    if len(winners) != 5 or not winners <= players or any(p in AMBIGUOUS for p in players):
        raise ValueError(f'Could not verify winner/identities: {name}')
    return dict(id=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-'), name=name,
                endDate=end, championTeam=team, teamCount=teams, attendanceComplete=True,
                championsComplete=True, sources=[source, 'championships'],
                players=sorted(players), champions=sorted(winners), **evidence)


def historical_go(rows):
    teams = defaultdict(lambda: defaultdict(set))
    stages = defaultdict(lambda: defaultdict(set))
    for row in rows:
        if int(row['maps']) < 1:
            continue
        stage = row['event']
        name = stage.removesuffix(' Challengers Stage')
        if name == 'StarLadder Major 2019':
            name = 'StarLadder Major Berlin 2019'
        person = normalize(row['name'])
        if person in AMBIGUOUS:
            person += '@' + COUNTRIES[row['nationality']]
        teams[name][row['team']].add(person)
        stages[name][stage].add(row['team'])
    events = []
    for name, end, champ, count in GO:
        lineups = teams[name]
        assert len(lineups) == count and all(len(s) >= 5 for s in lineups.values())
        assert all(len(teams_by_stage) == 16 for teams_by_stage in stages[name].values())
        assert len(stages[name]) == (2 if end >= '2018' else 1)
        events.append(edition(name, end, champ, count, set.union(*lineups.values()),
                              lineups[champ], 'csgo', stages=list(sorted(stages[name]))))
    return events


def historical_cs2(rows):
    event_names = {e[0] for e in CS2}
    names_by_id = defaultdict(set)
    games = defaultdict(list)
    map_lineups = defaultdict(set)
    for row in rows:
        for side in ('team1', 'team2'):
            for ix in range(1, 6):
                prefix = f'{side}_player{ix}'
                # Some rows have only an ID (e.g. KOI in Copenhagen). An ID's
                # display name is metadata; only the dated series earns credit.
                player = re.split(r'\s*[,(/]', row[prefix], maxsplit=1)[0]
                if player:
                    names_by_id[row[prefix+'_id']].add(normalize(player))
        if row['tournament'] in event_names:
            if row['is_total'] == 'True':
                games[row['tournament']].append(row)
            else:
                for side in ('team1', 'team2'):
                    key = (row['match_id'], row[side])
                    map_lineups[key].update(row[f'{side}_player{i}_id'] for i in range(1, 6))

    events = []
    for name, end, champion, count, exhibition in CS2:
        played = [r for r in games[name] if r['match_id'] != exhibition]
        assert len(games[name]) == len(played) + 1
        n_series = 73 if count == 24 else 106
        assert len(played) == len({row['match_id'] for row in played}) == n_series
        teams = defaultdict(set)
        final = max(played, key=lambda row: row['datetime'])
        assert final['datetime'][:10] == end
        final_side = 'team1' if float(final['score1_match']) > float(final['score2_match']) else 'team2'
        assert final[final_side] == champion
        winners = set()
        for row in played:
            for side in ('team1','team2'):
                lineup = set()
                ids = {row[f'{side}_player{i}_id'] for i in range(1, 6)}
                # Do not silently lose a player if a future export introduces a
                # mid-series stand-in absent from the series-level five.
                assert len(ids) == 5 and map_lineups[row['match_id'], row[side]] <= ids
                for pid in ids:
                    assert pid and pid.isdigit() and int(pid)>0
                    possible = names_by_id[pid]
                    if len(possible) != 1:
                        raise ValueError(f'Unknown/ambiguous player ID: {pid}: {possible}')
                    person, = possible
                    if person == 'zero' and row[side] == 'TYLOO':
                        person = 'zero@cn'
                    elif person in AMBIGUOUS:
                        person = CS2_HOMONYMS[pid]
                    lineup.add(person)
                assert len(lineup) == 5
                teams[row[side]].update(lineup)
                if row is final and side == final_side:
                    winners = lineup
        assert len(teams) == count
        events.append(edition(name, end, champion, count, set.union(*teams.values()), winners,
                              'cs2', series=n_series, finalSeries=final['match_id']))
    return events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=Path('/tmp/cs2-major-experience'))
    args = parser.parse_args()
    events = historical_go(source_rows('csgo', args.cache)) + historical_cs2(source_rows('cs2', args.cache))
    sources = {k: dict(url=f'https://www.kaggle.com/datasets/{repo}/versions/{version}',
                      file=file, sha256=digest, license=license_)
               for k, (repo, version, file, digest, license_) in SOURCES.items()}
    sources['championships'] = {'url': CHAMPIONSHIPS}
    history = dict(version=1, scope='2013–2026 Valve CS:GO / CS2 Majors, first official stage onward',
                   sources=sources, aliases=ALIASES, teamAliases=TEAM_ALIASES, unresolved=sorted(AMBIGUOUS),
                   events=events)
    assert [e['endDate'] for e in events] == sorted({e['endDate'] for e in events}) and len(events) == 24
    (HERE/'history.json').write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(f'{len(events)} editions, {sum(len(e["players"]) for e in events)} player-edition appearances')

if __name__ == '__main__':
    main()
