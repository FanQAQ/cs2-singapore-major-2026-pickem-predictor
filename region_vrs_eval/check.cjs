'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const {root, fields, strategies:old, seeds, budget, productionSeed, checkMatrix, asJSON,
  matrixHash, rankedTail, cardScore, closeTo, rounded, sum} = require('../integrated_eval/runtime.cjs');
const oldReport = require('../integrated_eval/report.json');
const oldDetails = require('../integrated_eval/diagnostics.json');
const regions = ['americas','asia','europe'];
const namedPairs = ['americas-asia','americas-europe','asia-europe'];
const controls = ['base','region','combined'];
const strategies = {};
const controlOf = {};
for (const key of controls) {
  strategies[key] = old[key];
  strategies[key+'Vrs'] = {...old[key],regionVrs:true};
  controlOf[key] = controlOf[key+'Vrs'] = key;
}
// Load the current public runtime. The archive helper loads the old strategy dependencies.
require(path.join(root,'dist','region-vrs.js'));

function matches(event,matrices) {
  const rows = [], wins = Array(16).fill(0), losses = Array(16).fill(0);
  for (const [index,round] of event.rounds.entries()) {
    for (const [winner,loser] of round) {
      const i = Math.min(winner,loser), j = Math.max(winner,loser);
      assert.equal(wins[i],wins[j]); assert.equal(losses[i],losses[j]);
      const bestOf = CS.bestOf(wins[i],losses[i]);
      const [a,b] = [i,j].map(k=>event.teams[k].name);
      const [ra,rb] = [a,b].map(t=>event.regionRisk.teams[t].region);
      const y = Number(winner===i);
      const row = {round:index+1,a,b,ra,rb,bestOf,y};
      const probs = new Map();
      for (const [key,matrix] of Object.entries(matrices)) {
        const p = matrix['bo'+bestOf][i][j];
        // Using the same frontend controls must give the same value as the match matrix.
        const d = PickLab.duel(event.id,strategies[key],i,j);
        closeTo(p,d['bo'+bestOf],1e-12);
        probs.set(key,p); row[key] = p;
      }
      if (ra===rb || !ra || !rb) for (const key of controls) assert.equal(probs.get(key+'Vrs'),probs.get(key));
      rows.push(row);
    }
    for (const [w,l] of round) { wins[w]++; losses[l]++; }
  }
  assert.equal(rows.length,33);
  return rows;
}

function score(rows, key, firstRegion=null) {
  const n = rows.length;
  const prev = controlOf[key];
  let correct=0, brier=0, log=0, changed=0, predicted=0, observed=0;
  for (const r of rows) {
    const p = r[key], y = r.y;
    const actualProbability = y ? p : 1-p;
    correct += actualProbability>.5 ? 1 : actualProbability===.5 ? .5 : 0;
    brier += (y-p)**2; log -= Math.log(actualProbability);
    changed += Number(Math.abs(r[prev]-p)>1e-10);
    if (firstRegion) {
      assert.ok(r.ra===firstRegion || r.rb===firstRegion);
      predicted += (r.ra===firstRegion ? p : 1-p);
      observed += (r.ra===firstRegion ? y : 1-y);
    }
  }
  return {n,correct,brier:n ? rounded(brier/n) : null,logLoss:n ? rounded(log/n) : null,changed,
    firstRegion,predictedRate:firstRegion && n ? rounded(predicted/n) : null,
    observedRate:firstRegion && n ? rounded(observed/n) : null, observedWins:firstRegion && n ? observed : null};
}

function scoreGroups(rows,key) {
  return {all:score(rows,key),bo1:score(rows.filter(r=>r.bestOf===1),key),bo3:score(rows.filter(r=>r.bestOf===3),key)};
}

function pairGroups(rows,key) {
  const known = r=>regions.includes(r.ra) && regions.includes(r.rb);
  const cross = rows.filter(r=>known(r) && r.ra!==r.rb);
  const groups = {allCross:score(cross,key),same:score(rows.filter(r=>known(r) && r.ra===r.rb),key),
    unknown:score(rows.filter(r=>!known(r)),key)};
  for (const pair of namedPairs) {
    const [a,b] = pair.split('-');
    groups[pair] = score(cross.filter(r=>(r.ra===a && r.rb===b) || (r.ra===b && r.rb===a)),key,a);
  }
  assert.equal(sum(namedPairs.map(pair=>groups[pair].n)),groups.allCross.n);
  assert.equal(groups.allCross.n+groups.same.n+groups.unknown.n,rows.length);
  return groups;
}

// Only reuse archived repeated draws after verifying the full matrix including shared
// state, the card, 16 stage-outcome distributions and tail table at the production seed.
function simulationAudit(event,matrices,actual,archived) {
  const details = {}, results = {}, cache = new Map();
  for (const [key,flags] of Object.entries(strategies)) {
    const matrix = matrices[key], hash = matrixHash(matrix);
    const robust = Boolean(flags.robustCard);
    const cacheKey = hash+'|'+robust;
    if (!cache.has(cacheKey)) {
      const ref = controls.find(k=>archived.cards[k].matrixSha256===hash && Boolean(strategies[k].robustCard)===robust);
      const fixed = PickLab.simulateMatrices(matrix,flags,budget,productionSeed);
      const chosen = fixed.card;
      const fixedCard = cardScore(chosen,actual);
      const tail = rankedTail(fixed,event,actual);
      const details = {matrixSha256:hash,assignments:chosen,teams:tail.members};
      let hitsBySeed;
      if (ref) {
        const record = archived.cards[ref];
        assert.deepEqual(chosen,record.assignments);
        assert.deepEqual(tail.members,record.teams);
        if (robust) assert.deepEqual(fixed.robust,record.gate);
        hitsBySeed = archived.hitsBySeed[ref];
      } else {
        hitsBySeed = seeds.map(seed=>{
          if (seed===productionSeed) return fixedCard.hits;
          const sim = PickLab.simulateMatrices(matrix,flags,budget,seed);
          return cardScore(sim.card,actual).hits;
        });
      }
      assert.equal(hitsBySeed.length,seeds.length);
      assert.equal(hitsBySeed[seeds.indexOf(productionSeed)],fixedCard.hits);
      cache.set(cacheKey,{card:fixedCard,tail:tail.ranking,hitsBySeed,details});
    }
    const item = cache.get(cacheKey);
    details[key] = {...item.details,hitsBySeed:item.hitsBySeed};
    results[key] = {card:item.card,tail:item.tail};
  }
  return {details,results};
}

function stageAudit(id) {
  const event = fields.find(e=>e.id===id);
  assert.ok(event.regionVrsModel,'Ranking model missing from '+id);
  assert.deepEqual(event.regionVrsModel,require('../region_vrs_model/events.json')[id]);
  const matrices = Object.fromEntries(Object.entries(strategies).map(([k,f])=>[k,PickLab.seriesMatrices(event,f)]));
  for (const key of Object.keys(strategies)) {
    checkMatrix(matrices[key]); assert.deepEqual(matrices[key].state,matrices[controlOf[key]].state);
  }
  const archived = oldDetails.stages.find(s=>s.id===id);
  const replay = CS.replay(event.rounds);
  assert.ok(replay.ok && replay.total===33);
  assert.deepEqual(replay.actual,archived.actual);
  for (const key of controls) assert.equal(matrixHash(matrices[key]),archived.cards[key].matrixSha256);
  const rows = matches(event,matrices);
  const {details,results} = simulationAudit(event,matrices,replay.actual,archived);
  const models = {};
  for (const key of Object.keys(strategies)) models[key] = {...scoreGroups(rows,key),...results[key]};
  return {stage:{id,label:event.label,asOf:event.asOf,models},
    detail:{id,teams:event.teams.map(t=>t.name),actual:replay.actual,matches:rows,cards:details}};
}

function aggregate(results,key) {
  const cards = results.map(r=>r.stage.models[key].card);
  const rows = results.flatMap(r=>r.detail.matches);
  const hitsBySeed = name=>seeds.map((_,i)=>results.map(r=>r.detail.cards[name].hitsBySeed[i]));
  const scores = hitsBySeed(key), prior = hitsBySeed(controlOf[key]);
  const passed = s=>s.filter(h=>h>=5).length;
  const diff = scores.map((s,i)=>passed(s)-passed(prior[i]));
  const stability={meanHits:rounded(sum(scores.map(sum))/scores.length),
    meanPasses:rounded(sum(scores.map(passed))/scores.length),
    improved:diff.filter(d=>d>0).length,unchanged:diff.filter(d=>d===0).length,worse:diff.filter(d=>d<0).length};
  const tail = Object.fromEntries(['top2','top4','top6','seedBottom2'].map(m=>[m,sum(results.map(r=>r.stage.models[key].tail[m]))]));
  const card={hits:sum(cards.map(c=>c.hits)),passes:cards.filter(c=>c.passed).length,
    bucketHits:[0,1,2].map(i=>sum(cards.map(c=>c.bucketHits[i])))};
  const total={...scoreGroups(rows,key),card,tail,stability};
  if (controls.includes(key)) {
    const old = oldReport.totals[key];
    assert.deepEqual(total.card,old.card);assert.deepEqual(total.tail,old.tail);
    for (const f of ['all','bo1','bo3']) for (const m of ['n','correct','brier','logLoss']) assert.equal(total[f][m],old[f][m]);
    assert.equal(stability.meanPasses,old.stability.meanPasses); assert.equal(stability.meanHits,old.stability.meanHits);
  }
  return total;
}

function singaporePreview() {
  const event = PickLab.events.find(e=>e.id==='singapore');
  assert.ok(!event.hasResults && !event.rounds.length && event.regionVrsModel);
  const summary = {};
  for (const name of controls) {
    const comparison = strategies[name+'Vrs'];
    const prev = PickLab.run(event.id,strategies[name],budget,productionSeed);
    const next = PickLab.run(event.id,comparison,budget,productionSeed);
    const effects = {};
    for (const f of ['bo1','bo3']) {
      let changed = 0, maxAbsPP = 0, totalAbsPP = 0;
      for (let i=0;i<16;i++) for (let j=i+1;j<16;j++) {
        const delta = next.matchups[f][i][j] - prev.matchups[f][i][j];
        const amount = Math.abs(delta)*100;
        if (amount>1e-8) {
          changed++; maxAbsPP = Math.max(maxAbsPP,amount); totalAbsPP += amount;
        }
      }
      effects[f] = {potential:120,changed,maxAbsPP:rounded(maxAbsPP),meanAbsPPWhenChanged:changed?rounded(totalAbsPP/changed):null};
    }
    assert.deepEqual(prev.matchups.state,next.matchups.state);
    summary[name+'Vrs'] = {pairEffects:effects,selectedTeamSlotsChanged:prev.card.filter((k,i)=>next.card[i]!==k).length,
      identicalProbabilities:matrixHash(prev.matchups)===matrixHash(next.matchups),
      baseMatrixSha256:matrixHash(prev.matchups),matrixSha256:matrixHash(next.matchups)};
  }
  return summary;
}

async function main() {
  assert.deepEqual(oldDetails.seeds,seeds);
  const tasks = fields.map(event=>new Promise((resolve,reject)=>{
    const worker = new Worker(__filename,{workerData:event.id});
    worker.once('error',reject); worker.once('message',resolve);
    worker.once('exit',code=>{if (code) reject(Error(event.id+' audit exit '+code));});
  }));
  const results = await Promise.all(tasks);
  const rows = results.flatMap(r=>r.detail.matches);
  assert.equal(rows.length,165);
  const totals = {}, regionalPairs = {};
  for (const key of Object.keys(strategies)) {
    totals[key] = aggregate(results,key);
    regionalPairs[key] = pairGroups(rows,key);
  }
  const report = {seed:productionSeed,simulationCount:budget,sensitivitySeeds:seeds,stageCount:results.length,
    stages:results.map(r=>r.stage),totals,regionalPairs,singapore:singaporePreview()};
  const detail = {strategies,controlOf,stages:results.map(r=>r.detail)};
  for (const [file,data] of [['report.json',report],['diagnostics.json',detail]]) {
    const target = path.join(__dirname,file), content = asJSON(data);
    if (process.argv.includes('--check')) assert.equal(fs.readFileSync(target,'utf8'),content);
    else { fs.writeFileSync(target+'.tmp',content); fs.renameSync(target+'.tmp',target); }
  }
  console.table(Object.entries(totals).map(([name,m])=>({name,brier:m.all.brier,changed:m.all.changed,
    correct:m.all.correct,hits:m.card.hits,passes:m.card.passes,zero:m.card.bucketHits[2],meanPasses:m.stability.meanPasses})));
}
if (isMainThread) main().catch(err=>{console.error(err);process.exitCode=1;});
else parentPort.postMessage(stageAudit(workerData));
