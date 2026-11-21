"""Build the official reference from the public October 5 Valve snapshot."""
import argparse
import json
from pathlib import Path
import sys

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[2]))
from f1bre_models.format_split.epl24.baseline import build

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    for key in ('cache','ektarr','pushbuild'):ap.add_argument('--'+key,type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    a=ap.parse_args()
    release=json.loads((HERE/'field.json').read_bytes())['strengthRelease']
    build(a.cache,a.ektarr,a.pushbuild,a.check,directory=HERE,release=release,series_name='bucharest26-rated-series.json')
