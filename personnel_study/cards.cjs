/* Replay the production fill rule using the fitted, date-locked MVP coefficient. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Worker,isMainThread,parentPort,workerData} = require('node:worker_threads');
const {budget,seeds,matrixHash,cardScore} = require('../integrated_eval/runtime.cjs');
require('../dist/region-vrs.js');
require('../dist/methods.js');
const shanghai = require('../holdout_shanghai/fixture.cjs');
const fits = require('./report.json').stageFits;
const refs = [...require('../research_cards/conditionalSeed.json').stages, require('../research_cards/conditionalSeed-shanghai.json')];

function evaluate(id) {
  const ref = refs.find(s=>s.id===id);
  const extra = id === 'shanghai-2024-elimination';
  const base = extra ? shanghai.makeForecast() : {};
  const event = extra ? base.event : PickLab.events.find(e=>e.id===id);
  const matrix = extra ? base.matrix : PickLab.seriesMatrices(event,PickMethods.defaults('recommended',event));
  assert.equal(matrixHash(matrix),ref.matrixSha256);
  const fit = fits[id], labels=event.teams.map(t=>fit.hasPriorMvp[t.name]);
  assert.ok(labels.every(v=>v===0 || v===1));
  const shifted = {};
  for(const form of ['bo1','bo3']) shifted[form]=matrix[form].map((row,i)=>row.map((p,j)=>{
    const change=fit.coefficient*(labels[i]-labels[j]);
    return change===0 || p===0 || p===1 ? p : 1/(1+Math.exp(-Math.log(p/(1-p))-change));
  }));
  const data = extra ? shanghai.readOutcomes() : CS.replay(event.rounds);
  const rounds = extra ? data.rounds : event.rounds;
  const records=Array.from({length:16},()=>[0,0]);
  const accuracy={};
  for(const round of rounds) for(const [w,l] of round) {
    const key='bo'+CS.bestOf(...records[w]);
    const a=accuracy[key]??={n:0,baseBrier:0,candidateBrier:0};
    a.n++;a.baseBrier+=(1-matrix[key][w][l])**2;a.candidateBrier+=(1-shifted[key][w][l])**2;
    records[w][0]++;records[l][1]++;
  }
  for(const a of Object.values(accuracy)) {
    a.baseBrier=+(a.baseBrier/a.n).toFixed(6);
    a.candidateBrier=+(a.candidateBrier/a.n).toFixed(6);
  }
  const unchanged = labels.every(v=>v===labels[0]) || !fit.coefficient;
  const trials = seeds.map((seed,k)=>{
    const r=ref.trials[k];assert.equal(r.seed,seed);
    const card=unchanged?r.candidate:CS.run(shifted,budget,seed,[],{seedConditionalCard:true}).card;
    const candidate=cardScore(card,data.actual);
    const base=cardScore(r.candidate,data.actual);
    assert.equal(base.hits,r.candidateScore.hits);
    return {seed,base:base.hits,candidate:candidate.hits,baseZero:base.bucketHits[2],candidateZero:candidate.bucketHits[2]};
  });
  return {id,accuracy,trials};
}

if(!isMainThread) parentPort.postMessage(evaluate(workerData));
else (async()=>{
  const results=await Promise.all(refs.map(s=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:s.id});
    worker.once('message',resolve);worker.once('error',reject);
  })));
  const pathOut=path.join(__dirname,'cards.json');
  if(process.argv.includes('--check')) assert.deepEqual(results,JSON.parse(fs.readFileSync(pathOut)));
  else fs.writeFileSync(pathOut,JSON.stringify(results,null,2)+'\n');
  console.log(results.map(s=>[s.id,s.trials[0],s.accuracy]));
})().catch(e=>{console.error(e);process.exitCode=1});
