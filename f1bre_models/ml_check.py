"""Score-free independent audit of source IDs, time splits and all map-to-series matrices."""
import gzip
import hashlib
import itertools
import json
from datetime import date
from pathlib import Path

import numpy as np

HERE=Path(__file__).resolve().parent
def read(name):
    return json.loads((HERE/name).read_text(encoding='utf8'))

archive=HERE/'ml-data.npz'
data=np.load(archive,allow_pickle=False)
meta=read('ml-data.json')
with gzip.open(HERE/'ml.json.gz','rt',encoding='utf8') as f:model=json.load(f)
assert hashlib.sha256(archive.read_bytes()).hexdigest()==model['inputSha256']
assert len(meta['events'])==1150 and len(meta['series'])==16422 and len(data['x'])==35744
assert len(set(zip(data['series'],data['map'])))==len(data['x'])
matches=read('cluj-results.json')['matchIds']
assert len(set(meta['series'])&{'hltv:'+str(i) for rr in matches for i in rr})==0
assert len(set(meta['mapNames']))==len(meta['mapNames'])
fields=read('major-fields.json')['fields'];fields['cluj-2026']=read('cluj-field.json')

for key,f in model['fields'].items():
    target=fields[key]
    assert f['teams']==[t['name'] for t in target['teams']] and f['start']==target['start']
    cutoff=date.fromisoformat(f['cutoffExclusive']).toordinal()
    ready=data['ready'];day=data['day'];ev=data['event']
    eligible=(day>=cutoff-365)&(ready<=cutoff);split=date.fromisoformat(f['training']['calibrationStart']).toordinal()
    cal=eligible&(day>=split);tree=eligible&(ready<=split)&~np.isin(ev,ev[cal])
    assert tree.sum()==f['training']['treeMaps'] and cal.sum()==f['training']['calibrationMaps']
    assert not set(ev[tree])&set(ev[cal])
    assert max(ready[tree])<=min(day[cal]) and max(ready[cal])<=cutoff
    if cutoff<date(2026,3,25).toordinal():assert sum(f['ratingCoveredPlayers'])==0
    if key=='cluj-2026':assert max(day[eligible])<date(2026,2,14).toordinal()
    w=data['w_'+key];w=w/w.sum(1)[:,None]
    for variant in (f,f['ablation'],f['teamOnly']):
        m=np.asarray(variant['mapProbabilities'])
        assert np.isfinite(m).all() and ((m>=.05)&(m<=.95)).all()
        bo1=(w*m).sum(1);bo3=np.zeros(120)
        for c in itertools.combinations(range(7),3):
            probs=m[:,c]
            pa,pb,pc=probs.T
            at_least_two=(pa*pb*(1-pc)+pa*(1-pb)*pc+(1-pa)*pb*pc+pa*pb*pc)
            prob_c=sum(w[:,i]*(w[:,j]/(1-w[:,i]))*(w[:,k]/(1-w[:,i]-w[:,j]))
                       for i,j,k in itertools.permutations(c))
            bo3+=at_least_two*prob_c
        for label,ps in [('bo1',bo1),('bo3',bo3)]:
            matrix=np.array(variant[label])
            np.testing.assert_allclose(matrix+matrix.T,1,rtol=0,atol=1e-12)
            np.testing.assert_allclose(matrix[np.triu_indices(16,1)],ps,rtol=0,atol=1.1e-8)
print('Verified 35,744 unique map labels, complete Cluj exclusion, 15 chronological event splits and 10,800 series probabilities.')
