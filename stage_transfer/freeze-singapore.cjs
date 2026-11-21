'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {fieldFor,roster,evidence,shifts,adjust}=require('./evaluate.cjs');
const editions=require('../major_form/all_stages.json').editions;
const {budget,productionSeed}=require('../strategy_v4_eval/settings.cjs');
const root=path.resolve(__dirname,'..');
const source='forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json';
const destination=path.join(root,'forecast_archive/singapore-stage1-earlier-stages-2026-11-21.json');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function makeRecord(sealedAt) {
  const base=JSON.parse(fs.readFileSync(path.join(root,source),'utf8'));
  const matrixFile=path.join(root,base.matrixReference.file);
  const matrixBytes=fs.readFileSync(matrixFile);
  assert.equal(digest(matrixBytes),base.matrixReference.sha256);
  const baseline=JSON.parse(matrixBytes)[base.matrixReference.field];
  assert.equal(sealedAt.slice(0,10),'2026-11-21');
  assert(sealedAt.slice(0,10)<base.startsOn);
  const compare=CS.run(baseline,budget,productionSeed,[],{seedConditionalCard:true});
  assert.deepEqual(compare.card,base.card);
  const eligible=PickLab.allEvents.filter(e=>e.hasResults && e.date.slice(0,10)<sealedAt.slice(0,10) && (e.parent||e.id)!=='singapore' &&
    editions[e.parent||e.id].end<sealedAt.slice(0,10)).map(fieldFor).sort((a,b)=>a.start.localeCompare(b.start));
  assert.equal(eligible.reduce((n,s)=>n+s.records.length,0),429);
  assert(eligible.every(s=>s.end<sealedAt.slice(0,10)));
  const teams=base.teams.map(t=>({name:t.team,roster:roster(t.roster)}));
  const own=evidence(teams,eligible.filter(s=>s.stage===1));
  const later=evidence(teams,eligible.filter(s=>s.stage>1));
  const deltas=shifts([own,later],teams.length);
  const matrix=adjust(baseline,deltas);
  const sim=CS.run(matrix,budget,productionSeed,[],{seedConditionalCard:true});
  return {stage:base.stage,kind:'earlier-stage-transfer-challenger',sealedAt,startsOn:base.startsOn,seed:productionSeed,
    categoryOrder:base.categoryOrder,
    baseline:{file:source,sha256:digest(fs.readFileSync(path.join(root,source)))},
    historicalSources:eligible.map(s=>({id:s.id,through:s.end,games:s.records.length})),teams:base.teams,
    teamEvidence:teams.map((t,i)=>({team:t.name,sameStageGames:own[i].n,laterStageGames:later[i].n,logOddsShift:deltas[i]})),
    seriesMatrices:matrix,card:sim.card};
}
if(process.argv.includes('--check')) {
  const record=JSON.parse(fs.readFileSync(destination,'utf8'));
  assert.deepEqual(makeRecord(record.sealedAt),record);
} else {
  const event=PickLab.allEvents.find(e=>e.id==='singapore');
  assert(event && !event.hasResults && !event.rounds.length);
  const base=JSON.parse(fs.readFileSync(path.join(root,source),'utf8'));
  assert.equal(base.startsOn,event.date.slice(0,10));
  assert.deepEqual(event.teams.map(t=>[t.name,t.roster]),base.teams.map(t=>[t.team,t.roster]));
  const record=makeRecord(new Date().toISOString());
  const temp=destination+'.'+randomUUID()+'.tmp';
  try{
    fs.writeFileSync(temp,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    assert.equal(new Date().toISOString().slice(0,10),'2026-11-21');
    fs.linkSync(temp,destination);
  }finally{fs.rmSync(temp,{force:true});}
}
console.log(path.basename(destination));
