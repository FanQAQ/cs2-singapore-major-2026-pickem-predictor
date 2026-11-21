'use strict';
const assert=require('node:assert/strict');
require('../engine/engine.js');
const sum=xs=>xs.reduce((a,b)=>a+b,0);
function errors(ps) {
  const average=fn=>ps.length?Number((sum(ps.map(fn))/ps.length).toFixed(9)):null;
  return {n:ps.length,brier:average(p=>(1-p)**2),logLoss:average(p=>-Math.log(p))};
}
function cardScore(card,actual) {
  assert.deepEqual([0,1,2,3].map(c=>card.filter(v=>v===c).length),[2,6,2,6]);
  if(!actual) return null;
  const slots=[0,1,2].map(c=>card.filter((v,i)=>v===c && actual[i]===c).length);
  const qualified=card.filter((v,i)=>v<2 && actual[i]<2).length;
  const hits=sum(slots);assert.equal(hits,CS.actualScore(card,actual));
  return {hits,slots,qualified,wrongTier:qualified-slots[0]-slots[1]};
}
module.exports={errors,cardScore};
