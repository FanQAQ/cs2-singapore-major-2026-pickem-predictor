'use strict';
const assert=require('node:assert/strict');
const {fieldFor}=require('../stage_transfer/evaluate.cjs');
const events=PickLab.allEvents.filter(e=>e.hasResults && e.parent!=='singapore' && e.id!=='singapore');
const fixtures=[];
for(const e of events){
  const f=fieldFor(e),losses=Array(16).fill(0),seen=new Set();
  assert.equal(CS.replay(e.rounds).matched,33);
  for(const round of e.rounds)for(const [w,l] of round){
    const [g,...extra]=f.records.filter(g=>(g.y?g.a:g.b)===w && (g.y?g.b:g.a)===l);
    assert(g && !extra.length && !seen.has(g.id));seen.add(g.id);
    if(g.bo===3)fixtures.push({edition:f.parent,stage:f.stage,start:f.start,day:g.day,id:g.id.split(':')[1],
      sides:[g.a,g.b].map((t,i)=>({won:t===w,pressure:losses[t]===2,actual:i===0?g.aFive:g.bFive,
        registered:f.teams[t].roster}))});
    losses[l]++;
  }
}
assert.equal(fixtures.length,189);
process.stdout.write(JSON.stringify(fixtures));
