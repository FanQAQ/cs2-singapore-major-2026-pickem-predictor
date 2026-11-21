'use strict';
const assert = require('node:assert/strict');
const {checkMatrix,matrixHash} = require('../integrated_eval/runtime.cjs');
for (const name of ['region-vrs','methods','lan-signal','pick-signal','major-form'])
  require('../dist/'+name+'.js');
require('./inputs.js');
const events = PickStageInputs.events(PickLab.events,require('./inputs.json'));
assert.equal(events.length,8);
let one = 0, three = 0;
for (const event of events) {
  const replay = CS.replay(event.rounds);
  assert.ok(replay.ok && replay.matched===33);
  const opening = PickLab.events.find(e=>e.id===event.parent);
  assert.ok(opening.boostModel.lastMatch <= event.asOf && event.asOf < event.date);
  const matrices = ['recommended','tree'].map(method=>{
    const flags = PickMethods.defaults(method,event);
    // This check compares the original frozen base before optional new calibration.
    const m = PickStageInputs.matrix(event,{...flags,stageTraining:false});
    checkMatrix(m);
    return m;
  });
  assert.notDeepEqual(matrices[0].bo3,matrices[1].bo3);
  if (event.allBo3) for (const m of matrices) assert.deepEqual(m.bo1,m.bo3);
  if (event.id.includes('-2024-')) {
    const baseline = require('../holdout_'+event.parent+'/baseline.json');
    assert.equal(matrixHash(matrices[0]),baseline.matrixSha256);
  }
  for (const f of event.formats.flat()) {
    if (f===1) one++;
    else {assert.equal(f,3); three++;}
  }
}
assert.deepEqual([one,three],[140,124]);
console.log('8 fields, 264 pairings, 140 BO1, 124 BO3, 16 method/field matrices verified.');
