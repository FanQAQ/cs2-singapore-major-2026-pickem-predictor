'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const {allocationInputs, eplSamples} = require('./evaluate.cjs');
require('../final_card/rules.js');

const majorIds = ['austin-2025-3','budapest-2025-3','cologne-2026-3'];
const targets = [...majorIds,'epl22-stage2','epl23-stage2'];
const cells = ['baseDefault','baseGrouped','roundDefault','roundGrouped'];
const sum = xs => xs.reduce((a,b) => a+b, 0);
const round = n => Number(n.toFixed(8));
const editions = require('../major_form/all_stages.json').editions;
const ids = Array.from({length:16}, (_,i) => i);
const pop = new Uint8Array(65536);
for (let i=1;i<pop.length;i++) pop[i] = pop[i>>>1]+(i&1);

function forward(target, external) {
  const edition=external ? null : PickLab.allEvents.find(e=>e.id===target.id).parent;
  const cutoff=external ? (target.id==='epl22-stage2' ? require('./epl22-inputs.json').priorStage.stage2Start :
    require('./epl-inputs.json').fields[target.id].stage2Start) : editions[edition].start;
  const historical=PickLab.allEvents.filter(s=>s.hasResults && s.stage>1 && editions[s.parent].end<cutoff)
    .sort((a,b)=>a.date.localeCompare(b.date));
  assert(historical.every(s=>s.parent!==edition && s.id!==target.id));
  assert.equal(historical.length,({'austin-2025-3':2,'budapest-2025-3':4,'cologne-2026-3':6,
    'epl22-stage2':4,'epl23-stage2':6})[target.id]);
  const points=target.teams.map(t=>t.points);
  assert(points.every(v=>Number.isFinite(v)&&v>0));
  const order=[...target.direct, ...target.qualified];
  assert.equal(target.direct.length,8); assert.equal(target.qualified.length,8);
  assert.deepEqual(order.slice().sort((a,b)=>a-b),ids);
  const groupPoints=order.map(i=>points[i]);
  const past=historical.map(s=>{
    const replay=CS.replay(s.rounds);
    assert(replay.ok && replay.matched===33);
    return {points:s.teams.map(t=>t.points),actual:replay.actual};
  });
  return {
    prior:PickFinalCard.prior(groupPoints,past),groupPoints,order,cutoff,
    history:historical.map(s=>({id:s.id,editionEnd:editions[s.parent].end})),
  };
}

function paths(matrix, target, external, budget, seed) {
  if(!external) {
    const s=CS.run(matrix,budget,seed,[],{seedConditionalCard:true});
    assert(s.searchN===12000 && s.evalN===12000);
    return {card:s.card,searchCounts:s.searchCounts,searchN:s.searchN,pass:card=>s.score(card).pass};
  }
  const n=budget/2;
  const train=eplSamples(matrix,target.liveRatings,n,seed);
  const test=eplSamples(matrix,target.liveRatings,n,(seed^0xc5398da1)>>>0);
  const {card}=CS.cardsFromSamples(train,true);
  function pass(choice) {
    const masks=[0,0,0];
    for(const i of ids) if(choice[i]<3) masks[choice[i]]|=1<<i;
    let successful=0;
    for(let i=0;i<test.outcomes.length;i+=3) {
      const h=pop[masks[0]&test.outcomes[i]]+pop[masks[1]&test.outcomes[i+1]]+pop[masks[2]&test.outcomes[i+2]];
      if(h>=5) successful++;
    }
    return successful/n;
  }
  return {card,searchCounts:train.frequencies,searchN:n,pass};
}

function forecast(matrix,target,external,budget,seed,training) {
  const result=paths(matrix,target,external,budget,seed);
  const {prior,groupPoints,order}=training;
  const s={searchCounts:order.map(i=>result.searchCounts[i]),searchN:result.searchN};
  const reordered=PickFinalCard.card('historical',s,groupPoints,prior);
  const groupCard=Array(16);
  order.forEach((i,k)=>{groupCard[i]=reordered[k];});
  return [result.card,groupCard].map(card=>{
    assert.deepEqual([0,1,2,3].map(s=>card.filter(x=>x===s).length),[2,6,2,6]);
    return {seed,card,simulatedPass:result.pass(card)};
  });
}

function run(id) {
  const {target,external,matrices,seeds,budget,actual}=allocationInputs(id);
  const training=forward(target,external);
  const rows=Object.fromEntries(cells.map(k=>[k,[]]));
  for(const seed of seeds) {
    const choices=[...forecast(matrices.base,target,external,budget,seed,training),
      ...forecast(matrices.roundShare,target,external,budget,seed,training)];
    for(const [i,k] of cells.entries()) rows[k].push(choices[i]);
  }
  // The target labels and any administrative forfeit are used only for scoring.
  const archived=require('./report.json').stages.find(stage=>stage.id===id);
  assert.deepEqual(archived.actual,actual);
  for(const key of cells) for(const p of rows[key]) {
    p.hits=CS.actualScore(p.card,actual);
    p.slots=[0,1,2].map(c=>p.card.filter((v,i)=>v===c && actual[i]===c).length);
    assert.equal(sum(p.slots),p.hits);
  }
  const errors={};
  for(const [method,defaultCell] of [['base','baseDefault'],['roundShare','roundDefault']]) {
    const baseline=archived.records[method];
    assert.deepEqual(rows[defaultCell].map(r=>r.card),baseline.rows.map(r=>r.card));
    assert.deepEqual(rows[defaultCell].map(r=>r.simulatedPass),baseline.rows.map(r=>r.simulatedPass));
    const played=archived.matches.filter(g=>g.bo===3);
    const probabilities=played.map(g=>matrices[method].bo3[g.w][g.l]);
    errors[method]={n:played.length,brier:round(sum(probabilities.map(p=>(1-p)**2))/played.length),
      logLoss:round(sum(probabilities.map(p=>-Math.log(p)))/played.length)};
    assert(Math.abs(errors[method].brier-baseline.errors.bo3.brier)<1e-8);
  }
  return {id,external,start:target.start,teams:target.entrants,direct:target.direct,qualified:target.qualified,
    actual,cutoff:training.cutoff,history:training.history,latestHistoryEnd:training.history.at(-1).editionEnd,
    administrativeExcluded:archived.administrativeExcluded,bo3Errors:errors,rows};
}

function aggregate(stages) {
  const result={};
  for(const key of cells) {
    const n=stages[0].rows[key].length;
    const bySeed=Array.from({length:n},(_,i)=>({
      hits:sum(stages.map(s=>s.rows[key][i].hits)),
      passes:stages.filter(s=>s.rows[key][i].hits>=5).length,
    }));
    result[key]={fixedHits:bySeed[0].hits,fixedPasses:bySeed[0].passes,
      fixedByStage:stages.map(s=>s.rows[key][0].hits),
      fixedSlots:[0,1,2].map(c=>sum(stages.map(s=>s.rows[key][0].slots[c]))),
      meanHits:round(sum(bySeed.map(r=>r.hits))/n),meanPasses:round(sum(bySeed.map(r=>r.passes))/n),
      meanSimulatedPass:round(sum(stages.flatMap(s=>s.rows[key].map(r=>r.simulatedPass)))/(n*stages.length)),
      bySeed};
  }
  const delta={probabilityDefault:[-1,0,1,0],probabilityGrouped:[0,-1,0,1],
    allocationBase:[-1,1,0,0],allocationRound:[0,0,-1,1],interaction:[1,-1,-1,1]};
  function contrasts(weights,metric) {
    const values=result.baseDefault.bySeed.map((_,i)=>sum(cells.map((k,j)=>weights[j]*result[k].bySeed[i][metric])));
    return {fixed:values[0],mean:round(sum(values)/values.length),better:values.filter(x=>x>0).length,
      equal:values.filter(x=>x===0).length,worse:values.filter(x=>x<0).length};
  }
  const effects=Object.fromEntries(Object.entries(delta).map(([k,w])=>[k,{
    hits:contrasts(w,'hits'),passes:contrasts(w,'passes')},
  ]));
  return {...result,effects};
}

async function main() {
  const stages=await Promise.all(targets.map(id=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:id});
    worker.once('message',resolve);worker.once('error',reject);
    worker.once('exit',code=>{if(code) reject(Error(id+' worker exit '+code));});
  })));
  const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
  const report={asOf:'2026-11-21',seeds,searchN:budget/2,auditN:budget/2,stages};
  const summary={major:aggregate(stages.filter(s=>!s.external)),byStage:Object.fromEntries(stages.map(s=>[s.id,aggregate([s])]))};
  for(const [filename,value] of [['allocation.json',report],['allocation-summary.json',summary]]) {
    const file=path.join(__dirname,filename);
    if(process.argv.includes('--check')) assert.deepEqual(JSON.parse(fs.readFileSync(file)),value);
    else fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
  }
}

if(require.main===module) {
  if(!isMainThread) parentPort.postMessage(run(workerData));
  else main().catch(e=>{console.error(e);process.exitCode=1;});
}
