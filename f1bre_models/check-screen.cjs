'use strict';
const assert = require('node:assert/strict');
const {historical} = require('./screen.cjs');
const references = require('./format_split/convergence.json').results;
const archived = require('./report.json').fields;
const counts = {equalHits:0, equalPass:0, sameOrder:0, tieChange:0, reversal:0};
for(const id of new Set(references.map(r=>r.id))) {
  const result = historical(id);
  const field = archived.find(f=>f.id===id);
  for(const name of ['elo','ml']) {
    for(const bo of ['bo1','bo3'])
      assert.deepEqual(result.methods[name][bo], field.methods[name].errors[bo]);
  }
  for(const [i,run] of result.methods.hybrid.runs.entries()) {
    const ref = references.find(r=>r.id===id && r.seed===run.seed);
    assert.equal(ref.count,360000);
    counts.equalHits += Number(run.observed.hits===ref.hits);
    counts.equalPass += Number((run.observed.hits>=5)===(ref.hits>=5));
    const order = Math.sign(result.methods.ml.runs[i].observed.hits-result.methods.elo.runs[i].observed.hits);
    const oldOrder = Math.sign(field.methods.ml.hits[i]-field.methods.elo.hits[i]);
    if(order===oldOrder) counts.sameOrder++;
    else if(!order || !oldOrder) counts.tieChange++;
    else counts.reversal++;
  }
  if(id==='cologne-2026-3') {
    assert.equal(result.distinctMatrices,2);
    assert.equal(result.methods.ml.runs,result.methods.hybrid.runs);
  }
}
assert.deepEqual(counts,{equalHits:6,equalPass:7,sameOrder:7,tieChange:2,reversal:0});
console.log(counts);
