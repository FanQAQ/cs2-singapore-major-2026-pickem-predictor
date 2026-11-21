'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
require(path.join(root,'dist/data.js'));
require('./model.js');
const close=require('./events.json');
for(const baseline of PICK_DATA) {
  const e={...baseline,closeSnapshot:close[baseline.id]};
  const updated=PickClose.view(e);
  const same=e.asOf===e.closeSnapshot.asOf;
  assert.equal(same,updated===e);
  assert.strictEqual(PickClose.view(e),updated);
  assert.strictEqual(PickClose.view(updated),updated);
  assert.strictEqual(updated.v4Model.masks,e.v4Model.masks);
  assert.strictEqual(updated.teams,e.teams);
  assert.equal(updated.v4Model.asOf,e.asOf);
  assert.equal(updated.mapVeto.asOf,updated.asOf);
  assert.equal(updated.mapStrength.asOf,updated.asOf);
  assert.deepEqual(Object.keys(updated.v4Model.teams).sort(),e.teams.map(t=>t.name).sort());
  assert.equal(e.asOf,e.closeSnapshot.baseAsOf);
  const later={...e, teams:e.teams.map((t,i)=>i===0?{...t,name:'new field entrant'}:t)};
  assert.strictEqual(PickClose.view(later),later);
}
console.log('Six historical/preview event views, unchanged controls, training dates, and field guards verified.');
