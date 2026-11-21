"""Summarize the fixed search, validate cards and pair the untouched Singapore audit."""
import argparse
import json
import math
import subprocess
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
HISTORY = ['copenhagen', 'shanghai', 'austin', 'budapest', 'cologne']


def picks(row):
    methods = row['results']
    out = {'released': methods['released'], 'local': methods['local']}
    for key in ('all', 'limited'):
        if key in methods:
            policy = methods[key]
            out[key+'First'] = policy['top'][0]
            out[key+'Rechecked'] = policy['top'][policy['selected']]
    for card in out.values():
        assert [card['card'].count(i) for i in range(4)] == [2, 6, 2, 6]
    return out


def aggregate(scores):
    return {'passes': sum(s >= 5 for s in scores), 'hits': sum(scores)}


def historic(rows):
    fixed = {row['id']: row for row in rows if row['index'] == 0}
    fixed_scores = {
        method: [picks(fixed[event])[method]['hits'] for event in HISTORY]
        for method in picks(fixed[HISTORY[0]])}
    grouped = {}
    for row in rows:
        grouped.setdefault(row['index'], {})[row['id']] = row
    assert all(set(events) == set(HISTORY) for events in grouped.values())
    assert all(len({r['seed'] for r in events.values()}) == 1 for events in grouped.values())
    seeds = []
    for index, events in sorted(grouped.items()):
        seed = events[HISTORY[0]]['seed']
        methods = {name: aggregate([picks(events[e])[name]['hits'] for e in HISTORY])
                   for name in ('released', 'local', 'limitedFirst', 'limitedRechecked')}
        seeds.append({'index': index, 'seed': seed, 'methods': methods})
    return {'events': HISTORY, 'fixedHits': fixed_scores, 'fixedTotals': {
        method: aggregate(scores) for method, scores in fixed_scores.items()}, 'pairedSeeds': seeds}


def singapore(row):
    with tempfile.TemporaryDirectory() as folder:
        subprocess.run(['node', str(HERE/'samples.cjs'), folder, '1', 'singapore'], check=True)
        root = Path(folder)
        manifest = json.loads((root/'manifest.json').read_text())[0]
        data = np.fromfile(root/manifest['files']['confirm'], np.uint16).reshape(-1, 3)
    n = len(data)
    methods = picks(row)
    def passes(card):
        scores = np.zeros(n, dtype=int)
        for t, c in enumerate(card):
            if c < 3:
                scores += (data[:,c] >> t) & 1
        return scores >= 5
    original = passes(methods['released']['card'])
    signed = {}
    for method, item in methods.items():
        hits = passes(item['card'])
        assert int(hits.sum()) == item['counts']['confirm']
        gain, loss = int((hits & ~original).sum()), int((~hits & original).sum())
        delta = (gain - loss) / n
        se = math.sqrt(((gain+loss)/n-delta**2)/(n-1))
        signed[method] = {'counts': item['counts'], 'gainPaths': gain, 'lossPaths': loss,
                          'ppDelta': round(delta*100, 5),
                          'ppMonteCarlo95': [round((delta+z*se)*100, 5) for z in (-1.96, 1.96)],
                          'teamGroups': [[t for t,c in zip(row['teams'],item['card']) if c==g] for g in range(3)]}
    return signed


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    report = json.loads((HERE/'report.json').read_text(encoding='utf8'))
    rows = report['rows']
    output = {'asOf': '2026-11-21', 'searchPaths': report['searchN'], 'selectionPaths': report['selectionN'],
              'auditPaths': report['auditN'], 'singaporeConfirmPaths': report['singaporeConfirmN'],
              'historical': historic([r for r in rows if r['id'] in HISTORY]),
              'singapore': singapore(next(r for r in rows if r['id'] == 'singapore'))}
    text = json.dumps(output, ensure_ascii=False, separators=(',', ':'))+'\n'
    filename = HERE/'summary.json'
    if args.check:
        assert text == filename.read_text(encoding='utf8')
    else:
        filename.write_bytes(text.encode('utf8'))
