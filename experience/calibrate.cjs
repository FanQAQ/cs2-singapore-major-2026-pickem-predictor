/* Walk forward by complete Major. Every stage of an edition uses the same
   experience coefficients, fitted on earlier editions only. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const name of ['engine','format','style-model','rolling','boost','data','adapter'])
  require('../dist/'+name+'.js');
const stages = require('../extra_validation/stages.json');
const {legacyPrior} = require('./transfer.cjs');
const strengths = require('../extra_validation/strengths.json');
const defaults = {format:true,shrinkBO:true};
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);
const logit = p => Math.log(p/(1-p));
const sigmoid = x => 1/(1+Math.exp(-x));

// Used without stdin when reproducing from the fully assembled source bundle.
// The regular build passes the same Python snapshots directly on stdin.
function laterSnapshots() {
  const supplied = process.stdin.isTTY ? '' : fs.readFileSync(0,'utf8').trim();
  if (supplied) return JSON.parse(supplied);
  const script = `
import json,sys
from pathlib import Path
from experience.features import snapshot
history=json.loads(Path('experience/history.json').read_text())
strengths=json.loads(Path('extra_validation/strengths.json').read_text())
cutoffs=json.load(sys.stdin)
print(json.dumps({e:snapshot(history,list(s['teams'].values()),cutoffs[e])
                  for e,s in strengths.items()}))`;
  const cutoffs = Object.fromEntries(PickLab.events.map(e=>[e.id,e.experience.asOf]));
  return JSON.parse(execFileSync('python3',['-c',script],{
    cwd:root,input:JSON.stringify(cutoffs),encoding:'utf8'
  }));
}

// All rows are oriented winner-minus-loser, with y=1. Under a zero-intercept
// paired logistic model this gives exactly the same loss in either orientation.
function fit(rows) {
  const beta = [0,0,0];
  const ridge = 10;
  const lipschitz = ridge + rows.reduce((n,r)=>n+dot(r.x,r.x)/4,0);
  for (let step=0; step<1000; step++) {
    const g = beta.map(v=>ridge*v);
    for(const {offset,x} of rows) {
      const error = sigmoid(offset+dot(beta,x))-1;
      x.forEach((v,k)=>{ g[k]+=error*v; });
    }
    if(Math.max(...g.map(Math.abs)) < 1e-8) break;
    g.forEach((v,k)=>{beta[k]-=v/lipschitz;});
  }
  return beta;
}

function laterEvent(ev, stage) {
  const frozen = strengths[ev.id];
  assert.ok(frozen.date < stage.start);
  const teams = stage.entrants.map(name => {
    const team = frozen.teams[name];
    assert.ok(team && team.vrsCoreOverlap>=3,ev.id+'/'+name);
    return team;
  });
  // Production win engine with the points, actual rosters and format
  // residuals frozen for these entrants at the same pre-Major cutoff.
  return {...ev,teams,matchups:null,
    formatModel:{...ev.formatModel,teams:Object.fromEntries(teams.map(t=>[t.name,t.format]))}};
}

function evaluate(event, rounds, formats, experience, beta, stage) {
  const probabilities = PickLab.seriesMatrices(event,defaults);
  const wins = Array(16).fill(0), losses = Array(16).fill(0);
  const training = [];
  let n=0, baseBrier=0, expBrier=0, baseHits=0, expHits=0;
  const hit = p => p===.5 ? .5 : Number(p>.5);
  for(const [r,round] of rounds.entries()) {
    for(const [i,[w,l]] of round.entries()) {
      const format = formats ? formats[r][i] : (wins[w]===2 || losses[w]===2 ? 3 : 1);
      assert.ok(format===1 || format===3);
      const p = probabilities['bo'+format][w][l];
      assert.ok(p>0 && p<1);
      const a = experience.teams[event.teams[w].name];
      const b = experience.teams[event.teams[l].name];
      assert.ok(a && b, 'Missing entrance record in '+event.id+' stage '+stage);
      let q = p;
      if (a.vector && b.vector) {
        assert.ok([a.vector,b.vector].every(v=>v.length===3 && v.every(Number.isFinite)));
        const x=a.vector.map((v,k)=>v-b.vector[k]);
        const offset=logit(p);
        const shift=dot(x,beta);
        if (shift!==0) q=sigmoid(offset+shift);
        training.push({offset,x,event:event.id,stage});
      }
      n++; baseBrier+=(1-p)**2; expBrier+=(1-q)**2;
      baseHits+=hit(p); expHits+=hit(q);
    }
    for(const [w,l] of round) { wins[w]++;losses[l]++; }
  }
  assert.equal(n,33);
  return {training,metrics:{stage,n,eligible:training.length,baseHits,expHits,
    baseBrier:baseBrier/n,expBrier:expBrier/n}};
}

const later = laterSnapshots();
const models = {}, past = [], results = [], laterResults = [];
for(const ev of [...PickLab.events].sort((a,b)=>a.date.localeCompare(b.date))) {
  const model = past.length
    ? {beta:fit(past), trainingMatches:past.length, cs2Matches:past.length, legacyMatches:0, coefficientSource:'cs2'}
    : legacyPrior(fit, ev.experience.asOf);
  const {beta,trainingMatches} = model;
  const stagesSeen = [...new Set(past.map(r=>r.event))];
  assert.ok(!stagesSeen.includes(ev.id));
  models[ev.id] = {...model,stagesSeen};
  if(!ev.hasResults) continue;

  const first = evaluate(ev,ev.rounds,null,ev.experience,beta,1);
  const context = {id:ev.id,label:ev.label,trainingMatches};
  results.push({...context,...first.metrics});
  const editionRows = [...first.training];
  const subsequent = Object.values(stages).filter(s=>s.parent===ev.id).sort((a,b)=>a.stage-b.stage);
  if (subsequent.length) {
    const history = later[ev.id];
    assert.equal(history?.asOf,ev.experience.asOf);
    const parts = [];
    for(const stage of subsequent) {
      const evaluated = evaluate(laterEvent(ev,stage),stage.rounds,stage.formats,history,beta,stage.stage);
      editionRows.push(...evaluated.training);
      parts.push(evaluated.metrics);
    }
    const sum = key=>parts.reduce((s,m)=>s+m[key],0);
    const n = sum('n');
    const weighted = key=>parts.reduce((s,m)=>s+m.n*m[key],0)/n;
    laterResults.push({...context,n,eligible:sum('eligible'),baseHits:sum('baseHits'),expHits:sum('expHits'),
      baseBrier:weighted('baseBrier'),expBrier:weighted('expBrier'),stages:parts});
  }
  // Every scored stage of this Major enters training only after the edition is scored.
  past.push(...editionRows);
}
console.log(JSON.stringify({models,results,laterResults}));
