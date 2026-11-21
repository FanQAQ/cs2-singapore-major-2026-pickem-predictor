/* Sensitivity to the original 30 predeclared random seeds on five fixed Major editions. */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {isMainThread,Worker,parentPort,workerData}=require('node:worker_threads');
const {root,v4,budget,seeds}=require('../strategy_v4_eval/settings.cjs');
const previous=require('../strategy_v4_eval/report.json');
const current=require('./report.json');
require(path.join(root,'dist/map-model.js'));
const round=n=>Number(n.toFixed(6));
const mean=values=>round(values.reduce((s,v)=>s+v,0)/values.length);

function stage(id) {
  const old=previous.opening.stages.find(s=>s.id===id).models.v4;
  const event=PickLab.events.find(e=>e.id===id);
  assert.deepEqual(require('../map_veto_data/veto.json')[id],event.mapVeto);
  const matrix=PickLab.seriesMatrices(event,{...v4,mapVeto:true});
  const actual=CS.replay(event.rounds).actual;
  const candidate=seeds.map(seed=>CS.actualScore(CS.run(matrix,budget,seed).card,actual));
  const base=old.hitsBySeed;
  const main=current.stages.find(r=>r.id===id);
  assert.equal(candidate[0],main.candidate.card.hits);
  assert.equal(base[0],main.base.card.hits);
  return {id,base,candidate,passes:{base:base.filter(h=>h>=5).length,candidate:candidate.filter(h=>h>=5).length}};
}

function runStage(id) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:id});
    worker.once('message',resolve);
    worker.once('error',reject);
    worker.once('exit',code=>{if(code!==0)reject(Error('Worker failed: '+id));});
  });
}

function totals(rows,key) {
  const passes=seeds.map((_,i)=>rows.filter(r=>r[key][i]>=5).length);
  const hits=seeds.map((_,i)=>rows.reduce((s,r)=>s+r[key][i],0));
  return {passes,hits,meanPasses:mean(passes),meanHits:mean(hits)};
}

async function main() {
  assert.deepEqual(seeds,previous.seeds);
  assert.equal(budget,previous.budget);
  const ids=current.stages.map(row=>row.id);
  const queue=ids.slice(), results=new Map();
  async function next() {
    while(queue.length) {
      const id=queue.shift();
      results.set(id,await runStage(id));
    }
  }
  await Promise.all([next(),next(),next()]);
  const rows=ids.map(id=>results.get(id));
  const base=totals(rows,'base'),candidate=totals(rows,'candidate');
  const delta=base.passes.map((n,i)=>candidate.passes[i]-n);
  const report={budget,seeds,stages:rows,base,candidate,
    pairedPassCount:{improved:delta.filter(n=>n>0).length,unchanged:delta.filter(n=>n===0).length,worse:delta.filter(n=>n<0).length}};
  const target=path.join(__dirname,'stability.json'),text=JSON.stringify(report,null,2)+'\n';
  if(process.argv.includes('--check')) assert.equal(fs.readFileSync(target,'utf8'),text);
  else fs.writeFileSync(target,text);
  console.log(JSON.stringify({base:base.meanPasses,candidate:candidate.meanPasses,baseHits:base.meanHits,
    candidateHits:candidate.meanHits,bySeed:report.pairedPassCount}));
}

if (isMainThread) main().catch(error=>{console.error(error);process.exitCode=1;});
else parentPort.postMessage(stage(workerData));
