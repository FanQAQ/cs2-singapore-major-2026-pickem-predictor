"""Build the score-side ledger after locking the predictions."""
import argparse
import json
from pathlib import Path
from field import HERE, NICK, sha, save
from f1bre_models.format_split.epl24.rosters import ALIASES, EKTARR, EKTARR_SHA, ledger, side_five

CLUB={**ALIASES,'The Mongolz':'The MongolZ','DENDELE CS':'DENDELE','Nemiga Gaming':'Nemiga',
      'Team Liquid':'Liquid','FUT Esports':'FUT'}


def extract(ektarr):
    locks={n:sha(HERE/n) for n in ('matrices.json','cards.json')}
    teams=json.loads((HERE/'field.json').read_bytes())['teams']
    names=[t['name'] for t in teams]
    games=[r for r in ledger(ektarr) if r['tournament']=='PGL Masters Bucharest 2026' and r['is_total']=='True'
           and '2026-10-24'<=r['datetime'][:10]<='2026-10-28']
    assert len(games)==len({g['match_id'] for g in games})==33
    rounds=[[] for _ in range(5)]
    played=[0]*16
    for r in sorted(games,key=lambda r:(r['datetime'],r['match_id'])):
        a,b=[names.index(CLUB.get(r[k],r[k])) for k in ('team1','team2')]
        round_no=played[a]
        assert round_no==played[b] and 0<=round_no<=4
        aa,bb=map(int,(r['score1_match'],r['score2_match']))
        assert r['bestOf']=='3' and max(aa,bb)==2 and min(aa,bb) in (0,1)
        played[a]+=1
        played[b]+=1
        sides=[]
        for side,idx in enumerate((a,b),1):
            players=side_five(r,side,names[idx])
            roster=[NICK.get(p['handle'],p['handle']) for p in players] if players else []
            if names[idx]=='Nemiga':
                roster=['kair0n-' if p=='kair0n' else p for p in roster]
            assert len(set(roster))==5
            sides.append(dict(team=names[idx],score=(aa,bb)[side-1],roster=roster,
                              shared=len(set(roster)&set(teams[idx]['roster'])) if roster else None))
        rounds[round_no].append(dict(id=r['match_id'],day=r['datetime'][:10],w=a if aa>bb else b,l=b if aa>bb else a,sides=sides))
    assert [len(r) for r in rounds]==[8,8,8,6,3]
    changes=[(g['day'],side) for rr in rounds for g in rr for side in g['sides'] if side['shared']!=5]
    assert [d for d,_ in changes]==['2026-10-26','2026-10-27']
    assert all(s['team']=='TYLOO' and s['shared']==4 and 'zhoking' in s['roster'] for _,s in changes)
    return dict(locks=locks,source=EKTARR,sourceSHA256=EKTARR_SHA,rounds=rounds)


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('ektarr',type=Path)
    ap.add_argument('--check',action='store_true')
    a=ap.parse_args()
    save(HERE/'actual.json',extract(a.ektarr),a.check)
