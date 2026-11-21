/* Score the BO3 losing-map feature on the five actual opening stages. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {root, fields, strategies, productionSeed, budget, rounded, sum, checkMatrix,
       cardScore, rankedTail, matrixHash, asJSON} = require('../integrated_eval/runtime.cjs');
require(path.join(root, 'dist', 'region-vrs.js'));

const frozen = require('./profiles.json');
const published = require('../region_vrs_eval/report.json');
const archived = require('../region_vrs_eval/diagnostics.json');
const flags = {...strategies.base, regionVrs:true};
const arms = ['base','salvage'];
const rankFields = ['top2','top4','top6','seedBottom2'];

function adjusted(base, profile, names) {
  const bo3 = base.bo3.map(row => row.slice());
  for (let i=0; i<names.length; i++) {
    for (let j=i+1; j<names.length; j++) {
      const left = profile.teams[names[i]], right = profile.teams[names[j]];
      if (!left.n || !right.n) continue;
      const delta = profile.coefficient * (left.residual-right.residual);
      // Preserve identical probabilities bit-for-bit, including when the fit shrinks to zero.
      if (delta === 0) continue;
      const p = base.bo3[i][j];
      bo3[i][j] = 1 / (1+Math.exp(-(Math.log(p/(1-p))+delta)));
      bo3[j][i] = 1-bo3[i][j];
    }
  }
  const candidate = {...base, bo3};
  checkMatrix(candidate);
  assert.deepEqual(base.bo1, candidate.bo1);
  return candidate;
}

function stageData(event) {
  const replay = CS.replay(event.rounds);
  assert.ok(replay.ok && replay.total===33);
  const profile = frozen[event.id];
  assert.equal(profile.asOf, event.asOf);
  assert.ok(Number.isFinite(profile.coefficient));
  const names = event.teams.map(t=>t.name);
  assert.deepEqual(Object.keys(profile.teams).sort(), [...names].sort());
  for (const t of Object.values(profile.teams))
    assert.ok(Number.isInteger(t.n) && t.n>=0 && Number.isFinite(t.residual));

  const base = PickLab.seriesMatrices(event, flags);
  const matrices = {base, salvage:adjusted(base,profile,names)};
  const reference = archived.stages.find(s=>s.id===event.id).cards.baseVrs;
  assert.equal(matrixHash(base),reference.matrixSha256);

  const matches=[], reached02=new Set(), wins=Array(16).fill(0), losses=Array(16).fill(0);
  for (const round of event.rounds) {
    for (const [winner,loser] of round) {
      assert.equal(wins[winner],wins[loser]);
      assert.equal(losses[winner],losses[loser]);
      const bo=CS.bestOf(wins[winner],losses[winner]);
      const is02=wins[winner]===0 && losses[winner]===2;
      if (is02) { reached02.add(winner); reached02.add(loser); assert.equal(bo,3); }
      matches.push({bo,is02,base:base['bo'+bo][winner][loser],
        salvage:matrices.salvage['bo'+bo][winner][loser]});
    }
    for (const [w,l] of round) { wins[w]++; losses[l]++; }
  }
  assert.equal(reached02.size,4);
  const cards={}, ranks={}, tail={};
  for (const arm of arms) {
    const sim = PickLab.simulateMatrices(matrices[arm],flags,budget,productionSeed);
    const ranked = rankedTail(sim,event,replay.actual);
    if (arm==='base') {
      assert.deepEqual(ranked.members,reference.teams);
      assert.deepEqual(sim.card,reference.assignments);
    }
    cards[arm]=cardScore(sim.card,replay.actual);
    ranks[arm]=ranked.ranking;
    tail[arm]=ranked.members.map((team,i)=>({
      reached:reached02.has(i), eliminated:replay.actual[i]===2,
      p02:team.p02, conditional:team.pLossGiven02, p03:team.p03
    }));
  }
  // The first two rounds only use BO1; paired draws must give the same P(0–2).
  assert.deepEqual(tail.base.map(t=>t.p02),tail.salvage.map(t=>t.p02));
  return {id:event.id,asOf:profile.asOf,coefficient:profile.coefficient,
    teamsWithLosses:names.filter(n=>profile.teams[n].n>0).length, matches,cards,ranks,tail};
}

function matchScore(rows,arm) {
  const n=rows.length;
  return {n,correct:sum(rows.map(r=>r[arm]>0.5?1:r[arm]===0.5?0.5:0)),
    changed:sum(rows.map(r=>Number(Math.abs(r[arm]-r.base)>1e-12))),
    brier:rounded(sum(rows.map(r=>(1-r[arm])**2))/n),
    logLoss:rounded(-sum(rows.map(r=>Math.log(r[arm])))/n)};
}

function binaryBrier(rows,prob,outcome) {
  assert.ok(rows.every(r=>Number.isFinite(r[prob])));
  return {n:rows.length,brier:rounded(sum(rows.map(r=>(r[prob]-Number(r[outcome]))**2))/rows.length)};
}

function summarize(data,arm) {
  const matches=data.flatMap(d=>d.matches), slots=data.flatMap(d=>d.tail[arm]);
  const cards=data.map(d=>d.cards[arm]);
  return {
    all:matchScore(matches,arm),
    bo1:matchScore(matches.filter(m=>m.bo===1),arm),
    bo3:matchScore(matches.filter(m=>m.bo===3),arm),
    eliminationBO3:matchScore(matches.filter(m=>m.is02),arm),
    tailQuality:{
      openingLosses:binaryBrier(slots,'p02','reached'),
      eliminationGiven02:binaryBrier(slots.filter(t=>t.reached),'conditional','eliminated'),
      allLosses:binaryBrier(slots,'p03','eliminated')
    },
    card:{hits:sum(cards.map(c=>c.hits)),passes:cards.filter(c=>c.passed).length,
      bucketHits:[0,1,2].map(k=>sum(cards.map(c=>c.bucketHits[k])))},
    tail:Object.fromEntries(rankFields.map(k=>[k,sum(data.map(d=>d.ranks[arm][k]))]))
  };
}

const observations=fields.map(stageData);
const totals=Object.fromEntries(arms.map(k=>[k,summarize(observations,k)]));
const actualBase=published.totals.baseVrs;
for (const part of ['all','bo1','bo3']) {
  for (const key of ['n','correct','brier','logLoss']) assert.equal(totals.base[part][key],actualBase[part][key]);
}
assert.deepEqual(totals.base.card,actualBase.card);
assert.deepEqual(totals.base.tail,actualBase.tail);
assert.deepEqual(totals.salvage.bo1,totals.base.bo1);
assert.equal(totals.base.eliminationBO3.n,10);
assert.equal(totals.base.tailQuality.eliminationGiven02.n,20);
const stages=observations.map(d=>({
  id:d.id,asOf:d.asOf,coefficient:d.coefficient,teamsWithLosses:d.teamsWithLosses,
  models:Object.fromEntries(arms.map(k=>[k,summarize([d],k)]))
}));
const result={seed:productionSeed,paths:budget,stages,totals};
const target=path.join(__dirname,'report.json'), contents=asJSON(result);
if (process.argv.includes('--check')) assert.equal(fs.readFileSync(target,'utf8'),contents);
else { fs.writeFileSync(target+'.tmp',contents); fs.renameSync(target+'.tmp',target); }
console.log(JSON.stringify(totals));
