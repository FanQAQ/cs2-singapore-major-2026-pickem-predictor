"""Count roster overlap in the fixed BO3 population; keep earliest observed full fives separate."""
import argparse
import csv
from datetime import date
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from bo5_history.elite_probe import HOLDOUT, IDS, ago, known, load, same_window
from latent_form.adjacency import AMBIGUOUS, HASHES

FISSURE = 'FISSURE Playground 2'
FISSURE_START = '2025-09-12'
FISSURE_INVITES = ['The MongolZ','Falcons','Aurora','FaZe','FURIA','G2','GamerLegion','HEROIC',
                   '3DMAX','Virtus.pro','Astralis','paiN','Liquid','Lynn Vision','TYLOO','Legacy']
# The 13 original observations which use this first release must not be joined to the next day's revision.
SEPTEMBER_FIRST = 'd007fa190cda39097a3ddd55bb6455adade117a9'
FIRST_EIGHT = [('Spirit',2031),('MOUZ',1902),('Falcons',1881),('FUT',1847),
               ('Vitality',1841),('Legacy',1783),('FURIA',1754),('G2',1723)]

# Hand-checked for the three Singapore entries with no full five in the frozen population.
# The match time is the listed scheduled start. Same-day comments establish public visibility.
PUBLIC_FIVES = {
    'Wildcard': dict(day='2026-09-26',scheduledStartUtc='2026-09-26T17:00:00Z',bo=3,
                     event='iBUYPOWER Masters FML 2026',opponent='NRG',id='hltv:2398291',
                     roster=['HexT','Cxzi','fr3nd','nEMANHA','reck'],publicByDay='2026-09-26',
                     sourceUrl='https://www.hltv.org/matches/2398291/wildcard-vs-nrg-ibuypower-masters-fml-2026',
                     additionalEvidence='https://www.hltv.org/news/45578/nrg-sent-packing-by-wildcard-as-ibuypower-masters-fml-reaches-playoffs'),
    'Chinggis Warriors': dict(day='2026-10-08',scheduledStartUtc='2026-10-08T05:00:00Z',bo=3,
                     event='MESA Pro Series Fall 2026',opponent='5star',id='hltv:2399372',
                     roster=['ROUX','sk0R','fury5k','cool4st','tikuak'],publicByDay='2026-10-08',
                     sourceUrl='https://www.hltv.org/matches/2399372/5star-vs-chinggis-warriors-mesa-pro-series-fall-2026',
                     additionalEvidence='https://www.hltv.org/matches/2399924/5star-vs-chinggis-warriors-mesa-pro-series-halloween-cup-2026'),
}


def check_ektarr(archive):
    assert digest(archive) == HASHES['ektarr']
    nearby = {name:0 for name in PUBLIC_FIVES}
    with archive.open(encoding='utf-8-sig',newline='') as f:
        for r in csv.DictReader(f):
            for name,g in PUBLIC_FIVES.items():
                event,teams,day = r['tournament'].lower(),[r['team1'].lower(),r['team2'].lower()],r['datetime'][:10]
                key = 'ibuypower' if name=='Wildcard' else 'mesa pro series fall'
                if ago(g['day'],2) <= day <= ago(g['day'],-2):
                    nearby[name] += 1
                    assert not any(name.casefold() in t for t in teams) or not any(g['opponent'].casefold() in t for t in teams)
                    assert key not in event
    assert all(nearby.values())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rank_groups(releases, tables, sources):
    result = {}
    for i, release in enumerate(releases):
        day = release['rankDay']
        if day < '2024-08-06':
            continue
        if release['sha'] == SEPTEMBER_FIRST:
            assert release['files'][0]['sha256'] == '201b2165c966fb22791c6a9dfce6708bd2408e9ba2157b8ef818dbe874967eec'
            elite = FIRST_EIGHT
        else:
            if day != '2024-08-06':
                assert sources[day]['global']['sha256'] == release['files'][0]['sha256'], day
            elite = [(name, p) for p, name, _ in tables[day]['global'][:8]]
        groups = {(n.casefold(),p) for n,p in elite}
        assert len(groups) == 8
        result[i] = groups
    return result


def witness(row):
    return {k:row[k] for k in ('day','id','bo','event')}


def scan_field(field, indices, rows, broad, groups):
    cutoff = field['cutoffExclusive']
    teams = field['teams']
    names = [t['name'] for t in teams]
    cores = {frozenset(known(t['roster'],t['name'])):t['name'] for t in teams}
    assert len(cores) == 16 and all(len(core)==5 for core in cores)
    counts = {n:dict(elite=[0,0,0],other=[0,0,0],firstInBO3Window=None,firstObserved=None) for n in names}
    selected = [rows[i] for i in indices if rows[i]['event'] != HOLDOUT]
    for g in sorted(selected,key=lambda r:(r['day'],r['id'])):
        assert g['rankPublished'][:10] < g['earliestUtcDay'] and g['latestUtcDay'] < ago(cutoff,1)
        for side, other in [('A','B'),('B','A')]:
            five = set(g['five'+side]) - AMBIGUOUS
            matches = [(n,len(core & five)) for core,n in cores.items() if len(core & five)>=3]
            assert len(matches) <= 1
            if not matches:
                continue
            name,k = matches[0]
            elite = (g['rankTeam'+other].casefold(),g['points'+other]) in groups[g['release']]
            profile = counts[name]
            profile['elite' if elite else 'other'][k-3] += 1
            if k == 5 and profile['firstInBO3Window'] is None:
                profile['firstInBO3Window'] = witness(g)
    # Wider date/format coverage is solely to distinguish an observed new five from sparse BO3 history.
    # These rows never populate the two opponent groups or expose a future target outcome.
    for g in broad:
        gap = 2 if g['id'].startswith('ektarr:') else 1
        if g['day'] >= ago(cutoff,gap):
            continue
        for side in 'AB':
            n = cores.get(frozenset(g['five'+side])-AMBIGUOUS)
            if n is not None and counts[n]['firstObserved'] is None:
                counts[n]['firstObserved'] = witness(g)
    return dict(start=field['start'],cutoffExclusive=cutoff,windowStart=ago(cutoff,180),
                rawPopulation=len(indices),excludedHoldout=len(indices)-len(selected),teams=counts)


def holdout_schedule(archive, tables):
    assert digest(archive) == HASHES['hltv']
    schedule = []
    july = tables['2025-07-07']['global']
    names = {n.casefold():n for n in FISSURE_INVITES}
    seeds = [names[n.casefold()] for _, n, _ in july if n.casefold() in names]
    assert seeds == FISSURE_INVITES
    rounds = [[] for _ in range(5)]
    for r in json.loads(gzip.decompress(archive.read_bytes())):
        if r.get('event') != FISSURE:
            continue
        m = re.search(r'Swiss round ([1-5])', r.get('stage',''))
        if not m:
            continue
        rd = int(m[1])
        assert r['format'].startswith('Best of 3')
        a,b = seeds.index(r['team1']),seeds.index(r['team2'])
        rounds[rd-1].append([a,b] if r['team1score']==2 else [b,a])
        if rd==1:
            schedule.append(frozenset((a,b)))
    assert set(schedule) == {frozenset((i,i+8)) for i in range(8)}
    js = ("require('./engine/engine.js');let r=CS.replay(JSON.parse(require('fs').readFileSync(0,'utf8')));"
          "require('assert/strict').equal(r.matched,33);console.log(JSON.stringify(r.rounds.map(x=>x.matched)))")
    ret = subprocess.run(['node','-e',js],cwd=ROOT,input=json.dumps(rounds),text=True,capture_output=True,check=True)
    assert json.loads(ret.stdout) == [8,8,8,6,3]


def ml_coverage():
    import numpy as np
    dates = date.fromisoformat(FISSURE_START).toordinal()
    meta = load('ml_allocation/ml-training.json')
    with np.load(ROOT/'ml_allocation/ml-training.npz',allow_pickle=False) as data:
        day,ready,event = data['day'],data['ready'],data['event']
        eligible = (day >= dates-365) & (ready <= dates)
        observed = np.unique(day[eligible])
        split = observed[int(len(observed)*.85)]
        cal = eligible & (day>=split)
        train = eligible & (ready<=split) & ~np.isin(event,np.unique(event[cal]))
        assert not np.intersect1d(data['series'][train],data['series'][cal]).size
        assert all(meta['events'][int(x)]!=FISSURE for x in np.unique(event[eligible]))
        return dict(availableMaps=int(eligible.sum()),treeMaps=int(train.sum()),calibrationMaps=int(cal.sum()),
                    calibrationFirstDay=date.fromordinal(int(day[cal].min())).isoformat(),
                    lastTrainingDay=date.fromordinal(int(day[train].max())).isoformat(),
                    lastAvailableDay=date.fromordinal(int(day[eligible].max())).isoformat())


def build():
    fields = load('f1bre_models/major-fields.json')['fields']
    external = load('elite_opponents/field.json')
    fields = {external['id']:external, **{k:fields[k] for k in (*IDS,'singapore')}}
    source = load('tail_calibration/training.json.gz')
    releases = load('tail_calibration/training-releases.json')
    original = load('elite_opponents/profiles.json')
    tables = load('region_vrs_data/tables.json.gz')
    tables['2024-08-06']['global'] = load('elite_opponents/august-global.json')
    groups = rank_groups(releases,tables,load('region_vrs_data/sources.json'))
    wide = sorted(load('f1bre_models/elo-data.json.gz')['rows'],key=lambda r:(r['day'],r['id']))
    result = {}
    for k,f in fields.items():
        indices = same_window(source['rows'],f['cutoffExclusive'])
        if k in source['targets']:
            assert indices == source['targets'][k]['indices']
        layer = scan_field(f,indices,source['rows'],wide,groups)
        for n,by in layer['teams'].items():
            if k in original:
                for grp in ('elite','other'):
                    assert sum(by[grp]) == original[k]['teams'][n][grp]['n'], (k,n,grp)
        result[k] = layer
    singapore = result['singapore']
    sg_rosters = {t['name']:known(t['roster'],t['name']) for t in fields['singapore']['teams']}
    for name,g in PUBLIC_FIVES.items():
        assert sg_rosters[name] == known(g['roster'],name)
        assert g['day'] <= g['publicByDay'] < singapore['cutoffExclusive']
        assert singapore['teams'][name]['firstObserved'] is None
        singapore['teams'][name]['publicFullFive'] = dict(**g, includedInFrozenBO3=False,
            absence='Fixed Ektarr v11 has no matching pair or event name within two days of the series.')
    nine = singapore['teams']['9z']
    assert nine['firstObserved'] is None
    nine['publicRosterCheck'] = dict(announcementDay='2026-11-07',mostRecentListedMatchDay='2026-11-03',
        firstScheduledAfterChange='2026-11-24',fullFivePublicWitness=None,
        sourceUrl='https://www.hltv.org/news/45940/9z-bench-meyern-add-history-as-major-stand-in',
        fixtureUrl='https://www.hltv.org/team/9996/9z',asOf=singapore['cutoffExclusive'])
    inputs = ['tail_calibration/training.json.gz','tail_calibration/training-releases.json',
              'region_vrs_data/tables.json.gz','elite_opponents/august-global.json',
              'f1bre_models/elo-data.json.gz','elite_opponents/field.json','f1bre_models/major-fields.json']
    return dict(sourceSha256={n:digest(ROOT/n) for n in inputs},coreOrder=[3,4,5],
                fields=result,nextField=dict(id='fissure-playground-2-2025',start=FISSURE_START,
                                              mlAvailability=ml_coverage(),replay=[8,8,8,6,3])), tables


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--check',action='store_true')
    p.add_argument('--archive',type=Path,help='replay FISSURE pairings against the fixed HLTvy source')
    p.add_argument('--ektarr',type=Path,help='verify that the two separately documented Singapore matches are absent in the fixed v11 raw source')
    args=p.parse_args()
    data,tables=build()
    if args.archive:
        holdout_schedule(args.archive,tables)
    if args.ektarr:
        check_ektarr(args.ektarr)
    if not args.check and not (args.archive and args.ektarr):
        p.error('Rebuild requires --archive and --ektarr to verify the independent schedule and match coverage.')
    encoded=(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode()
    output=HERE/'lineup_probe.json'
    if args.check:
        assert output.read_bytes()==encoded
    else:
        output.write_bytes(encoded)
