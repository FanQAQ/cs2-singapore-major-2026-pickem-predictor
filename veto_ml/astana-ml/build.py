"""Rebuild the original map ML at the Astana May 10, 2025 lock."""
import argparse
import gzip
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / 'ml_allocation'))
import ml_prepare as prepare
import ml_train as train

ID = 'astana-2025'
DAY = '2025-05-10'


def main(args):
    if args.part != 'model':
        if not all((args.hltvy, args.ektarr, args.ranks)):
            raise ValueError('The raw sources must be supplied for preparation.')
        cutoff = prepare.base.ordinal(DAY)
        history, dropped = prepare.clean_history(args, cutoff)
        assert max(g[1] for g in history.games) <= cutoff
        assert all(g[3] != 'PGL Astana 2025' for g in history.games)
        if args.part in ('all', 'training'):
            prepare.training(history, dropped, args.check, HERE, DAY)
        if args.part in ('all', 'queries'):
            f = prepare.read(HERE.parent / 'astana-field.json')
            assert f['id'] == ID and f['start'] == DAY
            assert len(f['teams']) == 16 and all(len(set(t['roster'])) == 5 for t in f['teams'])
            assert len(set(f['pool'])) == 7
            f.update(cutoffExclusive=DAY, targetLabel='PGL Astana 2025', precedingLabel=None)
            prepare.queries(history, args.check, [f], HERE)
    if args.part in ('all', 'model'):
        train.run(args.check, 1, HERE, [ID])
        with gzip.open(HERE / 'ml.json.gz', 'rt', encoding='utf8') as stream:
            result = json.load(stream)['fields'][ID]
        assert result['training']['targetStageMapsAvailable'] == 0 and result['training']['lastObserved'] < DAY
        print(result['training'])


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--part', choices=('all', 'training', 'queries', 'model'), default='all')
    for key in ('hltvy', 'ektarr', 'ranks'):
        ap.add_argument('--' + key, type=Path)
    main(ap.parse_args())
