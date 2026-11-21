"""Prepare the seeding snapshot and the documented Legacy substitution before scoring."""
import argparse
import hashlib
import json
from pathlib import Path

SEEDS = ['Spirit', 'Vitality', 'Falcons', 'MOUZ', 'Legacy', 'FURIA', 'Aurora', 'G2',
         'Natus Vincere', '9z', 'BETBOOM', 'PARIVISION', 'M80', 'TYLOO', '1win', 'ShindeN']
BASE = 'https://raw.githubusercontent.com/ValveSoftware/counter-strike_regional_standings/main/'
SOURCE = BASE + 'invitation/2026/standings_global_2026_09_07.md'
SHA = 'bc9553bcd9c3420f3279307fdca654d25f363d38e2c51a32b452c8c0e72e4f46'


def build(data):
    assert hashlib.sha256(data).hexdigest() == SHA
    entries = {}
    for line in data.decode().splitlines():
        fields = [col.strip() for col in line.strip('|').split('|')]
        if len(fields) < 4 or not fields[0].isdigit() or fields[2] not in SEEDS:
            continue
        rank, points, team, roster = fields[:4]
        five = roster.split(', ')
        assert len(set(five)) == 5 and team not in entries
        entry = dict(team=team, seed=SEEDS.index(team)+1, globalRank=int(rank),
                     vrsPoints=int(points), vrsFive=five)
        if team == 'Legacy':
            assert 'arT' in five
            entry['announcedFive'] = ['bobz' if p == 'arT' else p for p in five]
            entry['substitutionSource'] = 'https://www.hltv.org/news/45582/art-out-of-esl-pro-league-s24-with-meningitis'
        entries[team] = entry
    assert set(entries) == set(SEEDS)
    return dict(id='epl24-katowice', start='2026-10-03', allBo3=True,
                rankDate='2026-09-07', vrsSource=SOURCE, vrsSHA256=SHA,
                seedSource='https://x.com/ESLCS/status/2103492344561491999',
                seedReport='https://www.hltv.org/news/45575/esl-pro-league-24-seeding-revealed',
                teams=[entries[t] for t in SEEDS], firstRound=list(zip(SEEDS[:8], reversed(SEEDS[8:]))))


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('vrs', type=Path)
    parser.add_argument('--check', action='store_true')
    args=parser.parse_args()
    out=Path(__file__).with_name('seeding.json')
    serialized=json.dumps(build(args.vrs.read_bytes()),ensure_ascii=False,indent=2)+'\n'
    if args.check:
        assert out.read_bytes()==serialized.encode()
    else:
        out.write_bytes(serialized.encode())
