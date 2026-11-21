'use strict';
const assert = require('node:assert/strict');
const models = require('./events.json');
const snapshots = require('../region_vrs_data/events.json');
const anchors = require('../region_risk/anchor.json');
require('./model.js');
const apply = PickRegionVrs.apply;
let eligible = 0, fallback = 0;
for (const [id, model] of Object.entries(models)) {
  const event = {regionVrsModel:model,asOf:model.asOf,teams:Object.entries(anchors[id].teams)
    .map(([name,data])=>({name,roster:data.roster}))};
  const snapshot = snapshots[id];
  assert.equal(model.officialGlobal,snapshot.officialGlobal);
  assert.equal(model.asOf,snapshot.asOf);
  for (const [name,side] of Object.entries(model.teams)) {
    if (!side.region || !side.depth) continue;
    const rows = snapshot.regions[side.region].top11;
    const actual = new Set(side.roster.map(s=>s.normalize('NFKC').toLowerCase()));
    const ten = rows.filter(r=>r.roster.filter(p=>actual.has(p)).length < 3).slice(0,10);
    assert.equal(ten.length,10);
    assert.equal(side.depth,(ten[4].points+ten[5].points)/2,name);
  }
  for (let a=0;a<16;a++) for(let b=a+1;b<16;b++) for(const priorLan of [false,true]) {
    const prob=0.4, x=apply(event,a,b,prob,priorLan), y=apply(event,b,a,1-prob,priorLan);
    assert.equal(x.active,y.active);
    assert.equal(x.variant,priorLan?'withLan':'solo');
    assert.ok(Math.abs(x.probability+y.probability-1)<1e-12);
    assert.ok(Math.abs(x.logitDelta+y.logitDelta)<1e-12 && Math.abs(x.logitDelta)<=.375);
    if(!x.active) {
      assert.equal(x.probability,prob);
      fallback++;
    } else {
      assert.equal(x.reason,'active');
      assert.ok(x.left.region!==x.right.region && model.officialGlobal && model.variants[x.variant].validation.passed);
      assert.ok(Math.sign(x.probability-prob)===Math.sign(x.coefficient*x.depthDiff));
      eligible++;
    }
  }
  assert.equal(apply({...event,asOf:'1990-01-01'},0,1,.5).active,false);
  assert.equal(apply({...event,teams:event.teams.map(t=>({...t,roster:['a','b','c','d','e']}))},0,1,.5).active,false);
  const score = model.variants.solo.validation;
  assert.equal(Object.values(score.byRegion).reduce((sum,r)=>sum+r.n,0),2*score.n);
  assert.equal(Object.values(score.byRegion).reduce((sum,r)=>sum+r.wins,0),score.n);
}
assert.ok(eligible>0 && fallback>0);
console.log(eligible+' active and '+fallback+' fallback comparisons; leave-team-out depth, symmetry, roster and date guards verified.');
