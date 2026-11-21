"""Fetch the 74 public Valve ranking tables from their original release commits."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

HERE=Path(__file__).resolve().parent
PREFIX='https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/'


def fetch(root):
    for r in json.loads((HERE/'training-releases.json').read_text(encoding='utf8')):
        directory=root/r['sha']
        directory.mkdir(parents=True,exist_ok=True)
        for f in r['files']:
            dest=directory/Path(f['path']).name
            if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()==f['sha256']:
                continue
            with urlopen(PREFIX+r['sha']+'/'+f['path'],timeout=30) as response:
                data=response.read()
            assert hashlib.sha256(data).hexdigest()==f['sha256'],f['path']
            dest.write_bytes(data)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('cache',type=Path)
    fetch(p.parse_args().cache)
