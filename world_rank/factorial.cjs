'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const {fields, strategies, seeds, budget, matrixHash, rounded} = require('../integrated_eval/runtime.cjs');
const {evaluate} = require('../research_cards/conditional.cjs');
const {blend, errors} = require('./evaluate.cjs');
const snapshots = require('./snapshots.json');
const baseline = require('../research_cards/combined.json');

function bo1Blend(event, flags, snapshot) {
  const base = PickLab.seriesMatrices(event, flags);
  const adjusted = blend(event, snapshot);
  const blended = PickLab.seriesMatrices(adjusted.event, flags);
  const matrix = {...base, bo1: blended.bo1};
  return {matrix, base, covered: adjusted.audit.filter(row => row.rank !== null).length};
}

function runStage(id) {
  const event = fields.find(e => e.id === id);
  const flags = {...strategies.base, regionVrs: true};
  const {matrix, base, covered} = bo1Blend(event, flags, snapshots[id]);
  assert.equal(matrixHash(base), baseline.stages.find(s => s.id === id).matrixSha256);
  const scores = evaluate({event, matrix}, seeds, () => {
    const replay = CS.replay(event.rounds);
    assert.equal(replay.matched, 33);
    return replay.actual;
  }, null, 'combined');
  return {...scores, covered, week:snapshots[id].date, errors:errors(matrix, event.rounds)};
}

function summarise(stages, score) {
  const bySeed = seeds.map((seed, i) => {
    const scores = stages.map(s => s.trials[i][score]);
    return {seed, passes:scores.filter(s => s.passed).length, hits:scores.reduce((n,s) => n+s.hits,0),
      bucketHits:[0,1,2].map(k => scores.reduce((n,s) => n+s.bucketHits[k],0))};
  });
  const mean = name => rounded(bySeed.reduce((n,s) => n+s[name],0)/seeds.length);
  return {fixed:bySeed[0],meanHits:mean('hits'),meanPasses:mean('passes'),bySeed};
}

async function main() {
  const rows = await Promise.all(fields.map(e => new Promise((resolve,reject) => {
    const worker = new Worker(__filename,{workerData:e.id});
    worker.once('message',resolve);
    worker.once('error',reject);
    worker.once('exit',n => {if(n) reject(Error('worker '+n));});
  })));
  const table = {};
  for (const [model, stages] of [['current',baseline.stages],['rankBo1',rows]]) {
    table[model] = {current:summarise(stages,'baselineScore'),combined:summarise(stages,'candidateScore')};
  }
  const report = {budget,table,rows};
  const file = path.join(__dirname,'factorial.json');
  if (process.argv.includes('--check')) assert.deepEqual(report,JSON.parse(fs.readFileSync(file,'utf8')));
  else fs.writeFileSync(file,JSON.stringify(report)+'\n');
  for (const [model, variants] of Object.entries(table)) for (const [card, s] of Object.entries(variants)) {
    console.log(model, card, s.fixed.hits,s.fixed.passes,s.fixed.bucketHits,s.meanHits,s.meanPasses);
  }
}

module.exports = {bo1Blend};
if (require.main === module) {
  if (isMainThread) main().catch(e => {console.error(e);process.exitCode=1;});
  else parentPort.postMessage(runStage(workerData));
}
