'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const {createHash} = require('node:crypto');
const editions = require('../major_form/all_stages.json').editions;
const {seeds, budget, productionSeed} = require('../strategy_v4_eval/settings.cjs');
for (const name of ['methods','map-model','close-model','region-risk','region-vrs','robust-card','major-form','lan-signal','pick-signal']) {
  require('../dist/' + name + '.js');
}
require('../multi_stage/inputs.js');
require('./model.js');

const methods = ['recommended', 'tree'];
const variants = ['base', 'stage1Only', 'multiStage'];
const round = n => Number(n.toFixed(9));
const dates = Object.keys(editions).sort((a,b) => editions[a].start.localeCompare(editions[b].start));
const holdout = dates.at(-1);

function loadFields() {
  const openings = PickLab.events.filter(event => event.hasResults);
  const later = PickStageInputs.events(PickLab.events, require('../multi_stage/inputs.json'));
  const events = openings.concat(later).sort((a,b) => a.date.localeCompare(b.date));
  return events.map(event => {
    const stage = event.stage || 1, parent = event.parent || event.id;
    const games = editions[parent].matches.filter(game => game.stage === stage);
    assert.equal(games.length, 33);
    assert.equal(games.map(g=>g.day).sort()[0], event.date.slice(0,10));
    const replay = CS.replay(event.rounds);
    assert.ok(replay.ok && replay.matched === 33, event.id);
    const boRows = [];
    const wins = Array(16).fill(0), losses = Array(16).fill(0);
    event.rounds.forEach((round,r) => round.forEach(([w,l],k) => {
      assert.equal(wins[w], wins[l]);
      assert.equal(losses[w], losses[l]);
      const bo = event.formats?.[r][k] ?? CS.bestOf(wins[w],losses[w]);
      assert.equal(bo, event.allBo3 ? 3 : CS.bestOf(wins[w],losses[w]));
      boRows.push({i:Math.min(w,l), j:Math.max(w,l), y:Number(w<l), bo});
      wins[w]++;
      losses[l]++;
    }));
    assert.equal(boRows.filter(m=>m.bo===3).length, games.filter(m=>m.bo===3).length);
    const families = {};
    for (const method of methods) {
      let flags = PickMethods.defaults(method,event);
      if (stage > 1) flags = PickStageInputs.localFlags(event,flags).flags;
      flags = {...flags, stageTraining:false, seedConditionalCard:method==='recommended'};
      const base = PickLab.seriesMatrices(event,flags);
      const pooledBase = PickLab.seriesMatrices(event,{...flags,format:false,shrinkBO:false});
      const rows = boRows.map(m => ({...m,p:base['bo'+m.bo][m.i][m.j],
        pooledP:pooledBase['bo'+m.bo][m.i][m.j]}));
      for (const row of rows) for (const p of [row.p,row.pooledP]) assert.ok(Number.isFinite(p) && p>0 && p<1);
      families[method] = {flags,base,rows};
    }
    return {id:event.id,parent,stage,allBo3:!!event.allBo3,date:event.date.slice(0,10),
      lastMatch:games.map(g=>g.day).sort().at(-1), actual:replay.actual, families};
  });
}

function fit(rows, key='p') {
  if (!rows.length) return 1;
  const examples = rows.map(row => ({x:Math.log(row[key]/(1-row[key])),y:row.y}));
  let lo=.25, hi=3;
  for (let k=0;k<55;k++) {
    const b=(lo+hi)/2;
    let derivative=12*(b-1);
    for (const {x,y} of examples) derivative += x*(1/(1+Math.exp(-b*x))-y);
    if (derivative>0) hi=b;
    else lo=b;
  }
  return round((lo+hi)/2);
}
function modelFor(history, target) {
  const start = editions[target]?.start || PickLab.events.find(e=>e.id===target).date.slice(0,10);
  const eligible = dates.filter(parent => editions[parent].end < start);
  const earlier = history.filter(s=>eligible.includes(s.parent));
  assert.ok(earlier.every(s=>s.lastMatch < start && s.parent!==target));
  function train(sources) {
    const out={};
    for (const method of methods) {
      const rows=sources.flatMap(stage=>stage.families[method].rows);
      out[method]={pooled:fit(rows,'pooledP'),bo1:fit(rows.filter(r=>r.bo===1)),bo3:fit(rows.filter(r=>r.bo===3))};
    }
    return out;
  }
  const role = target==='singapore' ? 'prospective' : target === holdout ? 'holdout' : eligible.length ? 'forward' : 'initial';
  const lastTrainingMatch = earlier.map(s=>s.lastMatch).sort().at(-1) || null;
  const meta = {editions:eligible,cutoff:lastTrainingMatch,lastTrainingMatch,role,
    nByStage:Object.fromEntries([1,2,3].map(k=>[k,earlier.filter(s=>s.stage===k).length*33]))};
  return {
    multiStage:{...meta,...train(earlier)},
    stage1Only:train(earlier.filter(s=>s.stage===1))
  };
}
function statistics(rows) {
  if (!rows.length) return {n:0,brier:null,logLoss:null};
  return {n:rows.length, brier:round(rows.reduce((s,r)=>s+(r.p-r.y)**2,0)/rows.length),
    logLoss:round(rows.reduce((s,r)=>s-Math.log(r.y?r.p:1-r.p),0)/rows.length)};
}
function metrics(rows) {
  return {all:statistics(rows),bo1:statistics(rows.filter(r=>r.bo===1)),bo3:statistics(rows.filter(r=>r.bo===3))};
}
function compareStage(task) {
  const {stage,method,trained}=task;
  const {base,flags,rows}=stage.families[method];
  const records={}, byHash=new Map();
  for (const variant of variants) {
    const saved = trained[variant];
    const event = {stageTraining:saved};
    const options = {...flags,stageTraining:!!saved};
    const transform = (p,bo) => PickStageTraining.apply(event,options,p,bo);
    const matrix = {...base};
    for (const bo of [1,3]) {
      const key='bo'+bo;
      matrix[key] = base[key].map(row=>row.slice());
      for (let i=0;i<16;i++) for (let j=i+1;j<16;j++) {
        const p=transform(base[key][i][j],bo);
        matrix[key][i][j]=p;
        matrix[key][j][i]=1-p;
      }
    }
    if (stage.allBo3) {matrix.allBo3=true; matrix.bo1=matrix.bo3;}
    const signature=createHash('sha256').update(JSON.stringify(matrix)).digest('hex');
    let score=byHash.get(signature);
    if (!score) {
      const hitsBySeed=seeds.map((seed,k) => {
        const sim=CS.run(matrix,budget,seed,[],{seedConditionalCard:flags.seedConditionalCard});
        const buckets=[0,1,2].map(c=>sim.card.filter((b,i)=>b===c && c===stage.actual[i]).length);
        const hits=CS.actualScore(sim.card,stage.actual);
        assert.equal(hits,buckets.reduce((a,b)=>a+b,0));
        if (!k) score={assignments:sim.card,bucketHits:buckets};
        return hits;
      });
      score.hitsBySeed=hitsBySeed;
      byHash.set(signature,score);
    }
    const scored=rows.map(m=>({...m,p:transform(m.p,m.bo)}));
    records[variant]={...score,series:metrics(scored),rows:scored};
  }
  return records;
}
function summary(stages,method,variant) {
  const runs=stages.map(s=>s.methods[method][variant]), rows=runs.flatMap(r=>r.rows);
  const hits=seeds.map((_,k)=>runs.reduce((n,s)=>n+s.hitsBySeed[k],0));
  const passes=seeds.map((_,k)=>runs.filter(s=>s.hitsBySeed[k]>=5).length);
  return {stages:stages.length,series:metrics(rows),bucketHits:[0,1,2].map(k=>runs.reduce((n,s)=>n+s.bucketHits[k],0)),
    hits:hits[0],passes:passes[0],meanHits:round(hits.reduce((a,b)=>a+b,0)/hits.length),
    meanPasses:round(passes.reduce((a,b)=>a+b,0)/passes.length)};
}
function checkDefault(groups,method) {
  const bad=[];
  for (const group of ['stage1','holdout','all']) {
    const q=groups[group][method], proposed=q.multiStage;
    for (const old of ['base','stage1Only']) {
      const baseline=q[old];
      if (group==='all') {
        if (!(proposed.series.all.brier<baseline.series.all.brier || proposed.series.all.logLoss<baseline.series.all.logLoss)) bad.push({group,old,metric:'noStrictProbabilityGain'});
      } else {
        for (const key of ['brier','logLoss']) if (proposed.series.all[key]>baseline.series.all[key]) bad.push({group,old,metric:key});
        for (const key of ['hits','passes','meanHits','meanPasses']) if (proposed[key]<baseline[key]) bad.push({group,old,metric:key});
      }
    }
  }
  return {passed:!bad.length,missed:bad};
}
async function main() {
  const history=loadFields();
  assert.equal(history.length,13);
  const future='singapore';
  const forecasts=Object.fromEntries(dates.concat(future).map(parent=>[parent,modelFor(history,parent)]));
  const models=Object.fromEntries(history.map(s=>[s.id,forecasts[s.parent].multiStage]));
  models[future]=forecasts[future].multiStage;
  assert.deepEqual(models[future].nByStage,{1:165,2:165,3:99});
  const modelText=JSON.stringify(models,null,2)+'\n';
  const write=(name,text) => {
    const file=path.join(__dirname,name);
    if (process.argv.includes('--check')) assert.equal(fs.readFileSync(file,'utf8'),text,name);
    else {fs.writeFileSync(file+'.tmp',text);fs.renameSync(file+'.tmp',file);}
  };
  const output=history.map(({id,parent,stage,date})=>({id,parent,stage,date,methods:{}}));
  const tasks=history.flatMap(stage=>methods.map(method=>({stage,method,trained:forecasts[stage.parent]})));
  let next=0;
  async function run() {
    while (next<tasks.length) {
      const task=tasks[next++];
      const result=await new Promise((resolve,reject)=>{
        const worker=new Worker(__filename,{workerData:task});
        worker.once('message',resolve);worker.once('error',reject);
        worker.once('exit',code=>{if(code)reject(Error('Worker exit '+code));});
      });
      output.find(s=>s.id===task.stage.id).methods[task.method]=result;
    }
  }
  await Promise.all(Array.from({length:Math.min(os.availableParallelism(),8)},run));
  const groups={};
  for(const [name,group] of Object.entries({all:output,stage1:output.filter(s=>s.stage===1),stage2:output.filter(s=>s.stage===2),
    stage3:output.filter(s=>s.stage===3),holdout:output.filter(s=>s.parent===holdout)})) {
    groups[name]=Object.fromEntries(methods.map(m=>[m,Object.fromEntries(variants.map(v=>[v,summary(group,m,v)]))]));
  }
  // Preserve chronological and family order regardless of concurrent simulation completion.
  for(const stage of output) {
    stage.methods=Object.fromEntries(methods.map(m=>[m,stage.methods[m]]));
    for(const result of Object.values(stage.methods)) for(const run of Object.values(result)) {
      delete run.rows;
    }
  }
  const defaultGate=Object.fromEntries(methods.map(m=>[m,checkDefault(groups,m)]));
  const report={seed:productionSeed,budget,seeds,holdout,defaultGate,groups,stages:output,
    stage1OnlyByEdition:Object.fromEntries(Object.entries(forecasts).map(([id,v])=>[id,v.stage1Only]))};
  write('models.json',modelText);write('report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({groups:groups.all,holdout:groups.holdout,defaultGate},null,2));
}
if (isMainThread) main().catch(err=>{console.error(err);process.exitCode=1;});
else parentPort.postMessage(compareStage(workerData));
