'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Worker,isMainThread,parentPort,workerData} = require('node:worker_threads');
const {fields,strategies,seeds,budget,matrixHash,checkMatrix,cardScore,rounded} = require('../integrated_eval/runtime.cjs');
require('../dist/region-vrs.js');
const snapshots = require('./snapshots.json');
const prior = require('../region_vrs_eval/diagnostics.json');
const holdout = require('../holdout_copenhagen/fixture.cjs');
const baseFlags = {...strategies.base, regionVrs:true};
const normalize = handle => handle.normalize('NFKC').toLowerCase();

function blend(event, snapshot) {
  assert.ok(snapshot.date < event.date.slice(0,10));
  const audit = event.teams.map(team => {
    const roster = new Set(team.roster.map(normalize));
    assert.equal(roster.size, 5);
    const matches = snapshot.rows.map(row => ({
      row, overlap: new Set(row.roster.map(normalize).filter(name => roster.has(name))).size
    })).filter(match => match.overlap >= 3).sort((a,b) => b.overlap-a.overlap);
    const best = matches[0];
    const unique = best && best.overlap !== matches[1]?.overlap && Number.isFinite(team.points);
    return {team:team.name, points:team.points, rank:unique ? best.row.rank : null,
      overlap:unique ? best.overlap : null, adjusted:team.points};
  });
  const ranked = audit.filter(t => t.rank !== null).sort((a,b) => a.rank-b.rank);
  assert.equal(new Set(ranked.map(t => t.rank)).size, ranked.length);
  const ordered = ranked.map(t => t.points).sort((a,b) => b-a);
  ranked.forEach((t,i) => { t.adjusted = (t.points + ordered[i])/2; });
  return {audit,event:{...event,teams:event.teams.map((t,i) => ({...t,points:audit[i].adjusted}))}};
}

function errors(matrix, rounds) {
  const sums = {1:{n:0,sse:0},3:{n:0,sse:0}};
  const wins=Array(16).fill(0), losses=Array(16).fill(0);
  for (const round of rounds) for (const [winner,loser] of round) {
    const bo = CS.bestOf(wins[winner],losses[winner]);
    assert.equal(bo,CS.bestOf(wins[loser],losses[loser]));
    sums[bo].n++;
    sums[bo].sse += (1-matrix['bo'+bo][winner][loser])**2;
    wins[winner]++;
    losses[loser]++;
  }
  return Object.fromEntries(Object.entries(sums).map(([bo,s]) => ['bo'+bo,{n:s.n,brier:rounded(s.sse/s.n)}]));
}

function simulate(event, matrix, flags, rounds, ref) {
  const actual = CS.replay(rounds);
  assert.ok(actual.ok && actual.matched===33);
  const errorsByFormat = errors(matrix, rounds);
  if (ref) assert.equal(matrixHash(matrix),ref.matrixSha256);
  const hitsBySeed=[];
  let fixed;
  for (const [i,seed] of seeds.entries()) {
    if (i && ref) { hitsBySeed.push(ref.hitsBySeed[i]); continue; }
    const sim = PickLab.simulateMatrices(matrix,flags,budget,seed);
    const score = cardScore(sim.card,actual.actual);
    hitsBySeed.push(score.hits);
    if (!i) {
      if (ref) assert.deepEqual(sim.card,ref.assignments);
      const tail = sim.probs.map((row,j) => ({team:event.teams[j].name,p03:rounded(row[2]),actual:actual.actual[j]}));
      tail.sort((a,b) => b.p03-a.p03);
      fixed = {...score, assignments:sim.card, modeledPass:rounded(sim.pass), top03:tail.slice(0,2)};
    }
  }
  return {matrixSha256:matrixHash(matrix),...errorsByFormat,fixed,hitsBySeed};
}

function evaluate(id) {
  const extra = id === 'copenhagen-2024-elimination';
  const event = extra ? holdout.makeForecast().event : fields.find(e => e.id === id);
  const flags = extra ? holdout.makeForecast().flags : baseFlags;
  const snapshot = snapshots[extra ? 'copenhagen' : id];
  const candidate = blend(event,snapshot);
  const baselineMatrix = PickLab.seriesMatrices(event,flags);
  const newMatrix = PickLab.seriesMatrices(candidate.event,flags);
  checkMatrix(newMatrix);
  const rounds = extra ? holdout.readOutcomes().rounds : event.rounds;
  const ref = prior.stages.find(s => s.id === id)?.cards.baseVrs;
  return {id,week:snapshot.date,coverage:candidate.audit.filter(t=>t.rank!==null).length,
    audit:candidate.audit,baseline:simulate(event,baselineMatrix,flags,rounds,ref),
    candidate:simulate(event,newMatrix,flags,rounds)};
}

function summary(rows) {
  const result = {};
  for (const key of ['baseline','candidate']) {
    const hitTotals = seeds.map((_,i) => rows.reduce((n,s) => n+s[key].hitsBySeed[i],0));
    const passes = seeds.map((_,i) => rows.filter(s => s[key].hitsBySeed[i]>=5).length);
    result[key] = {hits:hitTotals[0],passes:passes[0],slots:[0,1,2].map(k=>rows.reduce((n,s)=>n+s[key].fixed.bucketHits[k],0)),
      meanHits:rounded(hitTotals.reduce((a,b)=>a+b)/seeds.length),
      meanPasses:rounded(passes.reduce((a,b)=>a+b)/seeds.length), passesBySeed:passes,
      ...Object.fromEntries(['bo1','bo3'].map(f=>[f,rounded(rows.reduce((n,s)=>n+s[key][f].brier*s[key][f].n,0)/rows.reduce((n,s)=>n+s[key][f].n,0))]))};
  }
  const diffs=result.candidate.passesBySeed.map((n,i)=>Math.sign(n-result.baseline.passesBySeed[i]));
  result.pairedPassSeeds={more:diffs.filter(v=>v>0).length,same:diffs.filter(v=>v===0).length,fewer:diffs.filter(v=>v<0).length};
  return result;
}

async function main() {
  const rows = await Promise.all([...fields.map(e => e.id),'copenhagen-2024-elimination'].map(id =>
    new Promise((resolve,reject) => {
      const worker = new Worker(__filename,{workerData:id});
      worker.once('message',resolve);
      worker.once('error',reject);
      worker.once('exit',code=>{if(code)reject(Error('worker exit '+code));});
    })));
  const dev = rows.slice(0,-1), extra = rows.at(-1);
  const report={seeds,paths:budget,development:summary(dev),holdout:summary([extra]),stages:rows};
  const file=path.join(__dirname,'report.json');
  if (process.argv.includes('--check')) assert.deepEqual(report,JSON.parse(fs.readFileSync(file,'utf8')));
  else fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({development:report.development,holdout:report.holdout}));
}
module.exports = {blend, errors, summary};
if (require.main === module) {
  if (isMainThread) main().catch(error=>{console.error(error);process.exitCode=1;});
  else parentPort.postMessage(evaluate(workerData));
}
