'use strict';
const assert=require('node:assert/strict');
const {samples}=require('../../../ml_allocation/draw.cjs');
const {seeds}=require('../../../strategy_v4_eval/settings.cjs');
const {pass}=require('../../../final_card/path_weights/weighted.cjs');
const {cardScore}=require('../../score.cjs');
const {read,freeze}=require('../astana/lock.cjs');
const {audit}=require('../pooled.cjs');
const field=read('field.json',__dirname),snapshot=read('matrices.json',__dirname);
const locked=read('cards.json',__dirname),{actual}=read('report.json',__dirname);

function alternatives(card,kind){
  const selected=kind==='sweep'?0:2, other=kind==='sweep'?1:3;
  const group=card.map((cat,i)=>cat===selected || cat===other?i:-1).filter(i=>i>=0);
  assert.equal(group.length,8);
  const rows=[];
  for(const [j,a] of group.entries())for(const b of group.slice(j+1)){
    const next=card.slice();
    for(const team of group)next[team]=team===a||team===b?selected:other;
    rows.push({pair:[a,b],card:next,original:next.every((c,i)=>card[i]===c)});
  }
  assert.equal(rows.length,28);
  return rows;
}
function examine(train,test,card,kind){
  const possibilities=alternatives(card,kind);
  for(const row of possibilities){
    row.estimated=pass(row.card,train.outcomes);
    row.independent=pass(row.card,test.outcomes);
  }
  // An exact tie keeps the original if present, then follows the public seed order.
  possibilities.sort((a,b)=>b.estimated-a.estimated || Number(b.original)-Number(a.original));
  const best=possibilities[0];
  const original=possibilities.find(r=>r.original);
  const hits=r=>cardScore(r.card,actual).hits;
  return {originalPair:original.pair,selectedPair:best.pair,trainGain:best.estimated-original.estimated,
    independentGain:best.independent-original.independent,selectedHits:hits(best),originalHits:hits(original),
    ceiling:Math.max(...possibilities.map(hits))};
}
const results={};
for(const [name,m] of Object.entries(snapshot.models)){
  results[name]=seeds.slice(0,3).map((seed,i)=>{
    const take=s=>samples(field,m,12000,s,'major');
    const train=take(seed),test=take(audit(seed)),original=locked.cards[name][i];
    assert.deepEqual(original.card,CS.cardsFromSamples(train,true).card);
    return {seed,sweep:examine(train,test,original.card,'sweep'),zero:examine(train,test,original.card,'zero'),
      zeroOdds:snapshot.teams.map((team,t)=>({team,p:test.frequencies[t][2]/test.count})).sort((a,b)=>b.p-a.p)};
  });
}
freeze('positions.json',results,__dirname);
for(const [k,rows] of Object.entries(results))console.log(k,...rows.map(r=>[r.sweep.selectedHits,r.sweep.ceiling,r.zero.selectedHits,r.zero.ceiling]));
