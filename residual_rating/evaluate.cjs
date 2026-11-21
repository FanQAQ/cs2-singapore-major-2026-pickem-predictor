'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {fields,strategies,budget,seeds,checkMatrix,matrixHash,cardScore,asJSON}=require('../integrated_eval/runtime.cjs');
const {measure}=require('../method_eval/metrics.cjs');
const published=require('../method_eval/diagnostics.json');
const ratings=require('./ratings.json');
require('../region_vrs_model/model.js');
const flags={...strategies.base,regionVrs:true};
const target=path.join(__dirname,'report.json');

function evaluate(event,quick) {
  const base=published.stages.find(row=>row.id===event.id).models.recommended.base;
  const full=PickLab.seriesMatrices(event,flags);
  assert.equal(matrixHash(full),base.matrixSha256);
  const neutral=PickLab.seriesMatrices(event,{...flags,form:false,strong:false,weak:false});
  const fit=ratings[event.id];
  assert.equal(fit.asOf,event.v4Model.asOf);
  const effects=event.teams.map(team=>{
    const rating=fit.teams[team.name];
    assert.deepEqual(rating.roster.slice().sort(),team.roster.slice().sort());
    return rating.residual;
  });
  const matrix={...neutral};
  for(const format of ['bo1','bo3']) {
    matrix[format]=neutral[format].map((row,i)=>row.map((p,j)=>
      1/(1+Math.exp(-Math.log(p/(1-p))-effects[i]+effects[j]))));
  }
  checkMatrix(matrix);
  const used=quick?seeds.slice(0,1):seeds;
  const cards=used.map(seed=>PickLab.simulateMatrices(matrix,flags,budget,seed).card);
  const replay=CS.replay(event.rounds);
  assert.ok(replay.ok && replay.total===33);
  assert.deepEqual(replay.actual,base.actual);
  const candidate={rows:base.rows.map(row=>({...row,p:matrix['bo'+row.bestOf][row.i][row.j],baseline:row.p})),
    card:cards[0],actual:replay.actual,hitsBySeed:cards.map(c=>cardScore(c,replay.actual).hits)};
  const control={...base,hitsBySeed:base.hitsBySeed.slice(0,used.length)};
  const neutralRows=base.rows.map(row=>({...row,p:neutral['bo'+row.bestOf][row.i][row.j],baseline:row.p}));
  const scores=entry=>cardScore(entry.card,entry.actual);
  return {id:event.id,control,candidate,neutralRows,summary:{id:event.id,base:scores(control),candidate:scores(candidate),
    coverage:effects.filter(x=>x!==0).length,officialSeedCard:cards[0],hitsBySeed:candidate.hitsBySeed,
    matrixSha256:matrixHash(matrix)}};
}

async function main() {
  const quick=process.argv.includes('--quick');
  const stages=await Promise.all(fields.map(e=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{id:e.id,quick}});
    worker.once('message',resolve);
    worker.once('error',reject);
    worker.once('exit',code=>{if(code!==0)reject(Error('Worker exit '+code));});
  })));
  const controls=stages.map(s=>s.control);
  const stripped=measure(stages.map(s=>({...s.control,rows:s.neutralRows})),controls);
  const report={simulationPaths:budget,seeds:quick?seeds.slice(0,1):seeds,stages:stages.map(s=>s.summary),
    base:measure(controls,controls),withoutOutcomeForm:{bo1:stripped.bo1,bo3:stripped.bo3,all:stripped.all},
    candidate:measure(stages.map(s=>s.candidate),controls)};
  if(quick) console.log(asJSON(report));
  else if(process.argv.includes('--check')) assert.deepEqual(report,JSON.parse(fs.readFileSync(target,'utf8')));
  else fs.writeFileSync(target,asJSON(report));
  console.log(quick?'fixed seed':'30 seeds',report.base.card,report.candidate.card, report.candidate.stability);
}
if(isMainThread) main().catch(e=>{console.error(e);process.exitCode=1;});
else parentPort.postMessage(evaluate(fields.find(e=>e.id===workerData.id),workerData.quick));
