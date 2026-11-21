'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {createHash}=require('node:crypto');
const {seeds}=require('../../strategy_v4_eval/settings.cjs');
const {matrices,getField}=require('../evaluate.cjs');
const {collect,streamsFor,audit}=require('./pooled.cjs');
const {score}=require('../../bo5_history/cards.cjs');
const study=require('./cards.json');
const fields=study.fields.filter(f=>f.stage===3);
const n=12000;
const streams=seeds.map(streamsFor);
const all=streams.flatMap(batch=>[...batch,...batch.map(audit)]);
assert.equal(new Set(all).size,1800);assert(!all.includes(0));

function run(id,index){
  const f=fields.find(f=>f.id===id),{elo,ml}=matrices(getField(id),['elo','ml']);
  const matrix={...ml,bo1:elo.bo1};
  const train=collect(id,matrix,streams[index]);
  const card=CS.cardsFromSamples(train,true).card;
  const test=collect(id,matrix,streams[index].map(audit));
  const passed=score(card,test,f.actual);
  // The shared score helper normalizes by 12,000 paths. Restore integer count before scaling.
  const passCount=Math.round(passed.simulatedPass*n);
  assert(passCount>=0&&passCount<=test.count);
  return {id,index,seed:seeds[index],card,hits:passed.hits,slots:passed.slots,passCount,count:test.count,
    frequencies:train.frequencies,originalHits:f.hybrid[index].hits};
}
async function main(){
  const dir=process.argv[2];assert(dir,'Supply a scratch directory for restartable jobs');
  const fingerprint=createHash('sha256');
  for(const file of [__filename,require.resolve('./pooled.cjs'),require.resolve('../../ml_allocation/draw.cjs'),require.resolve('../../engine/engine.js'),require.resolve('./cards.json'),
    require.resolve('../elo.json.gz'),require.resolve('../ml.json.gz')])fingerprint.update(fs.readFileSync(file));
  const out=path.join(dir,fingerprint.digest('hex'));fs.mkdirSync(out,{recursive:true});
  const jobs=fields.flatMap(f=>seeds.map((_,i)=>({id:f.id,index:i})));
  let cursor=0;
  async function work(){
    while(cursor<jobs.length){
      const job=jobs[cursor++],dest=path.join(out,job.id+'-'+job.index+'.json');
      if(fs.existsSync(dest))continue;
      const r=await new Promise((resolve,reject)=>{
        const w=new Worker(__filename,{workerData:job});w.once('message',resolve);w.once('error',reject);
        w.once('exit',code=>{if(code)reject(Error('Worker exited '+code));});
      });
      fs.writeFileSync(dest+'.tmp',JSON.stringify(r));fs.renameSync(dest+'.tmp',dest);
    }
  }
  await Promise.all(Array.from({length:4},work));
  const results=jobs.map(j=>JSON.parse(fs.readFileSync(path.join(out,j.id+'-'+j.index+'.json'))));
  for(const [i,r] of results.entries())assert(r.id===jobs[i].id&&r.index===jobs[i].index&&r.seed===seeds[r.index]&&r.count===360000);
  const file=path.join(__dirname,'convergence.json'),data=JSON.stringify({seeds,streams,results})+'\n';
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),data);
  else fs.writeFileSync(file,data);
}
if(require.main===module){
  if(isMainThread)main().catch(e=>{console.error(e);process.exitCode=1;});
  else parentPort.postMessage(run(workerData.id,workerData.index));
}
module.exports={collect,streams,audit};
