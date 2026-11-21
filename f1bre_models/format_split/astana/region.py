"""Replay the production region-depth feature from the pre-Astana Valve release."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

from field import HERE, ROOT
from datajob.build_features import Standings, matched_row, parse_rows, roster_key
from lineup_pairs.field import save, sha
from region_vrs_model import build as model


def rebuild(checkout):
    field = json.loads((HERE / 'field.json').read_bytes())
    release = field['strengthRelease']
    day = release['rankDay']
    assert release['published'][:10] < field['start']
    snapshots = json.loads((ROOT / 'region_vrs_data/snapshots.json').read_bytes())
    snapshot = snapshots[day]
    assert snapshot['officialGlobal']
    rows, proofs = [], {}
    for region in model.lan.REGS:
        path = f"invitation/2026/standings_{region}_{day.replace('-', '_')}.md"
        raw = subprocess.check_output(['git', '-C', str(checkout), 'cat-file', 'blob',
                                       f"{release['sha']}:{path}"])
        proofs[path] = hashlib.sha256(raw).hexdigest()
        table = [dict(region=region, rank=int(rank), points=int(points), name=name,
                      roster=lineup.split(', '))
                 for rank, points, name, lineup, _ in parse_rows(raw.decode())]
        top = snapshot['regions'][region]['top11']
        assert len(top) == 11
        for archived, official in zip(top, table[:11], strict=True):
            assert archived['rank'] == official['rank'] and archived['points'] == official['points']
            assert roster_key(archived['roster']) == roster_key(official['roster'])
        rows.extend(table)
    index = Standings(rows)
    teams, membership = {}, {}
    for t in field['teams']:
        row = matched_row(index, t['name'], t['roster'])
        assert row and row['points'] == t['points'], t['name']
        regions = {r['region'] for r in rows if len(roster_key(t['roster']) & roster_key(r['roster'])) >= 3}
        assert regions == {row['region']}, t['name']
        teams[t['name']] = dict(region=row['region'], roster=t['roster'])
        membership[t['name']] = dict(region=row['region'], rank=row['rank'],
                                      shared=len(roster_key(t['roster']) & roster_key(row['roster'])))
    corpus = model.lan.Corpus()
    cutoff = model.lan.numdate(day)
    corpus.international = {e for e in corpus.international if corpus.schedule[e][1] <= cutoff}
    examples = model.matchup_examples(corpus, snapshots)
    event = model.build_event(corpus, examples, dict(asOf=day, teams=teams), snapshot)
    return dict(id=field['id'], fieldSHA256=sha(HERE / 'field.json'), commit=release['sha'],
                sources=proofs, membership=membership, regionVrs=event)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--valve-checkout', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    save(HERE / 'region.json', rebuild(args.valve_checkout), args.check)
