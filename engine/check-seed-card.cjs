'use strict';
const assert = require('node:assert/strict');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const {fields, strategies, budget, matrixHash} = require('../integrated_eval/runtime.cjs');
require('../region_vrs_model/model.js');
const report = require('../research_cards/conditionalSeed.json');
const flags = {...strategies.base, regionVrs:true, seedConditionalCard:true};

function checkStage(id, full) {
  const stage = report.stages.find(s => s.id === id);
  const matrix = PickLab.seriesMatrices(fields.find(f => f.id === id), flags);
  assert.equal(matrixHash(matrix), stage.matrixSha256);
  for (const t of full ? stage.trials : stage.trials.slice(0,1)) {
    const s = PickLab.simulateMatrices(matrix, flags, budget, t.seed);
    assert.deepEqual(s.basePassCard, t.baseline);
    assert.deepEqual(s.card, t.candidate);
    assert.equal(s.pass, t.candidatePass);
    assert.equal(s.score(s.basePassCard).pass, t.baselinePass);
    assert.equal(s.cardPolicy, 'seedConditionalCard');
    for (const counts of s.searchCounts) assert.equal(counts.reduce((a,b) => a+b,0), s.searchN);
    const compare = s.compareCards(s.basePassCard,s.card);
    assert.equal(compare.originalOnly, t.baselineOnly);
    assert.equal(compare.swappedOnly, t.candidateOnly);
  }
}

function checkLocksAndObjectives() {
  const table = Array.from({length:16}, () => Array(16).fill(.5));
  const matrix = {bo1:table, bo3:table, state:{scales:Array(16).fill(.15)}};
  const seed = 17, budget = 150;
  let complete = [];
  for (let r=1; r<=5; r++) complete.push(CS.scenario(complete).rounds.at(-1).matches.map(m => m.b));
  for (const locks of [[], [[null]], [[8]], complete]) {
    const base = PickLab.simulateMatrices(matrix, {locks}, budget, seed);
    const s = PickLab.simulateMatrices(matrix, {seedConditionalCard:true, locks}, budget, seed);
    assert.ok(!('cardPolicy' in base) && !('searchCounts' in base));
    assert.deepEqual(s.basePassCard, base.card);
    assert.deepEqual(s.expectedCard, base.expectedCard);
    assert.deepEqual(s.probs, base.probs);
    assert.equal(s.cardPolicy, s.path.lockedCount ? 'lockedPassCard' : 'seedConditionalCard');
    if (s.path.lockedCount) assert.deepEqual(s.card, base.card);
    if (s.path.complete) assert.equal(s.expected, 10);
    const robust = PickLab.simulateMatrices(matrix, {seedConditionalCard:true,robustCard:true,locks}, budget, seed);
    assert.deepEqual(robust.passCard, s.card);
    assert.deepEqual(robust.card, robust.robust.selected === 'pass' ? s.card : base.expectedCard);
    assert.deepEqual(robust.histogram, s.score(robust.card).histogram);
  }
}

function checkFormatSpecificState() {
  const table=Array.from({length:16},()=>Array(16).fill(.5)),scales=Array(16).fill(0);
  scales[0]=1;
  const odds={bo1:table,bo3:table,state:{scales}},winners=[CS.scenario([]).rounds[0].matches.map(m=>m.a)];
  const chance=s=>s.path.rounds[1].matches.find(m=>m.a===0||m.b===0).probability;
  const shared=chance(CS.run(odds,100,19,winners));
  assert(Math.abs(shared-.5)>.01);
  odds.state.bo3Only=true;
  assert(Math.abs(chance(CS.run(odds,100,19,winners))-.5)<1e-10);
  odds.state.bo3Only=false;
  assert.equal(chance(CS.run(odds,100,19,winners)),shared);
  odds.allBo3=true;
  const full=CS.sampleTerminalMasks(odds,64,21);
  odds.state.bo3Only=true;
  assert.deepEqual(full,CS.sampleTerminalMasks(odds,64,21));
  for(const p of [0,.01,.47,.83,1]){
    const c=CS.stateCases(p,.3,.1);
    assert(Math.abs(c.reduce((a,b)=>a+b,0)/4-p)<1e-14);
  }
}

if (isMainThread) {
  checkLocksAndObjectives();
  checkFormatSpecificState();
  const full = process.argv.includes('--full');
  Promise.all(report.stages.map(s => new Promise((resolve,reject) => {
    const w = new Worker(__filename, {workerData:{id:s.id,full}});
    w.once('error',reject);
    w.once('exit', n => n ? reject(Error('worker '+n)) : resolve());
  }))).then(() => console.log('Frozen research cards, held-out scores, locks, and robust selection verified.'))
    .catch(e => {console.error(e); process.exitCode=1;});
} else {
  checkStage(workerData.id, workerData.full);
  parentPort.close();
}
