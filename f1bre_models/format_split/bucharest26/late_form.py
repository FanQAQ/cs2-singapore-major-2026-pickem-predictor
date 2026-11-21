"""Measure which core-matched results became available after the seeding snapshot."""
import argparse
import gzip
import json
from pathlib import Path
from field import HERE, NICK, sha, save, read_ranks
from datajob.build_features import Standings, matched_row
from tail_calibration.training import roster


def collect(archive,ranks,field,release):
    def canon(five,team):
        return roster([{'kair0n':'kair0n-'}.get(n,NICK.get(n,n)) for n in map(str.casefold,five)],team)
    table=read_ranks(release,ranks/release['sha']/Path(release['files'][0]['path']).name)
    entrants=Standings([dict(t,roster=canon(t['roster'],t['name'])) for t in field['teams']])
    rating=Standings([dict(t,roster=canon(t['roster'],t['name'])) for t in table])
    examples=[]
    with gzip.open(archive,'rt',encoding='utf8') as src:
        history=json.load(src)
    for g in history['rows']:
        day=g['day']
        if not release['published'][:10]<day<field['start']:continue
        won=sum(a>b for _,a,b in g['maps'])
        outcome=[won,len(g['maps'])-won]
        assert max(outcome)==g['bo']//2+1 and outcome[0]!=outcome[1]
        sides=[]
        for letter in ('a','b'):
            org=g[letter]
            five=canon(g['five'+letter.upper()],org)
            assert len(set(five))==5
            team=matched_row(entrants,org,five)
            prior=matched_row(rating,org,five)
            sides.append(dict(org=org,five=five,entrant=team['name'] if team else None,
                              points=prior['points'] if prior else None))
        if any(s['entrant'] for s in sides):
            assert sides[0]['entrant']!=sides[1]['entrant']
            examples.append(dict(id=g['id'],date=day,event=g['event'],bo=g['bo'],sides=sides,score=outcome))
    assert len(examples)==len({g['id'] for g in examples})
    summary={}
    for t in field['teams']:
        played=[(g,i) for g in examples for i,s in enumerate(g['sides']) if s['entrant']==t['name']]
        w=sum(g['score'][i]>g['score'][1-i] for g,i in played)
        summary[t['name']]=dict(played=len(played),won=w,opponentsRanked=sum(g['sides'][1-i]['points'] is not None for g,i in played))
    return dict(id=field['id'],ranking=release['sha'],archiveSHA256=sha(archive),sources=history['sources'],fromExclusive=release['published'][:10],
                endExclusive=field['start'],summary=summary,games=sorted(examples,key=lambda g:(g['date'],g['id'])))


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--history',type=Path,default=HERE.parents[1]/'elo-data.json.gz')
    ap.add_argument('--ranks',type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    a=ap.parse_args()
    field=json.loads((HERE/'field.json').read_bytes())
    save(HERE/'late-form.json',collect(a.history,a.ranks,field,field['strengthRelease']),a.check)
