'use strict';
const assert = require('node:assert/strict');
const swiss = require('../epl_transfer/swiss.cjs');
const slots = Array.from({length:16},(_,i)=>i);
const pop = new Uint8Array(65536);
for(let i=1;i<pop.length;i++)pop[i]=pop[i>>>1]+(i&1);

function initial(target) {
  assert.equal(target.ratingMargin,'full');
  assert.equal(target.liveRatings.length,16);
  return {wins:new Uint8Array(16),losses:new Uint8Array(16),met:new Uint16Array(16),ratings:target.liveRatings.slice()};
}

function draw(target,matrix,count,seed) {
  const random=CS.rng(seed),outcomes=new Uint16Array(3*count);
  const frequencies=slots.map(()=>[0,0,0,0]);
  for(let trial=0;trial<count;trial++){
    const state=initial(target);
    for(let r=0;r<5;r++)for(const [a,b] of swiss.pairs(state,r)){
      const won=random()<matrix.bo3[a][b];
      // S21 used the same full update after every series irrespective of map score.
      swiss.result(state,won?a:b,won?b:a,0);
    }
    for(const i of slots){
      const c=swiss.category(state,i);
      frequencies[i][c]++;
      if(c<3)outcomes[3*trial+c]|=1<<i;
    }
  }
  return {count,outcomes,frequencies};
}

function forecast(field,matrix,seed,count) {
  const training=draw(field,matrix,count,seed);
  const {card}=CS.cardsFromSamples(training,true);
  const audit=draw(field,matrix,count,(seed^0xc5398da1)>>>0),masks=[0,0,0];
  for(const i of slots) if(card[i]<3)masks[card[i]]|=1<<i;
  let passed=0;
  for(let j=0;j<audit.outcomes.length;j+=3){
    const n=pop[audit.outcomes[j]&masks[0]]+pop[audit.outcomes[j+1]&masks[1]]+pop[audit.outcomes[j+2]&masks[2]];
    if(n>=5)passed++;
  }
  return {seed,card,auditPass:passed/count};
}

function replay(target,truth) {
  const s=initial(target),matches=[];
  assert.equal(truth.administrativeMatchIds.length,0);
  const index=(a,b)=>Math.min(a,b)*16+Math.max(a,b);
  for(let r=0;r<5;r++){
    const actual=truth.rounds[r];
    assert.deepEqual(swiss.pairs(s,r).map(p=>index(...p)).sort((a,b)=>a-b),
      actual.map(p=>index(...p)).sort((a,b)=>a-b),'S21 round '+(r+1));
    for(const [i,[w,l,mapsLost]] of actual.entries()){
      assert([0,1].includes(mapsLost));
      swiss.result(s,w,l,0);
      matches.push({w,l,bo:3,id:truth.matchIds[r][i]});
    }
  }
  assert.equal(matches.length,33);
  return {actual:slots.map(i=>swiss.category(s,i)),matches,verifiedCount:matches.length,excluded:[]};
}
module.exports={draw,forecast,replay};
