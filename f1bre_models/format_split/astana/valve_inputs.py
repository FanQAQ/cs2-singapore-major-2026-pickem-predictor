"""Collect both sides of the same Valve series used by the v33 strength model."""
import argparse
import json
import re
import subprocess
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date,timedelta
from pathlib import Path
from field import HERE,ROOT
from datajob import build_features as vrs
from lineup_pairs.field import save,sha
from latent_form.bucharest import read_ranks

ASOF=date(2026,5,4)
def collect(cache,rank_cache,checkout):
    field=json.loads((HERE/'field.json').read_bytes())
    releases=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    dates={r['rankDay']:r for r in releases if '2025-09-01'<=r['rankDay']<=ASOF.isoformat()}
    tables={}
    for d,r in dates.items():
        file,=r['files']
        p=rank_cache/r['sha']/Path(file['path']).name
        read_ranks(r,p)
        rows=[]
        for rank,points,name,players,detail in vrs.parse_rows(p.read_text(encoding='utf8')):
            rel=Path(file['path']).parent/re.search(r'\(([^)]+)\)',detail)[1]
            rows.append(dict(name=name,rank=int(rank),points=int(points),roster=players.split(', '),detail=rel.as_posix()))
        tables[date.fromisoformat(d)]=vrs.Standings(rows)
    current=tables[ASOF]
    chosen={r['detail']:r for r in current.rows if r['rank']<=100}
    for t in field['teams']:
        r=vrs.matched_row(current,t['name'],t['roster'])
        assert r and r['points']==t['points']
        chosen[r['detail']]=r
    release=dates[ASOF.isoformat()]
    assert release['published'][:10]<'2026-05-09'
    def fetch(path):
        assert path in chosen
        dest=cache/release['sha']/path
        if not dest.exists():
            url='https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/'+release['sha']+'/'+urllib.parse.quote(path,safe='/')
            if checkout:
                raw=subprocess.check_output(['git','-C',str(checkout),'cat-file','blob',release['sha']+':'+path])
            else:
                req=urllib.request.Request(url,headers={'User-Agent':'Fangos-Lab-PickEm'})
                with urllib.request.urlopen(req,timeout=30) as reply:raw=reply.read()
            assert any(len(row)>=6 and row[4] in ('W','L') for row in vrs.parse_rows(raw.decode('utf8'))),path
            dest.parent.mkdir(exist_ok=True,parents=True)
            tmp=dest.with_suffix('.part');tmp.write_bytes(raw);tmp.replace(dest)
        return dest.read_text(encoding='utf8')
    with ThreadPoolExecutor(6) as workers:list(workers.map(fetch,chosen))
    original=vrs.fetch
    try:
        vrs.fetch=fetch
        observations=vrs.match_evidence(ASOF,list(chosen.values()))
        rows=[]
        published={date.fromisoformat(r['published'][:10]):tables[date.fromisoformat(d)] for d,r in dates.items()}
        assert len(published)==len(tables)
        for (day,mid),(prior, (a,ra),(b,rb)) in vrs.rated_games(observations,published):
            assert prior<day
            if ASOF-timedelta(days=174)<=day<=ASOF:
                rows.append([day.isoformat(),mid,a['name'],b['name'],a['y'],ra['points'],rb['points'],
                             sorted(a['players']),sorted(b['players'])])
    finally:vrs.fetch=original
    assert rows and max(row[0] for row in rows)<field['start']
    save(cache/'astana-rated-series.json',rows)
    return dict(fieldSHA256=sha(HERE/'field.json'),commit=release['sha'],published=release['published'],details=len(chosen),
                first=rows[0][0],last=rows[-1][0],series=len(rows),seriesSHA256=sha(cache/'astana-rated-series.json'),
                documents={k:sha(cache/release['sha']/k) for k in sorted(chosen)})

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--cache',type=Path,required=True);ap.add_argument('--ranks',type=Path,required=True)
    ap.add_argument('--valve-checkout',type=Path)
    a=ap.parse_args();result=collect(a.cache,a.ranks,a.valve_checkout);save(HERE/'series-sources.json',result)
    print(result['details'],result['series'],result['first'],result['last'])
