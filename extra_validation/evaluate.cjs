/* Evaluate frozen forecasts and point-in-time strength snapshots on six untouched stages. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../engine/engine.js');
require('../format_model/format.js');
require('../model_v3/rolling.js');
const vrsModels = require('../fitting/models.json');
const formatModels = require('../format_model/model.json');
const rollingModels = require('../model_v3/model.json');
const formatWeights = require('../model_v3/format_weight.json');
const strengths = require('./strengths.json');
const stages = require('./stages.json');
const on = {form:true,strong:true,weak:true};
const literalSeedCard = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
const sigmoid = x => 1/(1+Math.exp(-x));
function methods(stage,snapshot) {
  const teams = stage.entrants.map(n => snapshot.teams[n]);
  const canonical = players => new Set(players.map(p => p.normalize('NFKC').trim().toLowerCase()));
  for (const team of teams) {
    const target = canonical(team.roster), rated = canonical(team.vrsRoster);
    assert.equal(target.size,5);
    assert.equal(rated.size,5);
    assert.equal([...target].filter(p => rated.has(p)).length,team.vrsCoreOverlap);
    assert.ok(team.vrsCoreOverlap >= 3 && Number.isFinite(team.points),team.name);
    assert.equal(Object.values(team.coreAudit.retained).reduce((n,k)=>n+k,0),team.n);
  }
  const model = vrsModels[stage.parent];
  const e = {id:stage.parent,teams,model,rollingModel:rollingModels[stage.parent],
    formatModel:{...formatModels[stage.parent],teams:Object.fromEntries(teams.map(t => [t.name,t.format]))}};
  const actualPoints = teams.map(t=>t.points);
  const seedPoints = [...actualPoints].sort((a,b)=>b-a);
  const beta = model.masks[0].beta[0]/100;
  const byPoints = mix => (a,b) => sigmoid(beta*(mix*(actualPoints[a]-actualPoints[b])+
                                              (1-mix)*(seedPoints[a]-seedPoints[b])));
  const v2 = (a,b) => {
    const values = ['points','form','strong','weak'].map((s,k)=>(teams[a][s]-teams[b][s])/(k===0?100:1));
    return sigmoid(values.reduce((x,y,k)=>x+y*model.masks[7].beta[k],0));
  };
  const rolling = (a,b)=>PickRolling.probability(e,on,a,b);
  const vrs = byPoints(1);
  const vrsFormat = (a,b,bo)=>PickFormat.probability(e,a,b,vrs(a,b),bo);
  const weight = formatWeights[stage.parent].weight;
  assert.ok(Number.isFinite(weight) && weight>=0 && weight<=1);
  const guarded = (a,b,bo) => (1-weight)*vrs(a,b)+weight*vrsFormat(a,b,bo);
  return {vrs,vrsFormat,guarded,seedProjected:byPoints(0),blend:byPoints(.5),v2Pooled:v2,
    v2:(a,b,bo)=>PickFormat.probability(e,a,b,v2(a,b),bo),rolling,
    rollingFormat:(a,b,bo)=>PickFormat.probability(e,a,b,rolling(a,b),bo)};
}
function metrics(acc) {
  return {n:acc.n, brier:acc.squared/acc.n, logLoss:acc.logLoss/acc.n, hitRate:acc.correct/acc.n};
}
const aggregate = {};
const rows = [];
for (const [id,stage] of Object.entries(stages)) {
  const replay=CS.replay(stage.rounds);
  assert.equal(replay.ok,true,id+' Swiss pairing');
  assert.equal(replay.matched,33);
  const allBo3=stage.formats.every(r=>r.every(f=>f===3));
  const wins=new Uint8Array(16),losses=new Uint8Array(16);
  for (let r=0;r<5;r++) for(const [i,[w,l]] of stage.rounds[r].entries()){
    assert.equal(stage.formats[r][i],allBo3 || wins[w]===2 || losses[w]===2 ? 3 : 1);
    wins[w]++;losses[l]++;
  }
  const record = {id,parent:stage.parent,stage:stage.stage,asOf:strengths[stage.parent].date,
    start:stage.start,allBo3,seedCard:CS.actualScore(literalSeedCard,replay.actual),models:{}};
  for(const [name,prob] of Object.entries(methods(stage,strengths[stage.parent]))) {
    const matrix=(bo)=>stage.entrants.map((_,i)=>stage.entrants.map((__,j)=>prob(i,j,bo)));
    const odds = {bo1:matrix(allBo3?3:1),bo3:matrix(3)};
    const cardHits = budget => CS.actualScore(CS.run(odds,budget,33719).card,replay.actual);
    const hits=cardHits(6000), hits24k=cardHits(24000);
    const acc={n:0,squared:0,logLoss:0,correct:0};
    for (let r=0;r<5;r++) for(const [i,[w,l]] of stage.rounds[r].entries()) {
      const p = prob(w,l,stage.formats[r][i]);
      const q = prob(l,w,stage.formats[r][i]);
      assert.ok(Number.isFinite(p) && p>0 && p<1 && Math.abs(p+q-1)<1e-10);
      acc.n++;acc.correct+=p>.5 ? 1 : (p===.5 ? .5 : 0);acc.squared+=(1-p)**2;
      acc.logLoss-=Math.log(p);
    }
    record.models[name]={...metrics(acc),hits,passed:hits>=5,hits24k,passed24k:hits24k>=5};
    const a=aggregate[name]??={n:0,squared:0,logLoss:0,correct:0,totalHits:0,passes:0,totalHits24k:0,passes24k:0};
    for (const [k,v] of Object.entries(acc)) a[k]+=v;
    a.totalHits+=hits;a.passes+=Number(hits>=5); a.totalHits24k+=hits24k; a.passes24k+=Number(hits24k>=5);
  }
  rows.push(record);
}
const scores=Object.fromEntries(Object.entries(aggregate).map(([k,v])=>[k,{...metrics(v),hits:v.totalHits,passes:v.passes,hits24k:v.totalHits24k,passes24k:v.passes24k}]));
const report={n:198,stageCount:6,cardBudgets:[6000,24000],seedCard:{hits:rows.reduce((s,r)=>s+r.seedCard,0),passes:rows.filter(r=>r.seedCard>=5).length},
  models:scores,stages:rows};
fs.writeFileSync(path.join(__dirname,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({models:scores,seedCard:report.seedCard},null,2));
