'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const old=require('../f1bre_models/evaluate.cjs'),{cardScore,errors}=require('../f1bre_models/score.cjs');
const {teams,samples,inSeedOrder}=require('./draw.cjs');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const {externalDocs}=require('../tail_calibration/evaluate.cjs');
require('../final_card/rules.js');
const pastMajors=require('../multi_stage/inputs.json'),editions=require('../major_form/all_stages.json').editions;
const n=budget/2,methods=['baseline','ml'],policies=['standard','within','grouped'];
const ids=[...pastMajors.map(t=>t.id),'epl21-stage2','epl22-stage2','epl23-stage2','elisa-spring','elisa-fall'];
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const sum=xs=>xs.reduce((a,b)=>a+b,0);
function median(points) {
  const rated=points.filter(p=>Number.isFinite(p) && p>0).sort((a,b)=>a-b);
  assert(rated.length);return (rated[(rated.length-1)>>1]+rated[rated.length>>1])/2;
}
function fieldFor(id) {
  if(id.startsWith('elisa-')){
    const field=read('holdout-'+id.slice(6)+'-field.json');
    return elisaField(id,field);
  }
  if(externalDocs[id]) {
    const {target}=externalDocs[id]();
    return {...target,group:'esl',stage:2,scheme:'esl',cutoff:target.start,seedOrder:teams};
  }
  const field=old.getField(id),draw=pastMajors.find(r=>id===r.id);
  return {...field,group:'stage'+draw.stage,scheme:'major',direct:teams.slice(0,8),
    cutoff:editions[draw.parent].start,seedOrder:teams};
}
function elisaField(id,raw){
  const fallback=median(raw.teams.map(t=>t.points));
  const byVrs=(a,b)=>(raw.teams[b].points??fallback)-(raw.teams[a].points??fallback)||a-b;
  return {...raw,id,modelId:raw.id,opening:raw.openingPairs,stage:2,group:'elisa',scheme:'draw',cutoff:raw.start,
    seedOrder:teams.slice().sort(byVrs)};
}
function modelsFor(field){
  if(field.scheme==='major')return old.matrices(field,methods);
  const pathToMl=path.join(__dirname,'ml.json.gz');
  const archive=JSON.parse(gunzipSync(fs.readFileSync(pathToMl))).fields;
  const ml=archive[field.id]||archive[field.modelId];assert(ml,'Missing ML '+field.id);
  assert.deepEqual(ml.teams,field.teams.map(t=>t.name));
  assert.equal(ml.start,field.start);
  const points=field.teams.map(t=>t.points);
  const values=points.map(a=>points.map(b=>a>0 && b>0?1/(1+10**((b-a)/400)):.5));
  return {baseline:{bo1:values,bo3:values,allBo3:true},ml:{bo1:ml.bo1,bo3:ml.bo3,allBo3:true}};
}
function truthFor(field){
  if(field.scheme==='major')return old.truth(field.id,field.teams.map(t=>t.name));
  if(field.scheme==='esl'){
    const {truth}=externalDocs[field.id]();
    const replay=field.id==='epl21-stage2'?require('../tail_calibration/evaluate-esl21.cjs').replay:
      require('../round_form/evaluate.cjs').replayEsl;
    return replay(field,truth);
  }
  return elisaTruth(field,read('holdout-'+field.id.slice(6)+'-results.json'));
}
function elisaTruth(field,results){
  const seatActual=results.actual.slice(),actual=seatActual.slice();
  const replaced=new Set((results.changes??[]).map(r=>r.slot));
  for(const slot of replaced)actual[slot]=4;
  const matches=[],excluded=[];
  assert.deepEqual(results.rounds.map(r=>r.length),[8,8,8,6,3]);
  assert.equal(results.matches.length,33);
  for(const {id,w,l,played,coreEligible} of results.matches){
    assert(teams.includes(w) && teams.includes(l) && typeof played==='boolean');
    if(played && !replaced.has(w) && !replaced.has(l))assert.equal(typeof coreEligible,'boolean','core evidence '+id);
    (played && !replaced.has(w) && !replaced.has(l)?matches:excluded).push({id,w,l,bo:3,coreEligible});
  }
  return {actual,seatActual,matches,excluded};
}
function grouping(field){
  const points=field.teams.map(t=>t.points);
  const order=[...field.direct,...teams.filter(i=>!field.direct.includes(i))];
  assert.equal(field.direct.length,8);assert.deepEqual(order.slice().sort((a,b)=>a-b),teams);
  const historical=pastMajors.filter(s=>editions[s.parent].end<field.cutoff);
  const history=historical.map(s=>{
    const r=CS.replay(s.rounds);assert(r.ok && r.matched===33);
    return {points:s.teams.map(t=>t.points),actual:r.actual};
  });
  const orderedPoints=order.map(i=>points[i]);
  return {history:historical.map(s=>s.id),order,points:orderedPoints,
    prior:history.length?PickFinalCard.prior(orderedPoints,history):null};
}
function chooseCards(training,field,profile) {
  const seedOrder=field.seedOrder;
  const bySeed=CS.cardsFromSamples(inSeedOrder(training,seedOrder),true);
  const standard=teams.map(i=>bySeed.card[seedOrder.indexOf(i)]);
  const {prior,order}=profile;
  const freq=order.map(i=>training.frequencies[i]);
  const sim={searchCounts:freq,searchN:training.count,
    expectedCard:order.map(i=>bySeed.expectedCard[seedOrder.indexOf(i)])};
  const groupedOrder=PickFinalCard.card('historical',sim,profile.points,prior);
  const grouped=teams.map(i=>groupedOrder[order.indexOf(i)]);
  // For the identical eight advancers the gain of assigning 3–0 is P(3–0) minus P(ordinary).
  const gain=teams.map(i=>{
    const j=order.indexOf(i),row=freq[j],past=prior?.[j]??[0,0,0,0];
    return (9*(row[0]-row[1])/training.count+past[0]-past[1])/(9+sum(past));
  });
  const eight=seedOrder.filter(i=>standard[i]<2).sort((a,b)=>gain[b]-gain[a]);
  const within=standard.slice();eight.forEach((i,r)=>{within[i]=r<2?0:1;});
  return {standard,within,grouped};
}
const pop=new Uint8Array(65536);for(let i=1;i<pop.length;i++)pop[i]=pop[i>>>1]+(i&1);
function compareOnAudit(cards,sample) {
  const masks=policies.map(k=>[0,1,2].map(c=>cards[k].reduce((m,v,i)=>v===c?m|(1<<i):m,0)));
  const passes=[0,0,0],both=[0,0,0],o=sample.outcomes;
  for(let j=0;j<o.length;j+=3){
    let original=false;
    for(let k=0;k<3;k++){
      const m=masks[k],pass=pop[m[0]&o[j]]+pop[m[1]&o[j+1]]+pop[m[2]&o[j+2]]>=5;
      if(k===0)original=pass;
      passes[k]+=Number(pass);both[k]+=Number(pass && original);
    }
  }
  return Object.fromEntries(policies.map((k,i)=>[k,{passes:passes[i],both:both[i]}]));
}
function simulate(id,scheme){
  const f=fieldFor(id);scheme=scheme??f.scheme;
  const matrices=modelsFor(f),profile=grouping(f),modelRows={};
  for(const k of methods){
    const matrix=matrices[k],runs=seeds.map(seed=>{
      const training=samples(f,matrix,n,seed,scheme),testing=samples(f,matrix,n,(seed^0xc5398da1)>>>0,scheme);
      const cards=chooseCards(training,f,profile);
      return {seed,...cards,paths:[training,testing].map(set=>hash(Buffer.from(set.outcomes.buffer,set.outcomes.byteOffset,set.outcomes.byteLength))),
        audit:compareOnAudit(cards,testing)};
    });modelRows[k]={runs};
  }
  const truth=truthFor(f),archive=require('../f1bre_models/report.json').fields.find(x=>x.id===id);
  const extRef=require('../tail_calibration/report.json').stages.find(x=>x.id===id);
  for(const k of methods){
    const method=modelRows[k];
    const ps=truth.matches.map(g=>matrices[k]['bo'+g.bo][g.w][g.l]);
    method.errors=Object.fromEntries([1,3].map(bo=>['bo'+bo,errors(ps.filter((_,i)=>truth.matches[i].bo===bo))]));
    if(f.group==='elisa')method.coreErrors=errors(ps.filter((_,i)=>truth.matches[i].coreEligible));
    method.runs.forEach((r,i)=>{
      r.scores=Object.fromEntries(policies.map(p=>[p,cardScore(r[p],truth.actual)]));
      if(truth.actual?.includes(4))r.seatHits=Object.fromEntries(policies.map(p=>[p,cardScore(r[p],truth.seatActual).hits]));
      if(archive)assert.deepEqual(r.standard,archive.methods[k].runs[i].card,id+' '+k);
      else if(extRef && k==='baseline')assert.deepEqual(r.standard,extRef.methods.vrs.rows[i].card,id+' VRS');
    });
  }
  return {id,scheme,group:f.group,stage:f.stage,start:f.start,cutoff:f.cutoff,history:profile.history,teams:f.teams.map(t=>t.name),
    direct:f.direct,seedOrder:f.seedOrder,actual:truth.actual,seatActual:truth.seatActual,excluded:truth.excluded?.length??0,methods:modelRows};
}
const cache=path.join(__dirname,'cache');
function savedName(id,scheme){return path.join(cache,id+'-'+scheme+'.json');}
async function main(){
  const args=process.argv.slice(2),selected=args.filter(a=>ids.includes(a)),work=selected.length?selected:ids;
  const jobs=work.flatMap(id=>(id.startsWith('elisa-')?['draw','ranked']:[id.startsWith('epl')?'esl':'major']).map(scheme=>({id,scheme})));
  const rows=new Array(jobs.length);let next=0;
  async function go(){while(next<jobs.length){
    const i=next++,job=jobs[i],file=savedName(job.id,job.scheme);
    if(args.includes('--collect'))rows[i]=JSON.parse(fs.readFileSync(file,'utf8'));
    else{
      const result=await new Promise((resolve,reject)=>{const w=new Worker(__filename,{workerData:job});w.once('message',resolve);w.once('error',reject);w.once('exit',k=>{if(k)reject(Error(job.id+' '+k));});});
      rows[i]=result;
      if(!args.includes('--check')){fs.mkdirSync(cache,{recursive:true});fs.writeFileSync(file,JSON.stringify(result)+'\n');}
      console.log(job.id,job.scheme);
    }
  }}
  await Promise.all(Array.from({length:4},go));
  if(work.length===ids.length){
    const out=JSON.stringify({seeds,searchN:n,auditN:n,stages:rows})+'\n',file=path.join(__dirname,'report.json');
    if(args.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),out);
    else fs.writeFileSync(file,out);
  }
}
module.exports={fieldFor,truthFor,grouping,modelsFor,chooseCards,compareOnAudit,ids,methods,policies,simulate};
if(require.main===module){if(!isMainThread)parentPort.postMessage(simulate(workerData.id,workerData.scheme));else main().catch(e=>{console.error(e);process.exitCode=1;});}
