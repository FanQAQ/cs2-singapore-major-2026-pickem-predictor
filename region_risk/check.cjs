'use strict';
const assert=require('node:assert/strict');
const data=require('./events.json');
require('./model.js');
let active=0, fallback=0;
for(const [stage,field] of Object.entries(data)) {
  const teams=Object.entries(field.teams).map(([name,t])=>({name,roster:t.roster}));
  const event={teams,asOf:field.asOf,regionRisk:field};
  assert.equal(teams.length,16);
  for(let i=0;i<16;i++){
    for(let j=i+1;j<16;j++){
      const p=.1+.8*((i*16+j)%19)/19;
      const a=PickRegion.apply(event,i,j,p),b=PickRegion.apply(event,j,i,1-p);
      assert.ok(Math.abs(a.probability+b.probability-1)<1e-12);
      assert.equal(a.reason,b.reason);
      if(a.active){
        active++;
        assert.ok(a.left.region!==a.right.region && field.validation.passed && a.pairN>=10);
        assert.ok(a.range[0]<=a.probability && a.probability<=a.range[1]);
        assert.ok(Math.abs(a.range[0] + b.range[1] - 1)<1e-12);
      } else {
        fallback++;assert.equal(a.probability,p);
      }
      const earlier={...event,asOf:'2023-01-01'};
      assert.equal(PickRegion.apply(earlier,i,j,p).probability,p);
    }
  }
  const bad={...event,teams:teams.map((t,i)=>i ? t : {...t,roster:['new1','new2','new3','new4','new5']})};
  assert.equal(PickRegion.apply(bad,0,1,.5).reason,'unknown-region');
  assert.equal(PickRegion.stateFor(bad),null);
  const state=PickRegion.stateFor(event);
  assert.equal(!!state,field.sharedState.passed);
  if(state) assert.equal(state.scales.length,16);
  assert.equal(!!PickRegion.stateFor({...event,asOf:'2026-11-21'}),field.sharedState.passed);
}
assert.ok(active && fallback);
console.log(active+' active and '+fallback+' fallback pairs; order, uncertainty, cutoff, roster and state checks passed.');
