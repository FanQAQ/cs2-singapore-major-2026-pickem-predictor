'use strict';
const assert=require('node:assert/strict');
require('./style.js');
require('../ui/style-report.js');
require('../dist/data.js');
const event=PICK_DATA.find(e=>e.id==='singapore');
const study=event.styleStudy,rows=PickStyleReport.evidenceRows(event);
const scenario=PickStyleReport.defaults(event);
assert.equal(rows.length,16);
assert.deepEqual(Object.keys(scenario.assignments).sort(),event.teams.map(t=>t.name).sort());
const methods={};
for(const [name,item] of rows){
  assert(item.date<=study.asOf && study.asOf<event.date.slice(0,10));
  assert(item.url.startsWith('https://'));
  assert(PickStyle.profiles.some(p=>p.id===item.profile && p.id!=='unknown'));
  assert.equal(scenario.assignments[name],item.profile);
  methods[item.source]=(methods[item.source]||0)+1;
}
assert.deepEqual(methods,{'整队资料':10,'进攻方录像':5,'近期记分板':1});
assert.equal(scenario.assignments.DENDELE,'assistHigh');
assert.equal(scenario.assignments['Chinggis Warriors'],'earlyContact');
assert.equal(Object.keys(scenario.edges).length,6);
for(const pair of PickStyle.pairs){
  assert.equal(scenario.edges[pair.key],0);
  const flags={style:true,scenario:{assignments:{A:pair.a,B:pair.b},edges:{[pair.key]:7}}};
  const field={teams:[{name:'A'},{name:'B'}]};
  assert(Math.abs(PickStyle.apply(.5,field,0,1,flags)-.57)<1e-12);
  assert(Math.abs(PickStyle.apply(.5,field,1,0,flags)-.43)<1e-12);
}
assert.deepEqual(PickStyleReport.defaults({teams:[],profileEvidence:{}}),{assignments:{},edges:{}});
const clone=JSON.parse(JSON.stringify(event));
const pair=clone.styleStudy.scoutsReport.pairs[0];
pair.evenMatchShiftPP=4.2;
pair.test.pair={brier:.01,logLoss:.02};
assert.equal(PickStyleReport.defaults(clone).edges['duel:system'],4);
for(const [i,team] of event.teams.entries()){
  const page=PickStyleReport.render(event,i,(i+1)%16,k=>event.teams[k].name);
  assert(page.includes(PickStyleReport.labels[scenario.assignments[team.name]]));
  assert(!page.includes('NaN') && !page.includes('undefined'));
}
console.log('16 staged profiles, 6 held-out comparisons, both team orders and source dates verified.');
