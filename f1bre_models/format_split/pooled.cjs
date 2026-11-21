'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {samples}=require('../../ml_allocation/draw.cjs');
const paths=12000;
const streamsFor=seed=>Array.from({length:30},(_,i)=>(seed+Math.imul(30*i,0x9e3779b1))>>>0);
const audit=seed=>(seed^0xc5398da1)>>>0;

function collect(id,matrix,batch){
  const count=paths*batch.length,outcomes=new Uint16Array(3*count);
  const frequencies=Array.from({length:16},()=>[0,0,0,0]);
  for(const [i,seed] of batch.entries()){
    const result=samples({id},matrix,paths,seed,'major');
    outcomes.set(result.outcomes,3*i*paths);
    for(let t=0;t<16;t++)for(let c=0;c<4;c++)frequencies[t][c]+=result.frequencies[t][c];
  }
  assert(frequencies.every(row=>row.reduce((a,b)=>a+b,0)===count));
  return {count,outcomes,frequencies};
}
function seal(id,matrix,seed){
  const streams=streamsFor(seed),training=collect(id,matrix,streams);
  const card=CS.cardsFromSamples(training,true).card;
  const auditData=collect(id,matrix,streams.map(audit));
  const masks=[0,0,0],bits=new Uint8Array(65536);
  for(let i=1;i<bits.length;i++)bits[i]=bits[i>>>1]+(i&1);
  card.forEach((category,i)=>{if(category<3)masks[category]|=1<<i;});
  let auditPasses=0;
  const o=auditData.outcomes;
  for(let i=0;i<o.length;i+=3){
    const hits=bits[masks[0]&o[i]]+bits[masks[1]&o[i+1]]+bits[masks[2]&o[i+2]];
    if(hits>=5)auditPasses++;
  }
  const fingerprint=s=>createHash('sha256').update(Buffer.from(s.outcomes.buffer)).digest('hex');
  return {card,seed,streams,pathsPerStream:paths,trainingPaths:training.count,auditPaths:auditData.count,
    auditPasses,trainingSHA256:fingerprint(training),auditSHA256:fingerprint(auditData)};
}
module.exports={streamsFor,audit,collect,seal};
