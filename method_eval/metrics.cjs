'use strict';
const {cardScore,rounded,sum} = require('../integrated_eval/runtime.cjs');
const assert = require('node:assert/strict');
const names = ['base','lan','pick','both'];

function matches(rows) {
  const n = rows.length;
  let error = 0, logLoss = 0, correct = 0, changed = 0;
  for (const {p, y, baseline} of rows) {
    error += (p-y)**2;
    logLoss -= Math.log(y ? p : 1-p);
    correct += p===0.5 ? 0.5 : Number((p>0.5)===Boolean(y));
    changed += Number(Math.abs(p-baseline)>1e-10);
  }
  return {n,correct,brier:rounded(error/n),logLoss:rounded(logLoss/n),changed};
}

function measure(entries,baseEntries) {
  assert.ok(entries.length===baseEntries.length && entries.length>0);
  const scored = entries.map(({card,actual})=>cardScore(card,actual));
  const card = {hits:sum(scored.map(c=>c.hits)),passes:scored.filter(c=>c.passed).length,
    bucketHits:[0,1,2].map(k=>sum(scored.map(c=>c.bucketHits[k])))};
  const rows = entries.flatMap(e=>e.rows);
  const indices = entries[0].hitsBySeed.map((_,i)=>i);
  const seedHits = indices.map(i=>sum(entries.map(e=>e.hitsBySeed[i])));
  const seedPasses = indices.map(i=>entries.filter(e=>e.hitsBySeed[i]>=5).length);
  const diff = seedPasses.map((v,i)=>v-baseEntries.filter(e=>e.hitsBySeed[i]>=5).length);
  const stability = {meanHits:rounded(sum(seedHits)/indices.length),meanPasses:rounded(sum(seedPasses)/indices.length),
    more:diff.filter(d=>d>0).length,same:diff.filter(d=>d===0).length,fewer:diff.filter(d=>d<0).length};
  return {all:matches(rows),bo1:matches(rows.filter(r=>r.bestOf===1)),bo3:matches(rows.filter(r=>r.bestOf===3)),card,stability};
}

// Fixed before evaluating the two new signals. No destination event contributes to its choice.
function choose(prior,method) {
  if(prior.length<2) return 'base';
  const totals = Object.fromEntries(names.map(key=>{
    const base=prior.map(s=>s.models[method].base);
    return [key,measure(prior.map(s=>s.models[method][key]),base)];
  }));
  const base=totals.base;
  const eligible=names.slice(1).filter(key=>{
    const t=totals[key];
    const improved=prior.filter(s=>matches(s.models[method][key].rows).brier<matches(s.models[method].base.rows).brier).length;
    return improved>=2 && t.all.brier<base.all.brier && t.all.logLoss<base.all.logLoss &&
      t.card.hits>=base.card.hits && t.card.passes>=base.card.passes &&
      t.stability.meanHits>=base.stability.meanHits && t.stability.meanPasses>=base.stability.meanPasses;
  });
  eligible.sort((a,b)=>totals[a].all.brier-totals[b].all.brier || Number(a==='both')-Number(b==='both') || names.indexOf(a)-names.indexOf(b));
  return eligible[0] || 'base';
}
module.exports={names,measure,choose};
