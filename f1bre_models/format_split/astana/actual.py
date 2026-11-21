"""Verify each Swiss series against two result sources and audit both actual fives."""
import argparse
import json
from collections import defaultdict
from pathlib import Path

from field import HERE
from format_model import build as fmt
from history24.build import canonical
from strategy_v4.prepare import map_sides
from lineup_pairs.field import save,sha


def extract(ektarr,pushbuild):
    f=json.loads((HERE/'field.json').read_bytes())
    locked=json.loads((HERE/'cards.json').read_bytes())
    assert locked['hashes']['field.json']==sha(HERE/'field.json')
    assert json.loads((HERE/'candidate-large.json').read_bytes())['matrix']==locked['matrices']['candidate']
    assert sha(ektarr)==fmt.SOURCE_SHA256['ektarr'] and sha(pushbuild)==fmt.SOURCE_SHA256['pushbuild']
    names={fmt.norm(t['name']):i for i,t in enumerate(f['teams'])}
    fives=[{canonical(p) for p in t['roster']} for t in f['teams']]
    end='2026-05-13'
    verified={}
    for r in fmt.read_csv(pushbuild):
        d=r['date_utc'][:10]
        if r['event']!='PGL/2026/Astana' or not f['start']<=d<=end:continue
        key,label=fmt.format_source('pushbuild',r)
        assert label[0]==3 and key not in verified
        verified[key]=(label[1],sorted([int(r['score1']),int(r['score2'])]))
    rounds=defaultdict(list)
    for r in fmt.read_csv(ektarr):
        d=r['datetime'][:10]
        if r['tournament']!='PGL Astana 2026' or not f['start']<=d<=end or r['is_total']!='True':continue
        key,label=fmt.format_source('ektarr',r)
        score=[fmt.number(r['score1_match']),fmt.number(r['score2_match'])]
        assert label[0]==3 and verified.pop(key)==(label[1],sorted(score))
        sides=[names[fmt.norm(r[t])] for t in ('team1','team2')]
        lineups=map_sides(r)
        if lineups is None:
            assert (r['match_id'],d,r['team1'],r['team2'])==('10093010','2026-05-11','The Huns Esports','Fisher College')
            # Published player statistics and rosters in HLTV match 2394139.
            lineups=[{'nin9','sk0r','bart4k','xerolte','controlez'},{'nealan','th0r','aleks','crepow','corn'}]
        for idx,roster in zip(sides,lineups,strict=True):
            converted={'th0r' if p=='th0rsteinnf' and f['teams'][idx]['name']=='Fisher College' else p for p in roster}
            assert converted==fives[idx],(r['match_id'],f['teams'][idx]['name'],converted^fives[idx])
        if score[0]<score[1]:sides.reverse()
        rounds[d].append([*sides,r['match_id']])
    assert not verified
    ordered=[rounds[d] for d in sorted(rounds)]
    assert list(map(len,ordered))==[8,8,8,6,3]
    return dict(id=f['id'],cardSHA256=sha(HERE/'cards.json'),largeCardSHA256=sha(HERE/'candidate-large.json'),
                sources=fmt.SOURCE_SHA256,first=f['start'],last=end,series=33,rounds=ordered)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for source in ('ektarr','pushbuild'):parser.add_argument('--'+source,type=Path,required=True)
    a=parser.parse_args()
    save(HERE/'actual.json',extract(a.ektarr,a.pushbuild))
