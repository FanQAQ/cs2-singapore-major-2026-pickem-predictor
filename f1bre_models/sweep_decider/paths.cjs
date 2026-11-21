'use strict';
const assert=require('node:assert/strict');
const swiss=require('../../epl_transfer/swiss.cjs');
const {scoreThresholds}=require('../../stage1_holdout/evaluate.cjs');

// Record the two ordered deciders for every path, including on ESL's live-rating draw.
function simulate(field,base,decider,n,seed){
  assert(!base.state);
  const esl=!!field.liveRatings,random=CS.rng(seed);
  const table=p=>p.map(row=>row.map(scoreThresholds));
  const normal=esl?table(base.bo3):null,changed=esl?table(decider):null;
  const frequencies=Array.from({length:16},()=>[0,0,0,0]),outcomes=new Uint16Array(n*3);
  const pairs=new Uint8Array(n*2);
  let offset=0;
  for(let k=0;k<n;k++){
    const wins=new Uint8Array(16),losses=new Uint8Array(16),rounds=[];
    const state=esl?{wins,losses,met:new Uint16Array(16),ratings:field.liveRatings.slice()}:null;
    for(let r=0;r<5;r++){
      const matches=esl?swiss.pairs(state,r):CS.nextPairs(rounds);
      const round=[];
      for(const [a,b] of matches){
        const special=r===2 && wins[a]===2;
        if(special){assert.equal(wins[b],2);pairs[offset++]=16*a+b;}
        const x=random();
        if(esl){
          const [sweep,p,reverse]=(special?changed:normal)[a][b];
          if(x<p)swiss.result(state,a,b,Number(x>=sweep));
          else swiss.result(state,b,a,Number(x>=reverse));
        }else{
          const matrix=special?decider:(base.allBo3 || CS.bestOf(wins[a],losses[a])===3?base.bo3:base.bo1);
          const [w,l]=x<matrix[a][b]?[a,b]:[b,a];
          wins[w]++;losses[l]++;round.push([w,l]);
        }
      }
      if(!esl)rounds.push(round);
    }
    for(let i=0;i<16;i++){
      const c=wins[i]===3?(losses[i]===0?0:1):(wins[i]===0?2:3);
      frequencies[i][c]++;
      if(c<3)outcomes[k*3+c]|=1<<i;
    }
  }
  assert.equal(offset,n*2);
  return {outcomes,frequencies,pairs,count:n};
}
module.exports={simulate};
