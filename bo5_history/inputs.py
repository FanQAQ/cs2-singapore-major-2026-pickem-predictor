"""Recover only verified, played BO5 maps and actual per-player scoreboard observations."""
import argparse
import bisect
import csv
import gzip
import hashlib
import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0,str(ROOT))
from f1bre_models import ml_prepare as base
from f1bre_models.elo_inputs import ektarr_game, hltv_game, EKTARR_SHA, CS2_HOMONYMS


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def read(file):
    raw=file.read_bytes()
    return json.loads(gzip.decompress(raw) if file.suffix=='.gz' else raw)


def store(file, data, check):
    raw=(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode()
    if file.suffix=='.gz':raw=gzip.compress(raw,mtime=0)
    if check:assert raw==file.read_bytes(),file
    else:file.write_bytes(raw)


def valid(g):
    return g and len(g['maps']) in (3,4,5) and all(m[0] in base.MAPS for m in g['maps']) and not (
        'cluj' in g['event'].lower() and '2026' in g['event'])


def box(data):
    # Only contemporaneous ADR, KAST and kills/round are added. Rating stays missing.
    return {n:[x if math.isfinite(x) else None for x in values[:3]] for n,values in data.items()}


def extract(args):
    assert sha(args.hltvy)==base.sources.hltvy.SHA256 and sha(args.ektarr)==EKTARR_SHA
    elo_file=ROOT/'f1bre_models/elo-data.json.gz'
    verified={g['id']:g for g in read(elo_file)['rows'] if g['bo']==5}
    rows={};reject=Counter();scanned=Counter()
    def add(g,stats,url,u):
        if not valid(g):reject['scoreFormatPoolOrExcluded']+=1;return
        if g['id'] not in verified:reject['notInDeduplicatedPlayedSeries']+=1;return
        assert g==verified[g['id']]
        assert g['id'] not in rows and len(stats)==len(g['maps'])
        assert all(set(v[i])==set(g['five'+'AB'[i]]) for v in stats for i in (0,1))
        rows[g['id']]={key:g[key] for key in ('day','event','a','b','fiveA','fiveB','maps')}
        rows[g['id']].update(sourceUrl=url,uncertainty=u,stats=stats)
    with gzip.open(args.hltvy,'rt',encoding='utf8') as f:sources=json.load(f)
    for raw in sources:
        if not str(raw.get('format','')).lower().startswith('best of 5'):continue
        day=base.datetime.fromtimestamp(raw['date']/1000,base.timezone.utc).date().isoformat()
        if not base.FIRST_CS2<=day<=base.sources.LAST_ARCHIVE_DAY:continue
        scanned['hltv']+=1
        if raw.get('enrich_failed') or any('advantage' in str(v).casefold() or 'forfeit' in str(v).casefold()
            for v in (raw.get('stage',''),raw.get('format',''),raw.get('veto',[]))):
            reject['advantageForfeitOrIncomplete']+=1;continue
        g=hltv_game(raw)
        if not valid(g):reject['hltvNotCompleteMR12BO5']+=1;continue
        stats=[]
        for r,(mp,x,y) in zip((r for r in raw['maps'] if r['status']=='played'),g['maps']):
            by={base.sources.hltvy.key(r[c]['name']):r['players'][c] for c in ('team1','team2')}
            stats.append([box(base.players(by[base.sources.hltvy.key(g[side])],g[side],x+y,'hltv')) for side in ('a','b')])
        add(g,stats,raw['url'].replace('https://hltv.org/','https://www.hltv.org/'),0)
    del sources
    grouped=defaultdict(list);gids=Counter()
    with args.ektarr.open(encoding='utf-8-sig',newline='') as f:
        for r in csv.DictReader(f):
            if r['is_total']!='False' or not base.sources.shifted(base.sources.LAST_ARCHIVE_DAY,1)<r['datetime'][:10]<'2026-11-21':
                continue
            gids[r['game_id']]+=1
            if r['bestOf'] in ('5','5.0'): grouped[r['match_id']].append(r)
    for mid,rs in grouped.items():
        scanned['ektarr']+=1
        if not mid or any(not r['game_id'] or gids[r['game_id']]!=1 for r in rs):
            reject['ektarrDuplicateGameId']+=1;continue
        try:g=ektarr_game(rs)
        except (KeyError,ValueError,TypeError,OverflowError):g=None
        if not valid(g):reject['ektarrNotCompleteMR12BO5']+=1;continue
        stats=[]
        for r,(mp,x,y) in zip(rs,g['maps']):
            both=[]
            for s in (1,2):
                values=[]
                for i in range(1,6):
                    k=f'team{s}_player{i}'
                    name=CS2_HOMONYMS.get(r[k+'_id'],re.split(r'\s*[,(/]',r[k],maxsplit=1)[0])
                    values.append([name,r[k+'_adr'],r[k+'_kast'],r[k+'_kills']])
                both.append(box(base.players(values,r['team'+str(s)],x+y,'ektarr')))
            stats.append(both)
        add(g,stats,base.sources.CACHE_VERSION,1)
    tables=base.sources.release_tables(args.ranks)
    pub=[r['published'][:10] for r in tables]
    final={}
    for mid,g in sorted(rows.items()):
        early=base.sources.shifted(g['day'],-g['uncertainty'])
        available=base.sources.shifted(g['day'],g['uncertainty']+2)
        rid=bisect.bisect_left(pub,early)-1
        if rid<0:reject['noPreMatchPublication']+=1;continue
        table=tables[rid]
        matches=[base.sources.rank_for(g['five'+s],table) for s in 'AB']
        if not all(matches) or matches[0][0] is matches[1][0]:
            reject['noUniqueThreePlayerVRS']+=1;continue
        g.update(earliest=early,available=available,rank=dict(rankDay=table['rankDay'],published=table['published'],
                 points=[r[0]['p'] for r in matches],overlap=[r[1] for r in matches],commit=table['sha']))
        assert pub[rid]<early<=g['day']<available
        final[mid]=g
    return dict(sources=dict(hltvy=sha(args.hltvy),ektarr=sha(args.ektarr),deduplicatedSeries=sha(elo_file),
                releases=sha(ROOT/'tail_calibration/training-releases.json')),scanned=scanned,rejected=reject,series=final)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    for key in ('hltvy','ektarr','ranks'):ap.add_argument('--'+key,type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    a=ap.parse_args();out=extract(a);store(HERE/'bo5-maps.json.gz',out,a.check)
    print(out['scanned'],out['rejected'],len(out['series']),'verified BO5',sum(len(g['maps']) for g in out['series'].values()),'maps')
