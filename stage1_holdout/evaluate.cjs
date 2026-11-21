'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
require('../engine/engine.js');
// The shared pairing primitives use 16 numbered slots and the state passed to
// them. Construct our own state: only this stage's starting ratings power it.
const swiss = require('../epl_transfer/swiss.cjs');
const teams = Array.from({length: 16}, (_,i) => i);
const methods = ['vrs','targetOnly','earlierDonors'];
const sum = values => values.reduce((a,b) => a+b, 0);
const rounded = value => Number(value.toFixed(8));
const digest = data => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

function initial(ratings) {
  return {wins:new Uint8Array(16), losses:new Uint8Array(16), met:new Uint16Array(16), ratings:ratings.slice()};
}

function fit(field) {
  const transfer = require('../stage_transfer/evaluate.cjs');
  const editions = require('../major_form/all_stages.json').editions;
  const fields = PickLab.allEvents.filter(e => e.hasResults && editions[e.parent||e.id].end < field.start)
    .sort((a,b) => a.date.localeCompare(b.date)).map(transfer.fieldFor);
  const past = fields.filter(f => f.stage===1), donors = fields.filter(f => f.stage>1);
  const roster = field.teams.map(t => ({name:t.name, roster:transfer.roster(t.roster)}));
  assert.equal(field.id,'epl23-stage1');
  assert.equal(field.start,'2026-03-01');
  assert(field.allBo3 && field.cutoff.slice(0,10)<field.start);
  assert(field.vrs.commitTime<=field.cutoff && field.seedingDate<field.start);
  assert.deepEqual(roster.map(t => t.name), field.entrants);
  assert.deepEqual(field.teams.map(t => t.seed), teams.map(i => i+1));
  assert.equal(new Set(field.entrants).size,16);
  assert.equal(field.liveRatings.filter(Number.isFinite).length,16);
  assert(field.teams.every(t => Number.isFinite(t.points) && t.points>0));
  assert.equal(past.length,4); assert.equal(donors.length,6);
  assert(fields.every(f => f.end<field.start));
  const sourceIds = fields.flatMap(f => f.records.map(g => g.id));
  assert.equal(new Set(sourceIds).size,330);
  for (const t of field.teams) {
    const five = transfer.roster(t.roster);
    const listed = transfer.roster(t.vrsRoster);
    const same = five.filter(n => listed.includes(n)).length;
    assert.equal(same,t.overlap,t.name);
    assert(same>=3,t.name+' needs a pre-event VRS core');
    assert(t.rosterEvidence.length && t.rosterEvidence.every(row=>row.day<field.start));
  }
  const prior = transfer.evidence(roster,past), later = transfer.evidence(roster,donors);
  const groups = {vrs:[],targetOnly:[prior],earlierDonors:[prior,later]};
  const points = field.teams.map(t => t.points);
  const series = points.map(a => points.map(b => 1/(1+10**((b-a)/400))));
  const matrices = {}, teamEvidence = [];
  for (const key of methods) {
    const shift = transfer.shifts(groups[key],16);
    matrices[key] = transfer.adjust({bo1:series,bo3:series},shift).bo3;
    assert(matrices[key].every((row,i) => row.every((p,j) => p>0 && p<1 &&
      Math.abs(p+matrices[key][j][i]-1)<1e-10)));
    for (const i of teams) {
      if (!teamEvidence[i]) teamEvidence[i] = {team:roster[i].name,nSame:prior[i].n,nLater:later[i].n,
        weightedSame:rounded(prior[i].weighted),weightedLater:rounded(later[i].weighted),shift:{}};
      teamEvidence[i].shift[key] = rounded(shift[i]);
    }
  }
  const sources = fields.map(f => ({stageId:f.id,stage:f.stage,majorEnd:editions[f.parent].end,
    lastStageMatch:f.end,series:f.records.length}));
  return {matrices,teamEvidence,sources};
}

function scoreThresholds(p) {
  let low=0, high=1;
  for (let i=0;i<50;i++) {
    const q=(low+high)/2;
    if (q*q*(3-2*q)<p) low=q;
    else high=q;
  }
  const q=(low+high)/2;
  return [q*q,p,p+(1-q)**2];
}

function samples(table, ratings, count, seed) {
  const random=CS.rng(seed);
  const frequencies=teams.map(() => [0,0,0,0]);
  const outcomes=new Uint16Array(count*3);
  for (let trial=0;trial<count;trial++) {
    const s=initial(ratings);
    for (let r=0;r<5;r++) {
      for (const [a,b] of swiss.pairs(s,r)) {
        const [sweep,win,reverseSweep]=table[a][b], x=random();
        if(x<win) swiss.result(s,a,b,Number(x>=sweep));
        else swiss.result(s,b,a,Number(x>=reverseSweep));
      }
    }
    for (const i of teams) {
      const c=swiss.category(s,i);
      frequencies[i][c]++;
      if(c<3) outcomes[3*trial+c]|=1<<i;
    }
  }
  return {outcomes,frequencies,count};
}

const pop=new Uint8Array(65536);
for(let i=1;i<pop.length;i++) pop[i]=pop[i>>>1]+(i&1);
function predict(matrix, ratings, seed, count) {
  const odds=matrix.map(row => row.map(scoreThresholds));
  const train=samples(odds,ratings,count,seed);
  const card=CS.cardsFromSamples(train,true).card;
  const ev=samples(odds,ratings,count,(seed^0xc5398da1)>>>0);
  const masks=[0,0,0], histogram=Array(11).fill(0);
  for(const i of teams) if(card[i]<3) masks[card[i]]|=1<<i;
  for(let i=0;i<ev.outcomes.length;i+=3) {
    const h=pop[masks[0]&ev.outcomes[i]]+pop[masks[1]&ev.outcomes[i+1]]+pop[masks[2]&ev.outcomes[i+2]];
    histogram[h]++;
  }
  return {seed,card,auditPasses:sum(histogram.slice(5)),auditHits:histogram.reduce((a,n,i)=>a+n*i,0)};
}

function replay(field, truth) {
  if(truth.id) assert.equal(truth.id,field.id);
  if(truth.end) assert.equal(truth.end,field.end);
  assert.deepEqual(truth.rounds.map(r=>r.length),[8,8,8,6,3]);
  if(truth.matchIds) {
    assert.deepEqual(truth.matchIds.map(r=>r.length),truth.rounds.map(r=>r.length));
    assert.equal(new Set(truth.matchIds.flat()).size,33);
  }
  const s=initial(field.liveRatings), matches=[];
  const key=(a,b)=>Math.min(a,b)*16+Math.max(a,b);
  for (const [r,round] of truth.rounds.entries()) {
    assert.deepEqual(swiss.pairs(s,r).map(p=>key(...p)).sort((a,b)=>a-b),
      round.map(([w,l])=>key(w,l)).sort((a,b)=>a-b),'ESL Stage 1 round '+(r+1)+' pairing mismatch');
    for(const [i,[w,l,loserMaps]] of round.entries()) {
      assert.notEqual(w,l); assert([0,1].includes(loserMaps));
      matches.push({round:r+1,w,l,loserMaps,...(truth.matchIds && {hltvId:truth.matchIds[r][i]})});
      swiss.result(s,w,l,loserMaps);
    }
  }
  const actual=teams.map(i=>swiss.category(s,i));
  assert.deepEqual([0,1,2,3].map(c=>actual.filter(x=>x===c).length),[2,6,2,6]);
  return {actual,matches};
}

function score(field,fit,forecasts,truth,seeds,count) {
  const {matches,actual}=replay(field,truth);
  const summary={}, rows={};
  for(const key of methods) {
    const predictions=forecasts[key];
    assert.deepEqual(predictions.map(p=>p.seed),seeds);
    rows[key]=predictions.map(p=>{
      const bySlot=[0,1,2].map(c=>p.card.filter((t,i)=>t===c && actual[i]===c).length);
      const actualHits=sum(bySlot);
      assert.equal(actualHits,CS.actualScore(p.card,actual));
      return {...p,bySlot,actualHits,passed:actualHits>=5};
    });
    for(const m of matches) {
      if(!m.winnerProbability)m.winnerProbability={};
      m.winnerProbability[key]=fit.matrices[key][m.w][m.l];
    }
    const p=matches.map(m=>m.winnerProbability[key]), first=rows[key][0];
    summary[key]={hits:first.actualHits,passed:first.passed,bySlot:first.bySlot,
      fixedCard:[0,1,2].map(c=>field.entrants.filter((_,i)=>first.card[i]===c)),
      meanHits:rounded(sum(rows[key].map(r=>r.actualHits))/seeds.length),
      passingSeeds:rows[key].filter(r=>r.passed).length,meanSimulatedPass:rounded(sum(rows[key].map(r=>r.auditPasses))/(seeds.length*count)),
      bo1:{n:0,brier:null,logLoss:null},bo3:{n:p.length,brier:rounded(sum(p.map(v=>(1-v)**2))/p.length),
        logLoss:rounded(sum(p.map(v=>-Math.log(v)))/p.length)}};
  }
  function paired(a,b,fieldName) {
    const signs=rows[a].map((r,i)=>Math.sign(Number(r[fieldName])-Number(rows[b][i][fieldName])));
    return {more:signs.filter(n=>n>0).length,same:signs.filter(n=>!n).length,fewer:signs.filter(n=>n<0).length};
  }
  const pairs={};
  for(const [a,b] of [['earlierDonors','targetOnly'],['earlierDonors','vrs'],['targetOnly','vrs']])
    pairs[a+'Vs'+b]={actualHits:paired(a,b,'actualHits'),passes:paired(a,b,'passed')};
  return {event:field.id,asOf:'2026-11-21',start:field.start,end:field.end,source:truth.source??truth.sources,
    seeds,trainingN:count,evaluationN:count,pairedMatchups:matches.length,fieldSha256:digest(field),
    matrixSha256:Object.fromEntries(methods.map(k=>[k,digest(fit.matrices[k])])),sources:fit.sources,
    teams:field.entrants,teamEvidence:fit.teamEvidence,actual,summary,pairs,rows,matches};
}

async function main() {
  const field=require('./field.json'), params=fit(field);
  const {seeds,budget}=require('../strategy_v4_eval/settings.cjs'), count=budget/2;
  const jobs=methods.flatMap(key=>seeds.map(seed=>({key,seed})));
  const groups=Array.from({length:6},(_,i)=>jobs.filter((_,n)=>n%6===i));
  const outputs=(await Promise.all(groups.map(jobs=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{jobs,matrices:params.matrices,ratings:field.liveRatings,count}});
    worker.once('message',resolve); worker.once('error',reject);
    worker.once('exit',code=>{ if (code) reject(Error('ESL worker exited '+code)); });
  })))).flat();
  const forecasts=Object.fromEntries(methods.map(key=>[key,seeds.map(seed=>outputs.find(x=>x.key===key&&x.forecast.seed===seed).forecast)]));
  // Complete every prediction before opening the target's results file.
  const report=score(field,params,forecasts,require('./field-results.json'),seeds,count);
  const file=path.join(__dirname,'report.json'), text=JSON.stringify(report,null,2)+'\n';
  if(process.argv.includes('--check')) assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),report);
  else fs.writeFileSync(file,text);
  console.log(JSON.stringify({matched:report.pairedMatchups,summary:report.summary,paired:report.pairs},null,2));
}

if(!isMainThread && require.main===module) {
  const {jobs,matrices,ratings,count}=workerData;
  parentPort.postMessage(jobs.map(({key,seed})=>({key,forecast:predict(matrices[key],ratings,seed,count)})));
} else if(require.main===module) main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={fit,predict,replay,score,samples,scoreThresholds};
