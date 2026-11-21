'use strict';

const assert = require('node:assert/strict');
const {fields, strategies} = require('../integrated_eval/runtime.cjs');
require('../dist/region-vrs.js');
require('./alternatives.js');
const flags = {...strategies.base, regionVrs:true};

async function checkStage(id, expectedNames) {
  const event = fields.find(e => e.id === id);
  const sim = PickLab.run(id, flags);
  const initial = sim.card.slice();
  const pending = PickAlternatives.find(sim, sim.card);
  assert.equal(pending, PickAlternatives.find(sim, sim.card));
  const hint = await pending;
  assert.ok(hint);
  assert.deepEqual([hint.perfectTeam,hint.ordinaryTeam].map(i => event.teams[i].name), expectedNames);
  assert.deepEqual(sim.card, initial);
  assert.deepEqual(hint.card.filter((category,i) => category !== initial[i]).sort(), [0,1]);
  assert.ok(hint.interval[0] >= -.01 && hint.interval[1] <= .01);
  assert.ok(hint.interval[0] <= hint.delta && hint.interval[1] >= hint.delta);
  assert.ok([100000,400000].includes(hint.n));
  assert.ok(Math.abs(hint.swappedPass - hint.originalPass - hint.delta) < 1e-12);
  assert.equal(await PickAlternatives.find(sim, hint.card), null);
  return {sim, hint};
}

async function main() {
  const {sim, hint} = await checkStage('shanghai', ['FURIA','Liquid']);
  assert.equal(CS.actualScore(sim.card,sim.observed),3);
  assert.equal(CS.actualScore(hint.card,sim.observed),5);
  await checkStage('cologne', ['B8','BIG']);
  const signature = await PickAlternatives.fingerprint(sim.matchups, sim.card, 33719);
  assert.ok(signature);
  const frozen = {byFingerprint:{[signature]:{hint}}};
  const unusable = () => {throw Error('Matching frozen defaults must bypass comparison');};
  const fresh = {...sim, compareCards:unusable};
  assert.equal(await PickAlternatives.find(fresh, fresh.card, {frozen}),hint);
  const explicitlyEmpty = {...fresh};
  assert.equal(await PickAlternatives.find(explicitlyEmpty, explicitlyEmpty.card,
    {frozen:{byFingerprint:{[signature]:{hint:null}}}}),null);
  const changed = structuredClone(sim.matchups);
  changed.bo3[0][1] += .0000001;
  assert.notEqual(await PickAlternatives.fingerprint(changed, sim.card, 33719),signature);
  assert.notEqual(await PickAlternatives.fingerprint(sim.matchups, sim.card, 33718),signature);
  assert.notEqual(await PickAlternatives.fingerprint(sim.matchups, hint.card, 33719),signature);
  const closed = {...sim, path:{...sim.path, complete:true}};
  assert.equal(await PickAlternatives.find(closed, closed.card), null);

  // Force a conditioning result with a single open match so the passed locks can be inspected.
  const fake = {...sim, path:{complete:false, lockedCount:1, rounds:[{matches:[{winner:8},{winner:null}]}]}};
  const workerFallback = CS.pairedPassSample;
  try {
    let seen = 0;
    CS.pairedPassSample = (matrix,n,seed,locks,card,swapped) => {
      assert.equal(matrix, sim.matchups);
      assert.deepEqual(locks, [[8,null]]);
      assert.deepEqual(card, sim.card);
      assert.equal(swapped[hint.perfectTeam],1);
      seen += n;
      return {n,expectedOnly:n/4,passOnly:n/4,both:n/4,neither:n/4};
    };
    const result = await PickAlternatives.find(fake, fake.card,{frozen});
    assert.equal(seen, 100000);
    assert.equal(result.delta, 0);
    const zero = {...fake, probabilities:fake.probabilities.map(row=>[0,0,row[2],row[3]])};
    assert.equal(await PickAlternatives.find(zero, zero.card), null);
    assert.equal(seen,100000);
    CS.pairedPassSample = (matrix,n) => ({n,expectedOnly:n/4,passOnly:0,both:n/4,neither:n/2});
    const contradicted = {...fake};
    assert.equal(await PickAlternatives.find(contradicted, contradicted.card), null);
  } finally {
    CS.pairedPassSample = workerFallback;
  }
  console.log('Verified two historical cards, independent confirmation, locks, cache and manual-card exclusion.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
