"""Audit the history that actually entered the frozen home model, for all 16 teams."""
import argparse
import csv
import gzip
import json
from datetime import date
from field import HERE, ROOT, save
from strategy_v4.build import lineup

TICKET = 'forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json'
OLD = [
    dict(label='2024 上海 RMR',roster='MAJ3R XANTARES woxic Wicadia Calyx'.split(),
         source='https://www.hltv.org/matches/2377031/eternal-fire-vs-3dmax-perfect-world-shanghai-major-2024-europe-rmr-b'),
    dict(label='2025 年 4 月转入 Aurora',roster='MAJ3R XANTARES woxic Wicadia jottAAA'.split(),
         source='https://www.hltv.org/news/41357/aurora-sign-eternal-fire-roster-in-shock-move'),
]


def read(f):
    return json.loads((ROOT/f).read_bytes())


def build():
    frozen=read(TICKET)
    base=read('strategy_v4/models.json')['singapore']
    published=read('datajob/features.json')['singapore']
    point_rows={t['name']:t for t in read('f1bre_models/major-fields.json')['fields']['singapore']['teams']}
    research=read('f1bre_models/upstream-singapore.json')
    latest=date.fromisoformat(base['asOf'])
    assert base['asOf']==frozen['pointsAsOf']==published['asOf']
    sides=[]
    with gzip.open(ROOT/'strategy_v4/series.csv.gz','rt',encoding='utf8') as stream:
        for g in csv.DictReader(stream):
            if g['event']!='singapore' or not 0<=(latest-date.fromisoformat(g['day'])).days<90:
                continue
            for side in 'AB':
                sides.append((g['id'],g['day'],lineup(g['lineup'+side].split('|')),
                              int(g['winner'])==(side=='A'),bool(g['scores'])))
    audit={}
    for i,t in enumerate(frozen['teams']):
        name=t['team']
        five=lineup(t['roster'])
        ref=point_rows[name]
        source=next(v for v in published['teams'] if v['name']==name)
        assert five==lineup(ref['roster'])==lineup(source['roster'])
        counts=[[0,0],[0,0],[0,0]]
        rounds=0
        accepted=set()
        for match_id,_,roster,won,has_score in sides:
            shared=len(five & roster)
            if shared>=3:
                assert match_id not in accepted
                accepted.add(match_id)
                counts[shared-3][0 if won else 1]+=1
                rounds+=has_score
        stats=base['teams'][name]
        assert len(accepted)==stats['n'] and rounds==stats['nRound']
        assert [sum(g) for g in counts]==[source['coreAudit']['retained'][str(n)] for n in (3,4,5)]
        r=dict(roster=t['roster'],history=counts,roundSeries=rounds,rank=source['rank'],
               points=ref['points'],rankOverlap=len(five & lineup(ref['vrsRoster'])),slot=frozen['card'][i],
               probabilities=frozen['probabilities'][i][:3])
        if name=='Eternal Fire':
            assert counts==[[0,0],[0,1],[24,12]]
            r['older']=[{**g,'shared':sorted(five & lineup(g['roster']))} for g in OLD]
            assert [len(x['shared']) for x in r['older']]==[0,1]
            r['f1bre']={}
            for method,cards in research['methods'].items():
                card=next(c for c in cards if c['rank']==1)
                assert card['complete']
                r['f1bre'][method]=next((c for c in ('perfect','advance','zero') if name in card[c]),'outside')
        audit[name]=r
    assert len(audit)==16
    return dict(asOf=base['asOf'],rosterAsOf=frozen['startingFiveAsOf'],field=read('stage_goals/singapore-schedule.json')['sources']['rosters']['url'],
                standings=published['source'],externalSource=research['source'],teams=audit,
                forecast='forecasts/'+TICKET.split('/')[-1])


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check',action='store_true')
    save(HERE/'singapore.json',build(),ap.parse_args().check)
