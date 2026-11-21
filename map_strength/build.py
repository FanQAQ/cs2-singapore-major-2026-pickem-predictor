"""Build as-of opponent-adjusted per-map profiles from the frozen roster/map observations."""
import argparse
import csv
import gzip
import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from history24.build import canonical

# Event rules contain the map list; no frequencies or test-match results choose the pool.
POOLS = {
    'copenhagen': ('Ancient Anubis Inferno Mirage Nuke Overpass Vertigo', '7258/pgl-cs2-major-copenhagen-2024-opening-stage'),
    'shanghai': ('Ancient Anubis Dust2 Inferno Mirage Nuke Vertigo', '7861/perfect-world-shanghai-major-2024-opening-stage'),
    'austin': ('Ancient Anubis Dust2 Inferno Mirage Nuke Train', '8436/blasttv-austin-major-2025-stage-1'),
    'budapest': ('Ancient Dust2 Inferno Mirage Nuke Overpass Train', '8504/starladder-budapest-major-2025-stage-1'),
    'cologne': ('Ancient Anubis Dust2 Inferno Mirage Nuke Overpass', '9028/iem-cologne-major-2026-stage-1'),
    'singapore': ('Ancient Anubis Cache Dust2 Inferno Mirage Nuke', '9303/pgl-major-singapore-2026-stage-1'),
}


def roster(names):
    result = frozenset(canonical(n) for n in names)
    if len(result) != 5 or '' in result:
        raise ValueError(f'Incomplete five: {names}')
    return result


def entries():
    earlier = json.loads((ROOT/'history24/fixtures.json').read_text())
    later = json.loads((ROOT/'datajob/stage_rosters.json').read_text())
    dates = json.loads((ROOT/'strategy_v4/models.json').read_text())
    return {event: (date.fromisoformat(dates[event]['asOf']),
                    {name: roster(five) for name, five in rosters.items()})
            for event, rosters in {**{e: v['rosters'] for e,v in earlier.items()}, **later}.items()}


def team_for(lineup, entrants):
    eligible = [(team, len(five & lineup)) for team, five in entrants.items() if len(five & lineup) >= 3]
    if len(eligible) > 1:
        return None
    return eligible[0] if eligible else None


def map_prior(gap, bo):
    """Implied equal-map probability from the prior VRS series prediction."""
    p = 1 / (1 + 10 ** (-gap/400))
    if bo == 1:
        return p
    low, high = 0., 1.
    for _ in range(40):
        middle = (low + high)/2
        if middle*middle*(3 - 2*middle) < p:
            low = middle
        else:
            high = middle
    return (low + high)/2


def profile(pool, games):
    by_map = defaultdict(list)
    for game in games:
        by_map[game['map']].append(game)
    values = {}
    for name in pool:
        obs = by_map[name]
        error = sum(g['weight'] * (g['y'] - g['prior']) for g in obs)
        info = sum(g['weight'] * g['prior']*(1-g['prior']) for g in obs)
        values[name] = (error, info)
    total_info = sum(info for _,info in values.values())
    team_effect = sum(err for err,_ in values.values())/total_info if total_info else 0.
    maps = {}
    for name, (err, info) in values.items():
        obs = by_map[name]
        maps[name] = {
            'n':len(obs), 'wins':sum(g['y'] for g in obs),
            'weight':round(sum(g['weight'] for g in obs), 4),
            'logitOffset':round((err - info*team_effect)/(3 + info), 7) if obs else 0.,
        }
    return {'n':len(games), 'series':len({g['series'] for g in games}),
            'first':min((g['date'] for g in games), default=None),
            'last':max((g['date'] for g in games), default=None), 'maps':maps}


def build():
    specs = entries()
    seen = set()
    groups = defaultdict(lambda: defaultdict(list))
    counts = defaultdict(set)
    with gzip.open(HERE/'maps.csv.gz', 'rt') as f:
        for r in csv.DictReader(f):
            event, name = r['event'], r['map']
            cutoff, entrants = specs[event]
            day, rating_day = map(date.fromisoformat, [r['day'], r['rankDay']])
            age = (cutoff - day).days
            game_key = (event, r['gameId'])
            bo, winner = int(r['bo']), int(r['winnerA'])
            if (not 0 <= age < 90 or rating_day >= day or game_key in seen or
                    name not in POOLS[event][0].split() or bo not in (1,3) or winner not in (0,1)):
                raise ValueError(f'Invalid age, pool, format or duplicate {game_key}')
            seen.add(game_key)
            fives = [roster(r[k].split('|')) for k in ('fiveA','fiveB')]
            if fives[0] & fives[1]:
                raise ValueError(f'Overlapping players {game_key}')
            p = map_prior(int(r['pointsA'])-int(r['pointsB']), bo)
            matched = [team_for(five, entrants) for five in fives]
            if not any(matched) or (all(matched) and matched[0][0] == matched[1][0]):
                raise ValueError(f'Unresolved Major participant {game_key}')
            counts[event].add(r['series'])
            for side, match in enumerate(matched):
                if match:
                    team, common = match
                    groups[event][team].append(dict(map=name, series=r['series'], date=r['day'],
                        y=winner if side==0 else 1-winner, prior=p if side==0 else 1-p,
                        weight=(common/5) * .5 ** (age/45)))
    result = {}
    for event, (cutoff, entrants) in specs.items():
        pool, page = POOLS[event]
        pool = pool.split()
        by_team = {team:profile(pool, groups[event][team]) for team in entrants}
        result[event] = dict(asOf=cutoff.isoformat(), pool=pool,
            poolSource={'title':'HLTV · 当届首阶段地图池', 'url':'https://www.hltv.org/events/'+page},
            teams=by_team, series=len(counts[event]), uniqueMaps=sum(e==event for e,_ in seen))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = build()
    text = json.dumps(result, ensure_ascii=False, separators=(',',':'))+'\n'
    output = HERE/'events.json'
    if args.check:
        if text != output.read_text():
            raise SystemExit('Map strengths differ from frozen events.json')
    else:
        output.write_text(text)
    for key, x in result.items():
        print(key, x['series'], x['uniqueMaps'], sum(v['n']>0 for v in x['teams'].values()), '/ 16')
