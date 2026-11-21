'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {root, productionSeed, budget} = require('../integrated_eval/runtime.cjs');
for (const moduleName of ['region-vrs','major-form','lan-signal','pick-signal','methods']) {
  require(path.join(root,'dist',moduleName+'.js'));
}
require('./alternatives.js');

async function main() {
  const event = PickLab.events.find(e => e.id === 'singapore');
  const release = require('../method_eval/report.json');
  assert.deepEqual(event.methodSelection,release.selected,'Reassemble the stage inputs before freezing hints');
  const frozen = {event:event.id, methods:{}, byFingerprint:{}};
  for (const method of ['recommended','tree']) {
    const flags = PickMethods.defaults(method,event);
    const result = PickLab.run(event.id,flags,budget,productionSeed);
    assert.equal(result.path.lockedCount,0);
    const signature = await PickAlternatives.fingerprint(result.matchups,result.card,productionSeed);
    assert.ok(signature);
    frozen.methods[method] = signature;
    if (!Object.prototype.hasOwnProperty.call(frozen.byFingerprint,signature)) {
      const hint = await PickAlternatives.find(result,result.card,{seed:productionSeed});
      frozen.byFingerprint[signature] = {hint};
    }
  }
  const file = path.join(__dirname, 'singapore.json');
  const contents = JSON.stringify(frozen,null,2)+'\n';
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(file,'utf8'),contents);
  else fs.writeFileSync(file,contents);
  console.log('Verified two independent Singapore swap records.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
