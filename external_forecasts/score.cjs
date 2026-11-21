// Usage: node external_forecasts/score.cjs [verified-stage-results.json]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
require('../engine/engine.js');

const root = path.resolve(__dirname, '..');
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'singapore-stage1-2026-11-21.json'), 'utf8'));
const categories = ['3-0', '3-1 / 3-2', '0-3', 'other'];
const canonical = name => Object.hasOwn(snapshot.aliases, name) ? snapshot.aliases[name] : name;

function sealedJson(filename, expected) {
  // The archived hashes identify LF repository blobs. Windows Git can check out CRLF.
  const source = fs.readFileSync(path.join(root, filename), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), expected, filename);
  return JSON.parse(source);
}

function load() {
  const ref = snapshot.localReference;
  const local = sealedJson(ref.file, ref.sha256LF);
  const model = local.methods[ref.method];
  const matrixRef = model.matrixReference;
  const archive = sealedJson(matrixRef.file, matrixRef.sha256);
  assert.equal(local.stage, 'singapore');
  assert.deepEqual(local.categoryOrder, categories);
  assert.deepEqual(archive.categoryOrder, categories);
  assert.equal(archive.sealedOn, local.sealedOn);
  assert.deepEqual(archive.locks, []);
  assert.deepEqual(local.locks, []);
  assert.equal(archive.correction.matrixSha256, model.matrixSha256);
  const teams = local.seeds.map((row, i) => {
    assert.equal(row.seed, i + 1);
    assert.equal(row.seed, archive.teams[i].seed);
    assert.equal(row.team, archive.teams[i].name);
    assert.deepEqual(row.roster, archive.teams[i].roster);
    assert.equal(categories[model.card[i]], archive.teams[i].slot);
    return row.team;
  });
  assert.equal(new Set(teams).size, 16);
  const index = name => {
    const i = teams.indexOf(canonical(name));
    assert.notEqual(i, -1, 'Unknown team: ' + name);
    return i;
  };
  assert.equal(snapshot.roundOne.pairs.length, 8);
  const matrix = archive[matrixRef.field].bo1;
  const roundOne = snapshot.roundOne.pairs.map(([a,b,pct], i) => {
    assert.equal(index(a), i);
    assert.equal(index(b), i + 8);
    assert.ok(Number.isInteger(pct) && pct > 0 && pct < 100);
    const localP = matrix[i][i+8];
    assert.ok(localP > 0 && localP < 1);
    assert.ok(Math.abs(localP + matrix[i+8][i] - 1) < 1e-8);
    return {a:teams[i], b:teams[i+8], localP, publicP:pct/100, localMinusPublicPP:100*localP-pct};
  }).sort((a,b)=>Math.abs(b.localMinusPublicPP)-Math.abs(a.localMinusPublicPP));
  const publicCard = Array(16).fill(3);
  [snapshot.ticket.threeZero,snapshot.ticket.ordinary,snapshot.ticket.zeroThree].forEach((group, category)=>{
    assert.equal(group.length,[2,6,2][category]);
    for (const name of group) {
      const i = index(name);
      assert.equal(publicCard[i],3,'Duplicate team on ticket: '+name);
      publicCard[i]=category;
    }
  });
  const localCard = model.card;
  const latest = sealedJson('forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json',
    'ae1c25551ac4ce23737b2e69ef3aa5ad57488f5bc7e67bc3f1d088d1725c594c');
  assert.equal(latest.matrixSha256,model.matrixSha256);
  assert.deepEqual(latest.teams,local.seeds);
  assert.equal(latest.priorForecast.sha256,ref.sha256LF);
  globalThis.CS.actualScore(localCard,localCard);
  const challenger=sealedJson('forecast_archive/singapore-stage1-earlier-stages-2026-11-21.json',
    '0d6479c7b825e02d99c48cbda9463e5cf992260e8b4e9e0813d487b2ff199e75');
  assert.equal(challenger.stage,latest.stage);
  assert.deepEqual(challenger.teams,latest.teams);
  assert.equal(challenger.baseline.sha256,'ae1c25551ac4ce23737b2e69ef3aa5ad57488f5bc7e67bc3f1d088d1725c594c');
  return {teams,index,roundOne,localCard,publicCard,currentCard:latest.card,challengerCard:challenger.card,
    baselineOdds:archive[matrixRef.field],challengerOdds:challenger.seriesMatrices};
}

function probabilityScore(roundOne, winners, key) {
  const probabilities = roundOne.map(m=>winners.has(m.a)?m[key]:1-m[key]);
  const mean = numbers=>numbers.reduce((sum,n)=>sum+n,0)/numbers.length;
  return {n:probabilities.length, brier:mean(probabilities.map(p=>(1-p)**2)),
    logLoss:mean(probabilities.map(p=>-Math.log(p)))};
}

function ticketScore(card, replay, teams) {
  const hits = globalThis.CS.actualScore(card, replay.actual);
  return {hits,passed:hits>=5,bySlot:categories.slice(0,3).map((slot,category)=>({
    slot,hitTeams:teams.filter((name,i)=>card[i]===category && replay.actual[i]===category)
  }))};
}

function seriesScores(matrix,rounds) {
  const wins=Array(16).fill(0),losses=Array(16).fill(0);
  const predictions={bo1:[],bo3:[]};
  for(const round of rounds) for(const [w,l] of round) {
    const bestOf=wins[w]===2 || losses[w]===2?'bo3':'bo1';
    predictions[bestOf].push(matrix[bestOf][w][l]);
    wins[w]++;losses[l]++;
  }
  return Object.fromEntries(Object.entries(predictions).map(([bo,p])=>[bo,{
    games:p.length,brier:p.reduce((a,q)=>a+(1-q)**2,0)/p.length,logLoss:p.reduce((a,q)=>a-Math.log(q),0)/p.length
  }]));
}

function scoreResults(data, input) {
  assert.equal(input.stage,snapshot.stage,'Wrong event or stage');
  assert.ok(typeof input.source==='string' && new URL(input.source).protocol==='https:', 'Result source URL required');
  assert.ok(Array.isArray(input.rounds) && input.rounds.length===5,'The complete five rounds are required');
  const rounds = input.rounds.map(round=>round.map(pair=>{
    assert.ok(Array.isArray(pair) && pair.length===2 && pair.every(t=>typeof t==='string'),'Expected [winner, loser]');
    return pair.map(data.index);
  }));
  const replay = globalThis.CS.replay(rounds);
  assert.ok(replay.ok && replay.matched===33,replay.error || 'Fixtures do not match the bracket');
  const winners = new Set(rounds[0].map(([i])=>data.teams[i]));
  return {source:input.source, verifiedPairings:replay.matched,
    firstRoundBO1:{recommended:probabilityScore(data.roundOne,winners,'localP'),DAKEbits:probabilityScore(data.roundOne,winners,'publicP')},
    stageProbabilityErrors:{recommended:seriesScores(data.baselineOdds,rounds),earlierStageChallenger:seriesScores(data.challengerOdds,rounds)},
    completedStage:{originalRecommended:ticketScore(data.localCard,replay,data.teams),recommended:ticketScore(data.currentCard,replay,data.teams),
      earlierStageChallenger:ticketScore(data.challengerCard,replay,data.teams),CSGOTradeUp:ticketScore(data.publicCard,replay,data.teams)}};
}

function compare(data) {
  const slotDisagreements = data.teams.flatMap((team,i)=>data.localCard[i]===data.publicCard[i]?[]:[
    {team,recommended:categories[data.localCard[i]],CSGOTradeUp:categories[data.publicCard[i]]}
  ]);
  return {stage:snapshot.stage,frozenAt:snapshot.frozenAt,firstRoundBO1:data.roundOne,slotDisagreements};
}

if (require.main===module) {
  try {
    assert.ok(process.argv.length<=3,'Usage: node external_forecasts/score.cjs [verified-stage-results.json]');
    const data=load(), result=compare(data);
    if(process.argv[2]) result.scored=scoreResults(data,JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
    console.log(JSON.stringify(result,null,2));
  } catch (error) {
    console.error(error.message);
    process.exitCode=1;
  }
}
module.exports={load,compare,scoreResults};
