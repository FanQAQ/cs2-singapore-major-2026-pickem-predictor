'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {v4, budget, productionSeed} = require('../strategy_v4_eval/settings.cjs');
const reference = require('../strategy_v4_eval/report.json').opening;
const profiles = JSON.parse(fs.readFileSync(0, 'utf8'));
const rounded = n => +n.toFixed(7);

function evaluate(event) {
  const input = profiles[event.id];
  assert.equal(input.asOf, event.asOf);
  assert.ok(event.asOf < event.date.slice(0, 10));
  const base = PickLab.seriesMatrices(event, v4);
  const teamProfiles = event.teams.map(t => input.profiles[t.name]);
  const extended = {};
  for (const format of ['bo1', 'bo3']) {
    extended[format] = base[format].map((row, i) => Array.from(row, (p, j) => {
      const [a, na] = teamProfiles[i], [b, nb] = teamProfiles[j];
      if (i === j || !na || !nb) return p;
      return 1 / (1 + Math.exp(-Math.log(p / (1 - p)) - input.slope * (a - b)));
    }));
  }
  const replay = CS.replay(event.rounds);
  assert.ok(replay.ok && replay.total === 33);
  const metric = {n:0, coveredMatches:0, base:{brier:0, logLoss:0}, candidate:{brier:0, logLoss:0}};
  const wins = Array(16).fill(0), losses = Array(16).fill(0);
  for (const round of event.rounds) {
    for (const [a, b] of round) {
      const format = wins[a] === 2 || losses[a] === 2 ? 'bo3' : 'bo1';
      for (const [model, matrix] of [['base', base], ['candidate', extended]]) {
        const p = matrix[format][a][b];
        assert.ok(p > 0 && p < 1 && Math.abs(p + matrix[format][b][a] - 1) < 1e-10);
        metric[model].brier += (1-p)**2;
        metric[model].logLoss -= Math.log(p);
      }
      metric.n++;
      if (teamProfiles[a][1] && teamProfiles[b][1]) metric.coveredMatches++;
    }
    for (const [a,b] of round) { wins[a]++; losses[b]++; }
  }
  assert.equal(metric.n, 33);
  for (const [name, matrix] of [['base', base], ['candidate', extended]]) {
    for (const k of ['brier','logLoss']) metric[name][k] = rounded(metric[name][k] / metric.n);
    const sim = CS.run(matrix, budget, productionSeed);
    metric[name].cardHits = CS.actualScore(sim.card, replay.actual);
  }
  const old = reference.stages.find(x => x.id === event.id).models.v4;
  assert.equal(metric.base.brier, old.brier);
  assert.equal(metric.base.logLoss, old.logLoss);
  assert.equal(metric.base.cardHits, old.card.hits);
  return {event:event.id, asOf:input.asOf, trainN:input.trainN, slope:rounded(input.slope),
    teamsWithHistory:input.withHistory, ...metric};
}

const stages = PickLab.events.filter(e => e.hasResults).sort((a,b)=>a.date.localeCompare(b.date)).map(evaluate);
const total = {n:0, teamsWithHistory:0, coveredMatches:0, base:{}, candidate:{}};
for (const k of ['n','teamsWithHistory','coveredMatches']) total[k] = stages.reduce((s, e) => s + e[k], 0);
for (const name of ['base','candidate']) {
  for (const key of ['brier','logLoss'])
    total[name][key] = rounded(stages.reduce((s,e) => s + e[name][key] * e.n, 0) / total.n);
  total[name].cardHits = stages.reduce((s,e) => s + e[name].cardHits, 0);
  total[name].passes = stages.filter(e => e[name].cardHits >= 5).length;
}
assert.equal(total.n, 165);
process.stdout.write(JSON.stringify({budget, productionSeed, stages, total},null,2)+'\n');
