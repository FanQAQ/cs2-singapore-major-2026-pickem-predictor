'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
require('../engine/engine.js');
require('../final_card/rules.js');
const field = require('./field.json');
const swiss = require('./swiss.cjs');
const {teams} = swiss;
const strength = require('./rosters.json').teams;
assert.deepEqual(strength.map(row => row.name), field.entrants);
const points = strength.map(row => row.points);
const groupOrder = [...field.direct, ...teams.filter(i => !field.direct.includes(i))];
const groupPoints = groupOrder.map(i => points[i]);
const earlier = require('../multi_stage/inputs.json').filter(stage => stage.endDate < field.start);
const prior = PickFinalCard.prior(groupPoints, earlier.map(stage => {
  const replay = CS.replay(stage.rounds);
  assert.ok(replay.ok);
  return {points:stage.teams.map(team => team.points), actual:replay.actual};
}));

// The fixed series probability implies a single-map probability when maps are iid.
function scoreThresholds(a, b) {
  const series = 1 / (1 + 10 ** ((points[b] - points[a]) / 400));
  let lo=0, hi=1;
  for (let iteration=0; iteration<50; iteration++) {
    const q = (lo+hi)/2;
    if (q*q*(3-2*q) < series) lo=q;
    else hi=q;
  }
  const q=(lo+hi)/2;
  return [q*q, series, series+(1-q)**2];
}
const odds = teams.map(a => teams.map(b => scoreThresholds(a,b)));
function samples(count, seed) {
  const random = CS.rng(seed);
  const frequencies = teams.map(() => [0,0,0,0]);
  const outcomes = new Uint16Array(count*3);
  for (let trial=0; trial<count; trial++) {
    const state = swiss.initial();
    for (let round=0; round<5; round++) {
      for (const [a,b] of swiss.pairs(state,round)) {
        const [sweep, win, reverseSweep] = odds[a][b];
        const draw = random();
        if (draw < win) swiss.result(state,a,b,Number(draw >= sweep));
        else swiss.result(state,b,a,Number(draw >= reverseSweep));
      }
    }
    for (const i of teams) {
      const slot = swiss.category(state,i);
      frequencies[i][slot]++;
      if (slot < 3) outcomes[trial*3+slot] |= 1<<i;
    }
  }
  return {count,frequencies,outcomes};
}
const pop = new Uint8Array(1<<16);
for (let i=1; i<pop.length; i++) pop[i] = pop[i>>>1]+(i&1);
function score(card, actual, evaluation) {
  const masks=[0,0,0], actualBySlot=[0,0,0], histogram=Array(11).fill(0);
  for (const i of teams) {
    if (card[i] === 3) continue;
    masks[card[i]] |= 1<<i;
    if (card[i] === actual[i]) actualBySlot[card[i]]++;
  }
  for (let k=0; k<evaluation.outcomes.length; k+=3) {
    const hits = masks.reduce((v,m,c) => v+pop[m&evaluation.outcomes[k+c]],0);
    histogram[hits]++;
  }
  return {card,actualHits:CS.actualScore(card,actual),actualBySlot,
    simulatedPass:histogram.slice(5).reduce((a,b)=>a+b,0)/evaluation.count,
    simulatedMean:histogram.reduce((v,n,hits)=>v+n*hits,0)/evaluation.count};
}
function compare(seed) {
  const training=samples(12000,seed);
  const original=CS.cardsFromSamples(training,true).card;
  const reordered=PickFinalCard.card('historical',{
    searchCounts:groupOrder.map(i=>training.frequencies[i]),searchN:training.count
  },groupPoints,prior);
  const historical=Array(16);
  groupOrder.forEach((team,i)=>{historical[team]=reordered[i];});
  const evaluation=samples(12000,(seed^0xc5398da1)>>>0);
  const actual=swiss.replay();
  return {seed,original:score(original,actual,evaluation),historical:score(historical,actual,evaluation)};
}
const seeds = Array.from({length:30},(_,i)=>(33719+Math.imul(i,0x9e3779b1))>>>0);
async function main() {
  if(process.argv.includes('--one')) return console.log(JSON.stringify(compare(seeds[0]),null,2));
  const jobs=Array.from({length:5},(_,i)=>seeds.filter((_,index)=>index%5===i));
  const rows=(await Promise.all(jobs.map(group=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:group});
    worker.on('message',resolve);
    worker.on('error',reject);
    worker.on('exit',code=>{if(code) reject(Error('EPL worker exit '+code));});
  })))).flat().sort((a,b)=>seeds.indexOf(a.seed)-seeds.indexOf(b.seed));
  const summary={};
  for(const key of ['original','historical']) {
    const scores=rows.map(r=>r[key]);
    summary[key]={
      passes:scores.filter(v=>v.actualHits>=5).length,
      meanActual:scores.reduce((t,v)=>t+v.actualHits,0)/rows.length,
      meanSimulatedPass:scores.reduce((t,v)=>t+v.simulatedPass,0)/rows.length
    };
  }
  const comparisons=rows.map(r=>Math.sign(r.historical.actualHits-r.original.actualHits));
  const passChanges=rows.map(r=>Number(r.historical.actualHits>=5)-Number(r.original.actualHits>=5));
  const counts=signs=>({better:signs.filter(t=>t>0).length,tied:signs.filter(t=>t===0).length,worse:signs.filter(t=>t<0).length});
  const matches=require('./actual.json').rounds.flat();
  const brier=matches.reduce((sum,[w,l])=>sum+(1-odds[w][l][1])**2,0)/matches.length;
  const report={event:field.id,trainingN:12000,evaluationN:12000,earlier:earlier.map(s=>s.id),
    pairedMatchups:matches.length,actual:swiss.replay(),bo3Brier:brier,summary,
    hitsCompared:counts(comparisons),passCompared:counts(passChanges),rows};
  const file=path.join(__dirname,'report.json');
  if(process.argv.includes('--check')) assert.deepEqual(report,JSON.parse(fs.readFileSync(file)));
  else fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({summary,hits:report.hitsCompared,pass:report.passCompared,
    brier,fixed:rows[0]},null,2));
}
if(isMainThread) main().catch(err=>{console.error(err);process.exitCode=1;});
else parentPort.postMessage(workerData.map(compare));
