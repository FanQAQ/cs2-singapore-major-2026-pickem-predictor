'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {createHash}=require('node:crypto');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const {play}=require('../bo5_history/cards.cjs');
const scores=require('./scores.json'), arms=['baseline','candidate'];
const ids=Object.keys(scores.fields);
const read=name=>fs.readFileSync(path.join(__dirname,name));
const fields={};
for(const [group,hash] of Object.entries(scores.lockedInputSha256)){
  const bytes=read(group+'-matrices.json');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
  Object.assign(fields,JSON.parse(bytes).fields);
}
function run(id,arm){
  const f=fields[id],truth=scores.fields[id],matrix={allBo3:truth.bo1.n===0};
  for(const fmt of ['bo1','bo3']){
    const full=Array.from({length:16},()=>Array(16).fill(.5));
    let k=0;
    for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){
      const p=f.arms[arm][fmt][k++];
      assert(p>0 && p<1);
      full[i][j]=p;
      full[j][i]=Number((1-p).toFixed(10));
    }
    assert.equal(k,120);
    matrix[fmt]=full;
  }
  return seeds.map((seed,i)=>{
    const s=play({id,scheme:'major'},matrix,seed,truth.actual,true);
    const perfectBrier=s.teams.reduce((v,t,j)=>v+(t.perfect-Number(truth.actual[j]===0))**2,0)/16;
    return {seed,...s.cards.standard,perfectBrier,zeroBrier:s.zeroBrier,
      ...(i===0?{teamProbabilities:s.teams}:{})};
  });
}
function compare(deltas){
  return {better:deltas.filter(d=>d>0).length,same:deltas.filter(d=>d===0).length,worse:deltas.filter(d=>d<0).length};
}
function directions(fields){
  return Object.fromEntries(['passed','hits'].map(key=>[key,compare(seeds.map((_,i)=>
    fields.reduce((d,f)=>d+Number(f.candidate[i][key])-Number(f.baseline[i][key]),0)))]));
}
async function main(){
  assert.equal(scores.gatePassed,true,'External error gate must pass before simulating cards');
  assert.equal(seeds.length,30);assert.equal(budget/2,12000);
  const out={seed:seeds[0],seeds,pathsPerPartition:budget/2,fields:{}};
  const jobs=ids.flatMap(id=>arms.map(arm=>({id,arm})));
  let next=0;
  async function work(){
    while(next<jobs.length){
      const job=jobs[next++];
      const rows=await new Promise((resolve,reject)=>{
        const w=new Worker(__filename,{workerData:job});
        w.once('message',resolve);w.once('error',reject);
        w.once('exit',code=>{if(code)reject(Error('Worker exited '+code));});
      });
      (out.fields[job.id]??={})[job.arm]=rows;
    }
  }
  await Promise.all(Array.from({length:4},work));
  const ordered=Object.fromEntries(ids.map(id=>[id,Object.fromEntries(arms.map(a=>[a,out.fields[id][a]]))]));
  for(const [id,r] of Object.entries(ordered)){
    r.direction=directions([r]);
    console.log(id,r.baseline[0].hits,r.candidate[0].hits,JSON.stringify(r.direction));
  }
  const stages=ids.filter(id=>id.endsWith('-3'));
  assert.deepEqual(stages.map(id=>ordered[id].baseline[0].hits),[4,3,5]);
  out.fields=ordered;out.stage3Direction=directions(stages.map(id=>ordered[id]));
  const result=JSON.stringify(out)+'\n';
  if(process.argv.includes('--check'))assert.equal(read('cards.json').toString(),result);
  else fs.writeFileSync(path.join(__dirname,'cards.json'),result);
}
if(isMainThread)main().catch(e=>{console.error(e);process.exitCode=1;});
else parentPort.postMessage(run(workerData.id,workerData.arm));
