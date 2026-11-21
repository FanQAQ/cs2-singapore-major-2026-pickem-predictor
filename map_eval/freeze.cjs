/* Write the map candidate's prospective Singapore card once. --check is read-only. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const {root,v4,budget,productionSeed} = require('../strategy_v4_eval/settings.cjs');
require(path.join(root,'dist/map-model.js'));

const date = '2026-11-21';
const modes = process.argv.slice(2);
assert.ok(!modes.length || modes.length===1 && modes[0]==='--check');
const check = modes[0]==='--check';
const filename = 'singapore-stage1-map-veto-'+date+'.json';
const file = path.join(root,'forecast_archive',filename);
if (!check) {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
  assert.equal(today,date,'Can only seal on the recorded date');
  assert.ok(!fs.existsSync(file),'Forecast already sealed; use --check.');
}
const live = PickLab;
const liveEngine = CS;
const liveMap = PickMap;
const moduleFile = name => path.join(root,check && ['adapter','engine','map-model'].includes(name)
  ? 'forecast_archive/runtime-map' : 'dist',name+'.js');
if (check) {
  require(moduleFile('engine'));
  require(moduleFile('map-model'));
  require(moduleFile('adapter'));
}
const event = PickLab.events.find(e=>e.id==='singapore');
assert.ok(event && !event.hasResults && !event.rounds.length && event.teams.length===16);
assert.equal(event.v4Model.asOf,event.asOf);
assert.deepEqual(event.mapStrength,require('../map_strength/events.json').singapore);
assert.deepEqual(event.mapVeto,require('../map_veto_data/veto.json').singapore);
assert.ok(event.mapVeto.first && event.mapVeto.last && event.mapVeto.last<=event.asOf);
assert.ok(event.asOf<=date && event.rosterAsOf<=date && date<event.date.slice(0,10));
const settings = {...v4,mapVeto:true};
const matrix = PickLab.seriesMatrices(event,settings);
const base = PickLab.seriesMatrices(event,v4);
const sim = CS.run(matrix,budget,productionSeed);
const categories = ['3-0','3-1 / 3-2','0-3','1-3 / 2-3'];
const slot = k=>k===3?null:categories[k];
const hash = data=>createHash('sha256').update(data).digest('hex');
const teams = event.teams.map(t=>({name:t.name,roster:t.roster,points:t.points}));
const sources = {teams,v4Model:event.v4Model,formatModel:event.formatModel,formatWeight:event.formatWeight,
                 mapStrength:event.mapStrength,mapVeto:event.mapVeto};
const inputs = Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,hash(JSON.stringify(v))]));
const codeFiles=['engine','v4','format','style-model','map-model','adapter'];
const code = Object.fromEntries(codeFiles.map(k=>[k+'.js',hash(fs.readFileSync(moduleFile(k)))]));
const details = {bo1:[],bo3:[]};
for(let a=0;a<16;a++) {
  for(let b=a+1;b<16;b++) {
    const pair = PickLab.duel(event.id,settings,a,b);
    for(const [f,x] of [['bo1',pair.mapBO1],['bo3',pair.mapBO3]]) {
      assert.ok(x && Math.abs(x.probability-matrix[f][a][b])<1e-9);
      details[f].push({a:teams[a].name,b:teams[b].name,status:x.status,vetoN:x.vetoN,strengthN:x.strengthN,
                       sharedMaps:x.sharedMaps,base:base[f][a][b],candidate:matrix[f][a][b]});
    }
  }
}
const snapshot = {edition:event.label+' Stage 1',model:'v4 with verified map veto and per-map strength',
  sealedOn:date,startsOn:event.date.slice(0,10),cutoffs:{strengthAndVrs:event.asOf,announcedFive:event.rosterAsOf,
    firstVerifiedVeto:event.mapVeto.first,lastVerifiedVeto:event.mapVeto.last,
    lastVerifiedMapScore:Object.values(event.mapStrength.teams).map(t=>t.last).filter(Boolean).sort().at(-1)},
  seed:productionSeed,settings,locks:[],searchPaths:sim.searchN,independentEvaluationPaths:sim.evalN,
  objective:'at least five exactly correct slots across the 2/6/2 card',
  categoryOrder:categories,inputHashes:inputs,implementationHashes:code,
  seriesMatrices:matrix,pairCoverage:details,
  teams:teams.map((t,i)=>({...t,seed:i+1,
    outcomeProbabilities:Object.fromEntries(categories.map((c,k)=>[c,sim.probs[i][k]])),
    thresholdSlot:slot(sim.card[i]),expectedHitsSlot:slot(sim.expectedCard[i])})),
  modelPassProbability:sim.pass,modelExpectedHits:sim.expected};
const output=JSON.stringify(snapshot,null,2)+'\n';
if (check) {
  assert.equal(fs.readFileSync(file,'utf8'),output);
  globalThis.PickMap=liveMap;
  assert.deepEqual(live.seriesMatrices(event,settings),matrix);
  const current = liveEngine.run(matrix,budget,productionSeed);
  assert.deepEqual(current.card,sim.card);
  assert.deepEqual(current.probs,sim.probs);
}
else fs.writeFileSync(file,output,{flag:'wx'});
console.log(filename,hash(output));
