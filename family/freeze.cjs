/* Seal a prospective comparison only on the forecast date. Never replace the file. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname,'..');
const sealedOn = '2026-11-21';
const archive = path.join(root, 'forecast_archive', 'singapore-stage1-model-comparison-'+sealedOn+'.json');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--check'), 'Use --check to verify an existing archive.');
const verify = args[0] === '--check';
if (!verify) {
  assert.ok(!fs.existsSync(archive),'Forecast already exists. Use --check.');
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
  assert.equal(today,sealedOn,'Generate this prospective snapshot only on its actual forecast date.');
}
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const modules = ['engine','format','rolling','style-model','boost','data','adapter'];
const archivedRuntime = new Set(['engine','adapter']);
function modulePath(name) {
  const directory = verify && archivedRuntime.has(name) ? 'forecast_archive/runtime' : 'dist';
  return path.join(root,directory,name+'.js');
}
for(const name of modules) require(modulePath(name));
const event = PickLab.events.find(e=>e.id==='singapore');
assert.ok(event?.boostModel && !event.rounds.length && !event.hasResults);
assert.ok(event.asOf<=sealedOn && event.rosterAsOf<=sealedOn && sealedOn<event.date.slice(0,10));
const teams = event.teams.map(t=>({name:t.name,roster:t.roster.slice(),points:t.points,
                                  form:t.form,strong:t.strong,weak:t.weak}));
const inputs = {teams, fittedLogistic:event.model, fittedBoost:event.boostModel,
                formatModel:event.formatModel, formatWeight:event.formatWeight};
const inputHashes = Object.fromEntries(Object.entries(inputs).map(([name,value])=>[name,sha(JSON.stringify(value))]));
const implementationHashes = Object.fromEntries(modules.filter(n=>n!=='data').map(n=>
  [n+'.js',sha(fs.readFileSync(modulePath(n)))]));
const simulations=24000, randomSeed=33719;
const flags = {family:'logit', format:true, shrinkBO:true, form:false, strong:false, weak:false,
               seedPrior:false, rolling:false, experience:false, fresh:false, h2h:false, style:false};
const buckets=['3-0','3-1 or 3-2','0-3','1-3 or 2-3'];
const models = {};
function runForecast(cfg, lab, engine) {
  const odds=lab.seriesMatrices(event,cfg);
  const sim=engine.run(odds,simulations,randomSeed,[]);
  const forecast=teams.map((t,i)=>({seed:i+1,name:t.name,
    card:sim.card[i]===3 ? null : buckets[sim.card[i]],
    probabilities:Object.fromEntries(buckets.map((b,k)=>[b,sim.probs[i][k]]))}));
  return {featureSettings:cfg,forecast,passProbability:sim.pass,expectedCorrect:sim.expected,seriesMatrices:odds};
}
for (const cfg of [flags,{...flags,family:'boost',form:true,strong:true,weak:true}])
  models[cfg.family]=runForecast(cfg, PickLab, CS);
assert.notDeepEqual(models.logit.seriesMatrices,models.boost.seriesMatrices);
const record={
  schema:1, stage:'Singapore Major 2026 · Stage 1',createdOn:sealedOn,stageBegins:event.date.slice(0,10),
  cutoffs:{vrsAndRecentMatches:event.asOf,startingFives:event.rosterAsOf,
           logisticTrainingLastMatch:event.model.lastMatch,boostTrainingLastMatch:event.boostModel.lastMatch,
           formatWeight:event.formatWeight.asOf},randomSeed,simulations,searchPaths:simulations/2,evaluationPaths:simulations/2,
  objective:'maximize probability of at least five correct of the ten slots',manualMatchResults:[],algorithm:'roster-core3 / Stage 1 logistic and depth-2 gradient boosting / Swiss MC',
  inputSHA256:inputHashes,implementationSHA256:implementationHashes,models
};
const json=JSON.stringify(record,null,2)+'\n';
if(verify) {
  assert.equal(json,fs.readFileSync(archive,'utf8'),'Frozen inputs, implementation or predictions differ.');
  // Verify that the live versions reproduce the same two probability matrices,
  // cards, per-team category frequencies and objective values as their originals.
  for (const name of archivedRuntime) require(path.join(root,'dist',name+'.js'));
  for (const model of Object.values(models))
    assert.deepEqual(runForecast(model.featureSettings, PickLab, CS),model);
}
else fs.writeFileSync(archive,json,{flag:'wx'});
console.log(path.basename(archive)+' '+sha(json));
