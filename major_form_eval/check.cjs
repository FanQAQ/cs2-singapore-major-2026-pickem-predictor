'use strict';
// Rebuild the displayed recommendation, and measure the same residual with the event gate bypassed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Worker,isMainThread,parentPort,workerData} = require('node:worker_threads');
const {root,fields,strategies,seeds,budget,productionSeed,checkMatrix,rankedTail,cardScore,asJSON,
  matrixHash,rounded,sum,closeTo} = require('../integrated_eval/runtime.cjs');
require(path.join(root,'dist','region-vrs.js'));
require(path.join(root,'dist','major-form.js'));
const oldReport = require('../region_vrs_eval/report.json');
const oldDetails = require('../region_vrs_eval/diagnostics.json');
const baseFlags = {...strategies.base,regionVrs:true};
const candidateFlags = {...baseFlags,majorForm:true};
const models = ['base','candidate','shadow'];

function scenarios(e, flags=baseFlags) {
  const base = PickLab.seriesMatrices(e,flags);
  const candidate = PickLab.seriesMatrices(e,{...flags,majorForm:true});
  const shadow = structuredClone(base);
  for (const format of ['bo1','bo3']) {
    for (let i=0;i<16;i++) for (let j=i+1;j<16;j++) {
      const p=base[format][i][j];
      const live = PickMajorForm.apply(e,i,j,p);
      closeTo(candidate[format][i][j],live.probability,1e-12);
      const trial=PickMajorForm.apply(e,i,j,p,{shadow:true}).probability;
      shadow[format][i][j]=trial;
      shadow[format][j][i]=1-trial;
      if (e.majorForm.validation.passed) closeTo(trial,live.probability,1e-12);
      else assert.equal(candidate[format][i][j],base[format][i][j]);
    }
  }
  const matrices={base,candidate,shadow};
  Object.values(matrices).forEach(checkMatrix);
  return matrices;
}

function metrics(rows,key) {
  const n=rows.length;
  const probs=rows.map(r=>r.y?r[key]:1-r[key]);
  const changed=rows.filter(r=>Math.abs(r.base-r[key])>1e-10).length;
  return {n,changed,correct:sum(probs.map(p=>p>0.5?1:p===0.5?0.5:0)),
    brier:n?rounded(sum(probs.map(p=>(1-p)**2))/n):null,
    logLoss:n?rounded(-sum(probs.map(p=>Math.log(p)))/n):null};
}

function groupedScores(rows,key) {
  return {all:metrics(rows,key),bo1:metrics(rows.filter(r=>r.bestOf===1),key),
    bo3:metrics(rows.filter(r=>r.bestOf===3),key),
    informative:metrics(rows.filter(r=>Math.abs(r.shadow-r.base)>1e-10),key)};
}

// Affected matches are oriented toward the team that the residual favors. Each game counts once.
function favoredSide(rows) {
  const changed=rows.filter(r=>Math.abs(r.shadow-r.base)>1e-10);
  const favored=changed.map(r=>{
    const a=r.shadow>r.base;
    return {win:a?r.y:1-r.y,base:a?r.base:1-r.base,trial:a?r.shadow:1-r.shadow};
  });
  const n=favored.length;
  return {n,wins:sum(favored.map(i=>i.win)),expectedWins:rounded(sum(favored.map(i=>i.base))),
    shadowExpectedWins:rounded(sum(favored.map(i=>i.trial)))};
}

function replayRows(e,matrices,formats=null) {
  const rows=[], wins=Array(16).fill(0), losses=Array(16).fill(0);
  for (const [round,games] of e.rounds.entries()) {
    for (const [index,[winner,loser]] of games.entries()) {
      const i=Math.min(winner,loser),j=Math.max(winner,loser);
      assert.equal(wins[i],wins[j]); assert.equal(losses[i],losses[j]);
      const bestOf=formats?formats[round][index]:CS.bestOf(wins[i],losses[i]),f='bo'+bestOf;
      const a=e.teams[i].name,b=e.teams[j].name;
      const row={round:round+1,a,b,y:Number(i===winner),bestOf,repeatA:e.majorForm.teams[a].repeat,
        repeatB:e.majorForm.teams[b].repeat};
      for(const key of models) row[key]=matrices[key][f][i][j];
      rows.push(row);
    }
    for (const [w,l] of games) {wins[w]++;losses[l]++;}
  }
  assert.equal(rows.length,33);
  return rows;
}

function historyCoverage(e) {
  const profiles=Object.values(e.majorForm.teams);
  return {entrants:profiles.length,withPrevious:profiles.filter(t=>t.editions>0).length,
    eligibleTeams:profiles.filter(t=>t.repeat).length};
}

function simulate(event,matrices,actual) {
  const old=oldDetails.stages.find(s=>s.id===event.id).cards.baseVrs;
  const cache=new Map(),cards={};
  for (const key of models) {
    const odds=matrices[key],hash=matrixHash(odds);
    if (!cache.has(hash)) {
      const sim=PickLab.simulateMatrices(odds,baseFlags,budget,productionSeed);
      const score=cardScore(sim.card,actual);
      const {ranking}=rankedTail(sim,event,actual);
      let hitsBySeed;
      if(hash===old.matrixSha256) {
        assert.deepEqual(sim.card,old.assignments);
        assert.deepEqual(sim.probs,old.teams.map(t=>t.probabilities));
        hitsBySeed=old.hitsBySeed;
      } else {
        hitsBySeed=seeds.map(seed=>seed===productionSeed?score.hits:
          cardScore(PickLab.simulateMatrices(odds,baseFlags,budget,seed).card,actual).hits);
      }
      assert.equal(hitsBySeed[seeds.indexOf(productionSeed)],score.hits);
      cache.set(hash,{matrixSha256:hash,slots:sim.card,card:score,tail:ranking,hitsBySeed});
    }
    cards[key]=cache.get(hash);
  }
  assert.equal(cards.base.matrixSha256,old.matrixSha256);
  return cards;
}

function stage(id) {
  const event=fields.find(e=>e.id===id);
  assert.deepEqual(event.majorForm,require('../major_form/events.json')[id]);
  assert.ok(event.majorForm.asOf<=event.date.slice(0,10));
  const matrices=scenarios(event);
  const rows=replayRows(event,matrices), actual=CS.replay(event.rounds).actual;
  const scores=simulate(event,matrices,actual);
  const summary={};
  for (const key of models) summary[key]={...groupedScores(rows,key),card:scores[key].card,tail:scores[key].tail};
  const coverage={...historyCoverage(event),repeatMatches:rows.filter(r=>r.repeatA||r.repeatB).length,
    affectedMatches:summary.candidate.all.changed,shadowMatches:summary.shadow.all.changed};
  return {stage:{id,label:event.label,asOf:event.majorForm.asOf,gatePassed:event.majorForm.validation.passed,
    coverage,models:summary},detail:{id,actual,rows,teams:event.teams.map(t=>t.name),models:scores}};
}

function total(results,key) {
  const values=results.map(r=>r.stage.models[key]);
  const card={hits:sum(values.map(v=>v.card.hits)),passes:values.filter(v=>v.card.passed).length,
    bucketHits:[0,1,2].map(i=>sum(values.map(v=>v.card.bucketHits[i])))};
  const tail=Object.fromEntries(Object.keys(values[0].tail).map(k=>[k,sum(values.map(v=>v.tail[k]))]));
  const seeded=name=>seeds.map((s,i)=>results.map(r=>r.detail.models[name].hitsBySeed[i]));
  const current=seeded(key),baseline=seeded('base'),passes=s=>s.filter(n=>n>=5).length;
  const change=current.map((s,i)=>passes(s)-passes(baseline[i]));
  return {...groupedScores(results.flatMap(r=>r.detail.rows),key),card,tail,stability:{
    meanHits:rounded(sum(current.map(sum))/seeds.length),meanPasses:rounded(sum(current.map(passes))/seeds.length),
    improved:change.filter(v=>v>0).length,unchanged:change.filter(v=>v===0).length,worse:change.filter(v=>v<0).length}};
}

function transfer() {
  const specs=require('../extra_validation/stages.json');
  const laterModels=require('../major_form/later.json');
  const strengths=require('../extra_validation/strengths.json');
  const profiles=require('../strategy_v4/later_teams.json');
  const original=require('../integrated_eval/diagnostics.json');
  const stages=[],allRows=[];
  for(const [id,spec] of Object.entries(specs)) {
    const parent=fields.find(e=>e.id===spec.parent);
    const reference=original.stages.find(s=>s.id===id);
    const teams=spec.entrants.map(n=>strengths[spec.parent].teams[n]);
    const e={...parent,teams,rounds:spec.rounds,majorForm:laterModels[id],matchups:null,
      v4Model:{...parent.v4Model,teams:profiles[spec.parent]},
      formatModel:{...parent.formatModel,teams:Object.fromEntries(teams.map(t=>[t.name,t.format]))}};
    assert.deepEqual(Object.keys(e.majorForm.teams).sort(),[...spec.entrants].sort());
    assert.deepEqual(e.majorForm.validation,parent.majorForm.validation);
    assert.equal(e.asOf,strengths[spec.parent].date);
    assert.ok(e.asOf<parent.date.slice(0,10) && parent.date.slice(0,10)<spec.start);
    const matrices=scenarios(e,strategies.base);
    const rows=replayRows(e,matrices,spec.formats);
    const oldRows=reference.matches;
    for(const [k,row] of rows.entries()) {
      for(const attr of ['round','a','b','y','bestOf']) assert.equal(row[attr],oldRows[k][attr]);
      closeTo(row.base,oldRows[k].base,1e-12);
    }
    allRows.push(...rows);
    const allBo3=spec.formats.flat().every(f=>f===3);
    const actual=CS.replay(spec.rounds).actual, cache=new Map(),stats={};
    for(const name of models) {
      const matrix=allBo3?{bo1:matrices[name].bo3,bo3:matrices[name].bo3}:matrices[name];
      const hash=matrixHash(matrix);
      if(!cache.has(hash)) {
        const sim=PickLab.simulateMatrices(matrix,strategies.base,budget,productionSeed);
        cache.set(hash,{slots:sim.card,card:cardScore(sim.card,actual)});
      }
      const {slots,card}=cache.get(hash);
      stats[name]={...groupedScores(rows,name),card};
      if(name==='base') {
        assert.deepEqual(slots,reference.cards.base.assignments);
        assert.equal(hash,reference.cards.base.matrixSha256);
      }
    }
    stages.push({id,parent:spec.parent,stage:spec.stage,asOf:e.majorForm.asOf,gatePassed:e.majorForm.validation.passed,
      coverage:historyCoverage(e),models:stats});
  }
  assert.equal(allRows.length,198);
  const totals={};
  for(const key of models) {
    const cards=stages.map(s=>s.models[key].card);
    totals[key]={...groupedScores(allRows,key),card:{hits:sum(cards.map(c=>c.hits)),passes:cards.filter(c=>c.passed).length,
      bucketHits:[0,1,2].map(i=>sum(cards.map(c=>c.bucketHits[i])))}};
  }
  return {baseline:'v4',stageCount:stages.length,stages,totals,favoredSide:favoredSide(allRows)};
}

function preview() {
  const event=PickLab.events.find(e=>e.id==='singapore');
  assert.ok(!event.hasResults && !event.rounds.length);
  assert.deepEqual(event.majorForm,require('../major_form/events.json').singapore);
  const matrices=scenarios(event), compare={};
  const old=PickLab.run(event.id,baseFlags,budget,productionSeed);
  for(const key of models.slice(1)) {
    const effects={};
    for(const f of ['bo1','bo3']) {
      const differences=[];
      for(let i=0;i<16;i++) for(let j=i+1;j<16;j++) {
        const diff=Math.abs(matrices[key][f][i][j]-matrices.base[f][i][j]);
        if(diff>1e-10) differences.push(diff*100);
      }
      effects[f]={potential:120,changed:differences.length,maxAbsPP:rounded(Math.max(0,...differences)),
        meanAbsPPWhenChanged:differences.length?rounded(sum(differences)/differences.length):null};
    }
    const sim=PickLab.simulateMatrices(matrices[key],baseFlags,budget,productionSeed);
    compare[key]={effects,changedSlots:sim.card.filter((v,i)=>v!==old.card[i]).length,
      identicalProbabilities:matrixHash(matrices[key])===matrixHash(old.matchups),matrixSha256:matrixHash(matrices[key])};
  }
  return {...historyCoverage(event),asOf:event.majorForm.asOf,gatePassed:event.majorForm.validation.passed,
    identicalProbabilities:compare.candidate.identicalProbabilities,baselineMatrixSha256:matrixHash(old.matchups),...compare};
}

async function main() {
  const results=await Promise.all(fields.map(e=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:e.id});
    worker.once('error',reject);worker.once('message',resolve);worker.once('exit',code=>{if(code) reject(Error(e.id+' '+code));});
  })));
  const totals=Object.fromEntries(models.map(k=>[k,total(results,k)]));
  assert.equal(totals.base.all.n,165);
  for (const metric of ['n','correct','brier','logLoss']) assert.equal(totals.base.all[metric],oldReport.totals.baseVrs.all[metric]);
  assert.deepEqual(totals.base.card,oldReport.totals.baseVrs.card);
  assert.deepEqual(totals.base.tail,oldReport.totals.baseVrs.tail);
  const report={seed:productionSeed,sensitivitySeeds:seeds,simulationCount:budget,stageCount:results.length,
    stages:results.map(r=>r.stage),totals,favoredSide:favoredSide(results.flatMap(r=>r.detail.rows)),singapore:preview(),later:transfer()};
  for (const [name,data] of [['report',report],['diagnostics',{baseFlags,candidateFlags,seeds,stages:results.map(r=>r.detail)}]]) {
    const filename=path.join(__dirname,name+'.json'), content=asJSON(data);
    if (process.argv.includes('--check')) assert.equal(fs.readFileSync(filename,'utf8'),content);
    else {fs.writeFileSync(filename+'.tmp',content);fs.renameSync(filename+'.tmp',filename);}
  }
  console.table(models.map(key=>({model:key,...totals[key].all,hits:totals[key].card.hits,passes:totals[key].card.passes,
    meanPasses:totals[key].stability.meanPasses})));
}
if(isMainThread) main().catch(e=>{console.error(e);process.exitCode=1;});
else parentPort.postMessage(stage(workerData));
