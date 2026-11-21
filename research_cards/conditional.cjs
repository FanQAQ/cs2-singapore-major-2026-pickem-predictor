'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const {fields, strategies, seeds, budget, matrixHash, cardScore} = require('../integrated_eval/runtime.cjs');
require('../region_vrs_model/model.js');
const reference = require('../method_eval/diagnostics.json');
const probabilities = require('../method_eval/report.json').totals.recommended.base;
const controls = {...strategies.base, regionVrs: true};

// CS.run publishes marginals pooled across both halves. Replay only its search
// stream here: the independent evaluation half must never select a slot.
function trainingCounts(matrix, count, seed) {
  assert.ok(!matrix.state, 'This research replay supports fixed pairwise probabilities.');
  let state = seed >>> 0;
  function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), state | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  }
  const counts = Array.from({length: 16}, () => [0, 0, 0, 0]);
  for (let trial = 0; trial < count; trial++) {
    const rounds = [], wins = new Uint8Array(16), losses = new Uint8Array(16);
    for (let round = 0; round < 5; round++) {
      const matches = [];
      for (const [i, j] of CS.nextPairs(rounds)) {
        const bo = CS.bestOf(wins[i], losses[i]);
        const pair = random() < matrix['bo' + bo][i][j] ? [i, j] : [j, i];
        wins[pair[0]]++;
        losses[pair[1]]++;
        matches.push(pair);
      }
      rounds.push(matches);
    }
    for (let i = 0; i < 16; i++) {
      const slot = wins[i] === 3 ? (losses[i] === 0 ? 0 : 1) : (wins[i] === 0 ? 2 : 3);
      counts[i][slot]++;
    }
  }
  return counts;
}

function assign(card, counts) {
  const selected = card.flatMap((slot, i) => slot <= 1 ? [i] : []);
  const rate = i => counts[i][0] / (counts[i][0] + counts[i][1] || 1);
  selected.sort((a, b) => rate(b) - rate(a) || a - b);
  const sweeps = new Set(selected.slice(0, 2));
  return card.map((slot, i) => slot > 1 ? slot : Number(!sweeps.has(i)));
}

// Initial seeding and simulated downside can disagree, especially for teams
// without many international opponents. Average the two ordinal ranks inside
// the eight unselected teams; equal ranks avoid inventing probability scales.
function pickTail(card, counts, evidence = 'both') {
  const available = card.flatMap((slot, i) => slot >= 2 ? [i] : []);
  const byRisk = [...available].sort((a, b) => counts[b][2] - counts[a][2] || a - b);
  const bySeed = [...available].reverse();
  function ranks(i) {
    const tiedRisks = byRisk.filter(j => counts[i][2] === counts[j][2]);
    const average = tiedRisks.reduce((sum, j) => sum + byRisk.indexOf(j), 0) / tiedRisks.length;
    if (evidence === 'seed') return bySeed.indexOf(i);
    if (evidence === 'risk') return average;
    return average + bySeed.indexOf(i);
  }
  available.sort((a, b) => ranks(a) - ranks(b) || counts[b][2] - counts[a][2] || b - a);
  const losses = new Set(available.slice(0, 2));
  return card.map((slot, i) => slot < 2 ? slot : (losses.has(i) ? 2 : 3));
}

const policies = {
  conditional: assign,
  seedTail: pickTail,
  combined: (card, counts) => pickTail(assign(card, counts), counts),
  seedOnly: (card, counts) => pickTail(card, counts, 'seed'),
  riskOnly: (card, counts) => pickTail(card, counts, 'risk'),
  conditionalSeed: (card, counts) => pickTail(assign(card, counts), counts, 'seed'),
  conditionalRisk: (card, counts) => pickTail(assign(card, counts), counts, 'risk')
};

function evaluate({event, matrix}, testSeeds, readActual, audit, policy = 'conditional') {
  const trials = testSeeds.map((seed, index) => {
    const simulation = CS.run(matrix, budget, seed);
    const search = trainingCounts(matrix, simulation.searchN, seed);
    const alternative = policies[policy](simulation.card, search);
    if (index === 0) {
      // Exact frequency equality in every bucket verifies RNG, pairings and BO.
      const evaluation = trainingCounts(matrix, simulation.evalN, (seed ^ 0xc5398da1) >>> 0);
      for (let i = 0; i < 16; i++) for (let k = 0; k < 4; k++) {
        assert.equal(search[i][k] + evaluation[i][k], Math.round(budget * simulation.probs[i][k]));
      }
      if (audit) assert.deepEqual(simulation.card, audit.card);
    }
    const compare = simulation.compareCards(simulation.card, alternative);
    return {seed, baseline: simulation.card, candidate: alternative, baselinePass: compare.original.pass,
      candidatePass: compare.swapped.pass, baselineOnly: compare.originalOnly, candidateOnly: compare.swappedOnly};
  });
  const actual = readActual();
  for (const [i, trial] of trials.entries()) {
    trial.baselineScore = cardScore(trial.baseline, actual);
    trial.candidateScore = cardScore(trial.candidate, actual);
    if (audit) assert.equal(trial.baselineScore.hits, audit.hitsBySeed[i]);
    if (policy === 'conditional') assert.equal(trial.candidateScore.bucketHits[2], trial.baselineScore.bucketHits[2]);
    if (policy === 'seedTail') assert.deepEqual(trial.candidateScore.bucketHits.slice(0, 2), trial.baselineScore.bucketHits.slice(0, 2));
  }
  return {id: event.id, asOf: event.asOf, date: event.date, teams: event.teams.map(t => t.name),
    matrixSha256: matrixHash(matrix), trials};
}

function summary(stages) {
  return stages[0].trials.map(({seed}, i) => {
    const result = {seed};
    for (const name of ['baseline', 'candidate']) {
      const scores = stages.map(s => s.trials[i][name + 'Score']);
      result[name] = {hits: scores.reduce((n, s) => n + s.hits, 0),
        passes: scores.filter(s => s.passed).length,
        bucketHits: [0, 1, 2].map(k => scores.reduce((n, s) => n + s.bucketHits[k], 0))};
    }
    return result;
  });
}

async function main() {
  const quick = process.argv.includes('--quick');
  const policy = process.argv.find(arg => arg.startsWith('--policy='))?.slice(9) || 'conditional';
  assert.ok(Object.hasOwn(policies, policy));
  if (process.argv.includes('--shanghai')) {
    assert.equal(policy, 'conditionalSeed', 'Only the locked development winner is scored here.');
    const fixture = require('../holdout_shanghai/fixture.cjs');
    const result = evaluate(fixture.makeForecast(), seeds, () => fixture.readOutcomes().actual, null, policy);
    const file = path.join(__dirname, 'conditionalSeed-shanghai.json');
    if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(fs.readFileSync(file)), result);
    else fs.writeFileSync(file, JSON.stringify(result) + '\n');
    console.log(result.id, result.trials[0].baselineScore, result.trials[0].candidateScore);
    return;
  }
  if (process.argv.includes('--holdout')) {
    const fixture = require('../holdout_copenhagen/fixture.cjs');
    const result = evaluate(fixture.makeForecast(), seeds, () => fixture.readOutcomes().actual, null, policy);
    const file = path.join(__dirname, policy + '-holdout.json');
    if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(fs.readFileSync(file)), result);
    else fs.writeFileSync(file, JSON.stringify(result) + '\n');
    console.log(result.id, result.trials[0].baselineScore, result.trials[0].candidateScore);
    return;
  }
  const stages = await Promise.all(fields.map(event => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {workerData: {id: event.id, quick, policy}});
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => {if (code) reject(Error('Worker exit ' + code));});
  })));
  const bySeed = summary(stages);
  const report = {budget, bo1: probabilities.bo1, bo3: probabilities.bo3, bySeed, stages};
  console.table(stages.map(s => ({stage: s.id, before: s.trials[0].baselineScore.hits, after: s.trials[0].candidateScore.hits})));
  console.table(bySeed.slice(0, 1));
  if (quick) return;
  const snapshot = path.join(__dirname, policy + '.json');
  if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(fs.readFileSync(snapshot)), report);
  else fs.writeFileSync(snapshot, JSON.stringify(report) + '\n');
}

module.exports = {assign, evaluate, summary};
if (isMainThread && require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
if (!isMainThread && require.main === module) {
  const event = fields.find(e => e.id === workerData.id);
  const audit = reference.stages.find(s => s.id === event.id).models.recommended.base;
  const matrix = PickLab.seriesMatrices(event, controls);
  assert.equal(matrixHash(matrix), audit.matrixSha256);
  parentPort.postMessage(evaluate({event, matrix}, workerData.quick ? seeds.slice(0, 1) : seeds, () => {
    const replay = CS.replay(event.rounds);
    assert.equal(replay.matched, 33);
    return replay.actual;
  }, audit, workerData.policy));
}
