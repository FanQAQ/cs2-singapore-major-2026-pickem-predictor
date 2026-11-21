"""Freeze full monthly Valve leaderboards as compact facts, with verifiable sources."""
import argparse
import ast
import gzip
import hashlib
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REGIONS = ('europe', 'americas', 'asia')
REPO = 'ValveSoftware/counter-strike_regional_standings'
TABLENAME = re.compile(r'(?:standings_(global|asia|europe|americas)_(\d{4}_\d{2}_\d{2})|(\d{4}-\d{2}-\d{2})-(global|asia|europe|americas))\.md')


def compact(x):
    return json.dumps(x, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def sources():
    # Read the existing project's pinned revisions without importing its training stack.
    nodes = ast.parse((ROOT / 'history24/build.py').read_text()).body
    cfg = {node.targets[0].id: ast.literal_eval(node.value) for node in nodes
           if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
           and node.targets[0].id in ('REGIONAL', 'REV24')}
    for date in sorted(json.loads((ROOT / 'region_risk/ranking_hashes.json').read_text())):
        before_global = date in cfg['REGIONAL']
        commit = cfg['REGIONAL'][date] if before_global else cfg['REV24']
        for region in (REGIONS if before_global else (*REGIONS, 'global')):
            path = f'standings_{region}.md' if before_global else f'invitation/{date[:4]}/standings_{region}_{date.replace("-", "_")}.md'
            yield date, region, commit, path


def normalized(handle):
    return unicodedata.normalize('NFKC', handle).strip().casefold()


def read_table(raw, date, reg):
    lines = raw.decode().splitlines()
    header = lines[0].replace('_', '-').lower()
    if date not in header or (reg != 'global' and reg not in header) or (reg == 'global' and 'regional standings' in header):
        raise ValueError(f'Wrong ranking table for {date} {reg}')
    rows = []
    for line in lines:
        cells = [c.strip() for c in line.strip('|').split('|')]
        if not line.startswith('|') or len(cells) < 4 or not cells[0].isdigit():
            continue
        rank, points, name, names = cells[:4]
        roster = sorted(normalized(n) for n in names.split(','))
        assert 1 <= len(roster) == len(set(roster)) <= 5 and name and int(rank) == len(rows)+1, (date,reg,rank,roster,name)
        rows.append([int(points), name, roster])
    assert rows and len({tuple(r[2]) for r in rows}) == len(rows)
    return rows


def prepare(dirs, fetch):
    original = json.loads((ROOT / 'region_risk/ranking_hashes.json').read_text())
    files = defaultdict(list)
    for directory in dirs:
        for f in sorted(directory.rglob('*.md')):
            match = TABLENAME.fullmatch(f.name)
            if match:
                stamp = (match[2] or match[3]).replace('_', '-')
                files[stamp, match[1] or match[4]].append(f)
    result, manifest = {}, {}
    for day, reg, rev, path in sources():
        local = files[day, reg]
        web = f'https://github.com/{REPO}/blob/{rev}/{path}'
        if local:
            raw = local[0].read_bytes()
            assert all(f.read_bytes() == raw for f in local), (day,reg)
        elif fetch:
            raw = urlopen(f'https://raw.githubusercontent.com/{REPO}/{rev}/{path}', timeout=40).read()
        else:
            raise FileNotFoundError(f'Provide {day} {reg} in --tables or use --fetch')
        rows = read_table(raw, day, reg)
        if reg != 'global':
            check = [[roster, reg, pts] for pts, _, roster in rows if len(roster)==5]
            assert hashlib.sha256(compact(check).encode()).hexdigest() == original[day][reg]
        result.setdefault(day, {})[reg] = rows
        manifest.setdefault(day, {})[reg] = {'url':web, 'sha256':hashlib.sha256(raw).hexdigest(), 'rows':len(rows)}
    return compact(result)+'\n', compact(manifest)+'\n'


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--tables', type=Path, nargs='*', default=[])
    ap.add_argument('--fetch', action='store_true')
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    tables, manifest = prepare(args.tables,args.fetch)
    archive = HERE / 'tables.json.gz'
    catalogue = HERE / 'sources.json'
    if args.check:
        assert gzip.decompress(archive.read_bytes()) == tables.encode()
        assert catalogue.read_text() == manifest
    else:
        archive.write_bytes(gzip.compress(tables.encode(), mtime=0))
        catalogue.write_text(manifest)
