'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
globalThis.self=globalThis;
globalThis.importScripts=(...files)=>files.forEach(f=>require(path.join(dist,f)));
importScripts('history-worker.js');
require('./rules.js');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const round=n=>Number(n.toFixed(7));
const sum=arr=>arr.reduce((a,b)=>a+b,0);
const priorReport=require('../multi_stage_train/report.json');
const editionDates=require('../major_form/all_stages.json').editions;
const historical=PickLab.allEvents.filter(e=>e.hasResults).sort((a,b)=>a.date.localeCompare(b.date));
const parent=e=>e.parent||e.id;
function features(event) {
  const {id}=event;
  const stage=event.stage||1;
  const flags=PickMethods.defaults('recommended',event);
  const matrix=PickLab.seriesMatrices(event,flags);
  const points=event.teams.map(t=>t.points);
  const earlier=historical.filter(s=>s.stage>1 && editionDates[parent(s)].end<editionDates[parent(event)].start);
  const past=earlier.map(s=>({points:s.teams.map(t=>t.points),actual:CS.replay(s.rounds).actual}));
  const prior=stage>1 && past.length ? PickFinalCard.prior(points,past) : null;
  const results={};
  for(const seed of seeds) {
    const sim=CS.run(matrix,budget,seed,[],{seedConditionalCard:true});
    const choices=Object.fromEntries(PickFinalCard.methods.map(k=>[k,PickFinalCard.card(k,sim,points,prior)]));
    const actual=CS.replay(event.rounds).actual;
    for(const [key,card] of Object.entries(choices)) {
      const record=results[key]??={hits:[],estimatedPass:[]};
      const hits=CS.actualScore(card,actual);
      record.hits.push(hits);
      record.estimatedPass.push(round(sim.score(card).pass));
      if(seed===seeds[0]) {
        record.card=card;
        record.categories=[0,1,2].map(c=>card.filter((v,i)=>v===c && actual[i]===c).length);
        assert.equal(sum(record.categories),hits);
      }
    }
  }
  const archived=priorReport.stages.find(s=>s.id===id).methods.recommended.base;
  assert.deepEqual(results.current.hits,archived.hitsBySeed,id);
  return {id,stage,edition:parent(event),date:event.date.slice(0,10),earlier:earlier.map(s=>s.id),
    teams:event.teams.map(t=>t.name),actual:CS.replay(event.rounds).actual,series:archived.series,results};
}
function aggregate(stages,key) {
  const fixedCategories=[0,1,2].map(c=>sum(stages.map(s=>s.results[key].categories[c])));
  const hits=seeds.map((_,i)=>sum(stages.map(s=>s.results[key].hits[i])));
  const passes=seeds.map((_,i)=>stages.filter(s=>s.results[key].hits[i]>=5).length);
  return {passes:passes[0],hits:hits[0],categories:fixedCategories,meanPass:round(sum(passes)/seeds.length),
    meanHits:round(sum(hits)/seeds.length),passBySeed:passes,hitsBySeed:hits};
}
function select(stages) {
  if(stages.length<2) return 'current';
  const choices=PickFinalCard.methods.map(key=>({key,...aggregate(stages,key)}));
  const floor=choices[0];
  return choices.filter(r=>r.meanPass>=floor.meanPass && r.meanHits>=floor.meanHits)
    .sort((a,b)=>b.meanPass-a.meanPass||b.meanHits-a.meanHits)[0].key;
}
async function main() {
  const stages=new Array(historical.length);
  let idx=0;
  async function work() {
    while(idx<historical.length) {
      const i=idx++;
      stages[i]=await new Promise((resolve,reject)=>{
        const w=new Worker(__filename,{workerData:historical[i].id});
        w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error('worker '+code));});
      });
    }
  }
  await Promise.all(Array.from({length:4},work));
  for(const s of stages) {
    const eligible=stages.filter(row=>s.earlier.includes(row.id));
    const selected=s.stage===3 ? select(eligible) : 'current';
    s.selected=selected;s.results.forward=s.results[selected];
  }
  const summaries={};
  for(const [key,group] of Object.entries({stage1:stages.filter(s=>s.stage===1),stage2:stages.filter(s=>s.stage===2),
      stage3:stages.filter(s=>s.stage===3),transfer2024:stages.filter(s=>s.date.startsWith('2024')&&s.stage===2),
      cologne:stages.filter(s=>s.edition==='cologne'&&s.stage===3)})) {
    summaries[key]=Object.fromEntries([...PickFinalCard.methods,'forward'].map(k=>[k,aggregate(group,k)]));
  }
  const report={seeds,budget,summaries,stages,nextRule:select(stages.filter(s=>s.stage>1))};
  function save(filename,data) {
    const output=JSON.stringify(data,null,2)+'\n', file=path.join(__dirname,filename);
    if(process.argv.includes('--check')) assert.equal(fs.readFileSync(file,'utf8'),output);
    else fs.writeFileSync(file,output);
  }
  save('report.json',report);
  const profiles={};
  for(const e of historical.filter(s=>s.stage===3)) {
    const row=stages.find(s=>s.id===e.id);
    const earlier=historical.filter(s=>row.earlier.includes(s.id));
    const observations=earlier.map(s=>({points:s.teams.map(t=>t.points),actual:CS.replay(s.rounds).actual}));
    const points=e.teams.map(t=>t.points);
    const cutoff=earlier.map(s=>editionDates[parent(s)].end).sort().at(-1);
    assert.ok(cutoff<editionDates[parent(e)].start);
    profiles[e.id]={id:e.id,edition:parent(e),earlier:row.earlier,cutoff,teams:row.teams,
      prior:PickFinalCard.prior(points,observations)};
  }
  save('profiles.json',profiles);
  console.log(stages.filter(s=>s.stage>=2).map(s=>[s.id,s.selected,...Object.values(s.results).map(v=>v.hits[0])].join(' ')).join('\n'));
}
if(!isMainThread) parentPort.postMessage(features(historical.find(s=>s.id===workerData)));
else main().catch(e=>{console.error(e);process.exitCode=1;});
