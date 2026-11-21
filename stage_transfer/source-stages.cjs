'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fieldFor,evidence,shifts,adjust,score,tally,pair}=require('./evaluate.cjs');
const editions=require('../major_form/all_stages.json').editions;
const previous=require('./details.json');
const groups=['targetOnly','addStage2','addStage3','earlierDonors'];
const fields=PickLab.allEvents.filter(e=>e.hasResults).map(fieldFor).sort((a,b)=>a.start.localeCompare(b.start));
const details=[];
let shanghaiCounterfactual;
for(const target of fields.filter(e=>e.stage===1)) {
  const previousRow=previous.stages.find(s=>s.compact.id===target.id);
  const past=fields.filter(s=>s.parent!==target.parent && editions[s.parent].end<target.start);
  assert.deepEqual(past.filter(s=>s.stage>1).map(s=>s.id),previousRow.donors);
  const sourceByStage=[1,2,3].map(k=>past.filter(s=>s.stage===k));
  const [core,second,third]=sourceByStage.map(s=>evidence(target.teams,s));
  const sets={targetOnly:[core],addStage2:[core,second],addStage3:[core,third],earlierDonors:[core,second,third]};
  const cache=new Map(), records={}, changes={};
  for(const key of groups){
    const delta=shifts(sets[key],target.teams.length);
    const signature=JSON.stringify(delta);
    if(!cache.has(signature)) cache.set(signature,score(target,delta));
    records[key]=cache.get(signature);
    changes[key]=records[key].fixedCard.flatMap((v,i)=>{
      const from=previousRow.records.targetOnly.fixedCard[i];
      return v===from?[]:[{team:target.teams[i].name,from,to:v,actual:target.actual[i],
        stage2Series:second[i].n,stage3Series:third[i].n}];
    });
  }
  for(const baseline of ['targetOnly','earlierDonors']) {
    assert.deepEqual(records[baseline].hits,previousRow.records[baseline].hits);
    assert.deepEqual(records[baseline].fixedCard,previousRow.records[baseline].fixedCard);
  }
  if(target.id==='shanghai') {
    const focal=target.teams.findIndex(t=>t.name==='FURIA');
    assert(focal>=0);
    const original=shifts([core],target.teams.length), augmented=shifts([core,second],target.teams.length);
    const partial={onlyFuria:original.map((d,i)=>i===focal?augmented[i]:d),
      allExceptFuria:augmented.map((d,i)=>i===focal?original[i]:d)};
    shanghaiCounterfactual=Object.fromEntries(Object.entries(partial).map(([name,delta])=>{
      const sim=CS.run(adjust(target.matrix,delta),previous.budget,previous.seeds[0],[],{seedConditionalCard:true});
      return [name,{card:sim.card,hits:CS.actualScore(sim.card,target.actual)}];
    }));
  }
  if(!sourceByStage[2].length) assert.deepEqual(records.addStage2.hits,records.earlierDonors.hits);
  details.push({id:target.id,start:target.start,sources:sourceByStage.map(s=>s.map(x=>x.id)),records,changes});
}
function summarize(rows){
  const tables=Object.fromEntries(groups.map(k=>[k,tally(rows,k)]));
  return {metrics:Object.fromEntries(groups.map(k=>[k,tables[k].out])),
    stage2Increment:pair(tables.addStage2,tables.targetOnly),
    stage3OnStage2:pair(tables.earlierDonors,tables.addStage2)};
}
const exposed=details.filter(r=>r.sources[2].length);
const report={seed:previous.seeds[0],seedCount:previous.seeds.length,budget:previous.budget,
  shanghaiCounterfactual,
  all:summarize(details),withEarlierThird:{events:exposed.map(r=>r.id),...summarize(exposed)},
  stages:details.map(({id,start,sources,records,changes})=>({id,start,sources,changes,
    fixedHits:Object.fromEntries(groups.map(k=>[k,records[k].hits[0]])),
    passesByRule:Object.fromEntries(groups.map(k=>[k,records[k].hits.filter(n=>n>=5).length]))}))};
const out=path.join(__dirname,'source-stages.json');
if(process.argv.includes('--check'))assert.deepEqual(report,JSON.parse(fs.readFileSync(out,'utf8')));
else fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({eligible:report.withEarlierThird.events,
  totals:Object.fromEntries(groups.map(k=>[k,[report.all.metrics[k].passes,report.all.metrics[k].hits]])),
  moreWithStage3:report.withEarlierThird.stage3OnStage2}));
