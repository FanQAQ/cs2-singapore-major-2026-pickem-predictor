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


def blob(cache,name,commit=COMMIT):
    dest=cache/commit/name
    if not dest.is_file():
        dest.parent.mkdir(exist_ok=True,parents=True)
        with urlopen('https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/'+commit+'/'+name,timeout=45) as res:
            raw=res.read()
        dest.write_bytes(raw)
    return dest.read_bytes()


def build(cache,ektarr,pushbuild,check,*,directory=HERE,release=RELEASE,series_name='katowice-rated-series.json'):
    ranks=cache/'ranks'
    info,=release['files']
    commit,day=release['sha'],release['rankDay']
    target=ranks/commit/Path(info['path']).name
    target.parent.mkdir(parents=True,exist_ok=True)
    raw=target.read_bytes() if target.is_file() else blob(cache,info['path'],commit)
    assert hashlib.sha256(raw).hexdigest()==info['sha256']
    target.write_bytes(raw)
    field=json.loads((directory/'field.json').read_bytes())
    assert release['published']<field['start']
    series=cache/series_name
    proof=valve_inputs.collect(cache,ranks,None,directory=directory,asof=date.fromisoformat(day),
                               rank_release=release,series_name=series.name)
    save(directory/'series-sources.json',proof,check)
    kwargs=dict(directory=directory,rank_day=day)
    save(directory/'v4-strength.json',strength.strength(ektarr,series,**kwargs),check)
    save(directory/'classic.json',classic.build(series,**kwargs),check)
    files=dict(ektarr=ektarr,pushbuild=pushbuild)
    save(directory/'format.json',series_format.rebuild(series,files,**kwargs),check)
    save(directory/'region.json',region.rebuild(None,directory=directory,rank_release=release,blob=lambda p:blob(cache,p,commit)),check)
    print('Verified Valve documents',proof['details'],'paired rated series',proof['series'])


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    for k in ('cache','ektarr','pushbuild'):ap.add_argument('--'+k,type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    build(args.cache,args.ektarr,args.pushbuild,args.check)
