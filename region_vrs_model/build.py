"""Fit the incremental regional ranking-depth signal using strictly earlier LAN series."""
import argparse
import csv
import gzip
import json
import math
import unicodedata
from datetime import date
from functools import lru_cache
from pathlib import Path
from statistics import median

from scipy.special import expit

from sys import path as import_path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
import_path.insert(0, str(ROOT))
from region_risk import build as lan

UNIT = 400
MAX_GAP = 1.5
MAX_SLOPE = 0.25
PRECISION = 16.0
MIN_TRAIN = 35
MIN_TEST = 30


def names(roster):
    return frozenset(unicodedata.normalize('NFKC', s).strip().casefold() for s in roster)


def other_teams_depth(snapshot, region, roster):
    """Median points of the best ten other sides; a three-player transfer keeps team identity."""
    rows = snapshot.get('regions', {}).get(region, {}).get('top11', [])
    players = names(roster)
    overlaps = [len(players & names(row['roster'])) for row in rows]
    best = max(overlaps, default=0)
    ambiguous = best >= 3 and overlaps.count(best) != 1
    if ambiguous or len(players) != 5:
        return None, None
    self_index = overlaps.index(best) if best >= 3 else None
    other = [row['points'] for i, row in enumerate(rows) if i != self_index][:10]
    if len(other) < 10:
        return None, self_index is not None
    return float(median(other)), self_index is not None and self_index < 10


def depth_gap(left, right):
    return min(MAX_GAP, max(-MAX_GAP, (left - right) / UNIT))


def prior_evidence(corpus, key):
    start = corpus.schedule[key][0]
    earlier = corpus.eligible(start - 1)
    history = [r for e in earlier for r in corpus.events[e]]
    slopes = lan.fit_base(history)
    pairs = lan.fit_pairs(history, slopes)
    return start - 1, slopes, pairs


def matchup_examples(corpus, snapshots):
    """Prequential offsets and depth anchored to the archived VRS date of each match."""
    with gzip.open(ROOT / 'region_risk/evidence.csv.gz', 'rt') as handle:
        ranking_dates = {int(row['id']):row['snapshot'] for row in csv.DictReader(handle)}
    examples = {}
    for key in sorted(corpus.international):
        first_day = corpus.schedule[key][0]
        valid = []
        for r in corpus.events[key]:
            if r.ra == r.rb:
                continue
            stamp = ranking_dates[r.id]
            snapshot = snapshots.get(stamp)
            if not snapshot or not snapshot['officialGlobal'] or lan.numdate(stamp) >= first_day:
                continue
            assert lan.numdate(stamp) < r.day
            left, _ = other_teams_depth(snapshot, r.ra, r.a)
            right, _ = other_teams_depth(snapshot, r.rb, r.b)
            if left is not None and right is not None:
                valid.append((r, left-right))
        if not valid:
            continue
        cut, slopes, pairs = prior_evidence(corpus, key)
        @lru_cache(maxsize=None)
        def shift(roster):
            return lan.profile(corpus, roster, cut, slopes, pairs)['shift']
        batch = []
        for r, gap_points in valid:
            z = slopes[r.bo] * r.gap
            z_lan = None
            if pairs[lan.pair_key(r.ra, r.rb)]['n'] >= 10:
                delta = lan.pair_delta(pairs, r.ra, r.rb) + shift(r.a) - shift(r.b)
                z_lan = z + max(-0.7, min(0.7, delta))
            batch.append(dict(id=r.id, event=key, y=r.y, ra=r.ra, rb=r.rb, gapPoints=gap_points,
                              gap=depth_gap(gap_points,0.),solo=z,withLan=z_lan))
        examples[key] = batch
    return examples


def fit(samples, mode):
    beta = 0.0
    for _ in range(24):
        gradient, curvature = -PRECISION * beta, PRECISION
        for row in samples:
            x = row['gap']
            p = float(expit(row[mode] + x * beta))
            gradient += x * (row['y'] - p)
            curvature += x*x*p*(1-p)
        next_beta = max(-MAX_SLOPE, min(MAX_SLOPE, beta + gradient / curvature))
        if abs(next_beta - beta) < 1e-10:
            return next_beta
        beta = next_beta
    return beta



def signed_evidence(samples, predictions):
    def summary(values):
        size = len(values)
        return dict(n=size, wins=sum(y for y,_,_,_ in values),
                    baseExpectedWins=sum(old for _,old,_,_ in values),
                    adjustedExpectedWins=sum(new for _,_,new,_ in values),
                    meanGapPoints=sum(d for *_,d in values)/size if size else None)
    groups = {region:[] for region in lan.REGS}
    stronger = []
    for row, (_,old,new,y) in zip(samples,predictions):
        pts = row['gapPoints']
        left = (y, old, new, pts)
        right = (1-y, 1-old, 1-new, -pts)
        groups[row['ra']].append(left)
        groups[row['rb']].append(right)
        if pts != 0:
            stronger.append(left if pts > 0 else right)
    return dict(byRegion={k:summary(v) for k,v in groups.items()}, higherDepth=summary(stronger))


def build_variant(learn, holdout, complete, mode, boundary):
    subset = lambda sample: [r for r in sample if r[mode] is not None]
    train, test, final = map(subset, (learn, holdout, complete))
    trial = fit(train, mode)
    final_coefficient = fit(final, mode)
    predictions = [(r['event'], float(expit(r[mode])),
                    float(expit(r[mode] + r['gap']*trial)),r['y']) for r in test]
    validation = lan.gate_group(predictions, len(train), MIN_TEST)
    same_direction = trial*final_coefficient > 0
    validation['passed'] = bool(validation['passed'] and len(train) >= MIN_TRAIN and same_direction)
    validation.update(signed_evidence(test, predictions))
    validation.update(holdoutStart=date.fromordinal(boundary).isoformat() if boundary else None,
                      trainEvents=len({r['event'] for r in train}),sameDirection=same_direction)
    return dict(coefficient=final_coefficient if validation['passed'] else 0.,
                fittedCoefficient=final_coefficient, trialCoefficient=trial, fitN=len(final), validation=validation)


def build_event(corpus, examples, anchor, snapshot):
    cut = lan.numdate(anchor['asOf'])
    competitions = [k for k in corpus.eligible(cut) if k in examples]
    split = len(competitions)*2//3
    test_keys = competitions[split:]
    boundary = corpus.schedule[test_keys[0]][0] if test_keys else None
    train_keys = [k for k in competitions[:split] if corpus.schedule[k][1] < boundary]
    flat = lambda keys: [row for k in keys for row in examples[k]]
    learn, test, all_rows = map(flat, (train_keys, test_keys, competitions))
    variants = {m:build_variant(learn, test, all_rows, m, boundary) for m in ('solo', 'withLan')}
    teams = {}
    for name, v in anchor['teams'].items():
        depth, own = other_teams_depth(snapshot, v['region'], v['roster'])
        teams[name] = dict(roster=v['roster'],region=v['region'],depth=depth,excludedSelf=own)
    return dict(asOf=anchor['asOf'],officialGlobal=snapshot['officialGlobal'],unitPoints=UNIT,
                maxGap=MAX_GAP,windowDays=lan.WINDOW,teams=teams,variants=variants)


def generate():
    snapshots = json.loads((ROOT / 'region_vrs_data/snapshots.json').read_text())
    anchors = json.loads((ROOT / 'region_risk/anchor.json').read_text())
    corpus = lan.Corpus()
    all_examples = matchup_examples(corpus, snapshots)
    return {key:build_event(corpus, all_examples, anchor, snapshots[anchor['asOf']])
            for key, anchor in anchors.items()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    result = generate()
    content = json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(',',':'))+'\n'
    target = HERE/'events.json'
    if parser.parse_args().check:
        assert target.read_text() == content, 'Frozen regional ranking model differs from its inputs'
    else:
        target.write_text(content)
    for name, row in result.items():
        print(name, [(m, v['validation']['trainingN'], v['validation']['n'], v['validation']['passed'],
                      round(v['coefficient'],4)) for m,v in row['variants'].items()])
