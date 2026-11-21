"""Rebuild the pre-event Astana seed and roster hypotheses from dated Valve tables."""
import argparse
import json
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT))
from latent_form.bucharest import read_ranks
from lineup_pairs.field import key,save

START='2026-05-09'
OPENING=[('PARIVISION','9z'),('FURIA','Monte'),('Aurora','HEROIC'),('Falcons','K27'),
         ('MOUZ','Gentle Mates'),('The MongolZ','magic'),('Spirit','The Huns'),('G2','Fisher College')]
DRAW='https://www.hltv.org/news/44517/karrigan-to-debut-for-falcons-vs-k27-as-pgl-astana-opening-match-ups-revealed'
CHANGES={'MOUZ':({'Brollan','Jimpphat'},['jL','xelex'],'https://www.hltv.org/news/44408/mouz-set-for-major-overhaul-as-xelex-is-promoted-and-jl-joins-on-loan'),
         'Falcons':({'kyxsan'},['karrigan'],DRAW),
         'Fisher College':({'ReFuZR'},['neaLaN'],'https://www.dust2.us/news/72767/fisher-college-announce-nealan-as-stand-in-for-pgl-astana-2026')}

def field(cache):
    releases=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    order=[n for column in zip(*OPENING) for n in column]
    assert len(set(order))==16
    def first_rank(day):
        r,=[r for r in releases if r['rankDay']==day]
        assert r['published'][:10]<START
        file,=r['files']
        ranks=read_ranks(r,cache/r['sha']/Path(file['path']).name)
        first={}
        for t in ranks:
            if t['name'] in order:first.setdefault(t['name'],t)
        return r,first
    sr,seed=first_rank('2026-04-06')
    pr,ranks=first_rank('2026-05-04')
    assert list(seed)==order and set(ranks)==set(order)
    teams=[]
    for i,name in enumerate(order):
        v=ranks[name];roster=v['roster'].copy();source=None
        if name in CHANGES:
            out,inc,source=CHANGES[name]
            assert out<=set(roster)
            roster=[p for p in roster if p not in out]+inc
        overlap=len(set(map(key,roster))&set(map(key,v['roster'])))
        assert len(roster)==5 and overlap>=3
        teams.append(dict(name=name,seed=i+1,roster=roster,points=v['points'],vrsRoster=v['roster'],shared=overlap,
                          lineupSource=source or pr['files'][0]['path']))
    assert len({key(p) for t in teams for p in t['roster']})==80
    return dict(id='astana-2026',start=START,cutoffExclusive=START,allBo3=True,teams=teams,
                drawSource=DRAW,opening=OPENING,seedRelease=sr,strengthRelease=pr,
                seedMethod='April standings reproduce all eight publicly announced pairs; later-round replay pending',
                lineupMethod='May standings and announced substitutions; independently check each starting five before evaluation')

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--ranks',type=Path,required=True);ap.add_argument('--check',action='store_true')
    args=ap.parse_args();save(HERE/'field.json',field(args.ranks),args.check)
