'use strict';
// Rebuild the published forecast. --check also works after the tournament.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
require('../strategy_v4/predict.js');
require('../region_vrs_model/model.js');
require('../engine/engine.js');

const read = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/^\uFEFF/, ''));
const inputs = read('inputs.json');
const resultPath='../forecast_archive/prospective/results/singapore-2026-stage1.json';
const results = read(resultPath);
const original = read('../forecast_archive/singapore-stage1-region-vrs-2026-11-21.json');
const stageOne = original.teams.map(t => t.name);
const schedule = read('../stage_goals/singapore-schedule.json');
const inputsByName = inputs.teams;
const invitationRanking = schedule.stages[1].directInvites.map(t => t.team)
  .sort((a,b) => inputsByName[a].vrsRank - inputsByName[b].vrsRank);
const matches=results.rounds.flatMap((games,r)=>games.map(({winner,loser,bestOf,played}) =>
  ({a:winner,b:loser,winner,bestOf,played,round:r+1})));
const standings=new Map(stageOne.map((team,i)=>[team,{team,seed:i+1,wins:0,losses:0,opponents:[]}]));
for (const {a,b} of matches) {
  standings.get(a).wins++;
  standings.get(b).losses++;
  standings.get(a).opponents.push(b);
  standings.get(b).opponents.push(a);
}
for (const row of standings.values()) row.buchholz=row.opponents.reduce((total,team)=>{
  const other=standings.get(team); return total+other.wins-other.losses;},0);
const qualifiers = [...standings.values()].filter(row => row.wins === 3)
  .sort((a,b) => a.losses-b.losses || b.buchholz-a.buchholz || a.seed-b.seed).map(t => t.team);
assert.equal(qualifiers.length,8);
const field = invitationRanking.concat(qualifiers);
assert.equal(new Set(field).size,16);

const model = read('../strategy_v4/models.json').singapore;
const regionModel = read('../region_vrs_model/events.json').singapore;
assert.equal(read('../model_v3/format_weight.json').singapore.weight, 0);
const teams = Object.entries(inputsByName).map(([name,row]) => ({name,...row}));
const index = new Map(teams.map((row,i) => [row.name,i]));
const points = teams.map(t => t.points);
const featureTable = Object.fromEntries(teams.map(t => [t.name,t.profile]));
const event = {asOf:inputs.pointsAsOf, teams, v4Model:{...model,teams:featureTable},
  regionVrsModel:{...regionModel,teams:inputsByName}};
function prior(a,b) {
  if (a===b) return .5;
  const i=index.get(a), j=index.get(b);
  const p = PickV4.probability(event, PickV4.preset, points, i, j);
  return PickRegionVrs.apply(event, i, j, p).probability;
}
// The frozen BO split has zero weight for this edition. Verify the reconstructed
// baseline, both formats and every original matchup, before extending it.
for (const [i,a] of stageOne.entries()) for (const [j,b] of stageOne.entries()) {
  for (const bo of ['bo1','bo3'])
    assert(Math.abs(prior(a,b)-original.seriesMatrices[bo][i][j])<1e-8, 'Stage 1 baseline differs for '+a+' vs '+b);
}
const evidence = Object.fromEntries(field.map(name =>
  [name,{series:0,wins:0,expectedWins:0,information:0,shift:0}]));
assert.equal(matches.length,33);
const replay=CS.replay(Array.from({length:5},(_,i)=>matches.filter(m=>m.round===i+1)
  .map(m=>[stageOne.indexOf(m.winner),stageOne.indexOf(m.winner===m.a ? m.b : m.a)])));
assert.equal(replay.matched,33,'Stage 1 results must reproduce all five Swiss rounds');
assert(replay.ok);
const lossByFormat = {bo1:{n:0,brierSum:0,logLossSum:0},bo3:{n:0,brierSum:0,logLossSum:0}};
for (const {a,b,bestOf,winner,played} of matches) {
  if (played===false) continue;
  const i=stageOne.indexOf(a), j=stageOne.indexOf(b);
  assert(i>=0 && j>=0 && [1,3].includes(bestOf) && [a,b].includes(winner));
  const format='bo'+bestOf;
  const p=original.seriesMatrices[format][i][j];
  const loss=lossByFormat[format];
  loss.n++;
  loss.brierSum += (Number(winner===a)-p)**2;
  loss.logLossSum -= Math.log(winner===a ? p : 1-p);
  for (const [name,prob] of [[a,p],[b,1-p]]) {
    if (!evidence[name]) continue;
    const baselineRoster=original.teams.find(t => t.name===name).roster;
    const roster=inputsByName[name].roster.map(s=>s.toLowerCase());
    const overlap=baselineRoster.filter(s=>roster.includes(s.toLowerCase())).length;
    if (overlap<3) continue;
    const weight=overlap/5, team=evidence[name];
    team.series++;
    team.wins += weight*Number(winner===name);
    team.expectedWins += weight*prob;
    team.information += weight*prob*(1-prob);
  }
}
for (const [team,row] of Object.entries(evidence)) {
  row.shift = (row.wins-row.expectedWins)/(5+row.information);
  if (standings.has(team)) assert.equal(row.series,standings.get(team).wins+standings.get(team).losses);
}
const logit = p=>Math.log(p/(1-p));
const invLogit = z=>1/(1+Math.exp(-z));
function matrix(update) {
  const rows = field.map((a,i) => field.map((b,j) => {
    if (i===j) return .5;
    const p=prior(a,b);
    return update ? invLogit(logit(p)+evidence[a].shift-evidence[b].shift) : p;
  }));
  return {bo1:rows,bo3:rows};
}
const baseMatrix=matrix(false), updatedMatrix=matrix(true);
const seeds=[33719,35783,39079], paths=24000;
function run(m,seed) {return CS.run(m,paths,seed,[],{seedConditionalCard:true});}
function summary(score) {return {pass:score.pass,expected:score.expected};}
const recommended=run(updatedMatrix,seeds[0]), comparison=run(baseMatrix,seeds[0]);
const comparisons=seeds.map((seed,i)=>{
  const updated=i===0 ? recommended : run(updatedMatrix,seed);
  const old=i===0 ? comparison : run(baseMatrix,seed);
  return {seed,baseOptimized:summary(old),adjustedOptimized:summary(updated),
    frozenPicksOnBase:{withoutStage1:summary(old.score(comparison.card)),withStage1:summary(old.score(recommended.card))},
    frozenPicksOnAdjusted:{withoutStage1:summary(updated.score(comparison.card)),withStage1:summary(updated.score(recommended.card))}};
});
const startsAt=schedule.stages[1].firstMatchScheduledUtc;
const output=path.join(__dirname,'forecast.json');
const checking=process.argv.includes('--check');
const sealedAt=checking ? read('forecast.json').sealedAt : new Date().toISOString();
assert(Date.parse(sealedAt)<Date.parse(startsAt),'Forecast must precede the scheduled first series');
const boMetrics=Object.fromEntries(Object.entries(lossByFormat).map(([key,v])=>[key,{n:v.n,brier:v.brierSum/v.n,logLoss:v.logLossSum/v.n}]));
const sourceDigest=relative=>createHash('sha256').update(fs.readFileSync(path.join(__dirname,relative))).digest('hex');
const record={id:'singapore-2026-stage2',stage:2,startsAt,sealedAt,
  categoryOrder:['3-0','3-1 / 3-2','0-3','other'],
  methodSummary:'以 11 月 2 日 Valve 积分、赛区实力、PGL 首发和赛前比赛为基础，按至少三名相同首发继承历史表现。八支晋级队再按第一阶段实际胜场与赛前预期之差小幅调整，八支直邀队保留原估计。按本阶段种子模拟五轮瑞士赛，为十个预测位置选队。',
  teams:field.map((name,i)=>{const t=inputsByName[name], s=standings.get(name);
    return {seed:i+1,name,roster:t.roster,points:t.points,vrsRank:t.vrsRank,region:t.region,stage1Record:s ? s.wins+'–'+s.losses : null,
      stage1Update:evidence[name]};}),
  card:recommended.card,baseCard:comparison.card,probabilities:recommended.probs,baseProbabilities:comparison.probs,
  passProbability:recommended.pass,expectedHits:recommended.expected,basePassProbability:comparison.pass,baseExpectedHits:comparison.expected,
  matrix:updatedMatrix,baseMatrix,seed:seeds[0],searchPaths:recommended.searchN,evaluationPaths:recommended.evalN,
  audit:{inputDate:inputs.pointsAsOf,trainingSeries:inputs.trainingSeries,stage1Series:matches.length,
    stage1PreEventError:boMetrics,stage2ResultsUsed:0,pairedSeeds:comparisons,
    hashes:{stage1WinnerInput:sourceDigest(resultPath),features:sourceDigest('inputs.json'),
      priorMatrix:sourceDigest('../forecast_archive/singapore-stage1-region-vrs-2026-11-21.json')}},
  sources:[
    {label:'PGL 第一阶段赛果',url:'https://news.pglesports.com/api/groupStageEndpoint?stage=1'},
    {label:'PGL 参赛阵容',url:schedule.sources.rosters.url},
    {label:'Valve 11 月 2 日全球积分',url:'https://github.com/ValveSoftware/counter-strike_regional_standings/blob/f8c55f250fdef796d708aa32814587932154fa04/invitation/2026/standings_global_2026_11_02.md'},
    {label:'第二阶段赛制和参赛队',url:'https://www.hltv.org/events/9304/pgl-major-singapore-2026-stage-2'},
    {label:'PGL 新加坡 Major 赛程',url:'https://www.pglesports.com/cs2/pgl-major-singapore-2026/'}]};
if (checking) assert.deepEqual(record,read('forecast.json'));
else fs.writeFileSync(output,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({sealedAt,picks:[0,1,2].map(slot=>field.filter((_,i)=>recommended.card[i]===slot)),
  base:[0,1,2].map(slot=>field.filter((_,i)=>comparison.card[i]===slot)),pass:recommended.pass,expected:recommended.expected,boMetrics}));
