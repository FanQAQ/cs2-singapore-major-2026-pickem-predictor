"""Compare frozen pre-match play styles, using VRS odds as the strength offset."""
import argparse
import csv
import gzip
import json
import math
import unicodedata
from collections import defaultdict
from itertools import combinations
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit
from admission import requirements, recent


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SPLIT = '2026-09-01'
EVENTS = ['copenhagen', 'shanghai', 'austin', 'budapest', 'cologne', 'singapore']
STYLES = ['duel', 'system', 'tempo']
PENALTY = 4.0  # N(0, 0.5^2) on each log-odds coefficient.


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def five(names):
    players = frozenset(unicodedata.normalize('NFKC', p.strip()).casefold() for p in names)
    if len(players) != 5 or '' in players:
        raise ValueError(f'Incomplete roster: {names}')
    return players


def collect_labels():
    observations = []
    scouts = read(ROOT / 'style_scout/singapore.json')['teams']
    revised = {item['url'] for item in scouts.values()}
    for rows in read(HERE / 'profile_evidence.json').values():
        for name, item in rows.items():
            # The old Cologne BetBoom source describes one series against Vitality.
            required = requirements(name, item)
            if required is None or item['url'] in revised:
                continue
            observations.append((item['date'], five(item['rosterAtSource']), item['profile'], item['url'], required))
    for name, item in scouts.items():
        required = requirements(name, item)
        if required is not None and item['profile'] in STYLES:
            observations.append((item['date'], five(item['roster']), item['profile'], item['url'], required))
    return sorted(set(observations), key=lambda r: (r[0], r[3]))


def scouting_classifier(observations):
    def classify(players, day):
        choices = []
        for stamp, roster, profile, url, required in observations:
            if not recent(stamp, day):
                continue
            overlap = len(roster & players)
            if overlap < 3 or not required <= players:
                continue
            choices.append(((overlap, stamp), profile, url))
        if not choices:
            return None
        best = max(x[0] for x in choices)
        tied = [x for x in choices if x[0] == best]
        return tied[0][1] if len({x[1] for x in tied}) == 1 else None
    return classify


def demo_classifier(cohort):
    profiles = [(five(p['roster']), p['classKey']) for p in cohort['profiles']]
    @lru_cache(None)
    def closest(players):
        scores = [(len(players & core), label) for core, label in profiles]
        top = max(n for n, _ in scores)
        styles = {label for n, label in scores if n == top}
        if top >= 3 and len(styles) == 1:
            label = styles.pop()
            if label in ('earlyContact', 'trade', 'awp'):
                return label
        return None
    return lambda players, day: closest(players) if day > cohort['asOf'] else None


def series_rows(by_lineup=False):
    with gzip.open(ROOT/'strategy_v4/series.csv.gz', 'rt', encoding='utf-8') as stream:
        by_event = defaultdict(list)
        for row in csv.DictReader(stream):
            by_event[row['event']].append(row)
    def key(row):
        if by_lineup:
            teams = frozenset(five(row[k].split('|')) for k in ('lineupA','lineupB'))
            return row['day'], teams
        return row['day']
    covered = set()
    rows = []
    for event in EVENTS:
        rows.extend(r for r in by_event[event] if key(r) not in covered)
        covered.update(key(r) for r in by_event[event])
    return sorted(rows, key=lambda r: (r['day'], r['event'], r['id']))


def measure(y, z):
    if not len(y):
        return None
    return dict(brier=round(float(np.mean((expit(z)-y)**2)), 6),
                logLoss=round(float(np.mean(np.logaddexp(0, z)-y*z)), 6))


def regularized_fit(features, base, y):
    def loss(beta):
        z = base + features@beta
        return (np.logaddexp(0, z).sum() - y@z + PENALTY*(beta@beta)/2,
                features.T@(expit(z)-y) + PENALTY*beta)
    fit = minimize(loss, np.zeros(features.shape[1]), method='BFGS', jac=True)
    if not fit.success:
        raise ValueError(fit.message)
    return fit.x


def evaluate(rows, classify, labels):
    pairs = list(combinations(labels, 2))
    pairs_by_name = {pair: i for i, pair in enumerate(pairs)}
    data = []
    for row in rows:
        day = row['day']
        a, b = (classify(five(row[key].split('|')),day) for key in ('lineupA','lineupB'))
        if a is None or b is None or a == b:
            continue
        if a not in labels or b not in labels:
            raise ValueError('Unrecognized style')
        i, j = labels.index(a), labels.index(b)
        y = int(row['winner'])
        z = float(row['gap']) * math.log(10)/4
        if i > j:
            i, j, y, z = j, i, 1-y, -z
        data.append((row, i, j, y, z))
    n = len(data)
    main = np.zeros((n,len(labels)))
    paired = np.zeros((n,len(pairs)))
    for k, (_, i, j, _, _) in enumerate(data):
        main[k,i], main[k,j] = 1., -1.
        paired[k,pairs_by_name[labels[i],labels[j]]] = 1.
    y = np.asarray([r[3] for r in data],dtype=float)
    z = np.asarray([r[4] for r in data],dtype=float)
    train = np.asarray([r[0]['day']<SPLIT for r in data],dtype=bool)
    base_strength = regularized_fit(main[train],z[train],y[train])
    pair_strength = regularized_fit(paired[train],z[train],y[train])
    main_odds = z + main@base_strength
    pair_odds = z + paired@pair_strength
    def summarize(mask):
        return {'n':int(mask.sum()), 'wins':int(y[mask].sum()),
                'expectedWins':round(float(expit(z[mask]).sum()),2),
                'base':measure(y[mask],z[mask]), 'main':measure(y[mask],main_odds[mask]),
                'pair':measure(y[mask],pair_odds[mask])}
    formats = np.array([('unknown' if not row['scores'] else
                         'bo3' if '|' in row['scores'] else 'bo1') for row, *_ in data], dtype=str)
    output = []
    for i, (first,second) in enumerate(pairs):
        has = paired[:,i] == 1
        output.append(dict(first=first,second=second,overall=summarize(has),training=summarize(has & train),
                           test=summarize(has & ~train),
                           evenMatchShiftPP=round(float(100*(expit(pair_strength[i])-.5)),2)))
    return dict(labels=labels, split=SPLIT, n=n, training=summarize(train), test=summarize(~train),
                first=min((r[0]['day'] for r in data),default=None),
                last=max((r[0]['day'] for r in data),default=None), pairs=output,
                testByFormat={fmt:summarize((~train) & (formats == fmt)) for fmt in ('bo1','bo3','unknown')},
                series=[dict(event=r['event'],id=r['id'],day=r['day'],first=labels[i],second=labels[j],
                             firstWon=bool(won),firstExpected=round(float(expit(gap)),6))
                        for r,i,j,won,gap in data])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    rows = series_rows()
    augmented = series_rows(by_lineup=True)
    studies = [('style_pair_report', scouting_classifier(collect_labels()), STYLES),
               ('demo_pair_report', demo_classifier(read(ROOT/'style_stats/cohort.json')), ['earlyContact','trade','awp'])]
    for name, classify, labels in studies:
        report = evaluate(rows, classify, labels)
        sensitivity = evaluate(augmented, classify, labels)
        report['lineupMergeCheck'] = {k:sensitivity[k] for k in ('n','training','test')}
        path = HERE/(name+'.json')
        if args.check:
            assert read(path) == report
        else:
            path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')
        print(name, report['training'], report['test'])


if __name__ == '__main__':
    main()
