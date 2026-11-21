/* Cross-check every serialized map-set probability against the original veto enumerator. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const read = file => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,file))));
const model = read('models.json.gz').fields;
const profiles = read('profiles.json.gz').fields;
const source = fs.readFileSync(path.join(__dirname,'../map_model/model.js'),'utf8');
const originalExport = 'globalThis.PickMap={apply};';
assert.equal(source.split(originalExport).length, 2);
const oracle = {};
// Expose a private function to this test in an isolated VM, using its repository implementation.
vm.runInNewContext(source.replace(originalExport, 'globalThis.vetoOutcomes=vetoOutcomes;'),oracle);
let comparisons = 0, maxDifference = 0;
for (const [key,field] of Object.entries(model)) {
  assert.deepEqual(field.bo1,field.baseline.bo1);
  assert.equal(field.pairs.length,120);
  const order = new Map(field.triples.map((s,i)=>[s.join('|'),i]));
  for (const row of field.pairs) {
    const {a,b,nA,nB,original,veto,maps} = row;
    const sum = values => values.reduce((s,x)=>s+x,0);
    assert.ok(Math.abs(sum(original)-1)<1e-12 && Math.abs(sum(veto)-1)<1e-12);
    assert.ok(Math.min(...original)>0 && Math.min(...veto)>0 && maps.length===7);
    if (!nA&&!nB) {
      assert.deepEqual(original,veto);
      assert.equal(field.bo3[a][b],field.baseline.bo3[a][b]);
      continue;
    }
    const prior=[a,b].map(t=>profiles[key].teams[field.teams[t]].bo3);
    const originalEngine = oracle.vetoOutcomes(prior,field.pool,3,field.rules==='ABABAB');
    assert.equal(originalEngine.length,35);
    for (const {maps: set,mass} of originalEngine) {
      const i = order.get(set.map(k=>field.pool[k]).join('|'));
      const delta = Math.abs(veto[i]-mass);
      assert.ok(delta<1e-12,key+' '+a+'/'+b);
      maxDifference = Math.max(maxDifference,delta);
      comparisons++;
    }
    const probability=sum(field.triples.map((set,i)=>{
      const [p,q,r]=set.map(m=>maps[field.pool.indexOf(m)]);
      return veto[i]*(p*q+p*r+q*r-2*p*q*r);
    }));
    assert.ok(Math.abs(probability-field.bo3[a][b]) < 6e-11);
    assert.equal(Math.round(1e10*field.bo3[a][b])+Math.round(1e10*field.bo3[b][a]),1e10);
  }
}
console.log(JSON.stringify({fields:Object.keys(model).length,comparisons,maxDifference}));
