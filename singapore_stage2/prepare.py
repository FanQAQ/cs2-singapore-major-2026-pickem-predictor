"""Build pre-Major features for the Singapore Stage 2 field from pinned Valve snapshots."""
import csv
import gzip
import json
import sys
import unicodedata
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from strategy_v4.build import ALIAS, event_model


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf8'))


def table(key):
    rows = []
    for line in (HERE / ('valve-' + key + '.md')).read_text(encoding='utf-8-sig').splitlines():
        cells = [c.strip() for c in line.split('|')]
        if len(cells) > 5 and cells[1].isdigit():
            rows.append(dict(rank=int(cells[1]), points=int(cells[2]), name=cells[3],
                             roster=[p.strip() for p in cells[4].split(',')]))
    assert rows and rows[0]['rank'] == 1
    return rows


def players(roster):
    # PGL uses the original spelling Techno4K, Valve uses Techno.
    normalized = [unicodedata.normalize('NFKC', p).casefold().strip() for p in roster]
    return frozenset('techno' if p == 'techno4k' else ALIAS.get(p, p) for p in normalized)


def build():
    schedule = read('stage_goals/singapore-schedule.json')['stages'][1]
    initial = read('datajob/stage_rosters.json')['singapore']
    direct = {t['team']: t['announcedStartingFive'] for t in schedule['directInvites']}
    announced = dict(initial, **direct)
    with (ROOT / 'fitting/fit_examples.csv').open() as src:
        ids = {r['matchInSnapshot'] for r in csv.DictReader(src) if r['event'] == 'singapore'}
    with gzip.open(ROOT / 'strategy_v4/series.csv.gz', 'rt') as src:
        rows = sorted((r for r in csv.DictReader(src) if r['event'] == 'singapore'),
                      key=lambda r: (r['day'], r['id']))
    # Normalise the MongolZ handle in the features too.
    direct_for_model = {name: players(roster) for name, roster in direct.items()}
    model, extra = event_model(rows, ids, read('datajob/features.json')['singapore'], initial, direct_for_model)
    shipped = read('strategy_v4/models.json')['singapore']
    assert model['n'] == shipped['n']
    for name, row in shipped['teams'].items():
        for feature, value in row.items():
            assert abs(model['teams'][name][feature] - value) < 1e-7, (name, feature, value, model['teams'][name][feature])
    extra = {name:{key:round(v, 11) if isinstance(v, float) else v for key,v in row.items()}
             for name,row in extra.items()}
    profiles = dict(shipped['teams'], **extra)
    global_rows = table('snapshot')
    regional = {r:table(r) for r in ['asia', 'europe', 'americas']}
    previous = read('region_vrs_model/events.json')['singapore']['teams']
    output = {}
    for name, roster in announced.items():
        core = players(roster)
        ranked = sorted(((len(core & players(r['roster'])), r) for r in global_rows),
                        key=lambda item: -item[0])
        count, match = ranked[0]
        assert count >= 3 and count > ranked[1][0], name
        region, = [key for key, lst in regional.items() if any(players(r['roster']) == players(match['roster']) for r in lst)]
        others = [r['points'] for r in regional[region][:11] if len(core & players(r['roster'])) < 3][:10]
        depth = median(others)
        if name in previous:
            assert (region, depth) == (previous[name]['region'], previous[name]['depth']), name
        output[name] = dict(roster=roster, points=match['points'], vrsRank=match['rank'], vrsTeam=match['name'],
                            vrsRoster=match['roster'], coreOverlap=count, region=region, depth=depth, profile=profiles[name])
    return dict(pointsAsOf=shipped['asOf'], trainingSeries=shipped['n'], teams=output)


if __name__ == '__main__':
    payload = json.dumps(build(), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    path = HERE / 'inputs.json'
    if '--check' in sys.argv:
        assert path.read_text(encoding='utf8') == payload
    else:
        path.write_bytes(payload.encode('utf8'))
