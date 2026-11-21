'use strict';
const assert=require('node:assert/strict');
const {getField,matrices}=require('../evaluate.cjs');
const {seeds}=require('../../strategy_v4_eval/settings.cjs');
const {samples}=require('../../ml_allocation/draw.cjs');
const {pass}=require('../../final_card/path_weights/weighted.cjs');
const {audit}=require('../format_split/pooled.cjs');
const astana=require('../format_split/astana/lock.cjs');
const {simulate}=require('./paths.cjs');
function fields(){
  const result={};
  for(const id of ['austin-2025-3','budapest-2025-3','cologne-2026-3']){
    const f=getField(id),{baseline,ml}=matrices(f,['baseline','ml']);
    result[id]={f,base:baseline,ml:ml.bo3};
  }
  const a=astana.inputs();
  result.astana={f:a.f,base:a.recommended,ml:a.candidate.bo3};
  const epl=require('../format_split/epl24/matrices.json').models;
  result.katowice={f:require('../format_split/epl24/field.json'),base:{bo1:epl.recommended,bo3:epl.recommended,allBo3:true},ml:epl.mapML};
  const pgl=require('../format_split/bucharest26/matrices.json').models;
  result.bucharest={f:require('../format_split/bucharest26/field.json'),base:pgl.recommended,ml:pgl.mapML.bo3};
  return result;
}
function select(standard,freq){
  const rank=i=>freq[i][0]/(freq[i][0]+freq[i][1] || 1);
  const team=standard.map((c,i)=>c<2?i:-1).filter(i=>i>=0).sort((a,b)=>rank(b)-rank(a)||a-b);
  assert.equal(team.length,8);
  return standard.map((c,i)=>c>=2?c:(team.slice(0,2).includes(i)?0:1));
}
function paired(input,n,seed){
  const {f,base,ml}=input,scheme=f.liveRatings?'esl':'major';
  const control=simulate(f,base,base.bo3,n,seed),candidate=simulate(f,base,ml,n,seed);
  assert.deepEqual(control.outcomes,samples(f,base,n,seed,scheme).outcomes);
  assert.deepEqual(candidate.pairs,control.pairs);
  return {control,candidate};
}
function lock(input,seed,n=2000,nTest=4000){
  const training=paired(input,n,seed),test=paired(input,nTest,audit(seed));
  const base=CS.cardsFromSamples(training.control,true).card;
  assert.deepEqual(base,select(base,training.control.frequencies));
  const changed=select(base,training.candidate.frequencies);
  function entry(card){
    return {card,auditPasses:Object.fromEntries(Object.entries(test).map(([k,t])=>[k,Math.round(pass(card,t.outcomes)*nTest)]))};
  }
  return {seed,n,nTest,control:entry(base),candidate:entry(changed)};
}
if(require.main===module){
  const result={};
  for(const [id,input] of Object.entries(fields())){
    const {base,ml,f}=input;
    result[id]={teams:f.teams.map(t=>t.name),probabilitiesSHA256:astana.digest({base,ml}),
      rows:seeds.slice(0,3).map(seed=>lock(input,seed))};
  }
  astana.freeze('cards.json',result,__dirname);
}
module.exports={fields,lock};
