"""Compute the registered 180-day opponent profiles using only pre-stage observations."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from bo5_history.elite_probe import IDS, HOLDOUT, HOLDOUT_DAY, ago, describe, field_ranks, load, same_window
from region_vrs_data.prepare import compact, read_table

AUGUST = '2024-08-06'
EXTERNAL = 'cluj-2025'


def original_august(path, release):
    raw = path.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == release['files'][0]['sha256']
    rows = read_table(raw, AUGUST, 'global')
    assert len(rows) == 207
    return (compact(rows) + '\n').encode()


def run(field, training, tables, ranks, releases):
    start = field['start']
    assert field['cutoffExclusive'] == start
    series = same_window(training['rows'], start)
    selected = [training['rows'][i] for i in series if training['rows'][i]['event'] != HOLDOUT]
    assert all(g['earliestUtcDay'] >= ago(start, 180) and g['latestUtcDay'] < ago(start, 1) for g in selected)
    assert len({g['id'] for g in selected}) == len(selected)
    profile = describe(field, series, training['rows'], ranks)
    release = max((r for r in releases if r['published'][:10] < start), key=lambda r: r['published'])
    before = release['rankDay']
    lock_ranks = field_ranks(field['teams'], tables[before]['global'])
    assert len(set(lock_ranks.values()) - {None}) == sum(r is not None for r in lock_ranks.values())
    for name, rank in lock_ranks.items():
        profile['teams'][name]['lockRank'] = rank
    days = [g['day'] for g in selected]
    profile.update(start=start, windowStart=ago(start, 180), rankDay=before, published=release['published'],
                   source=f"https://github.com/ValveSoftware/counter-strike_regional_standings/blob/{release['sha']}/{release['files'][0]['path']}",
                   first=min(days), last=max(days), observedDays=len(set(days)))
    assert len(profile['teams']) == 16
    if start == HOLDOUT_DAY:
        assert len(series) == 2173 and len(set(days)) == 172 and not profile['excludedHoldout']
        assert {n for n,r in lock_ranks.items() if r is not None and r <= 8} == {'The MongolZ','FaZe','Eternal Fire','MOUZ'}
    else:
        assert series == training['targets'][field['id']]['indices']
    return profile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--august-source', type=Path, help='derive compact launch-day facts from pinned Valve Markdown')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    releases = load('tail_calibration/training-releases.json')
    august_file = HERE / 'august-global.json'
    if args.august_source:
        original = original_august(args.august_source, next(r for r in releases if r['rankDay'] == AUGUST))
        if args.check:
            assert august_file.read_bytes() == original
        else:
            august_file.write_bytes(original)
    fields = load('f1bre_models/major-fields.json')['fields']
    external = load('elite_opponents/field.json')
    fields = {EXTERNAL: external, **{k: fields[k] for k in IDS}}
    training = load('tail_calibration/training.json.gz')
    tables = load('region_vrs_data/tables.json.gz')
    tables[AUGUST]['global'] = json.loads(august_file.read_bytes())
    sources = load('region_vrs_data/sources.json')
    ranks = {}
    for f in fields.values():
        days = {training['rows'][i]['rankDay'] for i in same_window(training['rows'], f['start'])}
        for day in days - ranks.keys():
            if day != AUGUST:
                entry, = [r for r in releases if r['rankDay'] == day]
                assert entry['files'][0]['sha256'] == sources[day]['global']['sha256']
            ranking = tables[day]['global']
            ranks[day] = {(name.casefold(), pts): i for i,(pts,name,_) in enumerate(ranking, 1)}
            assert len(ranks[day]) == len(ranking)
    result = {k: run(f, training, tables, ranks, releases) for k,f in fields.items()}
    raw = (compact(result) + '\n').encode()
    out = HERE / 'profiles.json'
    if args.check:
        assert out.read_bytes() == raw
    else:
        out.write_bytes(raw)
    print({k: (p['population'], sum(t['eligible'] for t in p['teams'].values())) for k,p in result.items()})


if __name__ == '__main__':
    main()
