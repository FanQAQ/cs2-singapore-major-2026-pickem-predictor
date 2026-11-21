"""Recover original map ML strictly before Cluj 2025; never deserialize later raw scores."""
import argparse
import gzip
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT/'ml_allocation'))
import ml_prepare as prep
import ml_train as train

DAY='2025-02-14'
ID='cluj-2025'
LABEL='PGL Cluj-Napoca 2025'
LAST='2025-02-12'
FIELD=HERE.parent/'field.json'
FIELD_SHA='41812ecd382a980834af8acd861ead038bddfca8d3470269520996fb24d87605'
base=prep.base


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def selected_records(path):
    # The fixed archive is one indented JSON array. First inspect only the
    # top-level date field; all other scalar fields remain opaque bytes.
    assert sha(path)==base.sources.hltvy.SHA256
    start=b'  {\n'; ends=(b'  },\n',b'  }\n')
    date_field=re.compile(rb'^    "date": ([0-9]+),\n$')
    eligible=set();seen=0;dates=0;number=-1
    with gzip.open(path,'rb') as stream:
        for line in stream:
            if line==start:
                number+=1;continue
            if not line.startswith(b'    "date":'):continue
            timestamp=date_field.fullmatch(line)
            assert timestamp
            d=datetime.fromtimestamp(int(timestamp[1])/1000,timezone.utc).date().isoformat()
            dates+=1
            if base.FIRST_CS2<=d<=LAST:eligible.add(number)
    assert dates==number+1 and eligible
    # Deserialize only the date-approved objects. Never pass a raw row on or
    # after this event, or even its immediately preceding day, to a score parser.
    number=-1;buf=None
    with gzip.open(path,'rb') as stream:
        for line in stream:
            if line==start:
                number+=1;buf=[b'{\n'] if number in eligible else None
            elif buf is not None:
                if line in ends:
                    buf.append(b'}'); raw=json.loads(b''.join(buf));buf=None
                    day=datetime.fromtimestamp(raw['date']/1000,timezone.utc).date().isoformat()
                    assert base.FIRST_CS2<=day<=LAST and raw['event']!=LABEL
                    seen+=1
                    yield day,raw
                else:buf.append(line)
    assert seen==len(eligible)


def parsed(archive,dropped,counts):
    for day,r in selected_records(archive):
        counts['dateApprovedRawSeries']+=1
        event=r.get('event','')
        if 'cluj' in event.casefold() and '2026' in event:continue
        if base.sources.EXCLUDE.search(' '.join(str(r.get(k,'')) for k in ('event','stage','format','url'))):continue
        rr=[g for g in r.get('maps',[]) if g.get('status')=='played']
        half=[re.match(r'^\((\d+):(\d+)',g.get('half_scores','')) for g in rr]
        if not all(m and sum(map(int,m.groups()))==12 for m in half):continue
        try:m=base.sources.hltvy.normalize(r)
        except (TypeError,ValueError,OverflowError):continue
        if not m or not m.get('lineupA') or not m.get('lineupB'):continue
        if not all(base.sources.valid_mr12(x,y) for _,x,y in m['maps']):continue
        if event in prep.HOLDOUT_EVENTS:
            dropped[event]+=len(m['maps'])
            continue
        for raw,(mp,x,y) in zip(rr,m['maps']):
            players={base.sources.hltvy.key(raw[s]['name']):raw['players'][s] for s in ('team1','team2')}
            both=[base.players(players[base.sources.hltvy.key(t)],t,x+y,'hltv') for t in (m['a'],m['b'])]
            yield day,0,'hltv:'+str(m['mid']),event,mp,x,y,both


def save(file,data,check):
    raw=(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode()
    if check:assert raw==file.read_bytes(),file
    else:file.write_bytes(raw)


def run(args):
    if args.part!='model':
        if args.hltvy is None or args.ranks is None:raise ValueError('Supply --hltvy and --ranks')
        releases=prep.read(ROOT/'tail_calibration/training-releases.json')
        releases=[r for r in releases if r['published'][:10]<DAY]
        tables=base.sources.release_tables(args.ranks,releases)
        dropped=Counter();counts=Counter()
        h=base.History(parsed(args.hltvy,dropped,counts),tables)
        cutoff=base.ordinal(DAY)
        assert max(g[1] for g in h.games)<=cutoff and max(g[0] for g in h.games)<=base.ordinal(LAST)
        assert all(g[3]!=LABEL and g[3] not in prep.HOLDOUT_EVENTS for g in h.games)
        if args.part in ('training','all'):
            prep.training(h,dropped,args.check,HERE,DAY)
            meta=dict(cutoffExclusive=DAY,latestRawDayAdmitted=LAST,latestRankingPublished=tables[-1]['published'],
                      admittedRawSeries=counts['dateApprovedRawSeries'],supervisedMaps=len(h.games),
                      targetGames=0,eligibleEktarrPeriod=False,sourceSha256=sha(args.hltvy),
                      rankCommits=[t['sha'] for t in tables],excludedElisaMaps=dict(dropped))
            save(HERE/'source.json',meta,args.check)
        if args.part in ('queries','all'):
            assert sha(FIELD)==FIELD_SHA
            f=prep.read(FIELD)
            assert (f['id'],f['start'],f['cutoffExclusive'])==(ID,DAY,DAY)
            assert [r['name'] for r in f['teams']]==f['entrants']
            assert len(set(f['entrants']))==16 and all(len(set(r['roster']))==5 and r['overlap']>=3 for r in f['teams'])
            f.update(targetLabel=LABEL,precedingLabel=None)
            prep.queries(h,args.check,[f],HERE)
    if args.part in ('model','all'):
        assert sha(FIELD)==FIELD_SHA
        f=prep.read(FIELD)
        q=prep.read(HERE/'ml-queries.json')['fields'][ID]
        assert (q['teams'],q['rosters'],q['points'],q['pool'])==(f['entrants'],[r['roster'] for r in f['teams']],
                [r['points'] for r in f['teams']],f['pool'])
        train.run(args.check,1,HERE,[ID])
        with gzip.open(HERE/'ml.json.gz','rt',encoding='utf8') as stream:t=json.load(stream)['fields'][ID]['training']
        assert t['targetStageMapsAvailable']==0 and t['latestAvailability']<=DAY
        print('Historical training and calibration:',t)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for k in ('hltvy','ranks'):p.add_argument('--'+k,type=Path)
    p.add_argument('--part',choices=('training','queries','model','all'),default='all')
    p.add_argument('--check',action='store_true')
    run(p.parse_args())
