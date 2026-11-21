'use strict';
const assert=require('node:assert/strict');
const {getField,matrices,cardScore}=require('../evaluate.cjs');
const {fieldFor,roster}=require('../../stage_transfer/evaluate.cjs');
const {samples}=require('../../ml_allocation/draw.cjs');
const {seeds,productionSeed}=require('../../strategy_v4_eval/settings.cjs');
const {fields}=require('../sweep_decider/lock.cjs');
const {observed}=require('../sweep_decider/score.cjs');
const {freeze}=require('../format_split/astana/lock.cjs');
const official=require('../../major_form/all_stages.json').editions;
const rate=row=>row[0]/(row[0]+row[1] || 1);
const overlap=(a,b)=>a.filter(v=>b.includes(v)).length;
function donorHistory(){
  const history=[];
  for(const edition of Object.values(official)){
    const last=Math.max(...edition.matches.filter(m=>Number.isInteger(m.stage)).map(m=>m.stage));
    const e=PickLab.allEvents.find(e=>e.parent===edition.id && e.stage===last);
    const f=getField(e.id),audited=fieldFor(e),end=audited.records.map(m=>m.day).sort().at(-1);
    const p=matrices(f,['baseline']).baseline;
    assert.deepEqual(f.teams.map(t=>t.name),audited.teams.map(t=>t.name));
    const freq=samples(f,p,12000,productionSeed,'major').frequencies;
    for(const [i,c] of audited.actual.entries()){
      if(c>=2)continue;
      const fives=audited.records.filter(r=>r.a===i || r.b===i).map(r=>r.a===i?r.aFive:r.bFive);
      assert(fives.length>=3 && fives.length<=5);
      history.push({id:f.id,end,team:f.teams[i].name,fives,sweep:Number(c===0),p:rate(freq[i])});
    }
  }
  return history;
}
function matchHistory(history,f){
  return f.teams.map(t=>{
    const five=roster(t.roster);
    const earlier=history.filter(h=>h.end<f.start).map(h=>({h,shared:Math.min(...h.fives.map(x=>overlap(five,x)))}))
      .filter(r=>r.shared>=3).map(({h,shared})=>({stage:h.id,end:h.end,sourceTeam:h.team,shared,sweep:h.sweep,p:h.p}));
    assert.equal(new Set(earlier.map(h=>h.stage)).size,earlier.length);
    return earlier;
  });
}
function choose(original,q){
  const pool=original.map((c,i)=>c<2?i:-1).filter(i=>i>=0).sort((a,b)=>q[b]-q[a] || a-b);
  return original.map((c,i)=>c>=2?c:(pool[0]===i || pool[1]===i?0:1));
}
function prices(freq,history){
  const base=freq.map(rate);
  return {base,adjusted:base.map((p,i)=>{
    const rows=history[i],difference=rows.reduce((v,r)=>v+r.sweep-r.p,0);
    return Math.max(0,Math.min(1,p+difference/(8+rows.length)));
  })};
}
function experiment(history,f,base,seed,n){
  const sampled=samples(f,base,n,seed,f.liveRatings?'esl':'major');
  const original=CS.cardsFromSamples(sampled,true).card;
  const {base:q,adjusted}=prices(sampled.frequencies,history);
  assert.deepEqual(choose(original,q),original);
  return {seed,original,candidate:choose(original,adjusted),q,adjusted};
}
function summarize(entries,anchor=null){
  return entries[0].rows.map(({seed},i)=>{
    const totals={};
    for(const arm of ['original','candidate']){
      let passed=0,hits=0,sweeps=0,brier=0,qualified=0;
      for(const e of entries){
        const r=e.rows[i];assert.equal(seed,r.seed);
        const q=arm==='original'?r.q:r.adjusted.map((p,j)=>anchor && overlap(anchor,e.fives[j])>=3?r.q[j]:p);
        const card=choose(r.original,q);
        if(!anchor)assert.deepEqual(card,r[arm]);
        const s=cardScore(card,e.actual);
        passed+=Number(s.hits>=5);hits+=s.hits;sweeps+=s.slots[0];
        for(let j=0;j<16;j++)if(e.actual[j]<2){brier+=(q[j]-Number(e.actual[j]===0))**2;qualified++;}
      }
      assert.equal(qualified,8*entries.length);
      totals[arm]={passed,hits,sweeps,brier:brier/qualified};
    }
    return {seed,...totals};
  });
}
function evaluate(full=false){
  const history=donorHistory(),locked={};
  for(const [id,{f,base}] of Object.entries(fields())){
    const prior=matchHistory(history,f);
    const rows=(full?seeds:seeds.slice(0,3)).map(seed=>experiment(prior,f,base,seed,full?12000:2000));
    locked[id]={start:f.start,teams:f.teams.map(t=>t.name),fives:f.teams.map(t=>roster(t.roster)),prior,rows};
  }
  const prefix=full?'full-':'';
  freeze(prefix+'cards.json',locked,__dirname);
  const contexts=fields();
  const entries=Object.entries(locked).map(([id,data])=>({id,...data,actual:observed(id,contexts[id].f).actual}));
  const majors=entries.filter(e=>e.id.endsWith('-3')),others=entries.filter(e=>!e.id.endsWith('-3'));
  const summary=summarize(majors),external=summarize(others);
  const omitted={};
  for(const e of majors)for(const [i,t] of e.teams.entries()){
    if(!e.prior[i].length)continue;
    omitted[e.id+'/'+t]=summarize(majors,e.fives[i]).map(r=>r.candidate.passed-r.original.passed);
  }
  const decision=full?{reachedPrimaryTarget:summary[0].candidate.passed>=2}:
    {advance:summary.filter(r=>r.candidate.passed>r.original.passed && r.candidate.hits>=r.original.hits).length>=2};
  if(full){
    const archived=require('../report.json').fields;
    for(const e of majors){
      const prior=archived.find(h=>h.id===e.id).methods.baseline;
      assert.deepEqual(e.rows.map(r=>r.original),prior.runs.map(r=>r.card));
    }
  }
  const scores=Object.fromEntries(entries.map(e=>[e.id,e.rows.map(r=>[r.original,r.candidate].map(c=>cardScore(c,e.actual).hits))]));
  freeze(prefix+'report.json',{summary,external,omitted,scores,...decision},__dirname);
  console.log(JSON.stringify({summary:summary.slice(0,3),external:external.slice(0,3),...decision}));
}
if(require.main===module)evaluate(process.argv.includes('--full'));
