'use strict';
const assert=require('node:assert/strict');
const study=require('./cards.json'),large=require('./convergence.json');
const rmr=require('./rmr_a/budgets.json'),cluj=require('./rmr_a/cluj.json');
const {cardScore}=require('../score.cjs');
const {seeds}=require('../../strategy_v4_eval/settings.cjs');
const reports=require('../report.json').fields;
const sum=a=>a.reduce((x,y)=>x+y,0);
function summarize(){
  const old=study.fields.filter(f=>f.stage===3),actualById=new Map(old.map(f=>[f.id,f.actual]));
  actualById.set(rmr.id,require('./rmr_a/scores.json').actual);
  actualById.set(cluj.id,reports.find(r=>r.id===cluj.id).actual);
  const groups=old.map(f=>({id:f.id,results:seeds.map((seed,i)=>{
    const v=large.results.find(v=>v.id===f.id&&v.index===i);
    assert.equal(v.seed,seed);assert.equal(v.originalHits,f.hybrid[i].hits);
    return {seed,small:f.hybrid[i],large:v};
  })})).concat(rmr,cluj);
  for(const g of groups){
    assert.deepEqual(g.results.map(v=>v.seed),seeds);
    for(const pair of g.results)for(const r of [pair.small,pair.large]){
      const truth=cardScore(r.card,actualById.get(g.id));
      assert.deepEqual(truth.slots,r.slots);assert.equal(truth.hits,r.hits);
    }
  }
  const rows=groups.map(g=>{
    const v=g.results[0],pass=k=>g.results.filter(r=>r[k].hits>=5).length;
    return {id:g.id,small:v.small.hits,large:v.large.hits,zero:v.large.slots[2],smallPass:pass('small'),largePass:pass('large')};
  });
  const passes=seeds.map((_,i)=>sum(groups.slice(0,3).map(g=>Number(g.results[i].large.hits>=5))));
  const directions=ref=>[1,0,-1].map(sign=>passes.filter((p,i)=>Math.sign(p-ref[i])===sign).length);
  return {rows,paired:directions(study.groups.stage3.hybrid.passes),vsSite:directions(study.groups.stage3.site.passes),
    achieved:passes.filter(p=>p>=2).length,passes:passes[0],hits:sum(rows.slice(0,3).map(r=>r.large)),
    bo1:require('./rmr_a/scores.json').metrics['1']};
}
module.exports=summarize;
if(require.main===module)console.log(JSON.stringify(summarize()));
