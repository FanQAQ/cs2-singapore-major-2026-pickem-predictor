/* Snapshot the two production defaults before the Singapore opening match. */
'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');
const root = path.resolve(__dirname,'..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const hashJSON = value => hash(JSON.stringify(value));
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const scripts = ['data','engine','format','style-model','rolling','boost','v4','map-model','close-model',
  'region-risk','region-vrs','major-form','pick-signal','lan-signal','robust-card','methods','adapter'];
const check = process.argv[2] === '--check';
const scriptFile = name => (check && ['engine','adapter'].includes(name) ? 'method_archive/runtime/' : 'dist/')+name+'.js';
for (const name of scripts) require(path.join(root,scriptFile(name)));
assert.ok(check ? process.argv.length===3 : process.argv.length===2);
const day = '2026-11-21';
const target = path.join(__dirname,'singapore-stage1-methods-'+day+'.json');
const event = PickLab.events.find(e=>e.id==='singapore');
assert.ok(event && !event.rounds.length && !event.hasResults);
assert.ok(event.date.slice(0,10)>day && event.asOf<=day && event.rosterAsOf<=day);
const categories = ['3-0','3-1 / 3-2','0-3','other'];
const samples=24000, seed=33719;
const referenceFiles = {
  recommended:'forecast_archive/singapore-stage1-region-vrs-2026-11-21.json',
  tree:'forecast_archive/singapore-stage1-model-comparison-2026-11-21.json'
};

function historicalForecast(method,file) {
  const data=JSON.parse(read(file));
  if (method==='recommended') {
    return {matrices:data.seriesMatrices,card:data.teams.map(t=>categories.indexOf(t.slot)),
      teams:data.teams.map(t=>t.name),probabilities:data.teams.map(t=>t.probabilities),
      pass:data.modelPassProbability,expected:data.modelExpectedHits};
  }
  const model=data.models.boost;
  const buckets=['3-0','3-1 or 3-2','0-3','1-3 or 2-3'];
  return {matrices:model.seriesMatrices,card:model.forecast.map(t=>t.card===null ? 3 : buckets.indexOf(t.card)),
    teams:model.forecast.map(t=>t.name),probabilities:model.forecast.map(t=>buckets.map(k=>t.probabilities[k])),
    pass:model.passProbability,expected:model.expectedCorrect};
}

function snapshot(method) {
  const flags=PickMethods.defaults(method,event);
  assert.equal(flags.family,method==='recommended'?'v4':'boost');
  const live=PickLab.run(event.id,flags,samples,seed);
  const file=referenceFiles[method], previous=historicalForecast(method,file);
  const names=event.teams.map(t=>t.name);
  assert.deepEqual(previous.teams,names);
  const sameMatrix=isDeepStrictEqual(live.matchups,previous.matrices);
  const result={flags,selection:event.methodSelection[method],matrixSha256:hashJSON(live.matchups),
    card:live.card,probabilities:live.probabilities,passProbability:live.passRate,expectedHits:live.expected,
    searchPaths:live.searchCount,evaluationPaths:live.evalCount};
  const backtest=event.featureRelease.singapore[method];
  assert.equal(result.selection,backtest.selected);
  assert.equal(result.matrixSha256,backtest.variants[result.selection].matrixSha256);
  if (sameMatrix) {
    result.matrixReference={file,sha256:hash(read(file)),field:method==='recommended'?'seriesMatrices':'models.boost.seriesMatrices'};
    assert.deepEqual(live.probabilities,previous.probabilities);
    if (isDeepStrictEqual(live.card,previous.card)) {
      assert.equal(live.passRate,previous.pass);
      assert.equal(live.expected,previous.expected);
    }
  } else result.seriesMatrices=live.matchups;
  return result;
}

const inputs=['teams','model','boostModel','v4Model','formatModel','formatWeight','vrsRegionStats',
  'regionVrsModel','lanSignal','pickSignal','methodSelection'];
for (const key of inputs) assert.ok(event[key],key+' is missing from the production forecast');
for (const profile of [event.lanSignal,event.pickSignal]) assert.ok(profile.asOf<=day && profile.asOf<event.date.slice(0,10));
const record={sealedOn:day,startsOn:event.date.slice(0,10),stage:event.id,inputCutoff:event.asOf,
  startingFiveAsOf:event.rosterAsOf,lanAsOf:event.lanSignal.asOf,ownMapAsOf:event.pickSignal.asOf,
  seed,simulationPaths:samples,locks:[],categoryOrder:categories,
  seeds:event.teams.map((t,i)=>({seed:i+1,team:t.name,roster:t.roster})),
  inputSha256:Object.fromEntries(inputs.map(k=>[k,hashJSON(event[k])])),
  implementationSha256:Object.fromEntries(scripts.filter(s=>s!=='data').map(s=>[s,hash(read(scriptFile(s)))])),
  methods:Object.fromEntries(['recommended','tree'].map(method=>[method,snapshot(method)]))};
const content=JSON.stringify(record,null,2)+'\n';
if(check) assert.equal(fs.readFileSync(target,'utf8'),content);
else {
  assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date()),day);
  fs.writeFileSync(target,content,{flag:'wx'});
}
console.log(path.basename(target),hash(content));
