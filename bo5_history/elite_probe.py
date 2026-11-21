"""Describe pre-stage BO3 results versus then-top-eight opponents; never train a model."""
import argparse
from collections import Counter
from datetime import date, timedelta
import gzip
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from latent_form.adjacency import AMBIGUOUS, HASHES, player

IDS = ('austin-2025-3', 'budapest-2025-3', 'cologne-2026-3')
HOLDOUT = 'PGL Cluj-Napoca 2025'
HOLDOUT_DAY = '2025-02-14'
HOLDOUT_CLUBS = {'The MongolZ', 'Complexity', 'FaZe', 'SAW', 'MOUZ', 'BIG', '3DMAX',
                 'Virtus.pro', 'Falcons', 'FlyQuest', 'paiN', 'Astralis', 'MIBR', 'Wildcard',
                 'Eternal Fire', 'Imperial Valkyries'}


def load(path):
    raw = (ROOT / path).read_bytes()
    return json.loads(gzip.decompress(raw) if path.endswith('.gz') else raw)


def ago(day, days):
    return (date.fromisoformat(day) - timedelta(days=days)).isoformat()


def same_window(rows, start):
    return [i for i, r in enumerate(rows)
            if ago(start, 180) <= r['earliestUtcDay'] and r['latestUtcDay'] < ago(start, 1)]


def known(five, team):
    return {player(p, team) for p in five} - AMBIGUOUS


def field_ranks(teams, global_rows):
    result = {}
    ranked_cores = [known(five, name) for _, name, five in global_rows]
    for t in teams:
        core = known(t['roster'], t['name'])
        overlaps = [len(other & core) for other in ranked_cores]
        n = max(overlaps)
        result[t['name']] = overlaps.index(n)+1 if n >= 3 and overlaps.count(n) == 1 else None
    return result


def ranks_in_series(game, tables):
    table = tables[game['rankDay']]
    result = []
    for side in 'AB':
        rank = table[(game['rankTeam' + side].casefold(), game['points' + side])]
        assert game['overlap' + side] >= 3
        result.append(rank)
    assert result[0] != result[1] and game['rankPublished'][:10] < game['earliestUtcDay']
    return result


def describe(field, indices, rows, tables):
    teams = field['teams']
    cores = [known(t['roster'], t['name']) for t in teams]
    observed = [([], []) for _ in teams]  # elite and non-elite, in that order
    excluded = 0
    for i in indices:
        g = rows[i]
        if g['event'] == HOLDOUT:
            excluded += 1
            continue
        rank_a, rank_b = ranks_in_series(g, tables)
        p_a = 1 / (1 + 10 ** (-g['gap'] / 400))
        for side, outcome, p, other_rank in [('A', g['y'], p_a, rank_b), ('B', 1-g['y'], 1-p_a, rank_a)]:
            five = set(g['five'+side]) - AMBIGUOUS
            matched = [j for j, core in enumerate(cores) if len(core & five) >= 3]
            assert len(matched) <= 1
            if matched:
                observed[matched[0]][int(other_rank > 8)].append((outcome, p, g['id']))
    profiles = {}
    for t, (elite, other) in zip(teams, observed):
        def summary(games):
            return dict(n=len(games), wins=sum(y for y, _, _ in games),
                        expected=sum(p for _, p, _ in games),
                        relativeUnderdog=sum(p <= .35 for _, p, _ in games))
        e, o = summary(elite), summary(other)
        eligible = min(e['n'], o['n']) >= 3
        difference = (e['wins']-e['expected'])/(e['n']+5) - (o['wins']-o['expected'])/(o['n']+5)
        profiles[t['name']] = dict(elite=e, other=o, eliteSeries=[gid for _, _, gid in elite], eligible=eligible,
                                   difference=difference if eligible else 0)
    return dict(population=len(indices), excludedHoldout=excluded, teams=profiles)


def held_source(training, tables, archive):
    first = ago(HOLDOUT_DAY, 180)
    windows = training['targets'].values()
    for n in range(180):
        day = ago(HOLDOUT_DAY, n+1)
        assert any(w['windowStart'] <= day < w['cutoffExclusive'] for w in windows), day
    indices = same_window(training['rows'], HOLDOUT_DAY)
    assert not any(training['rows'][i]['event'] == HOLDOUT for i in indices)
    february = tables['2025-02-03']['global']
    top = [t for _, t, _ in february[:8] if t in HOLDOUT_CLUBS]
    result = dict(start=HOLDOUT_DAY, window=first, series=len(indices),
                  windowObservedDays=len({training['rows'][i]['day'] for i in indices}),
                  eligibleRankedClubs=top)
    if archive:
        raw = archive.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == HASHES['hltv']
        rows = [g for g in json.loads(gzip.decompress(raw)) if g.get('event') == HOLDOUT
                and re.search(r'Swiss round [1-5]', g.get('stage', ''))]
        counts = Counter(int(re.search(r'Swiss round (\d)', g['stage'])[1]) for g in rows)
        assert [counts[r] for r in range(1,6)] == [8,8,8,6,3]
        assert all(g['format'].startswith('Best of 3') for g in rows)
        result['swissRecordsByRound'] = [counts[r] for r in range(1,6)]
    return result


def check_rank_sources(required, tables, releases):
    source = load('region_vrs_data/sources.json')
    for release in releases:
        day = release['rankDay']
        if day not in required:
            continue
        original, = release['files']
        if day == '2024-08-06':
            # The root and later invitation Markdown files differ. Check exactly the
            # eight ranks used by the external profile against the first publication.
            eight = [[p, t.casefold()] for p, t, _ in tables[day]['global'][:8]]
            digest = hashlib.sha256(json.dumps(eight,separators=(',',':')).encode()).hexdigest()
            assert digest == '5814864cfd88ff30f5afbf0b44f73388594272dee27e9a23b421b07a9e33f6af'
        else:
            assert original['sha256'] == source[day]['global']['sha256'], day


def check_perfect(labels, field, series):
    """Recount 3–0 outcomes from the archive's actual five-player sides and wins."""
    cores = [known(t['roster'], t['name']) for t in field['teams']]
    names = [t['name'] for t in field['teams']]
    wins, losses = Counter(), Counter()
    assert len(series) == len({g['id'] for g in series}) == 33
    for game in series:
        names_in_game = []
        for side in 'AB':
            five = known(game['roster'+side], game[side.lower()])
            idx, = [i for i, core in enumerate(cores) if len(core & five) >= 3]
            names_in_game.append(names[idx])
        a, b = names_in_game
        winner, loser = (a,b) if game['y'] else (b,a)
        wins[winner] += 1
        losses[loser] += 1
    assert {n for n in names if wins[n] == 3 and losses[n] == 0} == labels


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='optional fixed HLTvy raw archive for Cluj coverage')
    parser.add_argument('--json', action='store_true', help='include all 48 team-stage profiles')
    args = parser.parse_args()
    training = load('tail_calibration/training.json.gz')
    raw_tables = load('region_vrs_data/tables.json.gz')
    tables = {}
    for day, release in raw_tables.items():
        rows = release.get('global', [])
        table = {(team.casefold(), points): rank for rank, (points, team, _) in enumerate(rows, 1)}
        assert len(table) == len(rows)
        tables[day] = table
    fields = load('f1bre_models/major-fields.json')['fields']
    releases = load('tail_calibration/training-releases.json')
    necessary = {training['rows'][i]['rankDay'] for day in [HOLDOUT_DAY]+[fields[t]['start'] for t in IDS]
                 for i in same_window(training['rows'], day)}
    check_rank_sources(necessary, raw_tables, releases)
    profiles = {}
    for stage in IDS:
        field = fields[stage]
        indexes = same_window(training['rows'], field['start'])
        assert indexes == training['targets'][stage]['indices'] and field['cutoffExclusive'] == field['start']
        result = describe(field, indexes, training['rows'], tables)
        before = [r for r in releases if r['published'][:10] < field['start']]
        result['rankDay'] = max(before, key=lambda r:r['published'])['rankDay']
        ranks = field_ranks(field['teams'], raw_tables[result['rankDay']]['global'])
        for team, rank in ranks.items():
            result['teams'][team]['lockRank'] = rank
        profiles[stage] = result
    # Attach archived labels and selections only after all feature values are fixed.
    truth = {f['id']: f for f in load('bo5_history/cards.json')['fields']}
    actual_series = load('major_form/all_stages.json')['editions']
    for stage, result in profiles.items():
        f = truth[stage]
        selections = f['arms']['original']['main']['cards']['standard']['card']
        for team, actual, pick in zip(f['teams'], f['actual'], selections, strict=True):
            result['teams'][team].update(perfect=actual == 0, originalPickedPerfect=pick == 0)
        perfect = {t for t, p in result['teams'].items() if p['perfect']}
        records = actual_series[stage.split('-')[0]]['matches']
        check_perfect(perfect, fields[stage], [g for g in records if g['stage'] == 3])
        assert perfect == {'FURIA', 'Spirit'}
        for team in ('FURIA', 'Spirit'):
            path = []
            for match in f['matches']:
                if f['teams'][match['w']] == team:
                    opponent = f['teams'][match['l']]
                    path.append(dict(round=match['round'], bo=match['bo'], opponent=opponent,
                                     opponentRank=result['teams'][opponent]['lockRank']))
            assert len(path) == 3
            result['teams'][team]['observedPath'] = path
    held = held_source(training, raw_tables, args.archive)
    if args.json:
        print(json.dumps(dict(major=profiles, holdout=held), ensure_ascii=False, indent=2))
    else:
        for stage, result in profiles.items():
            teams = result['teams']
            print(stage, 'eligible', sum(t['eligible'] for t in teams.values()), '/', len(teams),
                  'population', result['population'], 'excluded held event', result['excludedHoldout'])
            for team, p in teams.items():
                e, o = p['elite'], p['other']
                print(f"  {team:20s} {e['wins']:2d}/{e['n']:<2d} expected {e['expected']:5.2f}"
                      f"  other {o['wins']:2d}/{o['n']:<2d} expected {o['expected']:5.2f}"
                      f"  difference {p['difference']:+.3f}"
                      f"  original 3-0 {p['originalPickedPerfect']}  actual 3-0 {p['perfect']}")
        print('Unscored external field', json.dumps(held, ensure_ascii=False))


if __name__ == '__main__':
    main()
