"""Build frozen Stage 1 features using public Valve monthly VRS records (stdlib only)."""
import csv
import json
import re
import time
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
INPUT = HERE
CACHE = HERE / 'cache'
REPO = 'ValveSoftware/counter-strike_regional_standings'
REV = 'f8c55f250fdef796d708aa32814587932154fa04'
BASE = f'https://raw.githubusercontent.com/{REPO}/{REV}/'
WEB = f'https://github.com/{REPO}/blob/{REV}/'
EVENTS = {
    'austin': ('2025-06-02', 'Complexity|HEROIC|B8|BetBoom|TYLOO|Lynn Vision|Wildcard|FlyQuest|OG|Chinggis Warriors|Imperial|Nemiga|NRG|Legacy|Metizport|Fluxo'),
    'budapest': ('2025-11-03', 'Legacy|FaZe|B8|GamerLegion|fnatic|PARIVISION|Ninjas in Pyjamas|Imperial|FlyQuest|Lynn Vision|M80|Fluxo|RED Canids|The Huns|NRG|Rare Atom'),
    'cologne': ('2026-06-01', 'GamerLegion|B8|HEROIC|BetBoom|BIG|M80|MIBR|SINNERS|NRG|TYLOO|Sharks|Gaimin Gladiators|Liquid|Lynn Vision|THUNDER dOWNUNDER|FlyQuest'),
    'singapore': ('2026-11-02', 'Ninjas in Pyjamas|PARIVISION|HEROIC|FaZe|Liquid|Eternal Fire|100 Thieves|9z|M80|DENDELE|Imperial|Wildcard|BC.Game|FlyQuest|Chinggis Warriors|Lynn Vision'),
}

def fetch(path):
    dest = CACHE / path
    for cached in (dest, INPUT.parent/'fitting'/'cache'/path):
        if cached.is_file():
            return cached.read_text(encoding='utf-8')
    for attempt in range(4):
        try:
            with urlopen(BASE + path, timeout=30) as response:
                content = response.read().decode('utf-8')
            if '<html' in content[:600].lower():
                raise ValueError('HTML in place of source table')
            dest.parent.mkdir(exist_ok=True, parents=True)
            dest.write_text(content, encoding='utf-8')
            return content
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)

def snapshot_path(day, region='global'):
    return f'invitation/{day.year}/standings_{region}_{day:%Y_%m_%d}.md'

def key(name):
    return name.casefold().replace(' ', '')

def parse_rows(content):
    for line in content.splitlines():
        cells = [c.strip() for c in line.strip('|').split('|')]
        if line.startswith('|') and cells[0].isdigit():
            yield cells

def roster_key(names):
    """Valve publishes player handles. A lineup requires five distinct known handles."""
    if not names or isinstance(names, str):
        return frozenset()
    names = tuple(names)
    if len(names) != 5 or any(not isinstance(name, str) for name in names):
        return frozenset()
    players = frozenset(unicodedata.normalize('NFKC', name).strip().casefold() for name in names)
    missing = {'', '-', '—', '?', 'unknown', 'tba', 'tbd', 'n/a', 'stand-in', 'standin'}
    return players if len(players) == 5 and not players & missing else frozenset()


def core_overlap(a, b):
    return len(roster_key(a) & roster_key(b))


class Standings(defaultdict):
    """Index one immutable Valve ranking by player as well as by organization."""
    def __init__(self, rows):
        super().__init__(list)
        self.rows = list(rows)
        self.by_player = defaultdict(list)
        for index, row in enumerate(self.rows):
            self[key(row['name'])].append(row)
            for player in roster_key(row['roster']):
                self.by_player[player].append(index)


def parse_standings(path):
    rows = []
    for rank, points, name, lineup, detail in parse_rows(fetch(path)):
        detail_path = str(Path(path).parent / re.search(r'\(([^)]+)\)', detail).group(1))
        rows.append(dict(name=name, rank=int(rank), points=int(points),
                         roster=lineup.split(', '), detail=detail_path))
    return Standings(rows)


def month_snapshots(asof):
    start = asof - timedelta(days=130)
    return [start + timedelta(days=i) for i in range((asof-start).days+1)
            if (start+timedelta(days=i)).weekday()==0 and (start+timedelta(days=i)).day<=7]


def matched_row(standings, name, players=None):
    """Match a five across clubs. Reject ties at the highest overlap, even for the same brand."""
    five = roster_key(players)
    if not five:
        return None
    counts = Counter(index for player in five for index in standings.by_player.get(player, ()))
    best = counts.most_common(2)
    if not best or best[0][1] < 3 or (len(best) == 2 and best[0][1] == best[1][1]):
        return None
    return standings.rows[best[0][0]]


def display_name(event, name):
    return 'GOSH' if event == 'singapore' and name == 'BC.Game' else name


def stage_rosters():
    return json.loads((INPUT/'stage_rosters.json').read_text(encoding='utf8'))


def sampled_teams(standings, event):
    # The fixed source pool covers the first 100 ranked lineups and lower Stage 1 seeds.
    teams = {r['detail']:r for r in standings.rows if r['rank'] <= 100}
    for name, anchor in stage_rosters()[event].items():
        row = matched_row(standings, name, anchor)
        if row:
            teams[row['detail']] = row
    return list(teams.values())


def observations(teams):
    # A current club detail document can include the roster's games under a previous club.
    out = defaultdict(list)
    with ThreadPoolExecutor(12) as pool:
        for team, doc in zip(teams, pool.map(fetch, [r['detail'] for r in teams])):
            for row in parse_rows(doc):
                if len(row) < 6 or row[4] not in ('W', 'L'):
                    continue
                _, mid, when, opponent, outcome = row[:5]
                obs = (team['name'], opponent, int(outcome == 'W'), roster_key(row[-1].split(',')))
                out[date.fromisoformat(when), mid].append(obs)
    return out


def resolve_game(records):
    # In each direction Valve provides the actual five for its own side and its opponent's
    # reported name. Multiple documents may legitimately report the same five and score.
    sides = defaultdict(set)
    for _, other, won, players in records:
        sides[won].add((other, players))
    if len(sides[0]) != 1 or len(sides[1]) != 1:
        return None
    name_w, losing_five = next(iter(sides[0]))
    name_l, winning_five = next(iter(sides[1]))
    if not winning_five or not losing_five or winning_five & losing_five or key(name_w) == key(name_l):
        return None
    return tuple(sorted((dict(name=name_w, players=winning_five, y=1),
                         dict(name=name_l, players=losing_five, y=0)), key=lambda side:key(side['name'])))


def match_evidence(asof, teams, raw=None):
    records = observations(teams) if raw is None else raw
    return {k:game for k, sides in records.items() if k[0] <= asof and (game := resolve_game(sides))}


def rated_games(evidence, tables):
    import bisect
    dates = sorted(tables)
    for (day, mid), (a, b) in sorted(evidence.items()):
        prior = bisect.bisect_left(dates, day) - 1
        if prior < 0:
            continue
        previous = tables[dates[prior]]
        ra = matched_row(previous, a['name'], a['players'])
        rb = matched_row(previous, b['name'], b['players'])
        if ra and rb and ra['detail'] != rb['detail']:
            yield (day, mid), (dates[prior], (a, ra), (b, rb))


def elo_expectation(a, b):
    return 1/(1+10**(-(a-b)/400))


def build(event_specs=None, entrant_rosters=None):
    specs = EVENTS if event_specs is None else event_specs
    anchors = stage_rosters() if entrant_rosters is None else entrant_rosters
    result, history = {}, []
    days = {event: date.fromisoformat(spec[0]) for event,spec in specs.items()}
    all_days = sorted({day for asof in days.values() for day in month_snapshots(asof)})
    with ThreadPoolExecutor(10) as pool:
        tables = dict(zip(all_days, pool.map(parse_standings, [snapshot_path(d) for d in all_days])))
    regions = ['europe', 'americas', 'asia']
    regional_jobs = [(d, region) for d in all_days for region in regions]
    with ThreadPoolExecutor(10) as pool:
        regional = dict(zip(regional_jobs, pool.map(parse_standings,
                       [snapshot_path(d, region) for d, region in regional_jobs])))

    def memberships(day, row):
        five = roster_key(row['roster'])
        return [region for region in regions if any(roster_key(candidate['roster']) == five
                for candidate in regional[(day,region)].get(key(row['name']), ()))]
    for event, (_, names) in specs.items():
        asof = days[event]
        current = tables[asof]
        raw = observations(sampled_teams(current, event))
        raw = {k:v for k,v in raw.items() if 0 <= (asof-k[0]).days < 90}
        games = dict(rated_games(match_evidence(asof, (), raw), tables))
        out = result[event] = dict(asOf=asof.isoformat(), source=WEB+snapshot_path(asof), teams=[])
        for name in names.split('|'):
            display = display_name(event, name)
            anchor = anchors[event][display]
            five = roster_key(anchor)
            if not five:
                raise ValueError(f'{event}/{display}: invalid stage five')
            team = matched_row(current, name, five)
            if not team:
                # A new lineup has no entitlement to another roster's ranking. The stage
                # must provide an explicit neutral prior rather than pick a club by name.
                team = dict(name=name, roster=[], rank=None, points=None, detail=None)
            brand_keys = {key(name), key(team['name'])}
            retained = Counter()
            candidates = Counter()
            below_core = unknown = 0
            residuals, strong, weak = [], [], []
            regional_obs = {'intra':[], 'cross':[]}
            for k, reports in raw.items():
                # The union across club documents supports changes of organization.
                # Count each series once per candidate side; an inconsistent record is excluded.
                for won in (0, 1):
                    sides = {(players, other) for _, other, w, players in reports if w == won}
                    same_brand = any(key(label) in brand_keys for label,_,w,_ in reports if w==won)
                    if len(sides)!=1:
                        if same_brand: unknown += 1
                        continue
                    players, _ = next(iter(sides))
                    shared = len(five & players)
                    if shared < 3:
                        if same_brand:
                            if players: below_core += 1
                            else: unknown += 1
                        continue
                    candidates[shared] += 1
                    if k not in games:
                        continue
                    day, mid = k
                    histday, a, b = games[k]
                    (own, own_rank), (other, other_rank) = (a,b) if a[0]['y'] == won else (b,a)
                    p = elo_expectation(own_rank['points'], other_rank['points'])
                    retained[shared] += 1
                    residuals.append(won-p)
                    if p <= .35: strong.append(won-p)
                    if p >= .65: weak.append(won-p)
                    own_regions, opp_regions = memberships(histday, own_rank), memberships(histday, other_rank)
                    if len(own_regions) == len(opp_regions) == 1:
                        regional_obs['intra' if own_regions==opp_regions else 'cross'].append((won,p))
                    history.append(dict(event=event, date=day.isoformat(), snapshot=histday.isoformat(),
                        asOf=asof.isoformat(), team=name, historicalTeam=own['name'], opponent=other['name'],
                        y=won, ownPoints=own_rank['points'], oppPoints=other_rank['points'], prob=p,
                        matchInSnapshot=mid, lineup='|'.join(sorted(players)),
                        opponentLineup='|'.join(sorted(other['players'])), coreOverlap=shared,
                        monthlyTeam=own_rank['name'], monthlyOpponent=other_rank['name'],
                        ownVrsOverlap=core_overlap(players,own_rank['roster']),
                        oppVrsOverlap=core_overlap(other['players'],other_rank['roster'])))
            def shrink(values):
                return round(sum(values)/(len(values)+5),7)
            matching_regions = memberships(asof, team) if team['detail'] else []
            grouped = {'unknown': len(residuals)-sum(len(x) for x in regional_obs.values())}
            for scope, values in regional_obs.items():
                n = len(values)
                grouped[scope] = dict(n=n,
                    observed=round(sum(y for y,p in values)/n,7) if n else None,
                    expected=round(sum(p for y,p in values)/n,7) if n else None,
                    residual=round(sum(y-p for y,p in values)/n,7) if n else None)
            audit = dict(candidates={str(i):candidates[i] for i in (3,4,5)},
                         retained={str(i):retained[i] for i in (3,4,5)}, belowCore=below_core,
                         unknownLineup=unknown, unverified=sum(candidates.values())-len(residuals))
            out['teams'].append(dict(name=display,sourceName=name,regions=matching_regions,
                region=matching_regions[0] if len(matching_regions)==1 else ('multi' if matching_regions else 'unknown'),
                regional=grouped,rank=team['rank'],points=team['points'],roster=anchor,
                vrsRoster=team['roster'],vrsName=team['name'],vrsCoreOverlap=core_overlap(five,team['roster']),
                form=shrink(residuals),strong=shrink(strong),weak=shrink(weak),n=len(residuals),
                ns=len(strong),nw=len(weak),available=sum(candidates.values()),
                source=WEB+team['detail'] if team['detail'] else WEB+snapshot_path(asof),
                sameFive=candidates[5],coreAudit=audit))
        print(event,asof,len(out['teams']),sum(t['n'] for t in out['teams']),
              sum(t['available'] for t in out['teams']),flush=True)
    (HERE/'features.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    with (HERE/'history.csv').open('w',newline='') as dest:
        writer=csv.DictWriter(dest,fieldnames=list(history[0]),lineterminator='\n')
        writer.writeheader()
        writer.writerows(history)


if __name__=='__main__':
    build()
