"""Apply the production reference model at the September Valve snapshot."""
import argparse
from datetime import date
import hashlib
import json
from pathlib import Path
import sys
from urllib.request import urlopen

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(HERE.parent/'astana'))
import classic, region, series_format, strength, valve_inputs
from lineup_pairs.field import save

DAY='2026-09-07'
COMMIT='84ccfa4d751fa3801ae6430097a9a66f104ee131'
GLOBAL='invitation/2026/standings_global_2026_09_07.md'
RELEASE=dict(rankDay=DAY,sha=COMMIT,published='2026-09-09T18:45:20Z',
             files=[dict(path=GLOBAL,sha256='bc9553bcd9c3420f3279307fdca654d25f363d38e2c51a32b452c8c0e72e4f46')])


def blob(cache,name):
    dest=cache/COMMIT/name
    if not dest.is_file():
        dest.parent.mkdir(exist_ok=True,parents=True)
        with urlopen('https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/'+COMMIT+'/'+name,timeout=45) as res:
            raw=res.read()
        dest.write_bytes(raw)
    return dest.read_bytes()


def build(cache,ektarr,pushbuild,check):
    ranks=cache/'ranks'
    target=ranks/COMMIT/Path(GLOBAL).name
    target.parent.mkdir(parents=True,exist_ok=True)
    raw=blob(cache,GLOBAL)
    assert hashlib.sha256(raw).hexdigest()==RELEASE['files'][0]['sha256']
    target.write_bytes(raw)
    field=json.loads((HERE/'field.json').read_bytes())
    assert RELEASE['published']<field['start']
    series=cache/'katowice-rated-series.json'
    proof=valve_inputs.collect(cache,ranks,None,directory=HERE,asof=date.fromisoformat(DAY),
                               rank_release=RELEASE,series_name=series.name)
    save(HERE/'series-sources.json',proof,check)
    kwargs=dict(directory=HERE,rank_day=DAY)
    save(HERE/'v4-strength.json',strength.strength(ektarr,series,**kwargs),check)
    save(HERE/'classic.json',classic.build(series,**kwargs),check)
    files=dict(ektarr=ektarr,pushbuild=pushbuild)
    save(HERE/'format.json',series_format.rebuild(series,files,**kwargs),check)
    save(HERE/'region.json',region.rebuild(None,directory=HERE,rank_release=RELEASE,blob=lambda p:blob(cache,p)),check)
    print('Verified Valve documents',proof['details'],'paired rated series',proof['series'])


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    for k in ('cache','ektarr','pushbuild'):ap.add_argument('--'+k,type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    build(args.cache,args.ektarr,args.pushbuild,args.check)
