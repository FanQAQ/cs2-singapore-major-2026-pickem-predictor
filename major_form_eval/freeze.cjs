'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {root,strategies,budget,productionSeed,asJSON,stableHash,matrixHash,modelScripts} = require('../integrated_eval/runtime.cjs');
require(path.join(root,'dist','region-vrs.js'));
require(path.join(root,'dist','major-form.js'));
const report=require('./report.json');
const check=process.argv[2]==='--check';
assert.ok(process.argv.length===2 || check && process.argv.length===3);
const day='2026-11-21', target=path.join(root,'forecast_archive','singapore-stage1-major-form-'+day+'.json');
const event=PickLab.events.find(e=>e.id==='singapore');
assert.ok(!event.hasResults && !event.rounds.length && event.date.slice(0,10)>day);
assert.ok(event.rosterAsOf<=day && event.majorForm.asOf<=day);
const baseFlags={...strategies.base,regionVrs:true},flags={...baseFlags,majorForm:true};
const original=PickLab.run(event.id,baseFlags,budget,productionSeed);
const live=PickLab.run(event.id,flags,budget,productionSeed);
const reference = require('../forecast_archive/singapore-stage1-region-vrs-2026-11-21.json');
assert.equal(matrixHash(original.matchups),reference.correction.matrixSha256);
const metrics=report.singapore.candidate;
assert.equal(matrixHash(live.matchups),metrics.matrixSha256);
if(metrics.identicalProbabilities) {
  assert.ok(!fs.existsSync(target));
  assert.deepEqual(live.matchups,original.matchups);
  for (const key of ['card','tailRisk','probabilities','passRate','expected']) assert.deepEqual(live[key],original[key]);
  console.log('The Singapore Major-form preset exactly reproduces the existing regional ranking forecast; its archived record applies.');
} else {
  const categories=['3-0','3-1 / 3-2','0-3','other'];
  const teams=event.teams.map((t,i)=>({team:t.name,roster:t.roster,seed:i+1,baselineSlot:categories[original.card[i]],
    slot:categories[live.card[i]],probabilities:live.probabilities[i],p02:live.tailRisk[i].p02,pLossGiven02:live.tailRisk[i].pLossGiven02}));
  const implementationSha256=Object.fromEntries([...modelScripts,'region-vrs.js','major-form.js'].map(f=>
    [f,stableHash(fs.readFileSync(path.join(root,'dist',f)))]));
  const record={sealedOn:day,startsOn:event.date.slice(0,10),edition:event.label+' Stage 1',settings:flags,seed:productionSeed,
    simulationCount:budget,locks:[],asOf:event.asOf,signedFiveAsOf:event.rosterAsOf,majorForm:event.majorForm,
    baselineForecastSha256:stableHash(asJSON(reference)),matrixSha256:metrics.matrixSha256,implementationSha256,
    categoryOrder:categories,teams,seriesMatrices:live.matchups,passRate:live.passRate,expected:live.expected};
  const content=asJSON(record);
  if(check) assert.equal(fs.readFileSync(target,'utf8'),content);
  else {
    assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date()),day);
    fs.writeFileSync(target,content,{flag:'wx'});
  }
  console.log(path.basename(target),stableHash(content));
}
