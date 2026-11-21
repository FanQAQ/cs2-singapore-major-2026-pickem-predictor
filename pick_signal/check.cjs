'use strict';
const assert = require('node:assert/strict');
const files = require('./events.json');
const counts = require('../feature_study/pick_coverage.json');
require('./model.js');
require('../dist/data.js');

for (const e of PICK_DATA) {
  const model = files[e.id], coverage = counts[e.id];
  const event = {...e,pickSignal:model};
  assert.equal(model.asOf,e.asOf);
  assert.ok(model.lastTraining <= model.asOf && model.asOf < e.date.slice(0,10));
  assert.equal(model.pickTeams,coverage.covered);
  let changed = 0;
  for (let i = 0; i < e.teams.length; ++i) {
    const team = e.teams[i].name;
    assert.equal(model.teams[team].picks,coverage.teams[team]);
    for (let j = i+1; j < e.teams.length; ++j) {
      const a = PickSignal.adjust(event,i,j,.62,3);
      const b = PickSignal.adjust(event,j,i,.38,3);
      assert.ok(Math.abs(a+b-1) < 1e-12);
      assert.equal(PickSignal.adjust(event,i,j,.62,1),.62);
      if (!model.teams[team].comparableMaps || !model.teams[e.teams[j].name].comparableMaps) {
        assert.equal(a,.62);
      }
      if (a !== .62) changed++;
    }
  }
  console.log(e.id,changed,'/ 120 BO3 pairs');
}
