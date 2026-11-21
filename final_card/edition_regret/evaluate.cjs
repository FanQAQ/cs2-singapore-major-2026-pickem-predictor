'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {allocationInputs,eplSamples}=require('../../round_form/evaluate.cjs');
const {samples}=require('../../ml_allocation/draw.cjs');
const {grouping,fieldFor}=require('../../ml_allocation/evaluate.cjs');
const {seeds}=require('../../strategy_v4_eval/settings.cjs');
const {cardScore}=require('../../f1bre_models/score.cjs');
const stages=require('../../multi_stage/inputs.json');
const editions=require('../../major_form/all_stages.json').editions;
const refs=require('../../round_form/allocation.json').stages;
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const expected=(card,prob)=>sum(card.map((slot,i)=>slot<3?prob[i][slot]:0));

function priors(field){
  const profile=grouping(field);
  const dates=stages.filter(s=>profile.history.includes(s.id));
  assert(dates.every(s=>editions[s.parent].end<field.cutoff));
  const history=dates.map(s=>{
    const outcome=CS.replay(s.rounds);
    assert(outcome.ok && outcome.matched===33);
    return {edition:s.parent,points:s.teams.map(t=>t.points),actual:outcome.actual};
  });
  const removed=[null,...new Set(history.map(h=>h.edition))];
  const models=removed.map(edition=>PickFinalCard.prior(profile.points,history.filter(h=>h.edition!==edition)));
  assert.deepEqual(models[0],profile.prior);
  return {removed,models,order:profile.order,history:profile.history};
}

function pick(train,priors){
  const {order,models}=priors;
  const normal=CS.cardsFromSamples(train,true);
  const baseline=order.map(i=>normal.card[i]), pure=order.map(i=>normal.expectedCard[i]);
  const probabilities=models.map(model=>model.map((row,t)=>{
    const weight=9+sum(row);
    return row.map((v,c)=>(v+9*train.frequencies[order[t]][c]/train.count)/weight);
  }));
  const opts=probabilities.map(p=>PickFinalCard.optimal(p));
  const best=opts.map((card,s)=>expected(card,probabilities[s]));
  const candidates=[...opts,baseline,pure];
  let index=0,regret=Infinity,fullExpected=-Infinity;
  for(const [i,card] of candidates.entries()){
    const scores=probabilities.map(p=>expected(card,p));
    const worst=Math.max(...scores.map((s,j)=>best[j]-s));
    assert(worst>=-1e-9);
    if(worst<regret-1e-9 || (Math.abs(worst-regret)<=1e-9 && scores[0]>fullExpected+1e-9)){
      index=i;regret=worst;fullExpected=scores[0];
    }
  }
  const toField=card=>Array.from({length:16},(_,i)=>card[order.indexOf(i)]);
  return {control:normal.card,grouped:toField(opts[0]),candidate:toField(candidates[index]),worstRegret:Number(regret.toFixed(6))};
}
function evaluate(id,n,stream){
  const {target,external,matrices,actual}=allocationInputs(id),field=fieldFor(id);
  assert.deepEqual(field.teams.map(t=>t.name),target.teams.map(t=>t.name));
  const history=priors(field);
  const rows=stream.map(seed=>{
    const paths=external?eplSamples(matrices.base,target.liveRatings,n,seed):samples(target,matrices.base,n,seed,'major');
    const {worstRegret,...cards}=pick(paths,history);
    for(const card of Object.values(cards))assert.deepEqual([0,1,2,3].map(k=>card.filter(x=>x===k).length),[2,6,2,6]);
    return {seed,worstRegret,methods:Object.fromEntries(Object.entries(cards).map(([key,card])=>[key,{card,...cardScore(card,actual)}]))};
  });
  return {id,history:history.history,removed:history.removed,rows};
}
const run=(n,stream)=>refs.map(ref=>evaluate(ref.id,n,stream));
const pilot=run(2000,seeds.slice(0,3));
const passes=seeds.slice(0,3).map((_,i)=>pilot.slice(0,3).filter(s=>s.rows[i].methods.candidate.hits>=5).length);
const gate=passes[0]>=2 && passes.filter(x=>x>=2).length>=2 &&
  pilot.slice(3).every(s=>s.rows[0].methods.control.hits<5 || s.rows[0].methods.candidate.hits>=5);
const result={pilot,passes,gate};
if(gate)result.confirmation=run(12000,seeds);
const bytes=JSON.stringify(result)+'\n',file=path.join(__dirname,'results.json');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),bytes);else fs.writeFileSync(file,bytes);
console.log(JSON.stringify({scores:pilot.map(s=>[s.id,...s.rows.map(r=>Object.values(r.methods).map(m=>m.hits))]),passes,gate}));
