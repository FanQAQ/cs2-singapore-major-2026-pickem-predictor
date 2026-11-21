'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {root,strategies,budget,productionSeed,asJSON,stableHash,matrixHash,modelScripts} = require('../integrated_eval/runtime.cjs');
require(path.join(root,'dist/region-vrs.js'));
const report = require('./report.json');
const check = process.argv[2]==='--check';
assert.ok(process.argv.length===2 || check && process.argv.length===3);
const sealedOn = '2026-11-21', filename='singapore-stage1-region-vrs-'+sealedOn+'.json';
const target = path.join(root,'forecast_archive',filename);
const currentSite=PickLab;
const runtimePath=name=>path.join(root,check && name==='adapter.js' ? 'forecast_archive/runtime-region-vrs' :
  check && name==='map-model.js' ? 'forecast_archive/runtime-map' :
  check && name==='engine.js' ? 'method_archive/runtime' : 'dist',name);
if(check) { require(runtimePath('engine.js')); require(runtimePath('adapter.js')); }
const event = PickLab.events.find(e=>e.id==='singapore');
assert.ok(!event.hasResults && !event.rounds.length);
const date = event.date.slice(0,10);
assert.ok(event.asOf<=sealedOn && event.rosterAsOf<=sealedOn && sealedOn<date);
const flags = {...strategies.base,regionVrs:true};
const base = PickLab.run(event.id,strategies.base,budget,productionSeed);
const candidate = PickLab.run(event.id,flags,budget,productionSeed);
if(check) {
  const live=currentSite.run(event.id,flags,budget,productionSeed);
  for(const key of ['matchups','probabilities','card','expectedCard','tailRisk','passRate','expected'])
    assert.deepEqual(live[key],candidate[key],key+' changed for the existing regional VRS preset');
}
const metrics = report.singapore.baseVrs;
assert.equal(matrixHash(base.matchups),metrics.baseMatrixSha256);
assert.equal(matrixHash(candidate.matchups),metrics.matrixSha256);
if (metrics.identicalProbabilities) {
  assert.deepEqual(candidate.probabilities,base.probabilities);
  assert.deepEqual(candidate.card,base.card);
  assert.ok(!fs.existsSync(target),'Unchanged candidate must match the earlier baseline.');
  console.log('Singapore ranking strategy exactly reproduces the frozen original baseline; no duplicate file.');
} else {
  const values = ['3-0','3-1 / 3-2','0-3','other'];
  const state = event.teams.map((team,i)=>({name:team.name,seed:i+1,points:team.points,roster:team.roster,
    region:event.regionRisk.teams[team.name].region,slot:values[candidate.card[i]],probabilities:candidate.probabilities[i],
    baseSlot:values[base.card[i]],p02:candidate.tailRisk[i].p02,pLossGiven02:candidate.tailRisk[i].pLossGiven02}));
  const implementationSha256 = Object.fromEntries([...modelScripts,'region-vrs.js'].map(name=>
    [name,stableHash(fs.readFileSync(runtimePath(name)))]));
  const inputHashes = {};
  for (const name of ['teams','formatModel','formatWeight','v4Model','vrsRegionStats','regionVrsModel','regionRisk'])
    inputHashes[name]=stableHash(JSON.stringify(event[name]));
  const forecast = {edition:event.label+' Stage 1',sealedOn,startsOn:date,dataAsOf:event.asOf,signedFiveAsOf:event.rosterAsOf,
    strategy:'近期表现＋赛区排名实力',settings:flags,seed:productionSeed,locks:[],simulationCount:budget,
    categoryOrder:values,modelPassProbability:candidate.passRate,modelExpectedHits:candidate.expected,
    correction:metrics,regionalModel:event.regionVrsModel,rankingStats:event.vrsRegionStats,inputHashes,implementationSha256,
    teams:state,seriesMatrices:candidate.matchups};
  const content = asJSON(forecast);
  if (check) assert.equal(fs.readFileSync(target,'utf8'),content);
  else {
    assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date()),sealedOn);
    fs.writeFileSync(target,content,{flag:'wx'});
  }
  console.log(filename,stableHash(content));
}
