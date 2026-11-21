"""Provide the production adapter's classic coefficients from the same verified cohort."""
import argparse
import json
from datetime import date
from pathlib import Path

from field import HERE
from fitting.fit import fit, np
from datajob.build_features import elo_expectation
from lineup_pairs.field import save, sha


def build(file,*,directory=HERE,rank_day=None):
    proof = json.loads((directory/'series-sources.json').read_bytes())
    assert proof['seriesSHA256'] == sha(file)
    cutoff = date.fromisoformat(rank_day or json.loads((directory/'field.json').read_bytes())['strengthRelease']['rankDay'])
    evidence, x, y = [], [], []
    def profile(five, day):
        recent = [(p,delta) for when,side,p,delta in evidence
                  if 0 < (day-when).days <= 90 and len(side & five) >= 3]
        groups = [recent, [r for r in recent if r[0]<=.35], [r for r in recent if r[0]>=.65]]
        return np.array([sum(d for _,d in g)/(len(g)+5) for g in groups])
    for d, _, _, _, won, pa, pb, la, lb in json.loads(file.read_bytes()):
        day = date.fromisoformat(d)
        a,b = set(la),set(lb)
        if (cutoff-day).days < 85:
            x.append([(pa-pb)/100, *(profile(a,day)-profile(b,day))])
            y.append(won)
        p = elo_expectation(pa,pb)
        evidence.extend([(day,a,p,won-p),(day,b,1-p,p-won)])
    assert len(x)==json.loads((directory/'v4-strength.json').read_bytes())['v4Model']['n']
    return dict(n=len(x),masks={m:dict(beta=np.round(fit(np.array(x),np.array(y),m),7).tolist()) for m in range(8)})


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--series',type=Path,required=True)
    a=parser.parse_args()
    save(HERE/'classic.json',build(a.series))
