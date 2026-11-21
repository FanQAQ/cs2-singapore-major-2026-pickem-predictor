"""Swap only the distribution of the three BO3 maps in the locked map ML."""
import argparse
import itertools

import numpy as np
from profiles import HERE, ROOT, read, sha, store

TRIPLES = list(itertools.combinations(range(7),3))
PERMS = np.array(list(itertools.permutations(range(7))),dtype=np.int8)
INDEX = {v:i for i,v in enumerate(TRIPLES)}
OUTCOME = np.array([INDEX[tuple(sorted((p[2],p[3],p[6])))] for p in PERMS])
PAIRS = list(itertools.combinations(range(16),2))
FULL = 127
BITS = 1 << PERMS.astype(np.int16)
MASK = np.column_stack([np.full(len(PERMS), FULL)] + [FULL-BITS[:,:k].sum(axis=1) for k in range(1,6)])


def base_mass(weights):
    w = weights/np.sum(weights)
    result = np.zeros(35)
    for t,(a,b,c) in enumerate(TRIPLES):
        for i,j,k in itertools.permutations((a,b,c)):
            result[t] += w[i]*w[j]/(1-w[i])*w[k]/(1-w[i]-w[j])
    assert abs(result.sum()-1)<1e-12 and min(result)>0
    return result


def policy(row, pool, action):
    count = np.array([row[action][m] for m in pool])
    opp = np.array([row[action+'Opportunities'][m] for m in pool])
    prior = count.sum()/opp.sum() if count.sum() and opp.sum() else 1/7
    weights = (count+4*prior)/(opp+4)
    den = np.array([sum(x for i,x in enumerate(weights) if mask & (1<<i)) for mask in range(128)])
    assert min(weights)>0
    return weights,den


def transitions(row, pool):
    out={}
    for action,ks in [('ban',(0,1,4,5)),('pick',(2,3))]:
        w,den = policy(row,pool,action)
        for k in ks: out[k]=w[PERMS[:,k]]/den[MASK[:,k]]
    return out


def veto_mass(a,b,last_ab):
    roles = (0,1,0,1,0,1) if last_ab else (0,1,0,1,1,0)
    lanes = [a,b]
    leaf=np.zeros(len(PERMS))
    for first in (0,1):
        prob=np.full(len(PERMS),0.5)
        for k,role in enumerate(roles): prob *= lanes[role ^ first][k]
        leaf+=prob
    mass=np.bincount(OUTCOME,weights=leaf,minlength=35)
    assert abs(mass.sum()-1)<1e-12 and mass.min()>0
    return mass


def field(key, f, weight, p):
    teams=f['teams'];pool=f['pool']
    assert len(teams)==len(set(teams))==16 and set(teams)==set(p['teams']) and set(pool)==set(p['pool'])
    assert len(set(pool))==7 and len(f['mapProbabilities'])==len(weight)==120
    last_ab=key=='epl23-stage2'
    counts=[p['teams'][t]['bo3']['n'] for t in teams]
    lanes=[transitions(p['teams'][t]['bo3'],pool) for t in teams]
    candidate=np.asarray(f['bo3']).copy(); pairs=[];max_error=0.
    for row,(a,b) in enumerate(PAIRS):
        pm=np.asarray(f['mapProbabilities'][row])
        assert pm.shape==(7,) and min(pm)>=0 and max(pm)<=1
        series=np.array([pm[i]*pm[j]+pm[i]*pm[k]+pm[j]*pm[k]-2*pm[i]*pm[j]*pm[k] for i,j,k in TRIPLES])
        original=base_mass(weight[row])
        err=abs(np.dot(original,series)-f['bo3'][a][b])
        assert err<2e-8,(key,a,b,err)
        max_error=max(max_error,err)
        if counts[a] or counts[b]:
            new=veto_mass(lanes[a],lanes[b],last_ab)
            candidate[a,b]=round(float(new@series),10)
            candidate[b,a]=round(1-candidate[a,b],10)
        else:
            new=original
        pairs.append(dict(a=a,b=b,nA=counts[a],nB=counts[b],maps=pm.tolist(),
                          original=np.round(original,14).tolist(),veto=np.round(new,14).tolist()))
    assert np.max(abs(candidate+candidate.T-1))<1e-12
    assert np.min(candidate)>=0 and np.max(candidate)<=1
    both=sum(min(counts[a],counts[b])>0 for a,b in PAIRS)
    five=sum(min(counts[a],counts[b])>=5 for a,b in PAIRS)
    fallback=sum(counts[a]+counts[b]==0 for a,b in PAIRS)
    return dict(start=p['start'],cutoffExclusive=p['cutoffExclusive'],teams=teams,pool=pool,
                rules='ABABAB' if last_ab else 'ABABBA',
                triples=[[pool[k] for k in t] for t in TRIPLES], pairs=pairs,
                baseline=dict(bo1=f['bo1'],bo3=f['bo3']), bo1=f['bo1'], bo3=candidate.tolist(),
                coverage=dict(**p['coverage'],both=both,bothAtLeast5=five,neither=fallback,one=120-both-fallback),
                maxReconstructionError=max_error)


def run(check):
    profiles=read(HERE/'profiles.json.gz')['fields']
    result={}
    sources={'veto_ml/profiles.json.gz':sha(HERE/'profiles.json.gz')}
    for base,wfile in [('f1bre_models','ml-data.npz'),('ml_allocation','ml-queries.npz'),
                       ('latent_form/bucharest-ml','ml-queries.npz'),('veto_ml/astana-ml','ml-queries.npz')]:
        packed=ROOT/base/'ml.json.gz';weights=ROOT/base/wfile
        for file in (packed,weights):sources[file.relative_to(ROOT).as_posix()]=sha(file)
        model=read(packed)['fields']
        with np.load(weights,allow_pickle=False) as z:
            for k,f in model.items():
                if k not in profiles:continue
                assert k not in result
                result[k]=field(k,f,z['w_'+k],profiles[k])
                print(k, result[k]['coverage']['both'],result[k]['coverage']['neither'],flush=True)
    assert set(result)==set(profiles) and len(result)==18
    store(HERE/'models.json.gz',dict(version=1,sources=sources,fields=result),check)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    run(parser.parse_args().check)
