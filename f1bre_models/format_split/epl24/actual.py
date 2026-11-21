"""Score-side inputs only. Extract the five October Swiss rounds after the forecasts are locked."""
import argparse
import json
from pathlib import Path
from rosters import HERE, ALIASES, EKTARR, EKTARR_SHA, ledger, save, sha, side_five
from check_opening import STATS, SUPPLEMENT


def extract(ektarr):
    locks={name:sha(HERE/name) for name in ('matrices.json','recommended-cards.json','mapML-cards.json')}
    teams=json.loads((HERE/'field.json').read_bytes())['teams']
    names=[t['name'] for t in teams]
    scheduled=[r for r in ledger(ektarr) if r['is_total']=='True' and
               r['tournament']=='ESL Pro League Season 24' and '2026-10-03'<=r['datetime'][:10]<='2026-10-07']
    assert len({r['match_id'] for r in scheduled})==len(scheduled)==33
    games,counts=[],[0]*16
    rounds=[[] for _ in range(5)]
    ids=[[] for _ in rounds]
    for r in sorted(scheduled,key=lambda r:(r['datetime'],r['match_id'])):
        a,b=[names.index(ALIASES.get(r[k],r[k])) for k in ('team1','team2')]
        n=counts[a]
        assert n==counts[b] and n<5
        aa,bb=map(int,(r['score1_match'],r['score2_match']))
        assert max(aa,bb)==2 and min(aa,bb) in (0,1)
        rounds[n].append([a,b,bb] if aa>bb else [b,a,aa])
        ids[n].append(r['match_id'])
        counts[a]+=1
        counts[b]+=1
        evidence=[]
        for side,t in enumerate((a,b),1):
            players=side_five(r,side,names[t])
            handles=sorted(p['handle'] for p in players) if players else None
            source=EKTARR if handles else None
            if not handles and r['match_id']=='7310519':
                handles=sorted(n.casefold() for n in SUPPLEMENT[names[t]])
                source=STATS
            evidence.append(dict(team=names[t],handles=handles,source=source,
                                 shared=len(set(handles)&set(teams[t]['roster'])) if handles else None))
        games.append(dict(id=r['match_id'],datetime=r['datetime'],sides=evidence))
    return dict(locks=locks,source=EKTARR,sourceSHA256=EKTARR_SHA,rounds=rounds,matchIds=ids,games=games)


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('ektarr',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(HERE/'actual.json',extract(args.ektarr),args.check)
