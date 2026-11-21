/* Recompute the exact production cards, series probability scores and paired seed sensitivity. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Worker,isMainThread,parentPort,workerData} = require('node:worker_threads');
const {classic,v4,budget,seeds} = require('./settings.cjs');
const stages = require('../extra_validation/stages.json');
const strengths = require('../extra_validation/strengths.json');
const laterFeatures = require('../strategy_v4/later_teams.json');
const round = value => Number(value.toFixed(7));
const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
const records = PickLab.events.filter(e=>e.hasResults).sort((a,b)=>a.date.localeCompare(b.date));
const freshEvent = id => records.find(e=>e.id===id);

function field(id) {
  const original = freshEvent(id);
  if (original) return {event:original,rounds:original.rounds,formats:null};
  const stage = stages[id];
  const parent = freshEvent(stage.parent);
  const atEntry = strengths[stage.parent];
  assert.ok(atEntry.date === parent.asOf && atEntry.date < stage.start);
  const teams = stage.entrants.map(name=>atEntry.teams[name]);
  const profiles = laterFeatures[stage.parent];
  assert.ok(teams.every(t=>t.vrsCoreOverlap>=3 && profiles[t.name]));
  const event = {...parent,teams,matchups:null,
    v4Model:{...parent.v4Model,teams:profiles},
    formatModel:{...parent.formatModel,teams:Object.fromEntries(teams.map(t=>[t.name,t.format]))}};
  return {event, rounds:stage.rounds, formats:stage.formats};
}

function exactMetrics(odds,rounds,formats) {
  const wins=Array(16).fill(0), losses=Array(16).fill(0);
  let correct=0, squared=0, loss=0, n=0;
  for(const [r,row] of rounds.entries()) {
    for(const [i,[winner,loser]] of row.entries()) {
      const bestOf = formats ? formats[r][i] : wins[winner]===2||losses[winner]===2 ? 3 : 1;
      assert.ok(bestOf===3||bestOf===1);
      const matrix = bestOf===3 ? odds.bo3 : odds.bo1;
      const p = matrix[winner][loser];
      assert.ok(p>0 && p<1 && Math.abs(p+matrix[loser][winner]-1)<1e-10);
      correct += p>.5 ? 1 : p===.5 ? .5 : 0;
      squared += (1-p)**2;
      loss -= Math.log(p);
      n++;
    }
    for (const [winner,loser] of row) {wins[winner]++;losses[loser]++;}
  }
  assert.equal(n,33);
  return {n,correct,brier:round(squared/n),logLoss:round(loss/n)};
}

function evaluate(id) {
  const {event,rounds,formats} = field(id);
  assert.equal(event.v4Model.asOf,event.asOf);
  const replay = CS.replay(rounds);
  assert.ok(replay.ok && replay.total===33 && replay.matched===33);
  const allBo3 = !!formats && formats.flat().every(f=>f===3);
  const models={};
  for(const [name,flags] of Object.entries({classic,v4})) {
    const matrices=PickLab.seriesMatrices(event,flags);
    const odds = allBo3 ? {bo1:matrices.bo3,bo3:matrices.bo3} : matrices;
    const hitsBySeed=[];
    let card;
    for(const seed of (formats?seeds.slice(0,1):seeds)) {
      const sim = CS.run(odds,budget,seed);
      const hits = CS.actualScore(sim.card,replay.actual);
      hitsBySeed.push(hits);
      if (!card) {
        const bucketHits=[0,1,2].map(k=>sim.card.filter((slot,i)=>slot===k && replay.actual[i]===k).length);
        assert.equal(bucketHits.reduce((a,b)=>a+b),hits);
        card={hits,passed:hits>=5,byBucket:bucketHits,expectedCardHits:CS.actualScore(sim.expectedCard,replay.actual)};
        if(!formats && event.historyPresets?.[name==='v4'?'v4':'default']) {
          const saved=event.historyPresets[name==='v4'?'v4':'default'];
          assert.equal(hits,saved.model); assert.equal(card.expectedCardHits,saved.expected);
        }
      }
    }
    models[name]={...exactMetrics(odds,rounds,formats),card};
    if(!formats) models[name].hitsBySeed=hitsBySeed;
  }
  return {id,asOf:event.asOf,format:allBo3?'all-bo3':'mixed',models};
}

function aggregate(rows) {
  const result={};
  for(const key of ['classic','v4']) {
    const values=rows.map(row=>row.models[key]), n=values.reduce((s,x)=>s+x.n,0);
    const weighted=field=>round(values.reduce((s,x)=>s+x[field]*x.n,0)/n);
    result[key]={n,correct:values.reduce((s,x)=>s+x.correct,0),brier:weighted('brier'),logLoss:weighted('logLoss'),
      cardHits:values.reduce((s,x)=>s+x.card.hits,0),passes:values.filter(x=>x.card.passed).length};
    if(values.every(x=>x.hitsBySeed)) {
      const passBySeed=seeds.map((_,i)=>values.filter(x=>x.hitsBySeed[i]>=5).length);
      const hits=seeds.map((_,i)=>values.reduce((s,x)=>s+x.hitsBySeed[i],0));
      result[key].sensitivity={meanPasses:round(mean(passBySeed)),meanHits:round(mean(hits)),passBySeed};
    }
  }
  return result;
}

async function build() {
  const ids=[...records.map(e=>e.id),...Object.keys(stages).sort((a,b)=>stages[a].start.localeCompare(stages[b].start))];
  assert.equal(records.length,5); assert.equal(ids.length,11);
  const jobs=[...ids];
  const byId=new Map();
  async function takeNext() {
    while(jobs.length) {
      const id=jobs.shift();
      const row=await new Promise((resolve,reject)=>{
        const worker=new Worker(__filename,{workerData:id});
        worker.once('message',resolve);worker.once('error',reject);
        worker.once('exit',code=>{if(code!==0)reject(Error('Worker '+id+' exited '+code));});
      });
      byId.set(id,row);
    }
  }
  await Promise.all(Array.from({length:3},takeNext));
  const rows=ids.map(id=>byId.get(id));
  const opening=rows.slice(0,records.length),later=rows.slice(records.length);
  const transfers=aggregate(later), base=transfers.classic, candidate=transfers.v4;
  const holdoutSummary={n:base.n,baseCorrect:base.correct,v4Correct:candidate.correct,
    baseBrier:base.brier,v4Brier:candidate.brier,basePassed:base.passes,v4Passed:candidate.passes,stageCount:later.length};
  return {budget,seeds,settings:{classic,v4},holdoutSummary,
    opening:{...aggregate(opening),stages:opening},later:{...transfers,stages:later}};
}

if(isMainThread) {
  build().then(report=>{
    const file=path.join(__dirname,'report.json'), content=JSON.stringify(report,null,2)+'\n';
    if(process.argv.includes('--check')) assert.equal(fs.readFileSync(file,'utf8'),content,'Historical reproduction differs.');
    else fs.writeFileSync(file,content);
    for(const [name,summary] of Object.entries({opening:report.opening,later:report.later})) {
      console.log(name,JSON.stringify({classic:summary.classic,v4:summary.v4}));
      console.log(summary.stages.map(row=>row.id+' '+row.models.classic.card.hits+'/'+row.models.v4.card.hits).join(', '));
    }
  }).catch(e=>{console.error(e);process.exitCode=1;});
} else {
  parentPort.postMessage(evaluate(workerData));
}
