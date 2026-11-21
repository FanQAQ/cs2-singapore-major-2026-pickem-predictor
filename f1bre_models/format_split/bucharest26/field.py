"""Rebuild the PGL registered field, late starting lineup and October Swiss seeds."""
import argparse
import html
import json
from pathlib import Path
import re
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT))
from latent_form.bucharest import read_ranks
from lineup_pairs.field import save, sha

START='2026-10-24'
ROSTERS='https://news.pglesports.com/news/1792407992422-pgl-masters-bucharest-2026-all-16-team-rosters-revealed'
API='https://news.pglesports.com/api/articles/1792407992422'
LATE='https://www.hltv.org/news/45774/pgl-masters-bucharest-teams-format-schedule-prizes-talent-fantasy'
DRAW='https://www.hltv.org/news/45731/opening-matchups-set-for-pgl-masters-bucharest'
SEEDING='https://www.hltv.org/news/43490/pgl-moves-2026-belgrade-event-to-bucharest'
OPEN=[('Aurora','The MongolZ'),('FUT','TYLOO'),('MOUZ','Liquid'),('Spirit','BETBOOM'),
      ('Legacy','Nemiga'),('Vitality','9z'),('FURIA','DENDELE'),('G2','Natus Vincere')]
CLUB={'9z Globant':'9z','Aurora Gaming':'Aurora','BetBoom Team':'BETBOOM','FUT Esports':'FUT',
      'G2 Esports':'G2','Team Liquid':'Liquid','Team Spirit':'Spirit','Team Vitality':'Vitality'}
NICK={'hunter':'hunter-','naf-fly':'naf'}


def make(pgl,cache):
    assert sha(pgl)=='25e2c9065eec34772f4f3d73730c9f14e28ade99d8997516a0d28f41d2dbe9a3'
    article=json.loads(pgl.read_bytes())
    assert article['isPublished'] and article['updatedAt']==article['createdAt'] and article['updatedAt'][:10]<START
    released=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    release,=[r for r in released if r['rankDay']=='2026-10-05']
    assert release['published'][:10]<START
    table=read_ranks(release,cache/release['sha']/Path(release['files'][0]['path']).name)
    signed={}
    for name,raw,coach in re.findall(r'<strong>([^<>]+)</strong><br>([^<>]+)<br>Coach: ([^<>]+)',article['content']):
        club=CLUB.get(name,name)
        signed[club]=(html.unescape(raw).split(', '),html.unescape(coach).strip())
    assert set(signed)=={t for pair in OPEN for t in pair}
    teams=[]
    for team,(players,coach) in signed.items():
        registered=[NICK.get(p.casefold(),p.casefold()) for p in players]
        roster=registered.copy()
        if team=='Vitality':
            roster[roster.index('apex')]='jl'
        rows=[r for r in table if r['name']==team and len(set(roster)&{n.casefold() for n in r['roster']})>=3]
        v,=rows
        teams.append(dict(name=team,registered=players,coach=coach,roster=roster,points=v['points'],
                          globalRank=v['rank'],vrsRoster=v['roster'],shared=len(set(roster)&{p.casefold() for p in v['roster']}),
                          lineupSource=LATE if team=='Vitality' else ROSTERS))
    teams.sort(key=lambda row:row['globalRank'])
    for i,t in enumerate(teams,1):t['seed']=i
    actual_pairs={frozenset((a['name'],b['name'])) for a,b in zip(teams[:8],teams[8:])}
    assert actual_pairs==set(map(frozenset,OPEN))
    assert len({p for t in teams for p in t['roster']})==80
    return dict(id='masters-bucharest-2026',start=START,cutoffExclusive=START,allBo3=True,
                mapPool=['Ancient','Anubis','Cache','Dust2','Inferno','Mirage','Nuke'],
                drawSource=DRAW,seedingSource=SEEDING,rosterSource=ROSTERS,rosterEndpoint=API,
                rosterSHA256=sha(pgl),rosterDate=article['createdAt'],strengthRelease=release,opening=OPEN,teams=teams)


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--article',type=Path,required=True)
    ap.add_argument('--ranks',type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    a=ap.parse_args()
    save(HERE/'field.json',make(a.article,a.ranks),a.check)
