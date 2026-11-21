'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {collect,streams,audit}=require('../convergence.cjs');
const {score}=require('../../../bo5_history/cards.cjs');
const {seeds}=require('../../../strategy_v4_eval/settings.cjs');
const odds=require('./odds.json'),truth=require('./scores.json');
assert.equal(createHash('sha256').update(fs.readFileSync(require.resolve('./odds.json'))).digest('hex'),truth.lockedSHA256);

function expand(upper,rounded){
  const m=Array.from({length:16},()=>Array(16).fill(.5));
  let k=0;
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){
    const p=upper[k++];
    assert(p>0&&p<1);
    m[i][j]=p;m[j][i]=rounded?Number((1-p).toFixed(10)):1-p;
  }
  assert.equal(k,upper.length);
  return m;
}
function source(id){
  if(id===odds.id)return {actual:truth.actual,matrix:{bo1:expand(odds.eloBO1,false),bo3:expand(odds.mlBO3,true),allBo3:false}};
  assert.equal(id,'cluj-2026');
  const api=require('../../evaluate.cjs'),field=api.getField(id);
  const {ml}=api.matrices(field,['ml']);assert.equal(ml.allBo3,true);
  return {actual:api.truth(id,field.teams.map(t=>t.name)).actual,matrix:ml};
}
function compare(index,id){
  const batch=streams[index],{matrix,actual}=source(id);
  const large=collect(id,matrix,batch),test=collect(id,matrix,batch.map(audit));
  const small=collect(id,matrix,[seeds[index]]),smallTest=collect(id,matrix,[audit(seeds[index])]);
  function result(train,validation){
    const card=CS.cardsFromSamples(train,true).card;
    const r=score(card,validation,actual);
    const auditCount=s=>Math.round(score(card,s,actual).simulatedPass*12000);
    return {card,hits:r.hits,slots:r.slots,passCount:auditCount(validation),count:validation.count,
      commonAuditPassCount:auditCount(test)};
  }
  return {seed:seeds[index],small:result(small,smallTest),large:result(large,test)};
}
async function main(){
  const id=process.argv.includes('--cluj')?'cluj-2026':odds.id;
  let cursor=0;
  const results=new Array(seeds.length);
  async function work(){
    while(cursor<seeds.length){
      const i=cursor++;
      results[i]=await new Promise((resolve,reject)=>{
        const w=new Worker(__filename,{workerData:{i,id}});
        w.once('message',resolve);w.once('error',reject);
        w.once('exit',code=>{if(code)reject(Error('worker exit '+code));});
      });
    }
  }
  await Promise.all(Array.from({length:4},work));
  const file=path.join(__dirname,id===odds.id?'budgets.json':'cluj.json'),data=JSON.stringify({id,results})+'\n';
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),data);
  else fs.writeFileSync(file,data);
}
if(isMainThread)main().catch(e=>{console.error(e);process.exitCode=1;});
else parentPort.postMessage(compare(workerData.i,workerData.id));
