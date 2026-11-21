/* Reproduce the 2026-11-21 v2 release on three historical Stage 1 events.
 * Usage: node analysis/audit.cjs [path/to/extracted/v2/project]
 * With no path, read the published v2 source tree from the checkout's Git history.
 * An explicit path can be the v2 project ZIP or checkout, extracted to a directory.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {execFileSync} = require("node:child_process");

const release = "6699d12eb5b7637c9089ea5e0574b9884d9eee04";
const site = path.resolve(__dirname, "..");
const sandbox = vm.createContext({});
for (const name of ["data", "engine", "format", "style-model", "adapter"]) {
  const relative = "dist/" + name + ".js";
  const code = process.argv[2] ? fs.readFileSync(path.resolve(process.argv[2],relative),"utf8")
    : execFileSync("git",["-C",site,"show",release+":"+relative],{encoding:"utf8"});
  vm.runInContext(code,sandbox,{filename:relative});
}
const {CS,PickLab} = sandbox;
const flags = {form:true,strong:true,weak:true,format:true,h2h:false,style:false};
const seedCard = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
const cap = [2,6,2,6];
const mean = values => values.reduce((s,v)=>s+v,0)/values.length;
const round = v => Math.round(v*1e5)/1e5;
function randomReference() {
  // Count uniform legal cards against ANY legal observed stage. Repeated category
  // labels are unnumbered, and correct empty (1–3 / 2–3) assignments score zero.
  const target = cap.flatMap((n,k)=>Array(n).fill(k));
  const memo = new Map();
  function count(remaining) {
    const key = remaining.join(",");
    if (memo.has(key)) return memo.get(key);
    const n = remaining.reduce((s,x)=>s+x,0);
    const ways = Array(11).fill(0);
    if (n===0) ways[0]=1;
    else for (let k=0;k<4;k++) {
      if (remaining[k]===0) continue;
      const next = remaining.slice();
      next[k]--;
      const sub = count(next);
      const hit = Number(k<3 && target[16-n]===k);
      for (let j=0;j<=10-hit;j++) ways[j+hit]+=sub[j];
    }
    memo.set(key,ways);
    return ways;
  }
  const counts=count(cap);
  const total=counts.reduce((s,v)=>s+v,0);
  const expected=counts.reduce((s,v,i)=>s+i*v,0)/total;
  assert.equal(expected,2.75);
  return {total,counts,expected,pass:round(counts.slice(5).reduce((s,v)=>s+v,0)/total)};
}

function evaluateOdds(probabilities) {
  const n=probabilities.length;
  assert(n>0);
  return {n,correct:probabilities.filter(p=>p>.5).length,ties:probabilities.filter(p=>p===.5).length,
    brier:round(mean(probabilities.map(p=>(1-p)**2))),
    logLoss:round(mean(probabilities.map(p=>-Math.log(p))))};
}

function detailedCard(card,observed) {
  const hits=[0,0,0];
  for(let i=0;i<card.length;i++) if(card[i]<3 && card[i]===observed[i]) hits[card[i]]++;
  return {hits,total:hits.reduce((s,v)=>s+v,0)};
}

function tables(groups) {
  return Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,evaluateOdds(v)]));
}

const results=[], totals={coin:[],seedLadder:[],vrs:[],pooled:[],v2:[]};
const confidenceBands = [[.5,.6],[.6,.7],[.7,.8],[.8,1]].map(([min,max])=>({min,max,conf:[],labels:[]}));
for(const event of PickLab.events.filter(e=>e.hasResults)){
  const evalV2=PickLab.run(event.id,flags,6000);
  const observed=evalV2.observed;
  const evalPooled=PickLab.run(event.id,{...flags,format:false},6000);
  const vrs=PickLab.matrixFor(event,{});
  const aligned=event.teams.map(t=>t.points).sort((a,b)=>b-a);
  const b=event.model.masks[0].beta[0];
  const series={}, matches=[];
  for(const label of Object.keys(totals))series[label]=[];
  const w=Array(16).fill(0),l=Array(16).fill(0);
  for(const [r,roundOfMatches] of event.rounds.entries()){
    for(const [a,op] of roundOfMatches) {
      const format=w[a]===2||l[a]===2?3:1;
      const p=evalV2.matchups["bo"+format][a][op];
      const seedP=1/(1+Math.exp(-b*(aligned[a]-aligned[op])/100));
      const forecasts={v2:p,pooled:evalPooled.matchups.bo1[a][op],vrs:vrs[a][op],seedLadder:seedP,coin:.5};
      for(const [name,prob] of Object.entries(forecasts)){
        series[name].push(prob);
        totals[name].push(prob);
      }
      matches.push({round:r+1,format,winner:event.teams[a].name,loser:event.teams[op].name,
        v2WinnerProbability:round(p),higherSeedWon:a<op});
      const confidence=Math.max(p,1-p);
      const band=confidenceBands.find(bin=>confidence>=bin.min&&(confidence<bin.max||bin.max===1));
      band.conf.push(confidence);
      band.labels.push(p===.5?.5:Number(p>.5));
    }
    for(const [a,op] of roundOfMatches){w[a]++;l[op]++;}
  }
  const disc=(card,i)=>card[i]===3?null:card[i];
  const teams=event.teams.map((team,i)=>({seed:i+1,name:team.name,
    v2Card:disc(evalV2.card,i),pooledCard:disc(evalPooled.card,i),seedCard:disc(seedCard,i),
    actual:w[i]+"-"+l[i],actualCategory:observed[i],v2StageProbabilities:evalV2.probabilities[i].map(round)}));
  const predictedPass={v2:round(evalV2.passRate),seedUnderV2:round(evalV2.score(seedCard).passRate)};
  results.push({event:event.id,
    cards:{v2:detailedCard(evalV2.card,observed),pooled:detailedCard(evalPooled.card,observed),seed:detailedCard(seedCard,observed)},
    predictedPass,
    higherSeedWins:matches.filter(m=>m.higherSeedWon).length,
    forecasts:tables(series),teams,matches});
}
const calibration=confidenceBands.map(b=>({min:b.min,max:b.max,n:b.conf.length,
  averageConfidence:b.conf.length?round(mean(b.conf)):null,actualWinRate:b.labels.length?round(mean(b.labels)):null}));
assert.equal(totals.v2.length,99);
console.log(JSON.stringify({release,randomCard:randomReference(),forecastScores:tables(totals),calibration,events:results},null,2));
