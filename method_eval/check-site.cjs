'use strict';
const assert = require('node:assert/strict');
const {root,fields,matrixHash} = require('../integrated_eval/runtime.cjs');
const path = require('node:path');
for (const file of ['region-vrs.js','lan-signal.js','pick-signal.js']) {
  require(path.join(root,'dist',file));
}
const report = require('./report.json');
const details = require('./diagnostics.json');
const checked = [...fields, PickLab.events.find(e=>e.id==='singapore')];
let count = 0;
for (const event of checked) {
  for (const [method,base] of Object.entries(details.controls)) {
    for (const variant of ['base','lan','pick','both']) {
      const flags = {...base,lanSignal:['lan','both'].includes(variant),pickSignal:['pick','both'].includes(variant)};
      const matrix = PickLab.seriesMatrices(event,flags);
      const expected = event.hasResults
        ? details.stages.find(s=>s.id===event.id).models[method][variant]
        : report.singapore[method].variants[variant];
      assert.equal(matrixHash(matrix),expected.matrixSha256,[event.id,method,variant].join(' '));
      if(event.hasResults && variant==='base'){
        const score=CS.actualScore(expected.card,CS.replay(event.rounds).actual);
        assert.equal(score,event.historyPresets[method==='recommended'?'regionVrs':'boost'].model);
      }
      count++;
    }
  }
}
console.log('Verified',count,'published Swiss probability matrices against independently scored candidates.');
