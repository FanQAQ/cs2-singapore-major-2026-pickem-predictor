'use strict';
const assert = require('node:assert/strict');
const {stages,seeds} = require('./report.json');
const summary = require('./summary.json');
const {trainingArchive} = require('./evaluate.cjs');
const archive = trainingArchive(require('./report.json').trainingSha256);
const near = (a,b,tol=1e-8) => assert(Math.abs(a-b)<tol,a+' vs '+b);
const sum = x=>x.reduce((a,b)=>a+b,0);
let pairs=0,cards=0;

// Numerically minimize the constrained penalized NLL without using the training derivative.
function fit(rows) {
  if(!rows.length)return 1;
  const objective = b=>rows.reduce((total,x)=>total+Math.max(0,-x*b)+Math.log1p(Math.exp(-Math.abs(x*b))),2*(b-1)**2);
  let lo=.05,hi=4;
  for(let i=0;i<45;i++){
    const first=(2*lo+hi)/3,second=(lo+2*hi)/3;
    if(objective(first)<objective(second))hi=second;else lo=first;
  }
  return (lo+hi)/2;
}
assert.deepEqual([1,2,3].map(n=>stages.filter(s=>!s.external&&s.stage===n).length),[5,5,3]);
for(const s of stages){
  const odds=new Map(s.probabilities.map(q=>[q.a+'/'+q.b,q]));
  const names=s.teams;
  assert.equal(odds.size,120);pairs+=odds.size;
  const vrs=archive.targets[s.id].indices.map(i=>{
    const r=archive.rows[i];
    return (r.y?1:-1)*Math.LN10*r.gap/400;
  });
  near(s.fits.vrs.b,fit(vrs),0.000002);
  if(!s.external){
    const sourceStages=stages.filter(f=>s.fits.recommended.stages.includes(f.id));
    const production=sourceStages.flatMap(f=>f.matches.filter(g=>g.bo===3).map(g=>{
      assert(g.day<s.start);
      const p=g.winProbability.recommended;
      return Math.log(p/(1-p));
    }));
    assert.equal(production.length,s.fits.recommended.n);
    near(s.fits.recommended.b,fit(production),0.000002);
  }
  assert.equal(s.verifiedMatchups,33);
  assert.equal(s.matches.length+s.administrativeExcluded.length,33);
  for(const [key,body] of Object.entries(s.methods)){
    assert.deepEqual(body.rows.map(r=>r.seed),seeds);
    const win={1:[],3:[]};
    for(const g of s.matches){
      const low=Math.min(g.w,g.l),hi=Math.max(g.w,g.l),pair=odds.get(names[low]+'/'+names[hi]);
      const p=g.bo===1?pair.bo1:pair.bo3[key];
      const q=g.w===low?p:1-p;
      near(q,g.winProbability[key]);win[g.bo].push(q);
    }
    for(const bo of [1,3]){
      const err=body.errors['bo'+bo],ws=win[bo];
      assert.equal(ws.length,err.n);
      if(ws.length){
        near(sum(ws.map(v=>(1-v)**2))/ws.length,err.brier);
        near(sum(ws.map(v=>-Math.log(v)))/ws.length,err.logLoss);
      }
    }
    for(const [i,r] of body.rows.entries()){
      for(const [c,cap] of [2,6,2,6].entries())assert.equal(r.card.filter(v=>v===c).length,cap);
      const hits=r.card.filter((v,j)=>v<3&&v===s.actual[j]).length;
      assert.equal(r.hits,hits);
      assert.equal(summary.byStage[s.id].methods[key].hitsBySeed[i],hits);
      cards++;
    }
  }
  for(const [key,bins] of Object.entries(s.upsetBins)){
    const bo3=s.matches.filter(g=>g.bo===3);
    assert.equal(sum(bins.map(t=>t.n)),bo3.length);
    assert.equal(sum(bins.map(t=>t.actual)),bo3.filter(g=>g.winProbability[key]<.5).length);
    const kept=bo3.filter(g=>g.winProbability[key]!==.5);
    for(const [column,m] of [['expected',key],['after',key+'Cal']]){
      near(sum(bins.map(t=>t[column])),sum(kept.map(g=>Math.min(g.winProbability[m],1-g.winProbability[m]))));
    }
  }
}
assert.equal(cards,1740);assert.equal(pairs,1920);
console.log('16 stages: 1,920 hypothetical pairs, 1,740 cards, 29 independent slope fits and all BO1/BO3 errors verified.');
