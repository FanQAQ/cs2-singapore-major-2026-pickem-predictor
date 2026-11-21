'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const dist=path.resolve(__dirname,'../dist');
globalThis.self=globalThis;
globalThis.importScripts=(...files)=>files.forEach(file=>require(path.join(dist,file)));
importScripts('history-worker.js');
require('./rules.js');
const profiles=require('./profiles.json'), reference=require('./report.json');
// A second deterministic stream fixed from the ASCII encoding of CS23 (0x43533233).
const newSeeds=reference.seeds.map(seed=>(seed^0x43533233)>>>0);
assert.equal(new Set([...newSeeds,...reference.seeds]).size,60);
const sum=xs=>xs.reduce((a,b)=>a+b,0);
function evaluate(id) {
  const event=PickLab.allEvents.find(e=>e.id===id), profile=profiles[id];
  const flags={...PickMethods.defaults('recommended',event),seedConditionalCard:true};
  const matrix=PickLab.seriesMatrices(event,flags), points=event.teams.map(t=>t.points);
  const actual=CS.replay(event.rounds).actual;
  const priorEvents=PickLab.allEvents.filter(e=>profile.earlier.includes(e.id));
  const omissions=[...new Set(priorEvents.map(e=>e.parent))];
  const priors=[['full',profile.prior]];
  for(const parent of omissions) {
    const subset=priorEvents.filter(e=>e.parent!==parent).map(e=>({points:e.teams.map(t=>t.points),actual:CS.replay(e.rounds).actual}));
    priors.push([parent,PickFinalCard.prior(points,subset)]);
  }
  const values={base:[]};
  for(const seed of newSeeds) {
    const sim=CS.run(matrix,reference.budget,seed,[],{seedConditionalCard:true});
    values.base.push(CS.actualScore(sim.card,actual));
    for(const [key,prior] of priors) {
      const score=CS.actualScore(PickFinalCard.card('historical',sim,points,prior),actual);
      (values[key]??=[]).push(score);
      if(key==='full') {
        const active=PickFinalCard.apply(sim,{...flags,stage3Allocation:true},event,profile);
        assert.equal(CS.actualScore(active.card,actual),score);
        assert.deepEqual(sim.score(active.card).pass,active.pass);
        assert.equal(PickFinalCard.apply(sim,flags,event,profile),sim);
        assert.equal(PickFinalCard.apply(sim,{...flags,family:'boost',stage3Allocation:true},event,profile),sim);
      }
    }
  }
  return {id,values};
}
if(!isMainThread) parentPort.postMessage(evaluate(workerData));
else (async()=>{
  const stages=await Promise.all(Object.keys(profiles).map(id=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:id});
    worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code)reject(Error('worker '+code));});
  })));
  const pairs=newSeeds.map((_,k)=>{
    const more=stages.filter(s=>s.values.full[k]>=5).length-stages.filter(s=>s.values.base[k]>=5).length;
    return Math.sign(more);
  });
  const summary=stages.map(s=>({id:s.id,sourceOmissions:Object.fromEntries(Object.entries(s.values).map(([k,h])=>
    [k,{passed:h.filter(n=>n>=5).length,hits:sum(h)/newSeeds.length}]))}));
  const result={seeds:newSeeds,more:pairs.filter(x=>x>0).length,same:pairs.filter(x=>x===0).length,fewer:pairs.filter(x=>x<0).length,summary,stages};
  const output=JSON.stringify(result,null,2)+'\n', file=path.join(__dirname,'stability.json');
  if(process.argv.includes('--check')) assert.equal(fs.readFileSync(file,'utf8'),output);
  else fs.writeFileSync(file,output);
  console.log(JSON.stringify({more:result.more,same:result.same,fewer:result.fewer,summary}));
})().catch(e=>{console.error(e);process.exitCode=1;});
