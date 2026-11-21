"""Rebuild the stock of dual-reported, date-stamped series from pinned Valve tables.

Use --cache more than once to reuse existing Valve source downloads.
"""
import argparse
import csv
import datetime as dt
import sys
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / 'datajob'))
import build_features as vrs

def install_cache(paths):
    original = vrs.fetch
    caches = [*paths, HERE.parent / 'datajob/cache', HERE.parent / 'fitting/cache']
    @lru_cache(maxsize=None)
    def read(path):
        for cache in caches:
            item = cache / path
            if item.is_file():
                return item.read_text('utf8')
        return original(path)
    vrs.fetch = read

def extract_event(event, asof):
    start = asof - dt.timedelta(days=174)
    dates = []
    day = start - dt.timedelta(days=35)
    while day <= asof:
        if day.weekday() == 0 and day.day <= 7:
            dates.append(dt.date(2024, 11, 6) if day == dt.date(2024, 11, 4) else day)
        day += dt.timedelta(days=1)
    with ThreadPoolExecutor(8) as pool:
        standings = dict(zip(dates, pool.map(vrs.parse_standings, [vrs.snapshot_path(d) for d in dates])))
    current = standings[asof]
    rosters = vrs.sampled_teams(current, event)
    observations = vrs.match_evidence(asof, rosters)
    for (day, mid), (_, (a, ra), (b, rb)) in vrs.rated_games(observations, standings):
        if start <= day <= asof:
            yield [event, day.isoformat(), mid, a['name'], b['name'], a['y'], ra['points'], rb['points'],
                   '|'.join(sorted(a['players'])), '|'.join(sorted(b['players']))]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', type=Path, action='append', default=[])
    install_cache(ap.parse_args().cache)
    path = HERE / 'series.csv'
    with path.open('w', encoding='utf8', newline='') as fp:
        out = csv.writer(fp, lineterminator="\n")
        out.writerow('event date id a b y pointsA pointsB lineupA lineupB'.split())
        for event, (day, _) in vrs.EVENTS.items():
            rows = list(extract_event(event, dt.date.fromisoformat(day)))
            out.writerows(rows)
            print(event, len(rows), flush=True)
if __name__ == '__main__':
    main()
