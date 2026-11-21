"""Compare a current lineup's earlier Major results with like-for-like ordinary LAN series."""
import argparse
import csv
import gzip
import itertools
import json
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
WINDOW = 180
CALIPER = 0.10
MIN_CONTROLS = 2
MAX_CONTROLS = 3


def normalized(value):
    return unicodedata.normalize('NFKC', value).casefold().strip()


class Identities:
    def __init__(self):
        history = json.loads((ROOT / 'experience/history.json').read_text())
        self.aliases = {normalized(k): normalized(v) for k, v in history['aliases'].items()}
        self.aliases.update({'rmn': 'roman'})
        self.clubs = {normalized(c): {normalized(k): normalized(v) for k, v in m.items()}
                      for c, m in history['teamAliases'].items()}
        self.ambiguous = set(map(normalized, history['unresolved']))

    def roster(self, players, club=''):
        # An unscoped ambiguous handle cannot establish a shared player identity.
        keys = []
        for p in players:
            tag = normalized(p)
            tag = self.clubs.get(normalized(club), {}).get(tag, self.aliases.get(tag, tag))
            if tag not in self.ambiguous:
                keys.append(tag)
        return frozenset(keys)


def expectation(points_a, points_b):
    return 1.0 / (1.0 + 10.0 ** ((points_b - points_a) / 400.0))


@dataclass(frozen=True)
class Control:
    match: int
    side: int
    day: date
    end: date
    bo: int
    y: int
    p: float


class Standings:
    """Look up each actual playing five directly in the release used for that competition."""
    def __init__(self, identities):
        frozen = json.loads(gzip.decompress((ROOT / 'region_vrs_data/tables.json.gz').read_bytes()))
        self.by_date = {}
        for day, tables in frozen.items():
            rows = tables.get('global') or sum((tables[key] for key in ('asia','americas','europe')), [])
            index = defaultdict(set)
            for points, club, roster in rows:
                five = identities.roster(roster, club)
                for triple in itertools.combinations(sorted(five), 3):
                    index[triple].add((five, points))
            self.by_date[day] = index

    def points(self, day, actual):
        candidates = set()
        index = self.by_date[day]
        for triple in itertools.combinations(sorted(actual), 3):
            candidates.update(index.get(triple, ()))
        if not candidates:
            return None
        count = max(len(five & actual) for five, _ in candidates)
        best = [points for five, points in candidates if len(five & actual) == count]
        return best[0] if len(best) == 1 else None


def control_index(identities, standings):
    schedule = {(r['year'], r['event']): (date.fromisoformat(r['first']), date.fromisoformat(r['last']))
                for r in json.loads((ROOT / 'region_risk/schedule.json').read_text())}
    with gzip.open(ROOT / 'region_risk/evidence.csv.gz', 'rt') as handle:
        rows = list(csv.DictReader(handle))
    by_event = defaultdict(list)
    for row in rows:
        by_event[(row['day'][:4], row['tournament'])].append(row)
    index = defaultdict(list)
    for event, games in by_event.items():
        first, last = schedule[event]
        all_regions = {r[k] for r in games for k in ('ra', 'rb')}
        if len(all_regions) < 2:
            continue
        for r in games:
            day = date.fromisoformat(r['day'])
            assert first <= day <= last
            if date.fromisoformat(r['snapshot']) >= first:
                continue
            assert min(int(r['overlapA']), int(r['overlapB'])) >= 3
            actual = [identities.roster(r[key].split('|')) for key in ('a', 'b')]
            points = [standings.points(r['snapshot'], five) for five in actual]
            if None in points:
                continue
            p = expectation(*points)
            for side, five in enumerate(actual):
                c = Control(int(r['id']), side, day, last, int(r['bo']),
                            int(r['y']) if not side else 1 - int(r['y']), p if not side else 1-p)
                for triple in itertools.combinations(sorted(five), 3):
                    index[triple].append(c)
    return index


def matches(index, core, start, bo, p):
    earliest = start - timedelta(days=WINDOW)
    pool = {}
    for triple in itertools.combinations(sorted(core), 3):
        for c in index.get(triple, ()):
            if c.bo == bo and earliest <= c.day <= c.end < start and abs(c.p - p) <= CALIPER:
                if c.match in pool:
                    assert pool[c.match] == c
                pool[c.match] = c
    chosen = sorted(pool.values(), key=lambda c: (abs(c.p - p), -c.day.toordinal(), c.match))
    return chosen[:MAX_CONTROLS] if len(chosen) >= MIN_CONTROLS else []


def summarize(rows, eligible):
    n = len(rows)
    wins = sum(r['y'] for r in rows)
    expected = sum(r['p'] for r in rows)
    control_wins = sum(sum(c.y for c in r['controls']) / len(r['controls']) for r in rows)
    control_expected = sum(sum(c.p for c in r['controls']) / len(r['controls']) for r in rows)
    a = 100 * (wins - expected) / n if n else None
    b = 100 * (control_wins - control_expected) / n if n else None
    controls = {c.match for row in rows for c in row['controls']}
    def rnd(x):
        return round(x, 6) if x is not None else None
    return dict(eligibleSeries=eligible, matchedSeries=n, editions=len({r['edition'] for r in rows}),
                controlsN=len(controls), majorWins=wins, majorExpected=rnd(expected) if n else None,
                controlWins=rnd(control_wins) if n else None, controlExpected=rnd(control_expected) if n else None,
                majorResidualPP=rnd(a), controlResidualPP=rnd(b), pairedResidualPP=rnd(a-b) if n else None)


def build():
    identities = Identities()
    standings = Standings(identities)
    index = control_index(identities, standings)
    evidence = json.loads((HERE/'all_stages.json').read_text())['editions']
    targets = json.loads((ROOT/'region_risk/anchor.json').read_text())
    cs2 = json.loads((ROOT/'experience/history.json').read_text())['sources']['cs2']
    lan_sources = json.loads((ROOT/'region_risk/events.json').read_text())
    result = {}
    for target, anchor in targets.items():
        output = {}
        stage_rows = []
        stage_eligible = 0
        for club, team in anchor['teams'].items():
            five = identities.roster(team['roster'], club)
            by_edition = {}
            pool = []
            for edition_id, edition in evidence.items():
                if edition['end'] >= anchor['asOf']:
                    continue
                start = date.fromisoformat(edition['start'])
                eligible = 0
                matched = []
                for g in edition['matches']:
                    assert str(start) <= g['day'] <= edition['end']
                    if g['pointsAsOf'] >= str(start):
                        continue
                    playing = [identities.roster(g['roster'+key], g[key.lower()]) for key in ('A','B')]
                    points = [standings.points(g['pointsAsOf'], actual) for actual in playing]
                    if None in points:
                        continue
                    base = expectation(*points)
                    for side, hist in enumerate(playing):
                        core = five & hist
                        if len(core) < 3:
                            continue
                        eligible += 1
                        prob = base if not side else 1-base
                        controls = matches(index, core, start, g['bo'], prob)
                        if controls:
                            matched.append(dict(edition=edition_id,match=g['id'],p=prob,
                                                y=g['y'] if not side else 1-g['y'],controls=controls))
                if eligible:
                    by_edition[edition_id] = summarize(matched, eligible)
                    pool.extend(matched)
            eligible = sum(row['eligibleSeries'] for row in by_edition.values())
            output[club] = {**summarize(pool, eligible), 'byEdition':by_edition}
            stage_rows.extend(pool)
            stage_eligible += eligible
        summary = summarize(stage_rows, stage_eligible)
        summary.update(teamsMatched=sum(t['matchedSeries']>0 for t in output.values()),
                       teamsRepeated=sum(t['editions']>=2 for t in output.values()),
                       teamsTotal=len(output))
        result[target] = dict(asOf=anchor['asOf'], windowDays=WINDOW, matchTolerance=CALIPER,
                              minControls=MIN_CONTROLS, maxControls=MAX_CONTROLS, teams=output, summary=summary,
                              sources=[{'title':'五届 Major 全阶段逐场出场阵容', 'url':cs2['url']},
                                       *lan_sources[target]['sources']])
    return result


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--check', action='store_true')
    content = json.dumps(build(), ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n'
    output = HERE/'contrast.json'
    if args.parse_args().check:
        assert output.read_text() == content, 'Major/ordinary LAN comparison differs from frozen evidence.'
    else:
        output.write_text(content)
    for eid, v in json.loads(content).items():
        print(eid, v['summary'])
