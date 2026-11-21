'use strict';
const assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {inputs,digest,read,freeze}=require('./lock.cjs');
const {seeds}=require('../../../strategy_v4_eval/settings.cjs');
const {errors,cardScore}=require('../../score.cjs');
const {collect,streamsFor,audit}=require('../pooled.cjs');
const {samples}=require('../../../ml_allocation/draw.cjs');
const {f,recommended,candidate}=inputs(),locked=read('cards.json');
const outcome=read('actual.json'),large=read('candidate-large.json');
for(const [name,matrix] of Object.entries({recommended,candidate}))assert.equal(digest(matrix),locked.matrices[name]);
const rounds=outcome.rounds.map(r=>r.map(g=>g.slice(0,2))),r=CS.replay(rounds);
assert(r.ok && r.matched===33);
const bits=new Uint8Array(65536);
for(let i=1;i<bits.length;i++)bits[i]=bits[i>>>1]+(i&1);
function record(card,paths) {
  const masks=[0,0,0];
  card.forEach((c,i)=>{if(c<3)masks[c]|=1<<i;});
  let passes=0;
  for(let i=0;i<paths.length;i+=3)
    if(bits[paths[i]&masks[0]]+bits[paths[i+1]&masks[1]]+bits[paths[i+2]&masks[2]]>=5)passes++;
  return {card,...cardScore(card,r.actual),auditN:paths.length/3,auditPasses:passes};
}
function grade(seed){
  const batch=streamsFor(seed),sample=(m,s)=>samples(f,m,12000,s,'major');
  const standard=m=>{
    const card=CS.cardsFromSamples(sample(m,seed),true).card;
    return record(card,sample(m,audit(seed)).outcomes);
  };
  const control=standard(recommended),small=standard(candidate);
  let pooled;
  if(seed===large.seed){
    assert.deepEqual(control.card,locked.recommended);assert.deepEqual(small.card,locked.candidate);
    pooled={card:large.card,...cardScore(large.card,r.actual),auditN:large.auditPaths,auditPasses:large.auditPasses};
  }else{
    const train=collect(f.id,candidate,batch),card=CS.cardsFromSamples(train,true).card;
    pooled=record(card,collect(f.id,candidate,batch.map(audit)).outcomes);
  }
  return {seed,control,small,pooled};
}
async function main(){
  const workers=4;
  const groups=Array.from({length:workers},(_,i)=>seeds.filter((_,j)=>j%workers===i));
  const rows=(await Promise.all(groups.map(group=>new Promise((resolve,reject)=>{
    const w=new Worker(__filename,{workerData:group});w.once('message',resolve);w.once('error',reject);
    w.once('exit',n=>{if(n)reject(Error('Worker exit '+n));});
  })))).flat().sort((a,b)=>seeds.indexOf(a.seed)-seeds.indexOf(b.seed));
  assert.deepEqual(rows.map(r=>r.seed),seeds);
  const byFormat=Object.fromEntries(Object.entries({recommended,candidate}).map(([k,m])=>[k,errors(rounds.flat().map(([w,l])=>m.bo3[w][l]))]));
  const result={rounds:r.rounds.map(g=>g.matched),byFormat,rows};
  freeze('scores.json',result);
  console.log(byFormat,Object.fromEntries(['control','small','pooled'].map(k=>[k,rows.filter(x=>x[k].hits>=5).length])));
}
if(isMainThread)main().catch(e=>{console.error(e);process.exitCode=1});
else parentPort.postMessage(workerData.map(grade));
