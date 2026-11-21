"""Reconfirm offline venues for the post-snapshot series, using the pinned source archives."""
import argparse
import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "map_veto_data"))
import extract_archive as archive
import extract_singapore_csv as griffin


def collect(historical, recent):
    observations = json.loads(gzip.decompress((ROOT / "refresh_close/observations.json.gz").read_bytes()))
    needed = {r["id"]: r for r in observations}
    assert len(needed) == len(observations)
    if hashlib.sha256(historical.read_bytes()).hexdigest() != archive.SHA256:
        raise ValueError("Historical archive differs from the verified version")
    meta = {}
    with gzip.open(historical, 'rt') as source:
        for row in json.load(source):
            match_id = int(row["match-id"])
            if match_id in needed and needed[match_id]["source"] == "hltvy":
                day = datetime.fromtimestamp(row['date']/1000, timezone.utc).date().isoformat()
                assert day == needed[match_id]['day']
                meta[match_id] = (row['event'], '(lan)' in row['format'].casefold())
    for row in griffin.load(recent, 'series'):
        match_id = int(row['hltv_match_id'])
        if match_id in needed and needed[match_id]['source'] != 'hltvy':
            assert row['scheduled_start_utc'][:10] == needed[match_id]['day']
            meta[match_id] = (row['event_name'], row['environment'].strip().lower() == 'lan')
    assert needed.keys() == meta.keys()
    return {str(k): title for k, (title, lan) in sorted(meta.items()) if lan}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('historical', type=Path)
    parser.add_argument('recent', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = json.dumps(collect(args.historical, args.recent), ensure_ascii=False, indent=2)+'\n'
    path = HERE/'late_venues.json'
    if args.check:
        assert path.read_text() == result
    else:
        path.write_text(result)
