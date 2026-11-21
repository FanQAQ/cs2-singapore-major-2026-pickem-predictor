'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
for(const script of ['stage-inputs','methods','map-model','close-model','region-risk','region-vrs','major-form','lan-signal','pick-signal'])
  require('../dist/'+script+'.js');
require('../final_card/rules.js');
const inputs=require('../multi_stage/inputs.json');
const guides={...require('./early-editors.json'),...require('./editors.json')};
const fields=PickStageInputs.events(PickLab.events,inputs.filter(f=>guides[f.id])).sort((a,b)=>a.date.localeCompare(b.date));
const old=require('../multi_stage_train/report.json');
const round=x=>Number(x.toFixed(8));
function weight(prior) {
  let cross=0, squares=0;
  for(const {p,label,actual} of prior) for(let c=0;c<4;c++){
    const difference=Number(label===c)-p[c];
    cross+=difference*(Number(actual===c)-p[c]);
    squares+=difference*difference;
  }
  return Math.max(0,Math.min(1,cross/(1+squares)));
}
const prior=[], rows=[];
for(const event of fields) {
  const guide=guides[event.id];
  assert.ok(guide.published<event.date);
  assert.ok(prior.every(r=>r.endDate<event.date && r.parent!==event.parent));
  const labels=Array(16).fill(null);
  for(const [c,names] of [guide.sweep,guide.advance,guide.winless].entries()) for(const name of names) {
    const i=event.teams.findIndex(t=>t.name===name);
    assert.ok(i>=0 && labels[i]===null);
    labels[i]=c;
  }
  const matrix=PickLab.seriesMatrices(event,{...PickStageInputs.localFlags(event,PickMethods.defaults('recommended',event)).flags,stageTraining:false});
  const replay=CS.replay(event.rounds);
  assert.ok(replay.ok && replay.matched===33);
  const actual=replay.actual;
  const w=weight(prior);
  const evidence=[];
  const scores={};
  const cards={};
  const bucketHits={};
  for(const [si,seed] of seeds.entries()) {
    const sim=CS.run(matrix,budget,seed,[],{seedConditionalCard:true});
    const marginal=sim.searchCounts.map(row=>row.map(n=>n/sim.searchN));
    const mixed=sim.searchCounts.map((row,i)=>labels[i]===null ? row :
      row.map((n,c)=>(1-w)*n+w*sim.searchN*Number(c===labels[i])));
    assert.deepEqual(PickFinalCard.optimal(sim.searchCounts),sim.expectedCard);
    const variants={baseline:sim.card,dp:sim.expectedCard,editorial:PickFinalCard.optimal(mixed)};
    for(const [method,card] of Object.entries(variants)) {
      (scores[method]??=[]).push(CS.actualScore(card,actual));
      if(si===0) {
        cards[method]=card;
        bucketHits[method]=[0,1,2].map(c=>card.filter((v,i)=>v===c && actual[i]===c).length);
      }
    }
    if(!si) for(const [i,label] of labels.entries()) if(label!==null) evidence.push({
      parent:event.parent,endDate:event.endDate,p:marginal[i],label,actual:actual[i]
    });
  }
  const baseline=old.stages.find(s=>s.id===event.id).methods.recommended.base.hitsBySeed;
  assert.deepEqual(scores.baseline,baseline);
  const authorHits=labels.filter((label,i)=>label!==null && label===actual[i]).length;
  rows.push({id:event.id,stage:event.stage,w:round(w),trainedOn:[...new Set(prior.map(r=>r.parent))],trainingSlots:prior.length,
    statedSlots:evidence.length,authorHits,scores,cards,bucketHits});
  prior.push(...evidence);
}
const official=rows.filter(s=>s.stage===3), results={};
for(const method of ['baseline','dp','editorial']){
  const passes=seeds.map((_,i)=>official.filter(s=>s.scores[method][i]>=5).length);
  const hits=seeds.map((_,i)=>official.reduce((sum,s)=>sum+s.scores[method][i],0));
  const mean=a=>round(a.reduce((s,n)=>s+n,0)/a.length);
  const paired={};
  for(const base of ['dp','baseline']) {
    const diff=passes.map((v,i)=>Math.sign(v-official.filter(s=>s.scores[base][i]>=5).length));
    paired[base]=[1,0,-1].map(k=>diff.filter(n=>n===k).length);
  }
  results[method]={passes:passes[0],hits:hits[0],meanPass:mean(passes),meanHits:mean(hits),pairedPass:paired};
}
const output={budget,seeds,rows,official:results,nextWeight:round(weight(prior)),nextTrainingSlots:prior.length};
if(process.argv.includes('--check')) assert.deepEqual(output,require('./category-report.json'));
else fs.writeFileSync(path.join(__dirname,'category-report.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({results,rows:rows.map(({id,w,trainingSlots,scores})=>[id,w,trainingSlots,...Object.values(scores).map(ss=>ss[0])]),nextWeight:output.nextWeight}));
