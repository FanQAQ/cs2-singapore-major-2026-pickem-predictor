'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {blend}=require('../world_rank/evaluate.cjs');
const {seeds,budget,productionSeed}=require('../strategy_v4_eval/settings.cjs');
for(const script of ['stage-inputs','methods','lan-signal','pick-signal','major-form']) require('../dist/'+script+'.js');
const inputs=require('../multi_stage/inputs.json');
const weeks=require('./weeks.json');
const editors=require('./editors.json');
const old=require('../multi_stage_train/report.json');
const end = name => path.join(__dirname,name);
const round = x => Number(x.toFixed(8));
function editorInput(event,guide) {
  assert.ok(guide.published<event.date);
  const picks=[guide.sweep,guide.advance,guide.winless];
  const names=event.teams.map(t=>t.name);
  const known=picks.flat();
  assert.ok(known.every(t=>names.includes(t)));
  assert.equal(new Set(known).size,known.length);
  assert.deepEqual([guide.sweep.length,guide.advance.length],[2,6]);
  assert.ok(guide.winless.length>=1 && guide.winless.length<=2);
  const eight=new Set([...guide.sweep,...guide.advance]);
  const order=event.teams.slice().sort((a,b)=>Number(eight.has(b.name))-Number(eight.has(a.name)) || b.points-a.points || a.seed-b.seed);
  const ranking={date:guide.published,rows:order.map((team,i)=>({rank:i+1,team:team.name,roster:team.roster}))};
  return {adjusted:blend(event,ranking).event, picks};
}
function exactCard(event,picks,actual) {
  const indices=picks.map(names=>names.map(name=>event.teams.findIndex(t=>t.name===name)));
  const correct=indices.map((arr,cat)=>arr.filter(i=>actual[i]===cat).length);
  const assigned=new Set(indices.flat());
  const missing=10-assigned.size, hits=correct.reduce((sum,h)=>sum+h,0);
  const possibleCorrect0=actual.filter((c,i)=>c===2 && !assigned.has(i)).length;
  const possibleWrong0=actual.filter((c,i)=>c!==2 && !assigned.has(i)).length;
  return {slots:assigned.size,buckets:correct,hitRange:[hits+Math.max(0,missing-possibleWrong0),hits+Math.min(missing,possibleCorrect0)]};
}
function errors(event,matrix) {
  const out={1:[],3:[]};
  event.rounds.forEach((row,r)=>row.forEach(([w,l],i)=>{
    const bo=event.formats[r][i];out[bo].push(matrix['bo'+bo][w][l]);
  }));
  return Object.fromEntries(Object.entries(out).map(([bo,ps])=>['bo'+bo,{
    n:ps.length, brier:ps.length?round(ps.reduce((s,p)=>s+(1-p)**2,0)/ps.length):null,
    logLoss:ps.length?round(ps.reduce((s,p)=>s-Math.log(p),0)/ps.length):null
  }]));
}
function evaluate(id) {
  const field=inputs.find(s=>s.id===id);
  const event=PickStageInputs.events(PickLab.events,[field])[0];
  const flags=PickStageInputs.localFlags(event,PickMethods.defaults('recommended',event)).flags;
  const matrix=stage=>PickLab.seriesMatrices(stage,{...flags,stageTraining:false});
  const actual=CS.replay(event.rounds);
  assert.ok(actual.ok && actual.matched===33);
  const baseline=matrix(event);
  const recorded=old.stages.find(r=>r.id===id).methods.recommended.base;
  const audit={...errors(event,baseline),hitsBySeed:recorded.hitsBySeed,card:recorded.assignments,buckets:recorded.bucketHits};
  const check=CS.run(baseline,budget,productionSeed,[],{seedConditionalCard:true});
  assert.deepEqual(check.card,audit.card);
  const week=weeks[id];
  const {event:updated,audit:coverage}=blend(event,week);
  assert.equal(coverage.filter(t=>t.rank).length,week.coverage);
  const variants={weekly:updated};
  const article=editors[id] && editorInput(event,editors[id]);
  if(article) variants.editorial=article.adjusted;
  const results={baseline:audit};
  for(const [key,adjusted] of Object.entries(variants)) {
    const m=matrix(adjusted);
    const result={...errors(event,m),hitsBySeed:[]};
    seeds.forEach((seed,i)=>{
      const run=CS.run(m,budget,seed,[],{seedConditionalCard:true});
      if(!i) {
        result.card=run.card;
        result.buckets=[0,1,2].map(c=>run.card.filter((v,t)=>v===c && actual.actual[t]===c).length);
      }
      result.hitsBySeed.push(CS.actualScore(run.card,actual.actual));
    });
    results[key]=result;
  }
  return {id,stage:event.stage,week:week.date,weeklyCoverage:week.coverage,results,
    ...(article?{publishedCard:exactCard(event,article.picks,actual.actual)}:{})};
}
function summarize(rows,variant) {
  const records=rows.map(r=>r.results[variant]), pass=i=>records.filter(r=>r.hitsBySeed[i]>=5).length;
  const total=i=>records.reduce((s,r)=>s+r.hitsBySeed[i],0);
  const passes=seeds.map((_,i)=>pass(i)),hits=seeds.map((_,i)=>total(i));
  const changes=passes.map((v,i)=>Math.sign(v-rows.filter(r=>r.results.baseline.hitsBySeed[i]>=5).length));
  const formats={};
  for(const bo of ['bo1','bo3','all']) {
    const stats=records.flatMap(r=>bo==='all'?[r.bo1,r.bo3]:[r[bo]]).filter(s=>s.n);
    const n=stats.reduce((s,r)=>s+r.n,0);
    const avg=k=>round(stats.reduce((s,r)=>s+r.n*r[k],0)/n);
    formats[bo]={n,brier:avg('brier'),logLoss:avg('logLoss')};
  }
  return {passes:passes[0],hits:hits[0],meanPass:round(passes.reduce((a,b)=>a+b)/seeds.length),
    meanHits:round(hits.reduce((a,b)=>a+b)/seeds.length),pairedPass:[1,0,-1].map(x=>changes.filter(c=>c===x).length),formats};
}
async function main() {
  let next=0;
  const rows=Array(inputs.length);
  async function run() {
    while(next<inputs.length) {
      const i=next++;
      rows[i]=await new Promise((resolve,reject)=>{
        const worker=new Worker(__filename,{workerData:inputs[i].id});
        worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code)reject(Error('exit '+code));});
      });
    }
  }
  await Promise.all(Array.from({length:4},run));rows.sort((a,b)=>inputs.find(x=>x.id===a.id).date.localeCompare(inputs.find(x=>x.id===b.id).date));
  const groups={};
  for(const stage of [2,3]) {
    const group=rows.filter(r=>r.stage===stage);
    groups['stage'+stage]=Object.fromEntries(Object.keys(group[0].results).map(key=>[key,summarize(group,key)]));
  }
  const output={budget,seeds,groups,rows};
  if(process.argv.includes('--check')) assert.deepEqual(output,require('./report.json'));
  else fs.writeFileSync(end('report.json'),JSON.stringify(output,null,2)+'\n');
  for(const r of rows) console.log(r.id,...Object.entries(r.results).map(([k,v])=>k+' '+v.hitsBySeed[0]),r.publishedCard?.hitRange || '');
  console.log(JSON.stringify(groups,null,2));
}
if(isMainThread) main().catch(err=>{console.error(err);process.exitCode=1;});
else parentPort.postMessage(evaluate(workerData));
