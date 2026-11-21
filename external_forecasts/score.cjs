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
  function readTicket(ticket) {
    const card=Array(16).fill(3);
    [ticket.threeZero,ticket.ordinary,ticket.zeroThree].forEach((group, category)=>{
      assert.equal(group.length,[2,6,2][category]);
      for (const name of group) {
        const i = index(name);
        assert.equal(card[i],3,'Duplicate team on ticket: '+name);
        card[i]=category;
      }
    });
    return card;
  }
  const publicCard=readTicket(snapshot.ticket);
  const pley=sealedJson('external_forecasts/pley-singapore-stage1-2026-11-22.json',
    '652d27330e50e99c392ca7e5afe26ec6ff5ca34a7666a3d945bb60958800238e');
  assert.equal(pley.stage,snapshot.stage);
  assert.equal(Date.parse(pley.firstMatchAt),Date.parse(snapshot.firstMatchAt));
  assert(Date.parse(pley.publishedAt)<=Date.parse(pley.modifiedAt) && Date.parse(pley.modifiedAt)<=Date.parse(pley.recordedAt) &&
    Date.parse(pley.recordedAt)<Date.parse(pley.firstMatchAt));
  const pleyCard=readTicket(pley);
  const {singapore:external}=sealedJson('external_forecasts/git-model-2026-11-22.json',
    'd419c4a28932778d6f49312df8339e02728d8e4bfeacfb123e0edf722e5ec079');
  assert.equal(external.id,snapshot.stage);
  assert.equal(external.roundsPlayed,0);
  assert(Date.parse(external.committedAt)<=Date.parse(external.recordedAt) && Date.parse(external.recordedAt)<Date.parse(snapshot.firstMatchAt));
  assert.deepEqual(external.teams.map(t=>t.team),teams);
  assert.deepEqual(external.categoryOrder,categories);
  assert.equal(external.roundOne.length,8);
  for(const row of roundOne){
    const pair=external.roundOne.find(([a,b])=>[a,b].includes(row.a) && [a,b].includes(row.b));
    assert(pair && pair[2]>0 && pair[2]<1);
    row.gitModelP=pair[0]===row.a?pair[2]:1-pair[2];
  }
  const gitModelCard=readTicket(external);
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
  return {teams,index,roundOne,localCard,publicCard,pleyCard,pleyRecordedAt:pley.recordedAt,currentCard:latest.card,challengerCard:challenger.card,
    gitModelCard,gitModelRecordedAt:external.recordedAt,teamProbabilities:{recommended:latest.probabilities,gitModel:external.teams.map(t=>t.probabilities)},
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

function teamOutcomes(probabilities,actual) {
  assert.equal(probabilities.length,actual.length);
  const perCategory=[0,0,0,0];
  for(const [i,row] of probabilities.entries()){
    assert(row.length===4 && row.every(p=>p>=0 && p<=1));
    assert(Math.abs(row.reduce((a,b)=>a+b,0)-1)<1e-8);
    row.forEach((p,c)=>{perCategory[c]+=(p-Number(actual[i]===c))**2/actual.length;});
  }
  return {teams:actual.length,categoryOrder:categories,perCategory,brier:perCategory.reduce((a,b)=>a+b,0)};
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
    firstRoundBO1:{recommended:probabilityScore(data.roundOne,winners,'localP'),DAKEbits:probabilityScore(data.roundOne,winners,'publicP'),
      gitModel:probabilityScore(data.roundOne,winners,'gitModelP')},
    terminalTeamErrors:Object.fromEntries(Object.entries(data.teamProbabilities).map(([k,p])=>[k,teamOutcomes(p,replay.actual)])),
    stageProbabilityErrors:{recommended:seriesScores(data.baselineOdds,rounds),earlierStageChallenger:seriesScores(data.challengerOdds,rounds)},
    completedStage:{originalRecommended:ticketScore(data.localCard,replay,data.teams),recommended:ticketScore(data.currentCard,replay,data.teams),
      earlierStageChallenger:ticketScore(data.challengerCard,replay,data.teams),CSGOTradeUp:ticketScore(data.publicCard,replay,data.teams),
      Pley:ticketScore(data.pleyCard,replay,data.teams),gitModel:ticketScore(data.gitModelCard,replay,data.teams)}};
}

function compare(data) {
  const slotDisagreements = data.teams.flatMap((team,i)=>data.localCard[i]===data.publicCard[i]?[]:[
    {team,recommended:categories[data.localCard[i]],CSGOTradeUp:categories[data.publicCard[i]]}
  ]);
  const pleyVsPublished=data.teams.flatMap((team,i)=>data.currentCard[i]===data.pleyCard[i]?[]:[
    {team,recommended:categories[data.currentCard[i]],Pley:categories[data.pleyCard[i]]}
  ]);
  const gitModelVsPublished=data.teams.flatMap((team,i)=>data.currentCard[i]===data.gitModelCard[i]?[]:[
    {team,recommended:categories[data.currentCard[i]],gitModel:categories[data.gitModelCard[i]]}
  ]);
  return {stage:snapshot.stage,frozenAt:snapshot.frozenAt,pleyRecordedAt:data.pleyRecordedAt,gitModelRecordedAt:data.gitModelRecordedAt,
    firstRoundBO1:data.roundOne,slotDisagreements,pleyVsPublished,gitModelVsPublished};
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
