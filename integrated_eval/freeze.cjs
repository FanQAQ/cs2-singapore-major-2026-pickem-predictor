'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {root,strategies,budget,productionSeed,stableHash,matrixHash,asJSON,modelScripts,verifySources,
  checkMatrix,rankedTail,closeTo}=require('./runtime.cjs');

const sealedOn='2026-11-21';
const file='singapore-stage1-integrated-'+sealedOn+'.json';
const target=path.join(root,'forecast_archive',file);
const args=process.argv.slice(2),check=args[0]==='--check';
assert.ok(!args.length||args.length===1&&check);
if(!check) {
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
  assert.equal(today,sealedOn,'A prospective export can only be created on its stated day');
  assert.ok(!fs.existsSync(target),'The prospective version exists; check it without overwriting.');
}
// Recreate the original signed-off runtime, then compare to the live site's old settings.
const currentSite=PickLab;
const runtimeFile=k=>path.join(root,check && k==='adapter.js' ? 'forecast_archive/runtime-integrated' :
  check && k==='map-model.js' ? 'forecast_archive/runtime-map' :
  check && k==='engine.js' ? 'method_archive/runtime' : 'dist',k);
if(check) { require(runtimeFile('engine.js')); require(runtimeFile('adapter.js')); }
const event=PickLab.events.find(e=>e.id==='singapore');
const provenance=verifySources(event);
assert.ok(!event.hasResults && event.rounds.length===0 && provenance.closeAsOf<=sealedOn);
assert.ok(event.rosterAsOf<=sealedOn && sealedOn<event.date.slice(0,10));
const categories=['3-0','3-1 / 3-2','0-3','1-3 / 2-3'];
const slot=k=>k===3?null:categories[k];
const settings=strategies.combined;
const odds=PickLab.seriesMatrices(event,settings);
checkMatrix(odds);
const sim=PickLab.simulateMatrices(odds,settings,budget,productionSeed);
const live=currentSite.run(event.id,settings,budget,productionSeed);
assert.deepEqual(live.card,sim.card);
assert.deepEqual(live.robust,sim.robust);
assert.deepEqual(live.probabilities,sim.probs);
assert.deepEqual(live.matchups,odds);
assert.deepEqual(live.tailRisk,sim.tailRisk);
assert.equal(live.passRate,sim.pass);
assert.equal(live.expected,sim.expected);
assert.deepEqual(live.expectedCard,sim.expectedCard);
assert.deepEqual(live.passCard,sim.passCard);
const tail=rankedTail(sim,event).members;
const refreshed=PickClose.view(event);
const teamInputs=event.teams.map(t=>({name:t.name,points:t.points,roster:t.roster}));
const sources={teamInputs,v4Model:event.v4Model,formatModel:event.formatModel,formatWeight:event.formatWeight,
  oldMapVeto:event.mapVeto,oldMapStrength:event.mapStrength,closeSnapshot:event.closeSnapshot,regionRisk:event.regionRisk};
const inputHashes=Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,stableHash(JSON.stringify(v))]));
const implementationHashes=Object.fromEntries(modelScripts.map(k=>[k,stableHash(fs.readFileSync(runtimeFile(k)))]));
const pairCoverage=[];
for(let a=0;a<16;a++) for(let b=a+1;b<16;b++) {
  const d=PickLab.duel(event.id,settings,a,b);
  closeTo(d.bo1,odds.bo1[a][b],1e-10);closeTo(d.bo3,odds.bo3[a][b],1e-10);
  assert.ok(d.regionBO1 && d.regionBO3);
  const region=p=>({active:p.active,reason:p.reason,base:p.base,probability:p.probability,uncertainty:p.uncertainty,pairN:p.pairN});
  pairCoverage.push({seedA:a+1,seedB:b+1,bo1:region(d.regionBO1),bo3:region(d.regionBO3)});
}
const selection={productionSeed,searchN:sim.searchN,evaluationN:sim.evalN,gate:sim.robust,
  expected:sim.expectedCard,pass:sim.passCard,selected:sim.card};
const teams=teamInputs.map((t,i)=>({
  ...t,seed:i+1,closeSeries:event.closeSnapshot.byTeam?.[t.name]??null,
  mapVetoSeries:{bo1:refreshed.mapVeto.teams[t.name].bo1.n,bo3:refreshed.mapVeto.teams[t.name].bo3.n},
  mapScores:refreshed.mapStrength.teams[t.name].n,
  outcomeProbabilities:Object.fromEntries(categories.map((c,k)=>[c,sim.probs[i][k]])),
  riskRank:tail[i].riskRank,p02:tail[i].p02,pLossGiven02:tail[i].pLossGiven02,p03:tail[i].p03,
  reached02:tail[i].reached02,lost03:tail[i].lost03,opponentsAt02:sim.tailRisk[i].opponents,
  selectedSlot:slot(sim.card[i]),passSlot:slot(sim.passCard[i]),expectedSlot:slot(sim.expectedCard[i])}));
const forecast={edition:event.label+' Stage 1',strategy:'临赛综合策略',startsOn:event.date.slice(0,10),
  sealedOn,settings,locks:[],categoryOrder:categories,cutoffs:{...provenance,announcedFive:event.rosterAsOf},
  inputHashes,implementationHashes,seriesMatrices:odds,matrixSha256:matrixHash(odds),pairCoverage,teams,
  regionalValidation:event.regionRisk.validation,sharedState:event.regionRisk.sharedState,
  mapVetoApplied:!!settings.mapVeto,selection,selectionSha256:stableHash(JSON.stringify(selection)),
  modelPassProbability:sim.pass,modelExpectedHits:sim.expected};
const data=asJSON(forecast);
if(check) assert.equal(fs.readFileSync(target,'utf8'),data);
else fs.writeFileSync(target,data,{flag:'wx'});
console.log(file,stableHash(data));
