"""Freeze 2024 Opening Stage seeds and rosters, then verify all scoring outcomes."""
import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

EKTARR = 'https://www.kaggle.com/datasets/ektarr/counter-strike-pro-matches/versions/11'
PUSHBUILD = 'https://www.kaggle.com/datasets/pushbuild/open-data/versions/1'
KOI_RMR = 'https://www.hltv.org/matches/2369744/fnatic-vs-koi-pgl-cs2-major-copenhagen-2024-europe-rmr-a'

EVENTS = {
    'copenhagen': dict(
        label='哥本哈根 2024', date='2024-03-17', endDate='2024-03-20', asOf='2024-03-16',
        seeds=('Cloud9|Eternal Fire|ENCE|Apeks|HEROIC|GamerLegion|SAW|FURIA|'
               'ECSTATIC|The MongolZ|Imperial|paiN|Lynn Vision|AMKAL|KOI|Legacy').split('|'),
        event='PGL/2024/Copenhagen/Opening Stage', tournament='PGL Major Copenhagen 2024',
        sources=[
            'https://www.hltv.org/news/38424/pgl-major-copenhagen-attendees-finalized',
            'https://www.hltv.org/news/38493/official-gamerlegion-replace-9-pandas-at-copenhagen-major',
            'https://www.hltv.org/news/38486/pgl-major-copenhagen-teams-format-schedule-prizes-talent',
            'https://www.hltv.org/events/7258/pgl-cs2-major-copenhagen-2024-opening-stage',
            KOI_RMR, EKTARR, PUSHBUILD,
        ],
    ),
    'shanghai': dict(
        label='上海 2024', date='2024-11-30', endDate='2024-12-03', asOf='2024-11-29',
        seeds=('FURIA|Virtus.pro|Liquid|Complexity|BIG|fnatic|The MongolZ|paiN|'
               'GamerLegion|MIBR|Cloud9|FlyQuest|Passion UA|Wildcard|Rare Atom|Imperial').split('|'),
        event='Perfect World/Major/2024/Shanghai/Opening Stage',
        tournament='Perfect World Shanghai Major 2024',
        sources=[
            'https://www.hltv.org/news/40396/perfect-world-confirms-opening-major-matches',
            'https://www.hltv.org/news/40410/visualized-all-24-teams-at-the-shanghai-major',
            'https://www.hltv.org/events/7861/perfect-world-shanghai-major-2024-opening-stage',
            EKTARR, PUSHBUILD,
        ],
    ),
}


def normalize(name):
    return (name.lower().replace(' esports', '').replace(' gaming', '')
            .removeprefix('team ').replace(' ', ''))


def load(cache, name, digest):
    path = cache / name
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError(f'Unexpected archive version for {name}')
    with path.open(encoding='utf-8-sig', newline='') as stream:
        return list(csv.DictReader(stream))


def player_ids(row, side):
    return sorted(row[f'team{side}_player{i}_id'] for i in range(1, 6))


def prematch_rosters(rows, entrants, cutoff):
    rows = sorted((r for r in rows if r['datetime'][:10] <= cutoff), key=lambda r: r['datetime'])
    names = defaultdict(set)
    snapshots = {}
    for row in rows:
        for side in (1, 2):
            for i in range(1, 6):
                field = f'team{side}_player{i}'
                handle = re.split(r'\s*[,(/]', row[field], maxsplit=1)[0].strip()
                if handle:
                    names[row[field + '_id']].add(handle)
            team = entrants.get(normalize(row[f'team{side}']))
            if row['is_total'] == 'True' and team:
                evidence = dict(date=row['datetime'][:10], matchId=row['match_id'],
                                tournament=row['tournament'])
                snapshots[team] = player_ids(row, side), evidence
    # In the dated February RMR roster, ID 943 is the sole unnamed KOI player
    # alongside the other four identified players. The contemporary HLTV match
    # page identifies him as stadodo. Use handles available before the event.
    names['943'].add('stadodo')
    assert set(snapshots) == set(entrants.values())
    rosters = {}
    for team, (ids, _) in snapshots.items():
        assert '0' not in ids and '' not in ids and len(set(ids)) == 5
        assert all(len(names[ident]) == 1 for ident in ids)
        rosters[team] = sorted((next(iter(names[ident])) for ident in ids), key=str.casefold)
    return snapshots, rosters


def build(base):
    rows = load(base, 'cs2_all_tiers_games.csv',
                'd99aa6a61c5d9018eef587ce28c026df4dd61406fdd46afe7a8d08bdcdcf2972')
    series = load(base, 'esports%2Fcs2_liquipedia_series.csv',
                  '20ec7d1ba725c9b7cd7bd390dac1c86e68f63943fea61539ecf673bd8212bacf')
    output = {}
    for key, event in EVENTS.items():
        entrants = {normalize(name): name for name in event['seeds']}
        rank = {name: i for i, name in enumerate(event['seeds'])}
        snapshots, rosters = prematch_rosters(rows, entrants, event['asOf'])
        archived = [r for r in rows if r['tournament'] == event['tournament']
                    and r['is_total'] == 'True' and event['date'] <= r['datetime'][:10] <= event['endDate']]
        observations = Counter()
        for row in archived:
            a, b = [entrants[normalize(row[f'team{s}'])] for s in (1, 2)]
            score_a, score_b = [int(row[f'score{s}_match']) for s in (1, 2)]
            assert score_a != score_b
            observations[(a, b) if score_a > score_b else (b, a)] += 1
            for side, team in enumerate((a, b), 1):
                assert player_ids(row, side) == snapshots[team][0], (team, row['match_id'])

        rounds = [[] for _ in range(5)]
        formats = [[] for _ in range(5)]
        played = Counter()
        compared = Counter()
        stage_series = sorted((r for r in series if r['event'] == event['event']),
                              key=lambda r: r['date_utc'])
        for row in stage_series:
            a, b = [entrants[normalize(row[k])] for k in ('team1', 'team2')]
            winner = entrants[normalize(row['winner'])]
            assert winner in (a, b) and played[a] == played[b]
            loser = b if winner == a else a
            round_index = played[a]
            rounds[round_index].append([winner, loser])
            formats[round_index].append(int(row['best_of']))
            played[a] += 1
            played[b] += 1
            compared[winner, loser] += 1
        assert len(played) == 16 and sum(compared.values()) == 33 and compared == observations
        assert [len(group) for group in rounds] == [8, 8, 8, 6, 3]
        assert all(abs(rank[a] - rank[b]) == 8 for a, b in rounds[0])
        assert Counter(n for f in formats for n in f) == {1: 20, 3: 13}
        output[key] = dict(
            **{k: v for k, v in event.items() if k not in ('event', 'tournament')},
            rosters={n: rosters[n] for n in event['seeds']},
            rosterEvidence={n: snapshots[n][1] for n in event['seeds']},
            rounds=rounds, formats=formats,
        )
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('cache', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(json.dumps(build(args.cache), ensure_ascii=False, indent=2) + '\n')
