"""Fetch the small, pinned metadata index only. Run outside normal offline builds."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.request

REVISION = '912a363098feec3f220e41d68634d2f71676c28b'
REPO = 'blanchon/opencs2_dataset_demo'
ORIGIN = 'https://huggingface.co'


def fetch(cache):
    cache.mkdir(exist_ok=True, parents=True)
    with urllib.request.urlopen(f'{ORIGIN}/api/datasets/{REPO}/tree/{REVISION}/data', timeout=30) as response:
        shards = json.load(response)
    if len(shards) != 137:
        raise ValueError('Unexpected number of index shards')

    def download(item):
        name = item['path']
        if not re.fullmatch(r'data/[a-zA-Z0-9_-]+\.parquet', name):
            raise ValueError(name)
        local = cache / Path(name).name
        digest = item['lfs']['oid']
        if local.exists() and hashlib.sha256(local.read_bytes()).hexdigest() == digest:
            return
        url = f'{ORIGIN}/datasets/{REPO}/resolve/{REVISION}/{name}?download=true'
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=35) as response:
                    blob = response.read()
                if hashlib.sha256(blob).hexdigest() != digest:
                    raise ValueError(f'Unexpected digest for {name}')
                local.write_bytes(blob)
                return
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(1 + attempt)

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(download, shards))
    print(f'{len(shards)} verified metadata shards')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=Path)
    fetch(parser.parse_args().directory)
