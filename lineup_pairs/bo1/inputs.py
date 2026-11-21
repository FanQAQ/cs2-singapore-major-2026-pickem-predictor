"""Rebuild the RMR field from pre-opening rosters, draw and pinned Valve publications."""
import argparse
import json
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent
sys.path.insert(0,str(DIR.parent))
from field import dated_records, key, normalize, save, sha
from latent_form.bucharest import read_ranks

ID = 'shanghai-2024-europe-rmr-b'
EVENT = 'Perfect World Shanghai Major 2024 Europe RMR B'
START = '2024-11-21'
SEEDS = ('G2|Spirit|Eternal Fire|Virtus.pro|HEROIC|Astralis|BIG|3DMAX|Ninjas in Pyjamas|'
         'B8|Aurora|Passion UA|PARIVISION|9 Pandas|Sashi|TSM').split('|')
POOL = 'Ancient Anubis Dust2 Inferno Mirage Nuke Vertigo'.split()
REPO = 'https://github.com/ValveSoftware/counter-strike_regional_standings/blob/'
SEED_FILE = dict(sha='81a4bcd9cd775715530400b85bfa6dfef4dafc5a',published='2024-10-15T16:48:11Z',
    path='live/2024/standings_europe_2024_10_15.md',sha256='0861c8e3d864e1138f7ccb7270d621ace84fe31d8a52b51a6121742c801bc240')
POINT_FILE = dict(sha='9a0c127dc05a3f91a308a28995db6a58494e0889',published='2024-11-13T20:27:00Z',
    path='live/2024/standings_global_2024_11_13.md',sha256='4ee876c96e5083f83de4f6199fc97cf5306be3aea78633fdc76a591e6f9b6d49')
DRAW = 'https://www.hltv.org/news/40068/perfect-world-confirm-opening-rmr-matchups'
ROSTERS = 'https://www.hltv.org/news/40041/pw-shanghai-major-rmr-rosters-revealed'
ASTRALIS = 'https://www.hltv.org/news/40273/br0-to-play-for-astralis-in-shanghai-as-device-out-until-2025'
NIP = 'https://www.hltv.org/news/40199/nip-to-field-jocab-at-rmr-as-maxster-remains-on-injured-list'
PROFILES = {('G2','niko'):3741, ('TSM','niko'):10264,
            ('3DMAX','lucky'):13497, ('Sashi','lucky'):13843}


def identities(team, five):
    return {f'hltv:{PROFILES[team,key(p)]}' if (team,key(p)) in PROFILES else key(p) for p in five}


def ranking(snapshot,source):
    assert sha(source)==snapshot['sha256'] and snapshot['published'][:10]<START
    return read_ranks({'files':[snapshot]},source)


def field(archive,seed_file,points_file):
    seeds=ranking(SEED_FILE,seed_file)
    points=ranking(POINT_FILE,points_file)
    assert [r['name'] for r in seeds if r['name'] in SEEDS]==SEEDS
    witness={}
    for day,r in dated_records(archive,'2024-10-01','2024-11-20'):
        if not set(SEEDS).intersection([r['team1'],r['team2']]):
            continue
        g=normalize(r)
        if not g:
            continue
        for side in 'AB':
            name,roster=g[side.lower()],g['lineup'+side]
            if name not in SEEDS or not roster:
                continue
            stamp=r['date'],g['mid']
            if name not in witness or stamp>witness[name][0]:
                witness[name]=(stamp,dict(day=day,id=g['mid'],url=g['url'],roster=roster))
    teams=[]
    for seed,name in enumerate(SEEDS,1):
        prev=witness[name][1]
        five=list(prev['roster'])
        if name=='Astralis':
            five[five.index('device')]='br0'
        norm=identities(name,five)
        matches=[(len(norm & identities(row['name'],row['roster'])),row) for row in points]
        n=max(overlap for overlap,_ in matches)
        ranked,=[r for overlap,r in matches if overlap==n]
        assert n>=3 and ranked['name']==name
        invitation,=[r for r in seeds if r['name']==name]
        teams.append(dict(seed=seed,name=name,roster=five,points=ranked['points'],globalRank=ranked['rank'],
                          vrsRoster=ranked['roster'],overlap=n,octoberEuropeanRank=invitation['rank'],
                          octoberPoints=invitation['points'],witness=prev))
    assert len(set.union(*(identities(t['name'],t['roster']) for t in teams)))==80
    assert 'jocab' in teams[SEEDS.index('Ninjas in Pyjamas')]['roster']
    return dict(id=ID,label=EVENT,start=START,cutoffExclusive=START,pool=POOL,teams=teams,opening=list(zip(SEEDS[:8],SEEDS[8:])),
                seeds=dict(SEED_FILE,url=REPO+SEED_FILE['sha']+'/'+SEED_FILE['path']),
                globalPoints=dict(POINT_FILE,url=REPO+POINT_FILE['sha']+'/'+POINT_FILE['path']),
                draw=DRAW,registration=ROSTERS,standIns={'Astralis':ASTRALIS,'Ninjas in Pyjamas':NIP},
                homonyms={team:'https://www.hltv.org/player/'+str(pid)+'/'+nick for (team,nick),pid in PROFILES.items()})


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    for name in ('hltvy','seeds','points'):
        ap.add_argument('--'+name,type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(DIR/'field.json',field(args.hltvy,args.seeds,args.points),args.check)
