"""Reconstruct the Austin Europe MRQ field from invitations, Valve and earlier matches."""
import argparse
import json
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT))
from latent_form.bucharest import read_ranks
from lineup_pairs.field import dated_records,key,normalize,save

ID='austin-europe-mrq-2025'
EVENT='BLAST.tv Austin Major 2025 Europe Regional Qualifier'
START='2025-04-14'
TEAMS='Astralis|GamerLegion|SAW|BC.Game|HEROIC|BIG|500|B8|OG|Nemiga|BetBoom|fnatic|PARIVISION|9 Pandas|ENCE|Metizport'.split('|')
NAMES={key(t):t for t in TEAMS}
INVITES='https://blast.tv/cs/news/blasttv-austin-major-and-mrq-invites'
SCHEDULE='https://www.hltv.org/news/41424/astralis-to-face-og-in-eu-mrq-round-1'
OFFICIAL='https://blast.tv/cs/tournaments/austin-major-2025-mrq-eu'
VALVE='https://github.com/ValveSoftware/counter-strike_regional_standings/blob/'


def build(archive,rank_cache):
    releases=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    current=max((r for r in releases if r['published'][:10]<START),key=lambda r:r['published'])
    assert current['sha']=='548080058dd97a23a13fdfbb02ed8503d46b1dee'
    file,=current['files']
    ranks=read_ranks(current,rank_cache/current['sha']/Path(file['path']).name)
    witness={}
    for day,r in dated_records(archive,'2025-02-01','2025-04-13'):
        if not any(key(r[s]) in NAMES for s in ('team1','team2')):
            continue
        g=normalize(r)
        if not g:
            continue
        for side in 'AB':
            name=NAMES.get(key(g[side.lower()]))
            roster=g['lineup'+side]
            stamp=r['date'],g['mid']
            if name and roster and (name not in witness or stamp>witness[name][0]):
                witness[name]=stamp,dict(day=day,matchId=g['mid'],source=g['url'],roster=roster)
    teams=[]
    for seed,name in enumerate(TEAMS,1):
        prior=witness[name][1]
        five=set(map(key,prior['roster']))
        overlaps=[(len(five&set(map(key,r['roster']))),r) for r in ranks]
        best=max(n for n,_ in overlaps)
        vrs,=[r for n,r in overlaps if n==best]
        assert NAMES[key(vrs['name'])]==name and best==(4 if name=='9 Pandas' else 5)
        others=[r for n,r in overlaps if key(r['name'])==key(name) and r['rank']!=vrs['rank']]
        teams.append(dict(seed=seed,name=name,roster=prior['roster'],points=vrs['points'],rank=vrs['rank'],
                          vrsRoster=vrs['roster'],overlap=best,witness=prior,otherSameName=others))
    assert [t['name'] for t in sorted(teams,key=lambda t:t['rank'])]==TEAMS
    assert len(set().union(*(set(map(key,t['roster'])) for t in teams)))==80
    return dict(id=ID,start=START,cutoffExclusive=START,event=EVENT,allBo3=False,teams=teams,
                pool='Ancient Anubis Dust2 Inferno Mirage Nuke Train'.split(),opening=list(zip(TEAMS[:8],TEAMS[8:])),
                invites=INVITES,schedule=SCHEDULE,organizer=OFFICIAL,ranking={**current,'url':VALVE+current['sha']+'/'+file['path']})


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--hltvy',type=Path,required=True)
    ap.add_argument('--ranks',type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(HERE/'field.json',build(args.hltvy,args.ranks),args.check)
