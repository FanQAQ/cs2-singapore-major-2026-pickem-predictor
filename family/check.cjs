/* Invoked by build.py --check with fresh sklearn predictions. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('./boost.js');
const {models, cases} = JSON.parse(fs.readFileSync(0,'utf8'));
for (const {event, mask, x, p} of cases) {
  x.forEach((v,i) => {
    const actual = PickBoost.pooled(models[event],mask,v);
    const reverse = PickBoost.pooled(models[event],mask,v.map(n=>-n));
    assert.ok(Math.abs(actual-p[i]) < 1e-12, event+' python/js disagreement');
    assert.ok(Math.abs(actual+reverse-1) < 1e-12, event+' lost symmetry');
  });
}
console.log('Checked Python/browser probabilities for '+cases.length+' edition-feature combinations.');
