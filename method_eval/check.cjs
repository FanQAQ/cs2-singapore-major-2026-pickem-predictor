'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {root,fields,strategies,seeds,budget,productionSeed,matrixHash,checkMatrix,cardScore,asJSON,rounded}=require('../integrated_eval/runtime.cjs');
require('../region_vrs_model/model.js');
const reference=require('../region_vrs_eval/diagnostics.json');
const {names,measure,choose}=require('./metrics.cjs');
const controls={
  recommended:{...strategies.base,regionVrs:true},
  tree:{family:'boost',form:true,strong:true,weak:true,format:true,shrinkBO:true}
};
const baselineOnly=process.argv.includes('--baseline-only');
const quick=process.argv.includes('--quick');
const testSeeds=quick?[productionSeed]:seeds;
const signalPaths={
  lan:{folder:'lan_signal',field:'lanSignal',global:'PickLanSignal'},
  pick:{folder:'pick_signal',field:'pickSignal',global:'PickSignal'}
};
const requested=process.argv.find(arg=>arg.startsWith('--candidate='))?.slice('--candidate='.length);
if(requested && !['lan','pick'].includes(requested)) throw new Error('Use --candidate=lan or --candidate=pick');
const activeNames=baselineOnly?['base']:(requested?['base',requested]:names);

function inputHashes() {
  return Object.fromEntries(Object.values(signalPaths).flatMap(info=>['events.json','model.js'].map(name=>{
    const relative=info.folder+'/'+name;
    return [relative,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')];
  })));
}

function newInputs(event) {
  const enriched={...event};
  for (const [name,info] of Object.entries(signalPaths)) {
    if(requested && requested!==name)continue;
    require(path.join(root,info.folder,'model.js'));
    enriched[info.field]=require(path.join(root,info.folder,'events.json'))[event.id];
    assert.ok(enriched[info.field],event.id+' '+info.field);
  }
  return enriched;
}

function matrixWith(event,base,key) {
  if(key==='base') return base;
  const adjusted={...base,bo1:base.bo1.map(row=>row.slice()),bo3:base.bo3.map(row=>row.slice())};
  const apply=(i,j,p,bo)=>{
    if(key==='lan'||key==='both') p=PickLanSignal.adjust(event,i,j,p,bo);
    if(key==='pick'||key==='both') p=PickSignal.adjust(event,i,j,p,bo);
    return p;
  };
  for(const bo of [1,3]) {
    const tab=adjusted['bo'+bo];
    for(let i=0;i<16;i++) for(let j=i+1;j<16;j++){
      const p=apply(i,j,tab[i][j],bo),reverse=apply(j,i,tab[j][i],bo);
      assert.ok(Math.abs(1-p-reverse)<1e-7, event.id+' asymmetric signal '+key);
      tab[i][j]=p;tab[j][i]=1-p;
    }
  }
  checkMatrix(adjusted);
  return adjusted;
}

function replay(event,matrix,baseline) {
  const replay=CS.replay(event.rounds);
  assert.equal(replay.matched,33);
  const wins=Array(16).fill(0),losses=Array(16).fill(0),rows=[];
  for(const [r,round] of event.rounds.entries()){
    for(const [winner,loser] of round){
      assert.equal(wins[winner],wins[loser]);assert.equal(losses[winner],losses[loser]);
      const i=Math.min(winner,loser), j=Math.max(winner,loser), bestOf=CS.bestOf(wins[i],losses[i]), f='bo'+bestOf;
      rows.push({round:r+1,i,j,bestOf,y:Number(i===winner),p:matrix[f][i][j],baseline:baseline[f][i][j]});
    }
    for(const [winner,loser] of round){ wins[winner]++; losses[loser]++; }
  }
  return {rows,actual:replay.actual};
}

function cacheKey(matrix) {
  // The chosen card depends on these inputs only: no actual wins or labels enter the simulation.
  const hash=crypto.createHash('sha256');
  hash.update(fs.readFileSync(path.join(root,'dist','engine.js')));
  hash.update(asJSON({budget,seeds:testSeeds,matrix}));
  return hash.digest('hex');
}

function cards(matrix,flags,ref) {
  // Identical published matrices have a fully audited 30-seed record.
  const hash=matrixHash(matrix);
  if(ref?.matrixSha256===hash && ref.hitsBySeed?.length===seeds.length){
    const c=PickLab.simulateMatrices(matrix,flags,budget,productionSeed).card;
    assert.deepEqual(c,ref.assignments);
    return {card:c,hitsBySeed:ref.hitsBySeed.slice(0,testSeeds.length)};
  }
  const cache=process.env.PICKEM_METHOD_CACHE;
  const filename=cache && path.join(cache,cacheKey(matrix)+'.json');
  let assignments;
  if(filename && fs.existsSync(filename)) {
    assignments=JSON.parse(fs.readFileSync(filename,'utf8'));
  } else {
    assignments=testSeeds.map(seed=>PickLab.simulateMatrices(matrix,flags,budget,seed).card);
    if(filename){
      fs.mkdirSync(cache,{recursive:true});
      const tmp=filename+'.'+process.pid+'.'+Math.random().toString(16).slice(2)+'.tmp';
      fs.writeFileSync(tmp,asJSON(assignments));fs.renameSync(tmp,filename);
    }
  }
  return {card:assignments[0],assignments};
}

function runMethod({id,method}) {
  const exemplar=fields.find(e=>e.id===id);
  const event=baselineOnly?exemplar:newInputs(exemplar);
  const flags=controls[method],base=PickLab.seriesMatrices(event,flags),result={};
  const ref=reference.stages.find(s=>s.id===id).cards.baseVrs;
  if(method==='recommended') assert.equal(matrixHash(base),ref.matrixSha256);
  for(const key of activeNames){
    const matrix=matrixWith(event,base,key);
    const {rows,actual}=replay(event,matrix,base);
    const {card,hitsBySeed,assignments}=cards(matrix,flags,ref);
    const hits=hitsBySeed||assignments.map(a=>cardScore(a,actual).hits);
    assert.equal(cardScore(card,actual).hits,hits[0]);
    result[key]={rows,actual,card,hitsBySeed:hits,matrixSha256:matrixHash(matrix)};
  }
  return {id,method,result,inputs:baselineOnly||requested?null:inputHashes()};
}

function preview(selected) {
  const event=newInputs(PickLab.events.find(e=>e.id==='singapore'));
  const out={};
  for(const [method,flags] of Object.entries(controls)){
    const base=PickLab.seriesMatrices(event,flags);
    const variants={};
    for(const key of names) {
      const m=matrixWith(event,base,key);
      const changes={};
      for(const f of ['bo1','bo3']){
        const differences=[];
        for(let i=0;i<16;i++)for(let j=i+1;j<16;j++)differences.push(Math.abs(base[f][i][j]-m[f][i][j]));
        changes[f]={changed:differences.filter(d=>d>1e-10).length,maxAbsPP:rounded(100*Math.max(...differences))};
      }
      variants[key]={matrixSha256:matrixHash(m),...changes};
    }
    out[method]={selected:selected[method],variants};
  }
  return out;
}

function summarise(stages){
  const report={seed:productionSeed,seeds:testSeeds,simulationCount:budget,stageCount:stages.length,
    matchCount:33*stages.length,totals:{},forward:{},selected:{},stages:stages.map(s=>({id:s.id,label:s.label,models:{},selectedBefore:{}}))};
  for(const method of Object.keys(controls)){
    const base=stages.map(s=>s.models[method].base);
    for(const [i,stage] of stages.entries()){
      const row=report.stages[i];
      row.models[method]=Object.fromEntries(names.map(key=>[key,measure([stage.models[method][key]],[base[i]])]));
      row.selectedBefore[method]=choose(stages.slice(0,i),method);
    }
    report.totals[method]=Object.fromEntries(names.map(key=>[key,measure(stages.map(s=>s.models[method][key]),base)]));
    report.forward[method]=measure(stages.map((s,i)=>s.models[method][report.stages[i].selectedBefore[method]]),base);
    report.selected[method]=choose(stages,method);
  }
  report.singapore=preview(report.selected);
  return report;
}

async function main() {
  const frozen=baselineOnly||requested?null:inputHashes();
  const stages=fields.map(e=>({id:e.id,label:e.label,teams:e.teams.map(t=>t.name),models:{}}));
  const queue=stages.flatMap(s=>Object.keys(controls).map(method=>({id:s.id,method})));
  async function next(){
    while(queue.length){
      const task=queue.shift();
      const item=await new Promise((resolve,reject)=>{
        const worker=new Worker(__filename,{workerData:task,argv:process.argv.slice(2)});
        worker.once('error',reject);worker.once('message',resolve);
        worker.once('exit',n=>{if(n!==0)reject(Error('worker '+n));});
      });
      assert.deepEqual(item.inputs,frozen,'Feature inputs changed during simulation');
      stages.find(s=>s.id===item.id).models[item.method]=item.result;
    }
  }
  await Promise.all(Array.from({length:Math.min(6,os.availableParallelism?.()||2)},next));
  // Worker completion order must not determine report serialization.
  for(const s of stages) s.models=Object.fromEntries(Object.keys(controls).map(k=>[k,s.models[k]]));
  if(baselineOnly || requested){
    for(const method of Object.keys(controls)){
      const base=stages.map(s=>s.models[method].base);
      for(const key of activeNames){
        const entries=stages.map(s=>s.models[method][key]);
        const m=measure(entries,base);
        console.log(method,key,m.all.brier,m.bo3.brier,JSON.stringify(m.card),JSON.stringify(m.stability));
      }
    }
    return;
  }
  const report=summarise(stages);
  assert.deepEqual(inputHashes(),frozen);
  report.inputSha256=frozen;
  assert.equal(report.totals.recommended.base.card.hits,23);
  assert.equal(report.totals.recommended.base.all.n,165);
  assert.equal(report.totals.tree.base.card.hits,21);
  for(const [method,summaries] of Object.entries(report.totals)){
    console.table(names.map(key=>({method,key,brier:summaries[key].all.brier,bo3:summaries[key].bo3.brier,
      hits:summaries[key].card.hits,passes:summaries[key].card.passes,tail:summaries[key].card.bucketHits[2],
      meanPass:summaries[key].stability.meanPasses})));
  }
  console.log('Selected',report.selected,'rolling',Object.fromEntries(Object.entries(report.forward).map(([k,v])=>[k,v.card])));
  if(quick)return;
  for(const [name,body] of [['report',report],['diagnostics',{controls,seeds,stages}]]){
    const file=path.join(__dirname,name+'.json'),text=asJSON(body);
    if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),text);
    else {fs.writeFileSync(file+'.tmp',text);fs.renameSync(file+'.tmp',file);}
  }
}
if(isMainThread)main().catch(err=>{console.error(err);process.exitCode=1;});
else parentPort.postMessage(runMethod(workerData));
