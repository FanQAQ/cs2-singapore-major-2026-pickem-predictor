'use strict';
const assert = require('node:assert/strict');
require('../dist/data.js');
require('./model.js');
const frozen = require('./events.json');
let checked = 0;
for (const event of PICK_DATA) {
  const signal = frozen[event.id];
  const live = {...event, lanSignal:signal};
  assert.ok(signal.asOf < event.date.slice(0, 10));
  assert.equal(signal.covered, Object.values(signal.teams).filter(x => x.n >= 2).length);
  for (const row of Object.values(signal.teams)) {
    assert.equal(row.n, row.observations.length);
    if (row.latest) assert.ok(row.latest <= signal.asOf);
    for (const [format, p, y, weight] of row.observations) {
      assert.ok([1, 3].includes(format) && 0 < p && p < 1 && [0, 1].includes(y));
      assert.ok(weight > 0 && weight <= 1);
    }
  }
  for (let i=0; i<16; i++) for (let j=0; j<i; j++) {
    for (const format of [1,3]) for (const p of [.07,.43,.5,.75,.94]) {
      const adjusted = PickLanSignal.adjust(live,i,j,p,format);
      const swapped = PickLanSignal.adjust(live,j,i,1-p,format);
      assert.ok(adjusted > 0 && adjusted < 1 && Math.abs(adjusted + swapped - 1) < 1e-12);
      assert.ok(Math.abs(Math.log(adjusted/(1-adjusted))-Math.log(p/(1-p))) <= .45000001);
      checked++;
    }
  }
  const changed = live.teams.map(t => ({...t,roster:t.roster.map(n=>n+'_new')}));
  assert.equal(PickLanSignal.adjust({...live, teams:changed},0,1,.42,3),.42);
  assert.equal(PickLanSignal.adjust({...live, lanSignal:{...signal, asOf:signal.stageStart}},0,1,.42,3),.42);
  assert.equal(PickLanSignal.adjust({...live, date:'2000-01-01'},0,1,.42,3),.42);
  assert.equal(PickLanSignal.adjust(live,0,1,1,3),1);
  assert.equal(PickLanSignal.adjust(live,0,1,0,1),0);
}
console.log('Verified',checked,'pair/format/probability cases, roster and date protections.');
