/* Evaluate frozen pre-stage parameters. Historical winners are used only for scoring. */
"use strict";
const assert = require("node:assert/strict");
for (const filename of ["engine", "format", "style-model", "rolling", "boost", "data", "v4", "map-model", "close-model", "region-risk", "region-vrs", "major-form", "robust-card", "pick-signal", "lan-signal", "methods", "adapter"])
  require("../dist/" + filename + ".js");

const archived = require("../analysis/audit.json");
const rows = [];
const seedCard = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
const basic = {format:false};
const fullPooled = {form:true, strong:true, weak:true, format:false};
const fullSplit = {...fullPooled, format:true};
const variants = [];
const presets = {};
const defaults = {format:true,shrinkBO:true};
const boosted = {...fullSplit,shrinkBO:true,family:'boost'};
const current = {n:0,correct:0,brier:0};
const archivedCurrent = {n:0,correct:0,brier:0};
const boost = {n:0,correct:0,brier:0};
const v4 = {n:0,correct:0,brier:0};

function record(metric, p) {
  metric.n++;
  metric.correct += p > .5 ? 1 : p === .5 ? .5 : 0;
  metric.brier += (1-p)**2;
}
const bins = {1:{n:0,pooled:0,split:0}, 3:{n:0,pooled:0,split:0}};

for (const event of PickLab.events) {
  assert.equal(event.teams.length,16);
  assert.ok(event.teams.every(t => t.points === null || (t.points > 0 && Number.isFinite(t.points))));
  if (!event.hasResults) continue;
  const replay = CS.replay(event.rounds);
  assert.ok(replay.ok, event.id + " has unmatched pairs");
  assert.equal(replay.total,33);
  const scores = {};
  for (const [label,flags] of [["vrs",basic],["pooled",fullPooled],["full",fullSplit]]) {
    const result = PickLab.run(event.id,flags,6000);
    scores[label] = CS.actualScore(result.card, replay.actual);
    for (const probs of result.probabilities) assert.ok(Math.abs(probs.reduce((a,b) => a+b,0)-1)<1e-8);
    assert.ok(Math.abs(result.score(result.card).passRate-result.passRate)<1e-8);
  }
  const seed = CS.actualScore(seedCard,replay.actual);
  const historical = archived.events.find(row=>row.event===event.id);
  if (historical) assert.equal(seed,historical.cards.seed.total);
  rows.push({id:event.id,label:event.label,seed,...scores});
  const variant = {id:event.id,label:event.label,seed,old:historical?.cards.v2.total ?? null};
  presets[event.id] = {};
  for (const [key, options] of Object.entries({
    sameBudget:{}, boost:boosted, v4:PickV4.preset, map:{...PickV4.preset,mapVeto:true}, regionVrs:{...PickV4.preset,regionVrs:true}, majorForm:{...PickV4.preset,regionVrs:true,majorForm:true}, integrated:{...PickV4.preset,closeForm:true,regionRisk:true,robustCard:true}, experience:{form:false,strong:false,weak:false,shrinkBO:true,experience:true}, anchor:{seedPrior:true}, rolling:{rolling:true}, fresh:{fresh:true},
    guarded:{form:false,strong:false,weak:false,shrinkBO:true},
    vrsFormat:{form:false,strong:false,weak:false}, simple:{form:false,strong:false,weak:false,format:false}
  })) {
    if (key === "boost" && !event.boostModel) {
      variant[key] = null;
      continue;
    }
    const result = PickLab.run(event.id,{...fullSplit,...options},24000);
    variant[key] = key === "fresh" && !event.recentRating ? null : CS.actualScore(result.card, replay.actual);
    if (key === "guarded" || key === "boost" || key === "v4" || key === "map" || key === "regionVrs" || key === "majorForm" || key === "integrated") {
      const expected = CS.actualScore(result.expectedCard, replay.actual);
      presets[event.id][key === "guarded" ? "default" : key] = {model:variant[key],expected,seed};
      if (key === "guarded") variant.expected = expected;
    }
  }
  for (const method of ['recommended','tree']) {
    const flags = PickMethods.defaults(method,event);
    const result = PickLab.run(event.id,flags,24000);
    presets[event.id][method] = {
      model:CS.actualScore(result.card,replay.actual),
      expected:CS.actualScore(result.expectedCard,replay.actual),
      seed
    };
    const seeded = PickLab.run(event.id,{...flags,seedConditionalCard:true},24000);
    presets[event.id][method+'SeedConditional'] = {
      ...presets[event.id][method], model:CS.actualScore(seeded.card,replay.actual)
    };
  }
  variants.push(variant);

  const wins = new Uint8Array(16), losses = new Uint8Array(16);
  for (const round of event.rounds) {
    for (const [winner,loser] of round) {
      const bestOf = wins[winner] === 2 || losses[winner] === 2 ? 3 : 1;
      const odds = PickLab.duel(event.id,fullSplit,winner,loser);
      const simple = PickLab.duel(event.id,defaults,winner,loser);
      const probability = bestOf === 1 ? simple.bo1 : simple.bo3;
      record(current,probability);
      const candidate = PickLab.duel(event.id,PickV4.preset,winner,loser);
      record(v4, bestOf === 1 ? candidate.bo1 : candidate.bo3);
      if (historical) record(archivedCurrent,probability);
      if (event.boostModel) {
        const boostedOdds = PickLab.duel(event.id,boosted,winner,loser);
        record(boost,bestOf === 1 ? boostedOdds.bo1 : boostedOdds.bo3);
      }
      const bin = bins[bestOf];
      bin.n++;
      bin.pooled += (1 - odds.base) ** 2;
      bin.split += (1 - (bestOf === 1 ? odds.bo1 : odds.bo3)) ** 2;
    }
    for (const [winner,loser] of round) {
      wins[winner]++;
      losses[loser]++;
    }
  }
}
assert.equal(bins[1].n,rows.length*20);
assert.equal(bins[3].n,rows.length*13);
const roundMetric = x => Math.round(x*1e5)/1e5;
const formats = [1,3].map(bestOf => {
  const {n,pooled,split} = bins[bestOf];
  return {bestOf,n,pooled:roundMetric(pooled/n),split:roundMetric(split/n)};
});
for (const metric of [current,archivedCurrent,boost,v4]) {
  metric.brier = metric.n ? roundMetric(metric.brier/metric.n) : null;
}
console.log(JSON.stringify({cards:rows,formats,variants,current,archivedCurrent,boost,v4,presets}));
