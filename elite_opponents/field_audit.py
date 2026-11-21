"""After matrix lock v2, verify actual Swiss player participation against the frozen field."""
import argparse
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from map_veto_data.extract_archive import ARCHIVE_URL, SHA256, key, normalize


def build(archive):
    lock = json.loads((HERE/'matrices-v2.json').read_bytes())
    field_file = (HERE/'field.json').read_bytes()
    digest = hashlib.sha256(field_file).hexdigest()
    assert lock['forecast']['inputs']['field.json'] == digest
    subprocess.run(['node',str(HERE/'lock.cjs')],cwd=HERE.parent,check=True,capture_output=True)
    field = json.loads(field_file)
    teams = {t['name']:t['roster'] for t in field['teams']}
    raw = archive.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == SHA256
    seen = set()
    ledger = []
    for record in json.loads(gzip.decompress(raw)):
        if record.get('event') != 'PGL Cluj-Napoca 2025':
            continue
        rd = re.search(r'Swiss round ([1-5])',record.get('stage',''))
        if not rd:
            continue
        game = normalize(record)
        assert game and game['bo'] == 3 and game['mid'] not in seen
        seen.add(game['mid'])
        assert field['start'] <= game['day'] <= field['end']
        sides = []
        for side in 'AB':
            name = game[side.lower()]
            five = game['lineup'+side]
            actual = {key(p) for p in five}
            assert len(actual) == 5
            expected = {key(p) for p in teams[name]}
            sides.append(dict(team=name,actualFive=five,overlap=len(expected & actual),
                              incoming=sorted(actual-expected),outgoing=sorted(expected-actual)))
        ledger.append(dict(id=game['mid'],day=game['day'],round=int(rd[1]),mapCount=len(game['maps']),
                           teams=sides,source=game['url']))
    ledger.sort(key=lambda m:(m['round'],m['id']))
    counts = Counter(m['round'] for m in ledger)
    assert [counts[r] for r in range(1,6)] == [8,8,8,6,3]
    assert {s['team'] for m in ledger if m['round']==1 for s in m['teams']} == set(teams)
    overlaps = Counter(s['overlap'] for m in ledger for s in m['teams'])
    return dict(id=field['id'],fieldSha256=digest,matrixLockSha256=lock['sha256'],source=ARCHIVE_URL,
                sourceSha256=SHA256,matchCount=len(ledger),mapCount=sum(m['mapCount'] for m in ledger),
                sidesByOverlap=dict(sorted(overlaps.items())),rounds=[counts[r] for r in range(1,6)],
                matches=ledger)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('archive',type=Path)
    p.add_argument('--write',action='store_true')
    args=p.parse_args()
    doc=(json.dumps(build(args.archive),ensure_ascii=False,indent=2)+'\n').encode()
    target=HERE/'field-actual.json'
    if args.write:
        target.write_bytes(doc)
    else:
        assert target.read_bytes()==doc
