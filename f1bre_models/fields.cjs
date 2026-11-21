'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('../stage_transfer/evaluate.cjs');
const fields={};
const historicalIds=new Set(require('../final_card/report.json').stages.map(s=>s.id));
for(const e of PickLab.allEvents.filter(e=>historicalIds.has(e.id)||e.id==='singapore').sort((a,b)=>a.date.localeCompare(b.date))) {
  const start=e.date.slice(0,10);
  const teams=e.teams.map((t,i)=>({seed:i+1,name:t.name,roster:t.roster,points:t.points,vrsRoster:t.vrsRoster}));
  assert.equal(teams.length,16);assert(teams.every(t=>t.roster.length===5));
  fields[e.id]={id:e.id,label:e.label,stage:e.stage||1,start,cutoffExclusive:e.id==='singapore'?'2026-11-21':start,
    allBo3:!!e.allBo3,pointsAsOf:e.asOf,teams};
}
assert.equal(Object.keys(fields).length,14);
const out=JSON.stringify({fields},null,2)+'\n', file=path.join(__dirname,'major-fields.json');
if(process.argv.includes('--check')) assert.equal(fs.readFileSync(file,'utf8'),out);
else fs.writeFileSync(file,out);
