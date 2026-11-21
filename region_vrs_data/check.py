"""Cross-check dates, world presence, ties and field provenance from the offline snapshot."""
import csv
import gzip
import json
from pathlib import Path

from build import generate

HERE = Path(__file__).resolve().parent
root = HERE.parent
data = generate()
month = data['snapshots.json']
fields = data['events.json']
with gzip.open(root/'region_risk/evidence.csv.gz','rt') as f:
    rows = list(csv.DictReader(f))
assert all(r['snapshot'] in month and r['snapshot'] < r['day'] for r in rows)
assert len(month) == 42 and sum(s['officialGlobal'] for s in month.values()) == 28
assert sum(month[r['snapshot']]['officialGlobal'] for r in rows) == 2488
old = fields['copenhagen']
assert old['globalTeams'] is None and all(r['top30World'] is None for r in old['regions'].values())
assert fields['shanghai']['sharedTop30'] == fields['austin']['sharedTop30'] == 1
assert fields['shanghai']['regions']['americas']['top30World'] == 8.5
sg = fields['singapore']
assert sg['asOf'] == '2026-11-02' and sg['globalTeams'] == 376 and sg['sharedTop30'] == 0
for region, top30, mid in [('europe',22,1775),('americas',7,1489.5),('asia',1,1265.5)]:
    row = sg['regions'][region]
    assert row['top30World'] == top30 and row['top10MedianPoints'] == mid
    assert len(row['top11']) == 11 and row['top11'][10]['rank'] == 11
print(f'{len(month)} official snapshots, {len(fields)} fields and {len(rows)} date-aligned LAN matches verified')
