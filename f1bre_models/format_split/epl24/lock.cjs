'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), {createHash}=require('node:crypto');
const {productionSeed,seeds}=require('../../../strategy_v4_eval/settings.cjs');
const {choose}=require('../../../method_eval/metrics.cjs');
const {eplSamples}=require('../../../round_form/evaluate.cjs');
const {pass}=require('../../../final_card/path_weights/weighted.cjs');
const {streamsFor,audit}=require('../pooled.cjs');
require('../../../dist/methods.js');
require('../../../dist/region-vrs.js');
const file=name=>path.join(__dirname,name);
const read=name=>JSON.parse(fs.readFileSync(file(name)));
const hash=name=>createHash('sha256').update(fs.readFileSync(file(name))).digest('hex');
function freeze(name,value){
  const raw=JSON.stringify(value)+'\n';
  if(fs.existsSync(file(name)))assert.equal(fs.readFileSync(file(name),'utf8'),raw,name);
  else fs.writeFileSync(file(name),raw,{flag:'wx'});
}
function matrices(){
  const field=read('field.json'), ml=read('ml.json'), strength=read('v4-strength.json');
  const format=read('format.json'), region=read('region.json'), classic=read('classic.json');
  for(const document of [format,region,strength])assert.equal(document.fieldSHA256,hash('field.json'));
  assert.equal(ml.inputs['field.json'],hash('field.json'));
  assert.deepEqual(ml.teams,field.teams.map(t=>t.name));
  const prior=require('../../../method_eval/diagnostics.json').stages;
  assert.deepEqual(prior.map(e=>e.id),['copenhagen','shanghai','austin','budapest','cologne']);
  const selected=choose(prior,'recommended');
  assert.equal(selected,'base');
  const event={...field,asOf:'2026-09-07',methodSelection:{recommended:selected},model:classic,
    v4Model:strength.v4Model,regionVrsModel:region.regionVrs,...format};
  const flags=PickMethods.defaults('recommended',event);
  const baseline=PickLab.seriesMatrices(event,flags);
  assert(baseline.allBo3);
  const models={recommended:baseline.bo3,mapML:ml.bo3};
  for(const matrix of Object.values(models)){
    assert.equal(matrix.length,16);
    for(const [i,row] of matrix.entries()){
      assert.equal(row.length,16);
      for(const [j,p] of row.entries())assert(p>0 && p<1 && Math.abs(p+matrix[j][i]-1)<1e-8);
    }
  }
  return {teams:ml.teams,flags,models,hashes:Object.fromEntries(
    ['field.json','classic.json','ml.json','format.json','v4-strength.json','region.json'].map(n=>[n,hash(n)]))};
}
function sample(matrix,ratings,streams,count){
  if(streams.length===1)return eplSamples(matrix,ratings,count,streams[0]);
  const total=count*streams.length, outcomes=new Uint16Array(total*3);
  const frequencies=Array.from({length:16},()=>[0,0,0,0]);
  for(const [i,seed] of streams.entries()){
    const batch=eplSamples(matrix,ratings,count,seed);
    outcomes.set(batch.outcomes,3*i*count);
    batch.frequencies.forEach((row,t)=>row.forEach((n,c)=>{frequencies[t][c]+=n;}));
  }
  assert(frequencies.every(row=>row.reduce((a,b)=>a+b,0)===total));
  return {count:total,outcomes,frequencies};
}
function predict(matrix,ratings,streams,nTrain,nAudit){
  const training=sample(matrix,ratings,streams,nTrain);
  const card=CS.cardsFromSamples(training,true).card;
  const independent=sample(matrix,ratings,streams.map(audit),nAudit);
  return {streams,nTrain:training.count,nAudit:independent.count,card,
    auditPasses:Math.round(independent.count*pass(card,independent.outcomes))};
}
if(require.main===module){
  const inputs=matrices(), {liveRatings}=read('field.json');
  freeze('matrices.json',inputs);
  for(const [name,matrix] of Object.entries(inputs.models)){
    const run=(s,n,m)=>predict(matrix,liveRatings,s,n,m);
    const spec={matrixFileSHA256:hash('matrices.json'),pilot:seeds.slice(0,3).map(s=>run([s],2000,4000)),
      standard:seeds.map(s=>run([s],12000,12000))};
    if(name==='mapML')spec.large=run(streamsFor(productionSeed),12000,12000);
    freeze(name+'-cards.json',spec);
    console.log(name,'sealed');
  }
}
module.exports={read,hash,freeze,matrices};
