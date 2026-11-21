'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {root,v4,budget,productionSeed,seeds} = require('../strategy_v4_eval/settings.cjs');

// Run the actual frontend code for the probability, Swiss, and recommendation layers.
const modelScripts=['engine.js','format.js','style-model.js','rolling.js','boost.js','v4.js','map-model.js',
  'close-model.js','region-risk.js','robust-card.js','adapter.js'];
for (const file of modelScripts) require(path.join(root,'dist',file));

const strategies = {
  base:v4, close:{...v4,closeForm:true}, region:{...v4,regionRisk:true}, card:{...v4,robustCard:true},
  combined:{...v4,closeForm:true,regionRisk:true,robustCard:true}
};
const labels = {base:'原近期表现',close:'只更新临赛战绩',region:'只加跨区校正',card:'只更换选卡方式',combined:'临赛综合策略'};
const rounded = n=>Number(n.toFixed(8));
const sum = array=>array.reduce((acc,n)=>acc+n,0);
const stableHash = input=>createHash('sha256').update(input).digest('hex');
const matrixHash = m=>stableHash(JSON.stringify(m));
const asJSON = value=>JSON.stringify(value,null,2)+'\n';
const fields = PickLab.events.filter(e=>e.hasResults).sort((a,b)=>a.date.localeCompare(b.date));
const historical = require('../strategy_v4_eval/report.json');
const sourceFile = name=>path.join(root,'integrated_eval',name);
const closeTo=(a,b,tolerance=2e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);

function verifySources(event) {
  const close=event.closeSnapshot,region=event.regionRisk;
  assert.ok(close && region,'Missing frozen inputs for '+event.id);
  assert.deepEqual(close,require('../refresh_close/events.json')[event.id]);
  assert.deepEqual(region,require('../region_risk/events.json')[event.id]);
  assert.equal(close.baseAsOf,event.asOf);
  assert.ok(event.asOf<=close.asOf && close.asOf<event.date.slice(0,10));
  assert.ok(region.asOf<=close.asOf);
  const names=event.teams.map(t=>t.name).sort();
  assert.deepEqual(Object.keys(close.profiles).sort(),names);
  assert.ok(!close.latestMatch || close.latestMatch<=close.asOf);
  return {baseAsOf:event.asOf,closeAsOf:close.asOf,latestMatch:close.latestMatch,
    addedSeries:close.addedSeries,teamsCovered:close.teamsCovered};
}

function checkMatrix(matrix) {
  for (const f of ['bo1','bo3']) {
    assert.equal(matrix[f].length,16);
    matrix[f].forEach((row,i)=>{
      assert.equal(row.length,16);
      row.forEach((p,j)=>{
        assert.ok(p>0 && p<1);
        closeTo(p+matrix[f][j][i],1,1e-10);
      });
    });
  }
}

function cardScore(assignments,observed) {
  assert.deepEqual([0,1,2].map(k=>assignments.filter(x=>x===k).length),[2,6,2]);
  const bucketHits = [0,1,2].map(k=>assignments.filter((v,i)=>v===k && observed[i]===k).length);
  const hits=CS.actualScore(assignments,observed);
  assert.equal(sum(bucketHits),hits);
  return {hits,passed:hits>=5,bucketHits};
}

// Use the very same 2/6/2 recommendation (also when one candidate lost on the gate).
function chosen(sim,robust) {
  assert.ok(!robust||sim.robust);
  return robust ? sim.card : (sim.passCard || sim.card);
}

function rankedTail(sim,event,actual) {
  const rows=sim.tailRisk;
  assert.equal(rows.length,16);
  const ranked=CS.tailRanking(rows,actual);
  const members=rows.map((t,i)=>{
    assert.equal(t.paths,budget);
    assert.equal(t.lost03,Math.round(sim.probs[i][2]*budget));
    assert.ok(t.lost03<=t.reached02);
    if(t.reached02) closeTo(t.p02*t.pLossGiven02,t.p03,1e-10);
    return {team:event.teams[i].name,seed:i+1,riskRank:ranked.ranksByTeam[i],probabilities:sim.probs[i],
      reached02:t.reached02,lost03:t.lost03,p02:t.p02,pLossGiven02:t.pLossGiven02,p03:t.p03};
  });
  if (!actual) return {members};
  const ranking=Object.fromEntries(['top2','top4','top6','seedBottom2'].map(k=>[k,ranked[k]]));
  return {members,ranking};
}

module.exports={root,fields,strategies,labels,budget,productionSeed,seeds,historical,rounded,sum,
  stableHash,matrixHash,asJSON,modelScripts,sourceFile,verifySources,checkMatrix,cardScore,chosen,rankedTail,closeTo};
