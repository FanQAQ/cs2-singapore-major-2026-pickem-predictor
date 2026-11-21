"""Lock October-style post-ranking residuals before scoring the Stage 3 screen."""
import argparse
import json
from pathlib import Path
import sys
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT/'f1bre_models/format_split/bucharest26'))
from late_form import collect
from field import save

IDS=('austin-2025-3','budapest-2025-3','cologne-2026-3')


def build(archive,ranks):
    fields=json.loads((HERE.parent/'major-fields.json').read_bytes())['fields']
    releases=json.loads((ROOT/'tail_calibration/training-releases.json').read_bytes())
    out={}
    for key in IDS:
        field=fields[key]
        release,=[r for r in releases if r['rankDay']==field['pointsAsOf']]
        assert release['published'][:10]<field['cutoffExclusive']==field['start']
        data=collect(archive,ranks,field,release)
        delta={t['name']:0. for t in field['teams']}
        for game in data['games']:
            sides=game['sides']
            if any(s['points'] is None for s in sides):continue
            a,b=sides
            expected=1/(1+10**((b['points']-a['points'])/400))
            residual=float(game['score'][0]>game['score'][1])-expected
            change={1:32,3:40,5:48}[game['bo']]*residual
            for side,amount in ((a,change),(b,-change)):
                if side['entrant']:delta[side['entrant']]+=amount
        out[key]={**data,'raw':[t['points'] for t in field['teams']],
                  'adjusted':[round(t['points']+delta[t['name']],7) for t in field['teams']]}
    return out


if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--history',type=Path,default=HERE.parent/'elo-data.json.gz')
    ap.add_argument('--ranks',type=Path,required=True)
    ap.add_argument('--check',action='store_true')
    a=ap.parse_args()
    save(HERE/'inputs.json',build(a.history,a.ranks),a.check)
