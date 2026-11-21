"""Audit paired probabilities, exact target cutoffs, two-arm draws and never-label BO5 IDs."""
import itertools
from datetime import date
import numpy as np
from prepare import GROUPS, HERE, ROOT, PAIRS, base, read, sha, variants


def aggregations(p,w):
    w=w/w.sum(axis=1,keepdims=True)
    result=np.zeros(len(p));total=np.zeros(len(p))
    for a,b,c in itertools.combinations(range(7),3):
        mass=np.zeros(len(p))
        for i,j,k in itertools.permutations((a,b,c)):
            mass+=w[:,i]*w[:,j]*w[:,k]/((1-w[:,i])*(1-w[:,i]-w[:,j]))
        x,y,z=p[:,a],p[:,b],p[:,c]
        result+=mass*(x*y+(x*(1-y)+(1-x)*y)*z)
        total+=mass
    np.testing.assert_allclose(total,1,rtol=0,atol=1e-12)
    return (p*w).sum(axis=1),result


def main():
    model=read(HERE/'models.json.gz')
    groups,old=variants()
    for file,digest in model['sources'].items():assert sha(ROOT/file)==digest,file
    coverage=read(HERE/'coverage.json.gz')
    verified=coverage['series']
    for mid,g in verified.items():
        scores=[(x,y) for mp,x,y in g['maps']]
        assert len(scores) in (3,4,5) and all(base.sources.valid_mr12(x,y) for x,y in scores)
        a=sum(x>y for x,y in scores)
        assert max(a,len(scores)-a)==3 and min(a,len(scores)-a)<3
        assert g['rank']['published'][:10]<g['earliest']<=g['day']<g['available']
        assert min(g['rank']['overlap'])>=3
    for _,(file,_) in GROUPS.items():
        assert set(verified).isdisjoint(read(ROOT/file)['series'])
    worst=0.
    with np.load(HERE/'queries.npz',allow_pickle=False) as q:
        for key,f in model['fields'].items():
            end=f['cutoffExclusive'];lo=base.sources.shifted(end,-365)
            field=coverage['fields'][key]
            group=field['group']
            current={t['name']:set(base.sources.roster(t['roster'],t['name']))-base.sources.AMBIGUOUS
                     for t in groups[group][key]['teams']}
            for name,data in field['teams'].items():
                ws=ls=0
                for link in data['added']:
                    g=verified[link['id']];side=link['side']
                    assert lo<=g['earliest'] and g['available']<=end
                    assert len(current[name]&set(g['five'+'AB'[side]]))==link['overlap']>=3
                    assert link['w']==sum((x>y)==(side==0) for mp,x,y in g['maps'])
                    assert link['w']+link['l']==len(g['maps'])
                    ws+=link['w'];ls+=link['l']
                assert (ws,ls,ws+ls)==(data['extraWins'],data['extraLosses'],data['extraCoreMaps'])
            w=q['baseline_w_'+key]
            for arm in ('baseline','candidate'):
                z=f[arm]
                if arm=='baseline' and key in old:
                    assert all(z[k]==old[key][k] for k in ('mapProbabilities','bo1','bo3'))
                p=np.asarray(z['mapProbabilities'])
                for mode,check in zip(('bo1','bo3'),aggregations(p,w)):
                    matrix=np.asarray(z[mode])
                    assert matrix.shape==(16,16) and np.all(matrix.diagonal()==.5)
                    np.testing.assert_allclose(matrix+matrix.T,1,rtol=0,atol=1e-10)
                    diff=float(np.max(np.abs(matrix[np.triu_indices(16,1)]-check)))
                    assert diff<2e-8,(key,arm,mode,diff)
                    worst=max(worst,diff)
    print(len(model['fields']),'fields,',len(old),'archived baselines,',len(verified),'strictly historical BO5.')
    print('Validated',len(model['fields'])*2*len(PAIRS)*2,'series probabilities. Max difference:',worst)


if __name__=='__main__':main()
