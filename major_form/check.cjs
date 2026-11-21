'use strict';
const assert = require('node:assert/strict');
const models = require('./events.json');
const later = require('./later.json');
const swiss = require('./evidence.json').editions;
const full = require('./all_stages.json').editions;
require('./model.js');

let trials = 0, eligible = 0;
for (const [id, model] of Object.entries({...models,...later})) {
  const teams = Object.entries(model.teams).map(([name,row])=>({name,roster:row.roster}));
  assert.equal(teams.length,16);
  const event={teams,asOf:model.asOf,majorForm:model};
  for (const row of Object.values(model.teams)) {
    assert.equal(row.byEdition.length,row.editions);
    assert.equal(row.series,row.byEdition.reduce((n,e)=>n+e.series,0));
    assert.ok(!row.repeat || row.agreeingEditions>=2);
    for (const e of row.byEdition) {
      assert.ok(e.end<model.asOf);
      assert.equal(Object.values(e.overlapCounts).reduce((a,b)=>a+b,0),e.series);
    }
  }
  for (let i=0;i<16;i++) for (let j=i+1;j<16;j++) {
    const p=.63;
    const old=PickMajorForm.apply(event,i,j,p);
    const test=PickMajorForm.apply(event,i,j,p,{shadow:true});
    const reverse=PickMajorForm.apply(event,j,i,1-p,{shadow:true});
    trials++;
    assert.ok(Math.abs(test.probability+reverse.probability-1)<1e-12);
    assert.ok(Number.isFinite(old.probability) && old.probability>0 && old.probability<1);
    assert.equal(test.probability,old.candidateProbability);
    if (!model.validation.passed) assert.equal(old.probability,p);
    if (test.active) eligible++;
    assert.ok(Math.abs(test.logitDelta)<=.8+1e-10);
  }
  const changed=teams.slice();
  changed[0]={...teams[0],roster:['new1','new2','new3','new4','new5']};
  assert.equal(PickMajorForm.apply({...event,teams:changed},0,1,.55,{shadow:true}).reason,'lineup');
  assert.equal(PickMajorForm.apply({...event,asOf:'2000-01-01'},0,1,.55,{shadow:true}).reason,'cutoff');
}
let all=0, activeSwiss=0;
for (const [id,ed] of Object.entries(full)) {
  const games = new Map(ed.matches.map(m=>[m.id,m]));
  assert.equal(games.size,ed.matches.length);
  assert.equal(ed.matches.filter(m=>m.stage==='playoffs').length,7);
  all+=games.size;
  for (const match of swiss[id].matches) {
    const f=games.get(match.id);
    assert.equal(f.bo,match.bo);
    const same=JSON.stringify(f.rosterA)===JSON.stringify(match.rosterA);
    assert.deepEqual(f.rosterB,same?match.rosterB:match.rosterA);
    assert.equal(match.y,same?f.y:1-f.y);
    activeSwiss++;
  }
}
assert.equal(all,464);assert.equal(activeSwiss,363);
assert.deepEqual(models.copenhagen.validation.byEdition,[]);
assert.ok(!models.singapore.teams['Eternal Fire'].series);
console.log('Verified 464 actual series, 363 pre-match expectations,',trials,'pair checks and',eligible,'eligible probes.');
