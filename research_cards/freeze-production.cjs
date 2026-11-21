'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {root, budget, productionSeed, matrixHash, stableHash} = require('../integrated_eval/runtime.cjs');
require('../dist/region-vrs.js');
require('../dist/methods.js');

const check = process.argv.includes('--check');
const date = '2026-11-21';
const filename = 'singapore-stage1-seed-conditional-' + date + '.json';
const target = path.join(root,'forecast_archive',filename);
const event = PickLab.events.find(e=>e.id==='singapore');
const oldFile = 'method_archive/singapore-stage1-methods-2026-11-21.json';
const previousBytes = fs.readFileSync(path.join(root,oldFile));
const previous = JSON.parse(previousBytes);
const flags = {...PickMethods.defaults('recommended',event), seedConditionalCard:true};
assert.ok(!event.hasResults && event.rounds.length===0 && event.date.slice(0,10)>date);
const result = PickLab.run(event.id,flags,budget,productionSeed);
const old = previous.methods.recommended;
assert.deepEqual(result.basePassCard,old.card);
assert.deepEqual(result.probabilities,old.probabilities);
assert.equal(matrixHash(result.matchups),old.matrixSha256);
assert.deepEqual(event.teams.map(t=>t.roster),previous.seeds.map(t=>t.roster));
assert.equal(result.cardPolicy,'seedConditionalCard');
const record = {
  stage:'pgl-singapore-2026-stage-1', sealedOn:date, startsOn:event.date.slice(0,10),
  pointsAsOf:event.asOf, startingFiveAsOf:event.rosterAsOf, flags, seed:productionSeed, locks:[],
  searchPaths:result.searchCount,evaluationPaths:result.evalCount,
  priorForecast:{file:oldFile,sha256:stableHash(previousBytes),method:'recommended'},
  matrixReference:old.matrixReference, matrixSha256:old.matrixSha256,
  categoryOrder:previous.categoryOrder, teams:previous.seeds,
  card:result.card, probabilities:result.probabilities, passProbability:result.passRate,
  expectedHits:result.expected, scoreDistribution:result.histogram,
  codeSha256:Object.fromEntries(['engine/engine.js','assembly/adapter.js'].map(f=>{
    const file=check?path.join('forecast_archive/runtime-seed-conditional',path.basename(f)):f;
    return [f,stableHash(fs.readFileSync(path.join(root,file)))];
  }))
};
if (check) assert.deepEqual(record,JSON.parse(fs.readFileSync(target)));
else {
  assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date()),date);
  fs.writeFileSync(target,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
}
console.log(filename,result.card,old.passProbability,result.passRate);
