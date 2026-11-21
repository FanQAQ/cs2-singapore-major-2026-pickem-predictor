/* Seal Singapore's new card from its pre-Major inputs; verification is always read-only. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {root,modules,v4,budget,productionSeed} = require('./settings.cjs');
const date = '2026-11-21';
const file = path.join(root,'forecast_archive','singapore-stage1-v4-'+date+'.json');
const args = process.argv.slice(2);
assert.ok(!args.length || args.length===1 && args[0]==='--check');
const check = args[0]==='--check';
if (!check) {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
  assert.equal(today,date,'Can only seal the archive on its forecast date');
  assert.ok(!fs.existsSync(file),'Forecast already sealed; use --check.');
}
const live = PickLab;
const oldAdapter = path.join(root,'forecast_archive/runtime-v4/adapter.js');
const oldEngine = path.join(root,'forecast_archive/runtime-map/engine.js');
const moduleFile = name => check && name==='engine' ? oldEngine :
  check && name==='adapter' ? oldAdapter : path.join(root,'dist',name+'.js');
if (check) {
  require(oldEngine);
  require(oldAdapter);
}
const event = PickLab.events.find(e=>e.id==='singapore');
assert.ok(event.v4Model && event.teams.length===16 && !event.hasResults && !event.rounds.length);
assert.equal(event.asOf,event.v4Model.asOf);
assert.ok(event.v4Model.firstMatch<=event.v4Model.lastMatch && event.v4Model.lastMatch<=event.asOf);
assert.ok(event.v4Model.lastRoundMatch && event.v4Model.lastRoundMatch<=event.asOf);
assert.ok(event.asOf<=date && event.rosterAsOf<=date && date<event.date.slice(0,10));
const teams = event.teams.map(t=>({name:t.name,roster:t.roster,points:t.points}));
const matrices = PickLab.seriesMatrices(event,v4);
const evaluation = CS.run(matrices,budget,productionSeed);
const categories = ['3-0','3-1 / 3-2','0-3','1-3 / 2-3'];
const label = c=>c===3 ? null : categories[c];
const teamsForecast = teams.map((t,i)=>({...t,seed:i+1,
  probabilities:Object.fromEntries(categories.map((k,j)=>[k,evaluation.probs[i][j]])),
  thresholdCard:label(evaluation.card[i]),expectedHitsCard:label(evaluation.expectedCard[i])}));
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
const settings={...v4,seedPrior:false,fresh:false,rolling:false,experience:false,h2h:false,style:false};
assert.deepEqual(PickLab.seriesMatrices(event,settings),matrices);
const inputs={teams,v4Model:event.v4Model,formatModel:event.formatModel,formatWeight:event.formatWeight};
const hashes = Object.fromEntries(Object.entries(inputs).map(([name,data])=>[name,sha(JSON.stringify(data))]));
const implementation = Object.fromEntries(modules.filter(n=>n!=='data').map(n=>[n+'.js',sha(fs.readFileSync(moduleFile(n)))]));
const snapshot={model:'calibrated opponent form and adjusted round margin',edition:'Singapore Major 2026 Stage 1',
  sealedOn:date,startsOn:event.date.slice(0,10),cutoffs:{trainingAndVrs:event.asOf,trainingFirstMatch:event.v4Model.firstMatch,trainingLastMatch:event.v4Model.lastMatch,lastVerifiedRoundSeries:event.v4Model.lastRoundMatch,announcedStartingFive:event.rosterAsOf},
  seed:productionSeed,simulations:budget,searchPaths:evaluation.searchN,independentEvaluationPaths:evaluation.evalN,
  settings,locks:[],objective:'probability of at least five correct slots',
  inputHashes:hashes,implementationHashes:implementation,seriesMatrices:matrices,teams:teamsForecast,
  passProbability:evaluation.pass,expectedHits:evaluation.expected};
const output=JSON.stringify(snapshot,null,2)+'\n';
if (check) {
  assert.equal(fs.readFileSync(file,'utf8'),output,'Published forecast inputs, code or result differs.');
  assert.deepEqual(live.seriesMatrices(event,settings),matrices,'Live base model differs from sealed V4.');
}
else fs.writeFileSync(file,output,{flag:'wx'});
console.log(path.basename(file),sha(output));
