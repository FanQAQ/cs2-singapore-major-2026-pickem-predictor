'use strict';
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs'), path = require('node:path');
const {Worker, isMainThread, workerData, parentPort} = require('node:worker_threads');
const {fieldFor, modelsFor, grouping, chooseCards, compareOnAudit, truthFor} = require('./evaluate.cjs');
const {samples} = require('./draw.cjs');
const {cardScore} = require('../f1bre_models/score.cjs');
const {seeds, budget} = require('../strategy_v4_eval/settings.cjs');
const history = require('../multi_stage/inputs.json');
const byId = new Map(history.map(s => [s.id, s]));
const policies = ['standard','within','grouped'];
const ids = history.filter(s => s.stage === 3).map(s => s.id);
const n = budget / 2;
const sum = xs => xs.reduce((s,x) => s+x, 0);
const hash = set => createHash('sha256').update(Buffer.from(
  set.outcomes.buffer, set.outcomes.byteOffset, set.outcomes.byteLength)).digest('hex');

function profiles(original) {
  const data = original.history.map(id => {
    const source = byId.get(id), replay = CS.replay(source.rounds);
    assert(replay.ok && replay.matched === 33);
    return {id, edition: source.parent, actual: replay.actual, points: source.teams.map(t => t.points)};
  });
  const editions = [...new Set(data.map(s => s.edition))];
  const out = {};
  for (const name of ['full', ...editions, 'none']) {
    const keep = name === 'none' ? [] : data.filter(s => s.edition !== name);
    const prior = keep.length ? PickFinalCard.prior(original.points, keep) : null;
    out[name] = {...original, prior, history: keep.map(s => s.id)};
  }
  assert.deepEqual(out.full, original);
  return out;
}

function summary(rows, name) {
  const scores = rows.map(r => r.scores[name]);
  return {mainHits: scores[0].hits,
    passingSeeds: scores.filter(s => s.hits >= 5).length, totalHits: sum(scores.map(s => s.hits)),
    auditPasses: sum(rows.map(r => r.audit[name].passes))};
}

function stage(id, model) {
  const f = fieldFor(id), matrix = modelsFor(f)[model], truth = truthFor(f);
  const original = require('./cache/' + id + '-major.json');
  assert.deepEqual(original.actual, truth.actual);
  const priors = profiles(grouping(f));
  const cases = Object.fromEntries(Object.keys(priors).map(name => [name, {
    history: priors[name].history, rows: []
  }]));
  for (const [index, seed] of seeds.entries()) {
    const training = samples(f, matrix, n, seed, 'major');
    const testing = samples(f, matrix, n, (seed ^ 0xc5398da1) >>> 0, 'major');
    const ref = original.methods[model].runs[index];
    assert.equal(ref.seed, seed);
    assert.deepEqual([hash(training),hash(testing)], ref.paths);
    for (const [key, cfg] of Object.entries(priors)) {
      const cards = chooseCards(training, f, cfg);
      const scores = Object.fromEntries(policies.map(p => [p, cardScore(cards[p], truth.actual)]));
      const audit = compareOnAudit(cards, testing);
      assert.deepEqual(cards.standard, ref.standard);
      assert.deepEqual(scores.standard, ref.scores.standard);
      assert.deepEqual(audit.standard, ref.audit.standard);
      if (key === 'full') {
        for (const p of policies) assert.deepEqual(cards[p], ref[p]);
        assert.deepEqual(scores, ref.scores);
        assert.deepEqual(audit, ref.audit);
      }
      cases[key].rows.push({seed, cards, scores, audit});
    }
  }
  for (const entry of Object.values(cases)) {
    entry.summary = Object.fromEntries(policies.map(p => [p, summary(entry.rows,p)]));
  }
  for (const entry of Object.values(cases)) {
    entry.delta = Object.fromEntries(policies.map(p => {
      const base = cases.full.summary[p], test = entry.summary[p];
      const delta = Object.fromEntries(Object.keys(base).map(k => [k, test[k]-base[k]]));
      const comparisons = entry.rows.map((r,i) => r.scores[p].hits-cases.full.rows[i].scores[p].hits);
      return [p,{...delta, moreHits: comparisons.filter(x=>x>0).length,
        sameHits: comparisons.filter(x=>x===0).length, fewerHits: comparisons.filter(x=>x<0).length}];
    }));
  }
  return {id, model, teams: f.teams.map(t=>t.name), actual: truth.actual, cut: f.cutoff, cases};
}

function combine(stages) {
  const scenarios = [...new Set(stages.flatMap(s=>Object.keys(s.cases)))];
  const result = {};
  for (const name of scenarios) {
    // Dropping a later edition leaves an earlier target's prior unchanged.
    const cases = stages.map(s => s.cases[name] ?? s.cases.full);
    result[name] = {};
    for (const p of policies) {
      const bySeed = seeds.map((seed,i)=>{
        const hits = cases.map(c=>c.rows[i].scores[p].hits);
        return {seed, passes: hits.filter(h=>h>=5).length, hits: sum(hits)};
      });
      result[name][p] = {mainPasses: bySeed[0].passes, mainHits: bySeed[0].hits,
        passCountBySeed: [0,1,2,3].map(k=>bySeed.filter(r=>r.passes===k).length),
        totalPassingStages: sum(bySeed.map(r=>r.passes)), totalHits: sum(bySeed.map(r=>r.hits)), bySeed};
    }
  }
  return result;
}

async function run() {
  assert.equal(ids.length, 3);
  const models = {};
  for (const model of ['ml','baseline']) {
    const stages = await Promise.all(ids.map(id=>new Promise((resolve,reject)=>{
      const worker = new Worker(__filename, {workerData: {id,model}});
      worker.once('message',resolve);
      worker.once('error',reject);
      worker.once('exit',code=>{if(code)reject(Error(id+' '+code));});
    })));
    models[model] = {stages, summary: combine(stages)};
  }
  const bytes = JSON.stringify({seeds, selected: n, audit: n, models})+'\n';
  const file = path.join(__dirname,'donor-check.json');
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(file,'utf8'),bytes);
  else fs.writeFileSync(file,bytes);
  console.log('Verified 180 model/stage/seed runs, all three reference cards, both path hashes, and all donor deletions.');
}
if (require.main===module) {
  if (isMainThread) run().catch(error=>{console.error(error);process.exitCode=1;});
  else parentPort.postMessage(stage(workerData.id,workerData.model));
}
