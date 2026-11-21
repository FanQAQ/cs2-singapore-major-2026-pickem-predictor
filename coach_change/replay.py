"""Same-five descriptive comparison across a documented coaching change."""
import argparse
import csv
import gzip
import json
from datetime import date
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from datajob.build_features import roster_key

TEAM = 'HEROIC'
WINDOWS = [('doto','2026-09-12','2026-09-30'), ('Snappi','2026-10-12','2026-10-30')]
SOURCES = ['https://heroic.gg/atc/the-future-of-heroic',
           'https://heroic.gg/atc/snappi-returns-home-as-head-coach',
           'https://www.hltv.org/news/45602/snappi-takes-over-as-heroic-coach']


def study():
    stages = json.loads((ROOT/'datajob/stage_rosters.json').read_bytes())
    roster = stages['singapore'][TEAM]
    current = roster_key(roster)
    cologne = stages['cologne'][TEAM]
    with gzip.open(ROOT/'strategy_v4/series.csv.gz','rt',encoding='utf-8') as stream:
        rows = [r for r in csv.DictReader(stream) if r['event']=='singapore']
    assert len({r['id'] for r in rows}) == len(rows)
    result = []
    for coach, start, end in WINDOWS:
        assert (date.fromisoformat(end)-date.fromisoformat(start)).days+1 == 19
        games = []
        for r in rows:
            if not start <= r['day'] <= end:
                continue
            sides = [roster_key(r[k].split('|')) for k in ('lineupA','lineupB')]
            if current not in sides:
                continue
            side = sides.index(current)
            gap = (-1 if side else 1)*float(r['gap'])*100
            expected = 1/(1+10**(-gap/400))
            won = 1-int(r['winner']) if side else int(r['winner'])
            games.append(dict(day=r['day'],id=r['id'],opponent=sorted(sides[1-side]),
                              gap=round(gap),won=won,expected=round(expected,8)))
        wins=sum(g['won'] for g in games)
        expected=sum(g['expected'] for g in games)
        result.append(dict(coach=coach,start=start,end=end,n=len(games),wins=wins,
                           expected=round(expected,3),residual=round(wins-expected,3),series=games))
    return dict(team=TEAM,roster=roster,cologneRoster=cologne,coreOverlap=len(roster_key(cologne)&current),
                windows=result,sources=SOURCES,asOf='2026-11-21')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    report=study()
    file=HERE/'report.json'
    if parser.parse_args().check:
        assert report==json.loads(file.read_bytes())
    else:
        file.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    for window in report['windows']:
        print(window['coach'],window['n'],window['wins'],window['expected'],window['residual'])
