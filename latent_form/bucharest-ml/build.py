"""Rebuild the same held-out map model on the April 2025 Bucharest field before its first match."""
import argparse
import gzip
import json
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT/'ml_allocation'))
import ml_prepare as prepare
import ml_train as train


KEY='bucharest-2025-april'
DAY='2025-04-06'
POOL=['Dust2','Mirage','Inferno','Nuke','Train','Ancient','Anubis']


def run(args):
    if not args.model_only:
        if not all((args.hltvy,args.ektarr,args.ranks)):
            raise ValueError('Supply the frozen HLTvy, Ektarr and Valve releases, or use --model-only')
        field=prepare.read(HERE.parent/'bucharest-field.json')
        assert field['id']==KEY and field['start']==DAY
        assert len({p for t in field['teams'] for p in t['roster']})==80
        assert field['rankPublishedAt'][:10]<DAY
        assert all(t['overlap']>=3 and t['points']>0 and t['witness']['day']<DAY for t in field['teams'])
        field.update(cutoffExclusive=DAY, pool=POOL, targetLabel='PGL Bucharest 2025',precedingLabel=None)
        cutoff=prepare.base.ordinal(DAY)
        history,held=prepare.clean_history(args,cutoff)
        assert max(g[1] for g in history.games)<=cutoff
        assert not any(g[3]==field['targetLabel'] for g in history.games)
        prepare.training(history,held,args.check,HERE,DAY)
        prepare.queries(history,args.check,[field],HERE)
    train.run(args.check,1,HERE,[KEY])
    with gzip.open(HERE/'ml.json.gz','rt',encoding='utf8') as f:
        result=json.load(f)['fields'][KEY]
    assert result['training']['targetStageMapsAvailable']==0 and result['training']['lastObserved']<DAY
    print('Pre-stage maps, calibration, and series labels:',result['training'])


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check',action='store_true')
    ap.add_argument('--model-only',action='store_true')
    for source in ('hltvy','ektarr','ranks'): ap.add_argument('--'+source,type=Path)
    run(ap.parse_args())
