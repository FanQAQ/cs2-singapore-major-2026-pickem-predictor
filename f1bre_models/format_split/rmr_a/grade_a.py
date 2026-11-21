"""Check the locked RMR A matrix against the five played Swiss rounds."""
import argparse
import json
import re
import sys
from pathlib import Path

from field_a import EVENT,HERE,START,dated_records,save,sha
from f1bre_models import elo_inputs
sys.path.insert(0,str(HERE.parent))
from grade import evaluate


def verify(archive,check):
    lock=(HERE/'LOCK.sha256').read_text().split()[0]
    assert sha(HERE/'odds.json')==lock
    odds=json.loads((HERE/'odds.json').read_bytes())
    field=json.loads((HERE/'field.json').read_bytes())
    assert odds['teams']==[t['name'] for t in field['teams']]
    expected={t['name']:elo_inputs.source.roster(t['roster'],t['name']) for t in field['teams']}
    if archive:
        assert sha(archive)==odds['archive']
        games=[]
        for day,raw in dated_records(archive,START,'2024-11-20'):
            if raw['event']!=EVENT:continue
            g=elo_inputs.hltv_game(raw)
            assert g,raw['url']
            names=[g['a'],g['b']]
            assert [g['fiveA'],g['fiveB']]==[expected[n] for n in names],(raw['url'],names)
            rd=re.match(r'Swiss round ([1-5])',raw['stage'])
            placement=re.match(r'(4th|7th) place decider',raw['stage'])
            assert bool(rd)!=bool(placement)
            wins=sum(a>b for _,a,b in g['maps'])
            games.append(dict(id=raw['match-id'],day=day,round=int(rd[1]) if rd else None,
                              placement=placement[1] if placement else None,teams=names,bo=g['bo'],
                              winner=names[0 if wins>len(g['maps'])/2 else 1],maps=g['maps'],source=raw['url']))
        games.sort(key=lambda g:(g['round'] or 6,g['id']))
        save(HERE/'matches.json',games,check)
    else:
        games=json.loads((HERE/'matches.json').read_bytes())
    assert len(games)==len({g['id'] for g in games})==35
    assert {frozenset(g['teams']) for g in games if g['round']==1}==set(map(frozenset,field['opening']))
    assert [[sum(g['round']==r and g['bo']==b for g in games) for b in (1,3)] for r in range(1,6)]==[[8,0],[8,0],[4,4],[0,6],[0,3]]
    assert {g['placement'] for g in games if g['round'] is None}=={'4th','7th'}
    result=evaluate(games,odds)
    save(HERE/'scores.json',dict(lockedSHA256=lock,**result),check)
    print(result['metrics'])


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--hltvy',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    verify(args.hltvy,args.check)
