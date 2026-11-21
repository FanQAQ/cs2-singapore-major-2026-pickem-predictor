"""Validate the frozen training rows, target windows and release timing, offline."""
import bisect
import gzip
import hashlib
import json
from collections import Counter
from datetime import date,timedelta
from pathlib import Path

HERE=Path(__file__).resolve().parent
RELEASES=json.loads((HERE/'training-releases.json').read_text(encoding='utf8'))


def check():
    path=HERE/'training.json.gz'
    content=path.read_bytes()
    data=json.loads(gzip.decompress(content))
    rows=data['rows']
    assert len(rows)==len({r['id'] for r in rows})==12804
    dates=[r['published'][:10] for r in RELEASES]
    assert len(dates)==44 and dates==sorted(dates)
    source=Counter();overlap=Counter()
    seen={}
    for r in rows:
        d=date.fromisoformat(r['day'])
        assert r['pointsA']>0 and r['pointsB']>0 and r['gap']==r['pointsA']-r['pointsB']
        assert len(set(r['fiveA']))==len(set(r['fiveB']))==5 and not set(r['fiveA'])&set(r['fiveB'])
        assert r['rankTeamA']!=r['rankTeamB'] and r['bo']==3
        assert r['rankPublished'][:10]<r['earliestUtcDay']<=r['day']<=r['latestUtcDay']
        i=bisect.bisect_left(dates,r['earliestUtcDay'])-1
        assert i==r['release'] and r['rankDay']==RELEASES[i]['rankDay'] and r['rankPublished']==RELEASES[i]['published']
        score=sum(a>b for _,a,b in r['maps'])
        assert max(score,len(r['maps'])-score)==2 and r['y']==int(score==2)
        prefix,id=r['id'].split(':')
        source[prefix]+=1
        if prefix=='hltv':
            assert r['day']<='2026-03-23' and r['sourceUrl'].startswith('https://www.hltv.org/matches/'+id+'/')
        else:
            assert prefix=='ektarr' and r['earliestUtcDay']>'2026-03-23'
        for k in ('overlapA','overlapB'):
            assert r[k] in (3,4,5)
            overlap[r[k]]+=1
        first=r['fiveA']<r['fiveB']
        fp=(*sorted((tuple(r['fiveA']),tuple(r['fiveB']))),
            tuple(sorted((m,a,b) if first else (m,b,a) for m,a,b in r['maps'])))
        assert fp not in seen or d-seen[fp]>timedelta(days=1)
        seen[fp]=d
    assert len(data['targets'])==17
    for target in data['targets'].values():
        lo,hi=map(date.fromisoformat,(target['windowStart'],target['cutoffExclusive']))
        assert (hi-lo).days==180
        assert lo<hi<=date.fromisoformat(target['start'])
        expected=[i for i,r in enumerate(rows) if lo<=date.fromisoformat(r['earliestUtcDay'])
                  and date.fromisoformat(r['latestUtcDay'])+timedelta(days=1)<hi]
        assert expected==target['indices'] and len(expected)==target['n']
        assert rows[expected[0]]['day']==target['firstDay'] and rows[expected[-1]]['day']==target['lastDay']
    print('17 verified targets,',source,'BO3; matched players per side:',overlap)
    print(hashlib.sha256(content).hexdigest())


if __name__=='__main__':
    check()
