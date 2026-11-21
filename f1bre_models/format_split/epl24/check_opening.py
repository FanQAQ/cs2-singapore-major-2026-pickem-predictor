"""Audit only the eight opening pairings and their ten starters against the frozen field."""
import argparse
import json
from pathlib import Path
from rosters import ALIASES, CUTOFF, EKTARR, EKTARR_SHA, HERE, ledger, save, sha, side_five

STATS = 'https://www.hltv.org/stats/matches/131551/g2-vs-natus-vincere'
SUPPLEMENT = {
    'G2': ['NertZ','HeavyGod','MATYS','r1nkle','huNter-'],
    'Natus Vincere': ['b1t','Aleksib','iM','w0nderful','makazze'],
}


def audit(ektarr):
    file=HERE/'field.json'
    f=json.loads(file.read_bytes())
    scheduled={frozenset(p) for p in f['firstRound']}
    prescribed={t['name']:set(t['roster']) for t in f['teams']}
    games=[]
    for r in ledger(ektarr):
        if r['is_total']!='True' or r['tournament']!='ESL Pro League Season 24' or r['datetime'][:10]!=CUTOFF:
            continue
        teams=[ALIASES.get(r['team'+str(s)],r['team'+str(s)]) for s in (1,2)]
        assert frozenset(teams) in scheduled
        scheduled.remove(frozenset(teams))
        evidence=[]
        for side,team in enumerate(teams,1):
            players=side_five(r,side,team)
            if players is None:
                assert r['match_id']=='7310519' and team in SUPPLEMENT
                roster=sorted(n.casefold() for n in SUPPLEMENT[team])
                source=STATS
            else:
                roster=sorted(p['handle'] for p in players)
                source=EKTARR
            assert set(roster)==prescribed[team],(team,roster,prescribed[team])
            evidence.append(dict(team=team,actualFive=roster,source=source))
        games.append(dict(seriesId=r['match_id'],date=CUTOFF,sides=evidence))
    assert not scheduled and len(games)==8
    return dict(fieldSHA256=sha(file),sourceSHA256=EKTARR_SHA,coverage=16,
                openers=sorted(games,key=lambda g:int(g['seriesId'])))


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('ektarr',type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(HERE/'opening-audit.json',audit(args.ektarr),args.check)
