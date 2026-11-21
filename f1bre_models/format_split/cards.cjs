'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {seeds,budget}=require('../../strategy_v4_eval/settings.cjs');
const {getField,matrices}=require('../evaluate.cjs');
const {errors,cardScore}=require('../score.cjs');
const {play}=require('../../bo5_history/cards.cjs');
const reference=require('../report.json'),holdout=require('./scores.json');
const frozen=require('./odds.json'),repair=require('./correction.json'),holdoutId=frozen.id;
const majors=reference.fields.filter(f=>f.actual && f.id!=='cluj-2026');
const ids=[...majors.map(f=>f.id),holdoutId],arms=['baseline','hybrid'];
const round=x=>Number(x.toFixed(9));
const sum=a=>a.reduce((s,v)=>s+v,0);

function full(upper,precision){
  const m=Array.from({length:16},()=>Array(16).fill(.5));
  let k=0;
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){
    const p=upper[k++];
    assert(p>0 && p<1);
    m[i][j]=p;m[j][i]=precision?Number((1-p).toFixed(10)):1-p;
  }
  assert.equal(k,120);
  return m;
}
function inputs(id){
  if(id===holdoutId){
    const q=Object.fromEntries(['mlBO1','eloBO1','mlBO3'].map(k=>[k,frozen[k].slice()]));
    for(const change of repair.changes)for(const k of Object.keys(q))q[k][change.pair]=change[k];
    const ml={bo1:full(q.mlBO1,true),bo3:full(q.mlBO3,true),allBo3:false};
    const matches=holdout.corrected.winnerProbabilities.map(g=>({bo:g.bo,w:frozen.teams.indexOf(g.winner),
      l:frozen.teams.indexOf(g.teams.find(n=>n!==g.winner))}));
    return {actual:holdout.corrected.actual,matches,ml,hybrid:{...ml,bo1:full(q.eloBO1,false)}};
  }
  const f=getField(id),r=majors.find(m=>m.id===id);
  const {ml,elo}=matrices(f,['ml','elo']);
  assert.deepEqual(r.teams,f.teams.map(t=>t.name));
  return {actual:r.actual,matches:r.matches,ml,hybrid:{...ml,bo1:elo.bo1}};
}
function sampled(id,m,actual){
  return seeds.map(seed=>{
    const a=play({id,scheme:'major'},m,seed,actual,false).cards.standard;
    return {card:a.card,hits:a.hits,slots:a.slots,audit:round(a.simulatedPass)};
  });
}
function oldRuns(field,arm){
  return field.methods[arm].runs.map(r=>{
    const s=cardScore(r.card,field.actual);
    return {card:r.card,hits:s.hits,slots:s.slots,audit:r.audit};
  });
}
function evaluate(id){
  const {actual,matches,ml,hybrid}=inputs(id),ref=majors.find(f=>f.id===id);
  const baseline=ref?oldRuns(ref,'ml'):sampled(id,ml,actual);
  const trial=sampled(id,hybrid,actual);
  if(ml.allBo3)assert.deepEqual(trial,baseline,'All-BO3 same paths and cards for '+id);
  const byFormat={};
  for(const [arm,m] of [['baseline',ml],['hybrid',hybrid]]){
    byFormat[arm]=Object.fromEntries([1,3].map(bo=>['bo'+bo,errors(matches.filter(g=>g.bo===bo).map(g=>m['bo'+bo][g.w][g.l]))]));
  }
  assert.deepEqual(byFormat.baseline.bo3,byFormat.hybrid.bo3);
  if(ref)assert.deepEqual(byFormat.baseline,ref.methods.ml.errors);
  if(!ref)for(const arm of arms)for(const bo of [1,3])for(const metric of ['brier','logLoss']){
    assert(Math.abs(byFormat[arm]['bo'+bo][metric]-holdout.corrected.metrics[bo][arm][metric])<1e-8);
  }
  return {id,stage:ref?.stage??null,actual,errors:byFormat,baseline,hybrid:trial};
}
function directions(xs,ys){
  return {more:xs.filter((x,i)=>x>ys[i]).length,same:xs.filter((x,i)=>x===ys[i]).length,less:xs.filter((x,i)=>x<ys[i]).length};
}
function group(rows){
  const g={};
  for(const arm of [...arms,...(rows[0].stage?['site']:[])]){
    const records=rows.map(r=>arm==='site'?oldRuns(majors.find(m=>m.id===r.id),'baseline'):r[arm]);
    const passes=seeds.map((_,i)=>sum(records.map(a=>Number(a[i].hits>=5))));
    const hits=seeds.map((_,i)=>sum(records.map(a=>a[i].hits)));
    g[arm]={passes,hits,slots:[0,1,2].map(c=>sum(records.map(a=>a[0].slots[c])))};
  }
  for(const ref of ['baseline',...(g.site?['site']:[])]){
    g[ref+'Comparison']=Object.fromEntries(['passes','hits'].map(k=>[k,directions(g.hybrid[k],g[ref][k])]));
  }
  return g;
}
async function main(){
  assert(holdout.gatePassed && holdout.initial.gatePassed && holdout.corrected.gatePassed);
  assert.deepEqual(reference.seeds,seeds);assert.equal(budget,24000);
  const rows=new Array(ids.length);let next=0;
  async function work(){
    while(next<ids.length){
      const i=next++;
      rows[i]=await new Promise((resolve,reject)=>{
        const w=new Worker(__filename,{workerData:ids[i]});
        w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error(ids[i]+' exited '+code));});
      });
      console.log(rows[i].id,rows[i].baseline[0].hits,rows[i].hybrid[0].hits);
    }
  }
  await Promise.all(Array.from({length:4},work));
  const groups={};
  for(const s of [1,2,3])groups['stage'+s]=group(rows.filter(r=>r.stage===s));
  groups.holdout=group(rows.filter(r=>r.stage===null));
  assert.deepEqual([1,2,3].map(s=>rows.filter(r=>r.stage===s).length),[5,5,3]);
  const result={seeds,pathsPerPartition:budget/2,groups,fields:rows.map(r=>({...r,baseline:r.stage?undefined:r.baseline}))};
  const data=JSON.stringify(result)+'\n',dest=path.join(__dirname,'cards.json');
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(dest,'utf8'),data);
  else fs.writeFileSync(dest,data);
}
if(isMainThread)main().catch(e=>{console.error(e);process.exitCode=1;});
else parentPort.postMessage(evaluate(workerData));
