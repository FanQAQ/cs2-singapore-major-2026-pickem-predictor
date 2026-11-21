"""Rebuild the Cluj 2025 field exclusively from pre-opening schedule and player evidence."""
import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from latent_form.bucharest import read_ranks
from map_veto_data.extract_archive import ARCHIVE_URL, SHA256, key, normalize
from round_form.epl22_inputs import ranking, utc_day
from veto_ml.astana import POOL, rank_reference

START = '2025-02-14'
DRAW = 'https://x.com/pglesports/status/1888886605022114084'
PREVIEW = 'https://www.hltv.org/news/40977/pgl-cluj-napoca-2025-teams-format-schedule-prizes-talent-fantasy'
ANNOUNCED = [
    'The MongolZ', 'FaZe', 'MOUZ', 'Falcons', 'paiN', 'MIBR', '3DMAX', 'Eternal Fire',
    'Complexity', 'SAW', 'BIG', 'FlyQuest', 'Astralis', 'Wildcard', 'Virtus.pro', 'Imperial Valkyries',
]
OPENING = [('MOUZ','BIG'), ('3DMAX','Virtus.pro'), ('FaZe','SAW'), ('Falcons','FlyQuest'),
           ('The MongolZ','Complexity'), ('MIBR','Wildcard'), ('paiN','Astralis'),
           ('Eternal Fire','Imperial Valkyries')]
CHANGES = {
    'MOUZ': dict(day='2025-02-10',outgoing='xelex',incoming='Spinx',
                 source='https://www.hltv.org/news/40967/pgl-cluj-napoca-schedule-announced',
                 signing='https://www.hltv.org/news/40821/mouz-confirm-spinx-signing'),
    'Virtus.pro': dict(day='2025-02-12',outgoing='mir',incoming='FL4MUS',source=PREVIEW),
    'Imperial Valkyries': dict(day='2025-02-12',outgoing='bubble',incoming='tory',source=PREVIEW,
                  katowiceOnly='https://www.hltv.org/news/40855/tory-to-miss-iem-katowice-play-in'),
}


def build(archive, rank_file, invite_file):
    raw = archive.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == SHA256
    witnesses = {}
    before = [r for r in json.loads(gzip.decompress(raw)) if '2025-01-01' <= utc_day(r) < START]
    for record in sorted(before, key=lambda r:(r['date'], r['match-id'])):
        if not {record['team1'],record['team2']} & set(ANNOUNCED):
            continue
        assert record.get('event') != 'PGL Cluj-Napoca 2025'
        g = normalize(record)
        if not g:
            continue
        for side in ('A', 'B'):
            team, five = g[side.lower()], g['lineup'+side]
            if team in ANNOUNCED and five:
                assert len({key(p) for p in five}) == 5
                witnesses[team] = dict(id=g['mid'],day=g['day'],event=record['event'],url=g['url'],
                                       roster=five)
    assert set(witnesses) == set(ANNOUNCED)
    guide = json.loads((HERE/'field-guide.json').read_bytes())
    assert guide['source'] == PREVIEW and guide['publishedDay'] < START and set(guide['teams']) == set(ANNOUNCED)
    releases = json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    latest = max((r for r in releases if r['published'][:10] < START), key=lambda r:r['published'])
    invite, = [r for r in releases if r['rankDay'] == '2025-01-06']
    assert latest['rankDay'] == '2025-02-03'
    ranks, seeds = read_ranks(latest,rank_file), read_ranks(invite,invite_file)
    teams = []
    for name in ANNOUNCED:
        witness = witnesses[name]
        five = set(witness['roster'])
        change = CHANGES.get(name)
        if change:
            assert witness['day'] <= change['day'] < START
            five.remove(change['outgoing'])
            five.add(change['incoming'])
        five = sorted(five, key=key)
        assert set(map(key, five)) == set(map(key, guide['teams'][name])), name
        rank, seed = ranking(five,ranks), ranking(five,seeds)
        teams.append(dict(name=name,roster=five,points=rank['points'],rank=rank['rank'],
                          vrsRoster=rank['roster'],overlap=rank['overlap'],ratingTeam=rank['name'],
                          seedRank=seed['rank'],seedPoints=seed['points'],seedRoster=seed['roster'],
                          seedOverlap=seed['overlap'],seedRatingTeam=seed['name'],
                          rosterWitness=witness,change=change))
    teams.sort(key=lambda t:t['seedRank'])
    for i,t in enumerate(teams,1):
        t['seed']=i
    assert len({key(p) for t in teams for p in t['roster']}) == 80
    assert all(len({t[k] for t in teams}) == 16 for k in ('rank','seedRank','name'))
    names = [t['name'] for t in teams]
    assert names == ANNOUNCED
    assert {frozenset(p) for p in OPENING} == {frozenset((names[i],names[i+8])) for i in range(8)}
    stamp = (int(DRAW.rsplit('/',1)[1]) >> 22) + 1288834974657
    draw_time = datetime.fromtimestamp(stamp/1000,timezone.utc).isoformat(timespec='milliseconds')
    return dict(id='cluj-2025',label='PGL Cluj-Napoca 2025 Swiss',start=START,cutoffExclusive=START,
                end='2025-02-18',allBo3=True,groupStructure='single_field',entrants=names,teams=teams,
                pool=POOL,seedOrder=list(range(16)),openingPairs=OPENING,openingSource=DRAW,
                drawPublishedAt=draw_time.replace('+00:00','Z'),
                seedOrderSource='https://www.youtube.com/watch?v=ZZ9dyU0zQIw',
                fivePlayerGuide=PREVIEW,
                openingCorroboration='https://www.hltv.org/news/40967/pgl-cluj-napoca-schedule-announced',
                invitedSource='https://x.com/pglesports/status/1884164618484137986',
                withdrawal=dict(day='2025-02-04',outgoing='FURIA',incoming='Imperial Valkyries',
                      source='https://www.hltv.org/news/40922/imperial-fe-to-step-in-as-furia-withdraw-from-pgl-cluj-napoca'),
                announcedFutureChange=dict(team='SAW',day='2025-02-13',outgoing=['roman','Shr'],
                      effective='after PGL Cluj-Napoca 2025',source='https://saw.gg/comunicado-fim-de-um-ciclo-nos-saw/'),
                rankSnapshot=rank_reference(latest),seedSnapshot=rank_reference(invite),
                invitedViaVrs=16,openQualifierTeams=0,formatSource=PREVIEW,
                archiveSource=ARCHIVE_URL,archiveSha256=SHA256)


if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for param in ('archive','ranks','invite'):
        p.add_argument(param,type=Path)
    p.add_argument('--write',action='store_true')
    args=p.parse_args()
    data=(json.dumps(build(args.archive,args.ranks,args.invite),ensure_ascii=False,indent=2)+'\n').encode()
    target=HERE/'field.json'
    if args.write:
        target.write_bytes(data)
    else:
        assert data==target.read_bytes(), 'Rebuilt field differs from field.json'
