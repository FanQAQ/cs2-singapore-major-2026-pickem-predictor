"""Build an as-of roster audit using Valve releases and archived pre-stage series."""
import csv
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
field = json.loads((ROOT / 'field.json').read_text())


def standings(name):
    result = {}
    for line in (ROOT / name).read_text(encoding='utf-8').splitlines():
        cols = [column.strip() for column in line.split('|')]
        if len(cols) > 5 and cols[1].isdigit():
            result[cols[3]] = (int(cols[2]), [p.lower() for p in cols[4].split(', ')])
    return result


current = standings('2026_03_02.md')
previous = standings('2026_02_02.md')
with gzip.open(ROOT.parent / 'strategy_v4/series.csv.gz', 'rt', encoding='utf-8') as handle:
    history = [row for row in csv.DictReader(handle)
               if row['event'] == 'cologne' and '2026-02-01' <= row['day'] < field['start']]
history.sort(key=lambda row: (row['day'], int(row['id'])), reverse=True)
teams = []
for name in field['entrants']:
    points, vrs = current[name]
    for row in history:
        sides = [row[k].split('|') for k in ['lineupA', 'lineupB']]
        matches = [s for s in sides if len(set(s)) == 5 and len(set(vrs).intersection(s)) >= 3]
        if matches:
            assert len(matches) == 1
            witness = {'day': row['day'], 'series': row['id']}
            roster = matches[0]
            break
    else:
        raise ValueError(f'No verified pre-stage lineup for {name}')
    core = sorted(set(roster).intersection(vrs))
    if len(vrs) < 5:
        # A four-name Valve row alone is insufficient. Require independent evidence
        # linking the same players on two full, named starting fives before the event.
        february = previous[name][1]
        assert len(set(february)) == 5 and len(set(core).intersection(february)) >= 3
        witness['lastFullVrsRoster'] = february
    assert len(set(roster)) == 5 and len(core) >= 3, name
    teams.append(dict(name=name, points=points, vrsRoster=vrs, roster=roster, core=core, witness=witness))

out = {'cutoff': '2026-03-05T23:59:59Z',
       'commit': '3404a877b6ca513a1f508d6b23d20562c4afcc73',
       'commitTime': '2026-03-02T17:40:13Z', 'teams': teams,
       'sha256': {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
                  for p in ['2026_03_02.md', '2026_02_02.md']}}
(ROOT / 'rosters.json').write_text(json.dumps(out, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
