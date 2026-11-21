"""Extract compact, dated facts from pinned sources, limited to the post-snapshot, pre-stage interval."""
import argparse
import gzip
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from settings import HERE, ROOT, close_day

sys.path.insert(0, str(ROOT/'map_veto_data'))
sys.path.insert(0, str(ROOT))
import extract_archive as archive
import extract_singapore_csv as griffin
from map_veto_data.prepare import choices, game_index, identify
from map_strength.build import POOLS, entries, team_for
from history24 import build as historical
from datajob import build_features as valve


RANK_DIGESTS = {
    '2024-03-04-americas.md':'7b4d41745ee8c4311fba362f37b927a49b886b0bef5b4603069d25a358c18215',
    '2024-03-04-asia.md':'a6cd45fff95265f5a696ebbff17b791e7729f2ad87395e00ca259a63f7f356ff',
    '2024-03-04-europe.md':'f5d3fbc3a16556d61b2bc3f46db6ee18a45c808e4dfc944a3d25c9477a205d0a',
    '2024-11-06-global.md':'0d1b8c683d98feb81684419935f3b9873525ac7c93c0334db3ee1cd691803d55',
    '2024-11-25-global.md':'1e6fb01fc22f07373eb9c9d682b85ee26382939b68bd858d3bc8a1607e9d6221',
    'standings_global_2025_11_03.md':'5023417c70abc507877e84460a888c8e0ea08e01cc8cf262132a1460a4549e58',
    'standings_global_2026_11_02.md':'910e26dca938cab5483282f459203965766305d1504d4cb3cc89ced38b327b0b',
}


def standings(edition, base, vintage_dir, recent_dir):
    if edition in ('copenhagen','shanghai'):
        dates=[base.isoformat()]+(['2024-11-25'] if edition=='shanghai' else [])
        regions=('americas','europe','asia') if edition=='copenhagen' else ('global',)
        paths={d:[vintage_dir/f'{d}-{region}.md' for region in regions] for d in dates}
    else:
        paths={base.isoformat():[recent_dir/valve.snapshot_path(base)]}
    result={}
    for stamp, files in paths.items():
        rows=[]
        for path in files:
            raw=path.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=RANK_DIGESTS[path.name]:
                raise ValueError(f'Unverified source snapshot: {path}')
            content=raw.decode()
            if stamp not in content[:160].replace('_','-'):
                raise ValueError(f'Unexpected standing date in {path}')
            for cells in valve.parse_rows(content):
                rank, points, team, five=cells[:4]
                rows.append(dict(rank=int(rank), points=int(points), name=team, roster=five.split(', ')))
        result[stamp]=historical.Ranking(rows)
    return result


def records(zipped, csv_dir, windows):
    if hashlib.sha256(zipped.read_bytes()).hexdigest()!=archive.SHA256:
        raise ValueError('Historical archive digest changed.')
    with gzip.open(zipped,'rt') as stream:
        for raw in json.load(stream):
            day=datetime.fromtimestamp(int(raw['date'])/1000, timezone.utc).date()
            if not any(old<day<=new for event,(old,new) in windows.items() if event!='singapore'):
                continue
            try:
                record=archive.normalize(raw)
            except (TypeError,ValueError,OverflowError):
                continue
            if record:
                yield record, False
    # The upstream reader verifies all five CSV digests. Its old default ends at the baseline.
    griffin.CUTOFF=windows['singapore'][1].isoformat()
    for record in griffin.build(csv_dir):
        yield record, True


def extract(args):
    specs = entries()
    windows={e:(base,close_day(e)) for e,(base,_) in specs.items()}
    lookup=game_index(args.games)
    if hashlib.sha256(args.games.read_bytes()).hexdigest()!=historical.SERIES_SHA:
        raise ValueError('Wrong lineup cross-check dataset.')
    ranks={e:standings(e,old,args.historic_rank_dir,args.monthly_rank_dir)
           for e,(old,new) in windows.items() if old<new}
    accepted={}
    for match, sg in records(args.historic, args.griffin, windows):
        day=match['day']
        for e,(base,close) in windows.items():
            if sg!=(e=='singapore') or not base.isoformat()<day<=close.isoformat():
                continue
            info=identify(match, lookup)
            if not info:
                continue
            fives,lineage=info
            if not any(team_for(f,specs[e][1]) for f in fives):
                continue
            pool=POOLS[e][0].split()
            if not choices(match,pool):
                continue
            rankday=max(d for d in ranks[e] if d<day)
            ranked=[ranks[e][rankday].lookup(f) for f in fives]
            signature=(e,int(match['mid']))
            row={'event':e,'id':signature[1],'day':day,'url':match['url'],'bo':match['bo'],
                 'teams':[match['a'],match['b']], 'lineups':[sorted(f) for f in fives],
                 'steps':match['steps'],'maps':match['maps'],'lineupSource':lineage,
                 'source':'griffin' if sg else 'hltvy'}
            if all(r[0] for r in ranked) and ranked[0][0] is not ranked[1][0]:
                row['rank']={'day':rankday,'points':[r[0]['points'] for r in ranked],
                             'lineups':[r[0]['roster'] for r in ranked]}
            if signature in accepted and accepted[signature]!=row:
                raise ValueError(f'Conflicting match {signature}')
            accepted[signature]=row
    return sorted(accepted.values(),key=lambda r:(r['event'],r['day'],r['id']))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--historic',type=Path,required=True)
    p.add_argument('--griffin',type=Path,required=True)
    p.add_argument('--games',type=Path,required=True)
    p.add_argument('--historic-rank-dir',type=Path,required=True)
    p.add_argument('--monthly-rank-dir',type=Path,required=True)
    p.add_argument('--check',action='store_true')
    args=p.parse_args()
    result=extract(args)
    raw=(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n').encode()
    path=HERE/'observations.json.gz'
    if args.check:
        assert gzip.decompress(path.read_bytes()) == raw
    else:
        path.write_bytes(gzip.compress(raw,mtime=0))
    print('Recovered post-snapshot series',dict(Counter(r['event'] for r in result)))
