"""Reconstruct FISSURE's 16 entries from the announced draw and pre-event evidence."""
import argparse
import gzip
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
from elite_opponents.lineup_probe import FISSURE, FISSURE_INVITES, FISSURE_START
from latent_form.bucharest import read_ranks
from map_veto_data.extract_archive import ARCHIVE_URL, SHA256, key, normalize

ID = 'fissure-playground-2-2025'
GUIDE = 'https://csgo.com/news/132759-fissure-playground-2-viewers-guide/'
DRAW = 'https://www.hltv.org/news/42624/opening-matchups-revealed-for-fissure-playground-2'
# The Sept 11 guide lists skullz for FaZe. Check rain against his pre-event played five.
FIVES = [
    'bLitz Techno Senzu mzinho 910', 'NiKo kyousuke TeSeS m0NESY kyxsan',
    'MAJ3R XANTARES woxic Wicadia jottAAA', 'karrigan rain jcobbb frozen broky',
    'FalleN YEKINDAR yuurih KSCERATO molodoy', 'SunPayus huNter- malbsMd MATYS HeavyGod',
    'REZ ztr Tauson Kursy PR', 'xfl0ud nilo LNZ Alkaren yxngstxr',
    'Maka Lucky bodyy Ex3rcice Graviti', 'tO0RO FL1T fame Perfecto ICY',
    'device HooXi Magisk jabbi Staehr', 'dav1deuS nqz snow dgt biguzera',
    'siuhy NAF NertZ Twistzz ultimate', 'Westmelon z4KR Starry EmiliaQAQ C4LLM3SU3',
    'Attacker JamYoung Jee Mercury Moseyuh', 'dumau latto n1ssim lux saadzin',
]
NEWS = {
    'HEROIC': ('tN1R','xfl0ud','2025-08-12','https://www.hltv.org/news/42425/xfl0ud-returns-to-heroic-starting-roster'),
    'Virtus.pro': ('electroNic','tO0RO','2025-09-01','https://www.hltv.org/news/42582/virtuspro-promote-to0ro-from-vpprodigy'),
    'Astralis': ('stavn','Magisk','2025-09-01','https://www.hltv.org/news/42577/astralis-confirm-magisk-return'),
}


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def save(file, value, check=False):
    raw = (json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n').encode()
    if check:
        assert file.read_bytes() == raw, file
    else:
        file.write_bytes(raw)


def dated_records(archive, first, last):
    """Gate raw top-level objects by date before deserializing match information."""
    assert sha(archive) == SHA256
    date_field = re.compile(rb'^    "date": (\d+),\r?\n$')
    with gzip.open(archive, 'rb') as stream:
        buf = None
        day = None
        for line in stream:
            if line == b'  {\n':
                assert buf is None
                buf, day = [b'{\n'], None
            elif line in (b'  },\n', b'  }\n'):
                assert day is not None
                if buf is not None:
                    yield day, json.loads(b''.join([*buf,b'}']))
                buf = None
            elif buf is not None:
                if line.startswith(b'    "date":'):
                    match = date_field.fullmatch(line)
                    assert match
                    day = datetime.fromtimestamp(int(match[1])/1000,timezone.utc).date().isoformat()
                    if not first <= day <= last:
                        buf = None
                        continue
                buf.append(line)


def build(archive, ranks):
    releases = json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    releases = [r for r in releases if r['published'][:10] < FISSURE_START]
    latest = max(releases, key=lambda r:r['published'])
    assert latest['rankDay']=='2025-09-01'
    invite, = [r for r in releases if r['rankDay']=='2025-07-07']
    def table(r):
        return read_ranks(r,ranks/r['sha']/Path(r['files'][0]['path']).name)
    seeds = [t for t in table(invite) if t['name'] in FISSURE_INVITES]
    assert [t['name'] for t in seeds] == FISSURE_INVITES
    strengths = table(latest)
    recent = {}
    for day,r in dated_records(archive,'2025-08-01','2025-09-11'):
        if not set(FISSURE_INVITES).intersection((r['team1'],r['team2'])):
            continue
        g = normalize(r)
        if not g:
            continue
        for side in 'AB':
            team, five = g[side.lower()], g['lineup'+side]
            stamp = (r['date'],g['mid'])
            if team in FISSURE_INVITES and five and stamp>recent.get(team,((),))[0]:
                recent[team] = (stamp,dict(day=day,roster=five,url=g['url'],id=g['mid']))
    teams = []
    for i, (name, five) in enumerate(zip(FISSURE_INVITES,FIVES)):
        announced = five.split()
        witness = recent[name][1]
        ids = lambda names: {key(p) for p in names}
        actual = ids(witness['roster'])
        extra = {}
        if name in NEWS:
            out,new,published,url = NEWS[name]
            actual.remove(key(out))
            actual.add(key(new))
            extra.update(change=dict(out=out,incoming=new,published=published,url=url))
        if name=='FaZe':
            extra['corroboration'] = 'https://www.hltv.org/news/42548/faze-edge-past-ecstatic-on-quiet-jcobbb-debut'
        assert actual == ids(announced), name
        ranked = [(len(actual & ids(t['roster'])),t) for t in strengths]
        n = max(v for v,_ in ranked)
        rank, = [t for v,t in ranked if v==n]
        assert n>=3 and rank['name'] == name
        teams.append(dict(seed=i+1,name=name,roster=announced,points=rank['points'],
                          rank=rank['rank'],rankRoster=rank['roster'],overlap=n,rosterWitness=witness,**extra))
    assert len({key(p) for t in teams for p in t['roster']}) == 80
    return dict(id=ID,label=FISSURE,start=FISSURE_START,cutoffExclusive=FISSURE_START,
                allBo3=True,pool='Ancient Dust2 Inferno Mirage Nuke Overpass Train'.split(),teams=teams,
                openingPairs=[[seeds[i]['name'],seeds[i+8]['name']] for i in range(8)],
                draw=DRAW,guide=GUIDE,organizer='https://fissure.pro/events/fpg2-cs',
                strengthRelease=latest,inviteRelease=invite,history=ARCHIVE_URL,archiveSHA256=SHA256)


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    for name in ('hltvy','ranks'):
        ap.add_argument('--'+name,required=True,type=Path)
    ap.add_argument('--check',action='store_true')
    args=ap.parse_args()
    save(HERE/'field.json',build(args.hltvy,args.ranks),args.check)
