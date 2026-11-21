"""Build the EPL S23 Stage 1 field exclusively from material available before March 1."""
import argparse
import csv
import gzip
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
config = json.loads((HERE / 'inputs-epl23.json').read_text('utf8'))
raw = (ROOT / 'epl_transfer/2026_02_02.md').read_bytes().replace(b'\r\n', b'\n')
blob = hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
assert blob == config['vrs']['blob']
snapshot = []
for line in raw.decode().splitlines():
    if re.match(r'^\|\s*\d+\s*\|', line):
        _, rank, points, name, players, *_ = [x.strip() for x in line.split('|')]
        five = players.split(', ')
        if len(set(p.lower() for p in five)) == 5:
            snapshot.append((name, int(rank), int(points), five))

with gzip.open(ROOT / 'strategy_v4/series.csv.gz', 'rt', encoding='utf8') as csv_file:
    history = {}
    for s in csv.DictReader(csv_file):
        if s['event'] != 'cologne' or s['day'] >= config['start']:
            continue
        for side in ['lineupA', 'lineupB']:
            key = tuple(sorted(s[side].lower().split('|')))
            witness = (s['day'], s['id'])
            if key not in history or history[key] < witness:
                history[key] = witness

teams = []
for i, (name, live, listing) in enumerate(config['entrants']):
    roster = listing.split()
    core = {p.lower() for p in roster}
    matches = sorted(((len(core & {r.lower() for r in past[3]}), past) for past in snapshot), reverse=True)
    n, (vrs_name, rank, points, rating_roster) = matches[0]
    assert n >= 3 and n > matches[1][0], (name, matches[:2])
    sources = []
    if tuple(sorted(core)) in history:
        day, ident = history[tuple(sorted(core))]
        sources.append({'day': day, 'archivedSeriesId': ident})
    if n == 5:
        sources.append({'day': config['vrs']['date'], 'valveRank': rank})
    if name in config['datedRosterEvidence']:
        day, url = config['datedRosterEvidence'][name]
        sources.append({'day': day, 'url': url})
    assert sources and all(s['day'] < config['start'] for s in sources), name
    teams.append(dict(name=name,seed=i+1,roster=roster,points=points,overlap=n,
                      vrsName=vrs_name,vrsRank=rank,vrsRoster=rating_roster,rosterEvidence=sources))

field = {k:config[k] for k in ('id','start','end','cutoff','vrs','seedingDate','seedingSource')}
field.update(allBo3=True,format='online-esl-live-ratings',entrants=[t['name'] for t in teams],
             liveRatings=[t[1] for t in config['entrants']],teams=teams)
encoded = json.dumps(field,ensure_ascii=False,indent=2)+'\n'
dest = HERE / 'field.json'
parser = argparse.ArgumentParser()
parser.add_argument('--write', action='store_true')
if parser.parse_args().write:
    dest.write_text(encoded, encoding='utf8')
else:
    assert json.loads(dest.read_text('utf8')) == field
print('Verified 16 pre-stage starting fives and unique VRS cores:', [t['overlap'] for t in teams])
