"""Reconstruct the 2024 Copenhagen second-stage field without using its results."""
import argparse
import csv
import gzip
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from strategy_v4.build import event_model, lineup

AS_OF = '2024-03-04'
# HLTV, March 5: the eight teams directly seeded into the Elimination Stage.
DIRECT = {
    'FaZe': 'karrigan rain frozen ropz broky',
    'Spirit': 'chopper sh1ro magixx zont1x donk',
    'Vitality': 'apEX ZywOo flameZ Spinx mezii',
    'MOUZ': 'Brollan siuhy torzsi Jimpphat xertioN',
    'Complexity': 'hallzerk JT floppy Grim EliGE',
    'Virtus.pro': 'Jame FL1T fame n0rb3r7 mir',
    'Natus Vincere': 'Aleksib iM b1t jL w0nderful',
    'G2': 'NiKo huNter- nexa HooXi m0NESY',
}
# March 20, official round 1: opponents of seeds 1..8 are seeds 9..16.
QUALIFIERS = ['HEROIC', 'Cloud9', 'Eternal Fire', 'ECSTATIC', 'paiN', 'Imperial', 'The MongolZ', 'FURIA']


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def freeze_field(parent, cutoff, direct, qualifiers, field_date, stage_start):
    opening = read('history24/fixtures.json')[parent]['rosters']
    rosters = {**{k: v.split() for k, v in direct.items()}, **{k: opening[k] for k in qualifiers}}
    tables = json.loads(gzip.decompress((ROOT/'region_vrs_data/tables.json.gz').read_bytes()))[cutoff]
    rated_tables = {'global': tables['global']} if 'global' in tables else tables
    with gzip.open(ROOT/'strategy_v4/series.csv.gz', 'rt', encoding='utf8') as handle:
        series = [r for r in csv.DictReader(handle) if r['event'] == parent]
    with (ROOT/'history24/fit_examples.csv').open(encoding='utf8') as handle:
        training = {r['matchInSnapshot'] for r in csv.DictReader(handle) if r['event'] == parent}
    assert all(r['day'] <= cutoff for r in series)
    model, _ = event_model(sorted(series, key=lambda r: (r['day'], r['id'])), training,
                           {'asOf': cutoff}, rosters, {})
    published = read('strategy_v4/models.json')[parent]
    assert model['lastMatch'] == published['lastMatch']
    assert math.isclose(model['calibrationSlope'], published['calibrationSlope'], abs_tol=1e-8)
    for mask in model['masks']:
        for a, b in zip(model['masks'][mask]['beta'], published['masks'][mask]['beta']):
            assert abs(a - b) < 1e-5
    teams = []
    for name, five in rosters.items():
        if name in opening:
            for k, value in model['teams'][name].items():
                assert abs(value - published['teams'][name][k]) < 1e-9
        pool = [(len(lineup(five) & lineup(rated)), pts, rated, region)
                for region, rows in rated_tables.items() for pts, _, rated in rows]
        best = max(x[0] for x in pool)
        winners = [row for row in pool if row[0] == best]
        assert best >= 3 and len(winners) == 1, name
        overlap, points, rated, region = winners[0]
        if region == 'global':
            matches = [scope for scope, rows in tables.items() if scope != 'global'
                       and any(lineup(rated) == lineup(row[2]) for row in rows)]
            region = matches[0] if len(matches) == 1 else None
        profile = {k: round(v, 12) if isinstance(v, float) else v
                   for k, v in model['teams'][name].items()}
        teams.append(dict(name=name, seed=len(teams)+1, roster=five, points=points,
                          vrsRoster=rated, coreOverlap=overlap, region=region, profile=profile))
    return dict(asOf=cutoff, fieldAsOf=field_date, stageStart=stage_start, teams=teams)


def write_or_check(field, outfile):
    p = argparse.ArgumentParser()
    p.add_argument('--check', action='store_true')
    args = p.parse_args()
    if args.check:
        assert json.loads(outfile.read_text(encoding='utf8')) == field
    else:
        outfile.write_text(json.dumps(field, ensure_ascii=False, indent=2)+'\n', encoding='utf8')


if __name__ == '__main__':
    write_or_check(freeze_field('copenhagen', AS_OF, DIRECT, QUALIFIERS, '2024-03-20', '2024-03-21'),
                   HERE/'field.json')
