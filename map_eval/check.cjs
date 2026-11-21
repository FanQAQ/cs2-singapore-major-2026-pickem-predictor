/* Pair both strategies on the same historical fields, Swiss seeds and card objective. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {root, v4, budget, productionSeed} = require('../strategy_v4_eval/settings.cjs');
require(path.join(root, 'dist/map-model.js'));
const candidate = {...v4, mapVeto:true};
const modelNames = ['base','candidate'];
const formats = ['bo1','bo3'];
const prec = value => Number(value.toFixed(8));
const isActive = status => status === 'one' || status === 'both';
const roundKeys = ['bo1','bo3','moderateBo1'];
const original = require('../strategy_v4_eval/report.json').opening;
const strengthInputs = require('../map_strength/events.json');
const vetoInputs = require('../map_veto_data/veto.json');

function compare(a,b,message) {
  assert.ok(Math.abs(a-b) < 2e-7, message + ' (' + a + ' vs ' + b + ')');
}

function emptyRows() {
  return Object.fromEntries(roundKeys.map(key => [key,[]]));
}

function scores(rows) {
  if (!rows.length) return {n:0, brier:null, logLoss:null, correct:null};
  const n = rows.length;
  return {
    n,
    brier:prec(rows.reduce((sum,p) => sum + (1-p)**2, 0) / n),
    logLoss:prec(-rows.reduce((sum,p) => sum + Math.log(p), 0) / n),
    correct:rows.reduce((sum,p) => sum + (p>.5 ? 1 : p===.5 ? .5 : 0), 0),
  };
}

function coverage(rows) {
  const reasons = {};
  for (const {status} of rows) reasons[status] = (reasons[status] || 0)+1;
  return {n:rows.length, used:rows.filter(x=>isActive(x.status)).length,
    changed:rows.filter(x=>x.changed).length, reasons};
}

function cardStats(odds, observed) {
  const sim = CS.run(odds,budget,productionSeed);
  assert.equal(sim.searchN,12000);
  assert.equal(sim.evalN,12000);
  const bucketHits = [0,1,2].map(k => sim.card.reduce((s,c,i) => s + (c===k && observed[i]===k),0));
  const hits = CS.actualScore(sim.card, observed);
  assert.equal(bucketHits.reduce((s,x)=>s+x),hits);
  return {hits, passed:hits>=5, bucketHits, buckets:[2,6,2],
    modelPassRate:prec(sim.pass), modelExpectedHits:prec(sim.expected), seedOrder:sim.card};
}

function provenance(event) {
  assert.deepEqual(event.mapStrength,strengthInputs[event.id],'Rebuild website after changing map-strength data.');
  assert.deepEqual(event.mapVeto,vetoInputs[event.id],'Rebuild website after changing veto data.');
  assert.ok(event.v4Model.asOf === event.asOf && event.asOf < event.date.slice(0,10));
  for (const source of [event.mapStrength,event.mapVeto]) {
    assert.equal(source.asOf,event.asOf);
    assert.deepEqual(Object.keys(source.teams).sort(),event.teams.map(t=>t.name).sort());
  }
  assert.equal(event.mapVeto.pool.length,7);
  assert.deepEqual(event.mapVeto.pool,event.mapStrength.pool);
  const firstDate = new Date(event.asOf+'T00:00:00Z');
  firstDate.setUTCDate(firstDate.getUTCDate()-90);
  const earliest = firstDate.toISOString().slice(0,10);
  for (const profile of [event.mapVeto,...Object.values(event.mapStrength.teams)]) {
    if (!profile.last) continue;
    assert.ok(earliest<=profile.first && profile.first<=profile.last && profile.last<=event.asOf,
      'Map input dates outside the pre-stage window: '+event.id);
  }
}

function pairs(event, base, adjusted) {
  const pairs = new Map(), possible = {bo1:[],bo3:[]};
  for (let a=0;a<event.teams.length;a++) {
    for (let b=a+1;b<event.teams.length;b++) {
      const matchup = PickLab.duel(event.id,candidate,a,b);
      const info = {};
      for (const [f,detail] of [['bo1',matchup.mapBO1],['bo3',matchup.mapBO3]]) {
        assert.ok(detail && typeof detail.status==='string',event.id+' '+f+' absent map detail');
        const p = adjusted[f][a][b], old = base[f][a][b];
        assert.ok(0 < p && p < 1 && Math.abs(p+adjusted[f][b][a]-1)<1e-10);
        assert.ok(Math.abs(p-detail.probability)<1e-9,'Runtime chooser and matrix disagree.');
        if (!isActive(detail.status)) assert.equal(p,old,'Fallback changed base probability.');
        info[f] = {status:detail.status, changed:Math.abs(p-old)>1e-10};
        possible[f].push(info[f]);
      }
      pairs.set(a*16+b,info);
    }
  }
  return {possible,pairs};
}

function composeModels(series, cards, applied) {
  return Object.fromEntries(modelNames.map(name => [name,{
    ...Object.fromEntries(roundKeys.map(f => [f,scores(series[name][f])])),
    coveredOnly:Object.fromEntries(formats.map(f=>{
      const probabilities=series[name][f].filter((_,i)=>isActive(applied[f][i].status));
      return [f,scores(probabilities)];
    })),
    card: cards[name]
  }]));
}

function evaluate(event) {
  provenance(event);
  const base = PickLab.seriesMatrices(event,v4);
  const adjusted = PickLab.seriesMatrices(event,candidate);
  const {possible,pairs: pairInfo} = pairs(event,base,adjusted);
  // Generate both cards from pre-stage information; replay only supplies the held-out labels.
  const observed = CS.replay(event.rounds);
  assert.ok(observed.ok && observed.matched===33);
  const cards = {base:cardStats(base,observed.actual), candidate:cardStats(adjusted,observed.actual)};
  const series = {base:emptyRows(),candidate:emptyRows()};
  const applied = {bo1:[],bo3:[]};
  const wins = Array(16).fill(0), losses=Array(16).fill(0);
  for (const round of event.rounds) {
    for (const [a,b] of round) {
      const f = CS.bestOf(wins[a],losses[a])===1 ? 'bo1':'bo3';
      const p0 = base[f][a][b], p1 = adjusted[f][a][b];
      series.base[f].push(p0);
      series.candidate[f].push(p1);
      applied[f].push(pairInfo.get(Math.min(a,b)*16+Math.max(a,b))[f]);
      // Keep exactly the same BO1 matches in this diagnostic subgroup for both models.
      const favorite = Math.max(p0,1-p0);
      if (f==='bo1' && favorite>=.6 && favorite<.7) {
        series.base.moderateBo1.push(p0);
        series.candidate.moderateBo1.push(p1);
      }
    }
    for (const [a,b] of round) {wins[a]++; losses[b]++;}
  }
  const ref = original.stages.find(s=>s.id===event.id).models.v4;
  const all = scores([...series.base.bo1,...series.base.bo3]);
  compare(all.brier,ref.brier,event.id+' V4 Brier');
  compare(all.logLoss,ref.logLoss,event.id+' V4 log loss');
  assert.deepEqual(cards.base.bucketHits, ref.card.byBucket);
  for (const f of formats) {
    assert.equal(possible[f].length,120);
    assert.equal(applied[f].length,f==='bo1'?20:13);
  }
  const row = {id:event.id,label:event.label,asOf:event.asOf,
    coverage:{possible:Object.fromEntries(formats.map(f=>[f,coverage(possible[f])])),
              actual:Object.fromEntries(formats.map(f=>[f,coverage(applied[f])]))},
    ...composeModels(series,cards,applied)};
  return {row,series,applied};
}

function aggregate(reports) {
  const all = {base:emptyRows(),candidate:emptyRows()},cards={};
  for (const name of modelNames) {
    for (const f of roundKeys) all[name][f] = reports.flatMap(r=>r.series[name][f]);
    const individual = reports.map(r=>r.row[name].card);
    cards[name]={hits:individual.reduce((s,c)=>s+c.hits,0),passes:individual.filter(c=>c.passed).length,
      bucketHits:[0,1,2].map(k=>individual.reduce((s,c)=>s+c.bucketHits[k],0)),buckets:[10,30,10]};
  }
  const applied=Object.fromEntries(formats.map(f=>[f,reports.flatMap(r=>r.applied[f])]));
  return {coverage:Object.fromEntries(formats.map(f=>[f,coverage(applied[f])])),
    ...composeModels(all,cards,applied)};
}

const events = PickLab.events.filter(e=>e.hasResults).sort((a,b)=>a.date.localeCompare(b.date));
assert.equal(events.length,5);
const reports = events.map(evaluate);
const result = {seed:productionSeed,simulationCount:budget,searchPaths:budget/2,evaluationPaths:budget/2,
  baseSettings:v4,candidateSettings:candidate,
  stages:reports.map(r=>r.row),total:aggregate(reports)};
const output = JSON.stringify(result,null,2)+'\n';
const filename = path.join(__dirname,'report.json');
if (process.argv.includes('--check')) assert.equal(fs.readFileSync(filename,'utf8'),output);
else fs.writeFileSync(filename,output);
console.log(JSON.stringify(result.total,null,2));
