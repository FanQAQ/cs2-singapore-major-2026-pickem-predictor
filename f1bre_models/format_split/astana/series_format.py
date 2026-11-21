"""Rebuild the shipped best-of calibration and its time-fold shrinkage."""
import argparse
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from field import HERE
from format_model import build as fmt
from lineup_pairs.field import save, sha
from model_v3 import fit_format_weight as shrink


def lookup_labels(files, first, last):
    observations = defaultdict(lambda: defaultdict(list))
    for source, file in files.items():
        assert sha(file) == fmt.SOURCE_SHA256[source], file
        day_column = 'datetime' if source == 'ektarr' else 'date_utc'
        for row in fmt.read_csv(file):
            if first <= row[day_column][:10] <= last:
                match = fmt.format_source(source, row)
                if match:
                    key, label = match
                    observations[key][source].append(label)
    labels = {}
    for key, sources in observations.items():
        values = {v for rows in sources.values() for v in rows}
        if len(values) == 1 and all(len(rows) == 1 for rows in sources.values()):
            labels[key] = values.pop()
    return labels


def rebuild(series_file, files, *, directory=HERE, rank_day=None):
    field = json.loads((directory/'field.json').read_bytes())
    source = json.loads((directory/'series-sources.json').read_bytes())
    assert source['seriesSHA256'] == sha(series_file)
    assert source['fieldSHA256'] == sha(directory/'field.json')
    day = date.fromisoformat(rank_day or field['strengthRelease']['rankDay'])
    before = lambda days: (day - timedelta(days=days)).isoformat()
    rows = json.loads(series_file.read_bytes())
    labels = lookup_labels(files, source['first'], before(0))
    keys = defaultdict(set)
    def match_key(d, a, b):
        return (d, *sorted((fmt.norm(a), fmt.norm(b))))
    for d, mid, a, b, *_ in rows:
        keys[match_key(d, a, b)].add(mid)
    train, historical = [], []
    for d, mid, a, b, y, pa, pb, la, lb in rows:
        assert source['first'] <= d <= before(0) < field['start']
        x = (pa-pb)/100
        if d > before(85):
            train.append(dict(date=d, vrsPer100=x, y=y))
        key = match_key(d, a, b)
        label = labels.get(key)
        if len(keys[key]) == 1 and label and label[1] == fmt.norm(a if y else b):
            five_a, five_b = fmt.roster_key(la), fmt.roster_key(lb)
            assert five_a and five_b and not five_a & five_b
            historical.append(dict(day=d, bestOf=label[0], x=x, y=y, aRoster=five_a, bRoster=five_b))
    eligible = [r for r in historical if r['day'] > before(85)]
    series = [(r['day'], r['bestOf'], r['x'], r['y']) for r in eligible]
    base, share, scales = fmt.global_scales(series)
    teams = {}
    for t in field['teams']:
        five = fmt.roster_key(t['roster'])
        pairs = []
        for r in historical:
            if r['day'] <= before(90):
                continue
            if len(five & r['aRoster']) >= 3:
                pairs.append((r['bestOf'], r['x'], r['y']))
            elif len(five & r['bRoster']) >= 3:
                pairs.append((r['bestOf'], -r['x'], 1-r['y']))
        teams[t['name']] = fmt.team_contrast(pairs, scales, base)
    model = dict(asOf=before(0), shareBO3=round(share, 7), teams=teams,
                 scale={f'bo{f}': round(v, 7) for f, v in scales.items()},
                 nBO1=sum(r['bestOf']==1 for r in eligible), nBO3=sum(r['bestOf']==3 for r in eligible))
    folds = [shrink.rebuild_fold(train, eligible, historical, before(a), before(b))
             for a, b in ((60,40), (40,20), (20,-1))]
    calibration = folds[0] + folds[1]
    weight, reason = shrink.reliability(calibration)
    fmt_weight = dict(asOf=before(0), weight=round(weight, 7), reason=reason,
                      calibration=shrink.scores(calibration, weight), holdout=shrink.scores(folds[2], weight))
    return dict(id=field['id'], sources=fmt.SOURCE_SHA256, seriesSHA256=sha(series_file),
                fieldSHA256=sha(directory/'field.json'), formatModel=model, formatWeight=fmt_weight)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('series', 'ektarr', 'pushbuild'):
        parser.add_argument('--'+name, type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    a = parser.parse_args()
    save(HERE/'format.json', rebuild(a.series, dict(ektarr=a.ektarr, pushbuild=a.pushbuild)), a.check)
