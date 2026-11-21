'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {allocationInputs,eplSamples}=require('../../round_form/evaluate.cjs');
const {samples}=require('../../ml_allocation/draw.cjs');
const {grouping,fieldFor}=require('../../ml_allocation/evaluate.cjs');
const {seeds}=require('../../strategy_v4_eval/settings.cjs');
const {cardScore}=require('../../f1bre_models/score.cjs');
const {fit,pass,choose}=require('./weighted.cjs');
const previous=require('../../round_form/allocation.json');
const ids=previous.stages.map(s=>s.id);
const round=x=>Number(x.toFixed(8));
function run(id,n,testN,selected){
  const {target,external,matrices,actual}=allocationInputs(id);
  const reference=previous.stages.find(e=>e.id===id);
  const field=fieldFor(id),profile=grouping(field);
  assert.deepEqual(field.teams.map(t=>t.name),target.teams.map(t=>t.name));
  assert.deepEqual(profile.history,reference.history.map(e=>e.id));
  const prior=Array(16);
  profile.order.forEach((t,k)=>prior[t]=profile.prior[k]);
  const sample=(size,s)=>external?eplSamples(matrices.base,target.liveRatings,size,s):samples(target,matrices.base,size,s,'major');
  const rows=selected.map(seed=>{
    const train=sample(n,seed),audit=sample(testN,(seed^0xc5398da1)>>>0);
    const normal=CS.cardsFromSamples(train,true);
    const wanted=prior.map((v,i)=>v.map((a,k)=>(a+9*train.frequencies[i][k]/n)/(9+v.reduce((x,y)=>x+y,0))));
    const grouped=PickFinalCard.optimal(profile.order.map(t=>wanted[t]));
    const original=Array(16);
    profile.order.forEach((t,i)=>original[t]=grouped[i]);
    const {weights,marginals,effective,steps}=fit(train,wanted);
    const expected=PickFinalCard.optimal(marginals);
    const weighted=choose([normal.card,normal.basePassCard,original,expected],train.outcomes,weights);
    const choices={control:normal.card,rawPass:normal.basePassCard,grouped:original,expected,weighted};
    const methods=Object.fromEntries(Object.entries(choices).map(([k,card])=>[k,{card,...cardScore(card,actual),
      weightedTrainPass:round(pass(card,train.outcomes,weights)),auditPass:round(pass(card,audit.outcomes))}]));
    for(const v of Object.values(methods)) assert(methods.weighted.weightedTrainPass+1e-7>=v.weightedTrainPass);
    return {seed,effective:round(effective),steps,methods};
  });
  return {id,rows};
}
const pilot=ids.map(id=>run(id,2000,4000,seeds.slice(0,3)));
const passes=pilot.slice(0,3).filter(e=>e.rows[0].methods.weighted.hits>=5).length;
const gate=passes>=2 && pilot.slice(3).every(e=>e.rows[0].methods.control.hits<5||e.rows[0].methods.weighted.hits>=5);
const out={searchN:2000,auditN:4000,pilot,passGate:gate};
if(gate)out.confirmation=ids.map(id=>run(id,12000,12000,seeds));
const bytes=JSON.stringify(out)+'\n',file=path.join(__dirname,'results.json');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),bytes);else fs.writeFileSync(file,bytes);
console.log(pilot.map(e=>[e.id,...e.rows.map(r=>[r.methods.control.hits,r.methods.grouped.hits,r.methods.weighted.hits])]),gate);
