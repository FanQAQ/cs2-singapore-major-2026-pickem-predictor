"""Infer an as-of BO3 stage-state scale from adjacent residuals with equal event and team weights."""
import argparse
import gzip
import hashlib
import json
import math
import subprocess
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from scipy.special import expit, logit
from scipy.stats import t as student

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROWS = ROOT/'tail_calibration/training.json.gz'
ADJACENCY = HERE/'adjacency.json.gz'
HOLDOUT = 'PGL Cluj-Napoca 2026'
ROW_HASH = '11072635a348e12715aecdc15ea8aef39a18b4cb2ef66d98fa1bd7e32ff4abc1'
MAX_SCALE = .5


def read_archive(file):
    with gzip.open(file, 'rt', encoding='utf8') as f:
        return json.load(f)


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def slope(x, y):
    """Same penalized auxiliary regression and boundaries as tail_calibration/model.cjs."""
    if not len(x):
        return 1.
    def derivative(b):
        return x @ (expit(b*x)-y) + 4*(b-1)
    low, high = .05, 4.
    if derivative(low) >= 0: return low
    if derivative(high) <= 0: return high
    for _ in range(54):
        mid = (low+high)/2
        if derivative(mid) > 0: high = mid
        else: low = mid
    return (low+high)/2


def cases(p, scale):
    """Columns correspond to (--), (-+), (+-), (++), the same order as CS.stateCases."""
    p = np.atleast_1d(np.asarray(p, dtype=float))
    if not scale:
        return np.repeat(p[:,None], 4, axis=1)
    assert np.all((p>0) & (p<1)) and 0 <= scale <= MAX_SCALE
    span = 2*scale
    center = logit(p)
    low, high = center-span, center+span
    for _ in range(50):
        mid = (low+high)/2
        below = (2*expit(mid) + expit(mid-span) + expit(mid+span))/4 < p
        low, high = np.where(below,mid,low), np.where(below,high,mid)
    mid = (low+high)/2
    z = expit(mid)
    values = np.column_stack((z, expit(mid-span), expit(mid+span), z))
    assert np.max(np.abs(values.mean(axis=1)-p), initial=0.) < 1e-14
    return values


def nested_weights(pairs):
    teams = defaultdict(Counter)
    for pair in pairs:
        teams[pair['event']][pair['team']] += 1
    n_events = len(teams)
    weights = np.array([1/(n_events*len(teams[q['event']])*teams[q['event']][q['team']])
                        for q in pairs],dtype=float)
    if len(pairs):
        assert abs(weights.sum()-1) < 1e-12
    return teams, weights


def clustered(values, pairs, weights):
    if not len(pairs):
        return None, None, {}
    by_event = defaultdict(float)
    for v, q, w in zip(values, pairs, weights):
        by_event[q['event']] += float(v*w)
    n = len(by_event)
    by_event = {k:v*n for k,v in by_event.items()}
    mean = float(values @ weights)
    assert abs(sum(by_event.values())/n-mean)<1e-12
    if n < 2: return mean, None, by_event
    ev = np.asarray(list(by_event.values()))
    radius = float(student.ppf(.975,n-1)*ev.std(ddof=1)/math.sqrt(n))
    return mean, [mean-radius,mean+radius], by_event


def estimate(p1, p2, weights, sample_cov, events):
    if len(weights):
        u, ix = np.unique(np.r_[p1,p2], return_inverse=True)
        left, right = np.split(ix,2)
        def implied(scale):
            v = cases(u,scale)
            delta = (v[:,2]-v[:,1])/4
            return float(weights @ (delta[left]*delta[right]))
        limit = implied(MAX_SCALE)
    else:
        implied = lambda _: 0.
        limit = 0.
    reasons = []
    if len(weights) < 40: reasons.append('fewer-than-40-pairs')
    if events < 10: reasons.append('fewer-than-10-events')
    if sample_cov is None or sample_cov <= 0: reasons.append('nonpositive-or-undefined-covariance')
    if reasons:
        scale, status = 0., 'zero'
    elif sample_cov >= limit:
        scale, status = MAX_SCALE, 'at-cap'
    else:
        low, high = 0., MAX_SCALE
        for _ in range(40):
            mid = (low+high)/2
            if implied(mid) < sample_cov: low = mid
            else: high = mid
        scale, status = (low+high)/2, 'interior'
    matched = implied(scale)
    if status == 'interior': assert abs(matched-sample_cov) < 1e-12
    return dict(scale=scale, status=status, zeroReasons=reasons, capped=status=='at-cap',
                maxImpliedCovariance=limit, impliedCovariance=matched,
                unexplainedCovariance=sample_cov-matched if sample_cov is not None else None)


def target(key, planned, rows, pairs, frozen_targets):
    start, cutoff, low = (date.fromisoformat(planned[k]) for k in ('start','cutoffExclusive','windowStart'))
    assert low == cutoff-timedelta(days=180) and cutoff<=start
    extra_starts={'cluj-2026':'2026-02-14','bucharest-2025-april':'2025-04-06'}
    assert ((key in frozen_targets and planned['cutoffExclusive']==frozen_targets[key]['cutoffExclusive'])
            or extra_starts.get(key)==start.isoformat())
    indices = planned['seriesIndices']
    allowed = {i for i,r in enumerate(rows) if r['earliestUtcDay']>=low.isoformat()
               and date.fromisoformat(r['latestUtcDay'])+timedelta(days=1)<cutoff}
    eligible = {i for i in allowed if rows[i]['event']!=HOLDOUT}
    assert set(indices)==eligible and len(indices)==len(eligible)
    if key in frozen_targets:
        assert allowed==set(frozen_targets[key]['indices'])
    included = [rows[i] for i in indices]
    assert all(r['bo']==3 and r['y'] in (0,1) and r['rankPublished'][:10]<r['earliestUtcDay']
               and r['gap']==r['pointsA']-r['pointsB'] and min(r['overlapA'],r['overlapB'])>=3 for r in included)
    x = np.asarray([r['gap'] for r in included])*math.log(10)/400
    y = np.asarray([r['y'] for r in included])
    beta = float(slope(x,y))
    ps = np.full(len(rows),np.nan)
    ps[indices] = expit(beta*x)
    pair_ix = planned['indices']
    assert len(pair_ix)==len(set(pair_ix))
    assert set(pair_ix)=={j for j,pair in enumerate(pairs) if pair['left'] in eligible and pair['right'] in eligible}
    selected = [pairs[i] for i in pair_ix]
    teams, weights = nested_weights(selected)
    ps1, ps2, products, nick_overlap = [], [], [], Counter()
    seen = set()
    for q in selected:
        a,b = q['left'],q['right']
        sa,sb = q['sideLeft'],q['sideRight']
        assert a!=b and a in eligible and b in eligible and {sa,sb}<={0,1}
        ra,rb = rows[a],rows[b]
        assert q['leftId']==ra['id'] and q['rightId']==rb['id']
        assert ra['id'].split(':')[0]==rb['id'].split(':')[0]
        assert ra['day']!=rb['day'] and ra['latestUtcDay']<rb['earliestUtcDay']
        assert q['overlap'] in (3,4,5)
        nick_overlap[len(set(ra['fiveB' if sa else 'fiveA']) & set(rb['fiveB' if sb else 'fiveA']))] += 1
        k = (q['event'], q['team'],a,b)
        assert k not in seen
        seen.add(k)
        p1,p2 = (1.-ps[a] if sa else ps[a]), (1.-ps[b] if sb else ps[b])
        y1,y2 = (1-ra['y'] if sa else ra['y']), (1-rb['y'] if sb else rb['y'])
        ps1.append(p1); ps2.append(p2); products.append((y1-p1)*(y2-p2))
    cov, ci, ev_products = clustered(np.asarray(products),selected,weights)
    scale = estimate(np.asarray(ps1),np.asarray(ps2),weights,cov,len(teams))
    counts = Counter(str(p['overlap']) for p in selected)
    out = dict(start=planned['start'], windowStart=planned['windowStart'],cutoffExclusive=planned['cutoffExclusive'],
               firstObserved=min(r['day'] for r in included),lastObserved=max(r['day'] for r in included),
               series=len(indices),events=len(teams),teamEvents=sum(map(len,teams.values())),pairs=len(selected),
               coreOverlap={str(n): counts[str(n)] for n in (3,4,5)},auxSlope=beta,covariance=cov,
               covarianceCI95=ci, excludedClujSeries=len(allowed-eligible),
               pairEndpointDisplayNameOverlap={str(k):v for k,v in sorted(nick_overlap.items())},
               **scale)
    for k in ('series','events','teamEvents','pairs'):
        if k in planned: assert planned[k]==out[k], (key,k,planned[k],out[k])
    out['adjacencyAudit'] = {k:v for k,v in planned.items()
                             if k not in ('indices','seriesIndices') and k not in out}
    out['byEvent'] = {k:{'teams': len(v), 'pairs':sum(v.values()), 'meanResidualProduct':ev_products[k]}
                      for k,v in sorted(teams.items())}
    return out


def math_checks():
    # Enumerate the eight equiprobable (team, opponent1, opponent2) states directly.
    for scale in (0., .01, .25, MAX_SCALE):
        for p1,p2 in [(.1,.99),(.5,.5),(.9,.01),(.45,.35)]:
            a,b = cases([p1,p2],scale)
            joint = sum((a[2*t+j]-p1)*(b[2*t+k]-p2) for t in (0,1)
                        for j in (0,1) for k in (0,1))/8
            assert abs(joint-(a[2]-a[1])*(b[2]-b[1])/16) < 1e-14
            np.testing.assert_allclose(1-a,cases([1-p1],scale)[0][::-1],atol=1e-14,rtol=0)
    # Test unbalanced clusters, teams and repeated observations.
    group=[{'event':'a','team':'x'}]*3 + [{'event':'a','team':'y'},{'event':'b','team':'x'}]
    _, w = nested_weights(group)
    v, _, _ = clustered(np.array([1,1,1,0,0]),group,w)
    assert abs(v-.25)<1e-14
    p1,p2 = np.full(40,.38), np.full(40,.64)
    weights=np.ones(40)/40
    a,b=cases([.38,.64],.28)
    known=(a[2]-a[1])*(b[2]-b[1])/16
    assert abs(estimate(p1,p2,weights,known,10)['scale']-.28)<1e-10
    assert estimate(p1,p2,weights,-.01,10)['scale']==0
    assert estimate(p1,p2,weights,known,9)['scale']==0
    assert estimate(p1[:-1],p2[:-1],weights[:-1],known,10)['scale']==0
    assert estimate(p1,p2,weights,1.,10)['scale']==MAX_SCALE


def check_javascript(out, adj):
    # Independently group by event and team, then evaluate the actual engine probabilities on every pair.
    js = """
    const fs=require('fs'),z=require('zlib'),{elo,slope,calibrated}=require('./tail_calibration/model.cjs');
    require('./engine/engine.js');
    const load=f=>JSON.parse(z.gunzipSync(fs.readFileSync(f)));
    const rows=load('tail_calibration/training.json.gz').rows,adj=load(process.argv[1]);
    const scales=JSON.parse(fs.readFileSync(0,'utf8')),population={};
    const avg=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
    for (const [key,t] of Object.entries(adj.targets)) {
      const raw=i=>elo(rows[i].pointsA,rows[i].pointsB);
      const beta=slope(t.seriesIndices.map(i=>({p:raw(i),y:rows[i].y})));
      const events=new Map(), probabilities=new Map(), s=scales[key];
      function side(i,which) {
        const code=2*i+which;
        if(!probabilities.has(code)) {
          const p=calibrated(raw(i),beta), y=rows[i].y, q=which?1-p:p;
          const vals=CS.stateCases(q,s,s);
          const delta=(avg(vals.slice(2))-avg(vals.slice(0,2)))/2;
          probabilities.set(code,[which?1-y-q:y-q,delta]);
        }
        return probabilities.get(code);
      }
      for(const index of t.indices) {
        const q=adj.pairs[index],a=side(q.left,q.sideLeft),b=side(q.right,q.sideRight);
        if(!events.has(q.event))events.set(q.event,new Map());
        const teams=events.get(q.event);
        if(!teams.has(q.team))teams.set(q.team,[]);
        teams.get(q.team).push([a[0]*b[0],a[1]*b[1]]);
      }
      const nested=c=>avg([...events.values()].map(teams=>avg([...teams.values()].map(v=>avg(v.map(t=>t[c]))))));
      population[key]={beta,measured:events.size?nested(0):null,implied:events.size?nested(1):0};
    }
    const cases=[.01,.1,.37,.5,.83,.99].flatMap(p=>[0,.19,.5].map(s=>CS.stateCases(p,s,s)));
    console.log(JSON.stringify({population,cases}));
    """
    scales=json.dumps({k:v['scale'] for k,v in out.items()}).encode()
    r=json.loads(subprocess.check_output(['node','-e',js,str(adj)],cwd=ROOT,input=scales))
    for k,v in out.items():
        ref=r['population'][k]
        assert abs(v['auxSlope']-ref['beta'])<5e-12
        if ref['measured'] is None: assert v['covariance'] is None
        else: assert abs(ref['measured']-v['covariance'])<5e-13
        assert abs(ref['implied']-v['impliedCovariance'])<5e-13
    v=[cases([p],s)[0] for p in (.01,.1,.37,.5,.83,.99) for s in (0,.19,.5)]
    np.testing.assert_allclose(v,r['cases'],rtol=0,atol=5e-15)


def check_schedule(adj, frozen):
    """Check each accepted edge against every appearance, including non-BO3 blockers."""
    schedule=[dict(zip(adj['scheduleFields'],r)) for r in adj['schedule']]
    timelines=defaultdict(list)
    for i,r in enumerate(schedule):
        for team in r['teams']:
            if team is not None:
                timelines[team].append((r['day'],r['time'] or '',r['id'],i))
    positions={(key,r[3]): j for key,events in timelines.items() for j,r in enumerate(sorted(events))}
    for pair in adj['pairs']:
        ai,bi=pair['scheduleLeft'],pair['scheduleRight']
        a,b=schedule[ai],schedule[bi]
        assert a['id']==frozen[pair['left']]['id'] and b['id']==frozen[pair['right']]['id']
        aliases=adj['eventAliases'][pair['source']]
        for end in ('left','right'):
            raw=frozen[pair[end]]['event']
            assert pair['event']==pair['source']+'|'+aliases.get(raw,raw)
        sa,sb=pair['sideLeft'],pair['sideRight']
        key=pair['team']
        assert a['teams'][sa]==b['teams'][sb]==key
        assert positions[key,bi]-positions[key,ai]==1, (a['id'],b['id'])
        assert a['teams'][1-sa]!=b['teams'][1-sb]
        assert a['source']==b['source']==pair['source'] and a['day']<b['day']
        core=set(a['cores'][sa]) & set(b['cores'][sb])
        assert core==set(pair['commonCore']) and len(core)==pair['overlap']>=3


def run(check):
    math_checks()
    raw,adj=read_archive(ROWS),read_archive(ADJACENCY)
    assert digest(ROWS)==ROW_HASH and adj['frozenRowsSha256']==ROW_HASH
    primary=set(raw['targets'])|{'cluj-2026'}
    secondary={'bucharest-2025-april'}
    assert len(primary)==18 and set(adj['targets'])==primary|secondary
    out={k:target(k,t,raw['rows'],adj['pairs'],raw['targets']) for k,t in adj['targets'].items()}
    if check:
        check_schedule(adj, raw['rows'])
        check_javascript(out, ADJACENCY)
    payload=dict(version=1, primaryTargets=sorted(primary), additionalTransferTargets=sorted(secondary),
                 frozenRowsSha256=ROW_HASH, adjacencySha256=digest(ADJACENCY),
                 maxScale=MAX_SCALE, minPairs=40, minEvents=10, confidence='event-mean Student t 95%',
                 targets=out)
    dest=HERE/'training.json'
    text=json.dumps(payload,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
    if check: assert json.loads(dest.read_text(encoding='utf8'))==payload
    else: dest.write_text(text,encoding='utf8')
    for k,v in out.items():
        print(k,v['series'],v['pairs'],v['events'],v['auxSlope'],v['covariance'],v['scale'],v['status'])


if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--math-only', action='store_true')
    args=ap.parse_args()
    if args.math_only: math_checks(); print('Eight-state covariance identity, gate, cap, known interior root and equal-weight checks passed.')
    else: run(args.check)
