'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {fields,strategies,labels,budget,productionSeed,seeds,historical,rounded,sum,matrixHash,asJSON,
  sourceFile,verifySources,checkMatrix,cardScore,chosen,rankedTail,closeTo}=require('./runtime.cjs');
const laterStages=require('../extra_validation/stages.json');
const laterRatings=require('../extra_validation/strengths.json');
const laterProfiles=require('../strategy_v4/later_teams.json');

function getField(id) {
  const opening=fields.find(e=>e.id===id);
  if (opening) return {event:opening,rounds:opening.rounds,formats:null};
  const stage=laterStages[id],parent=fields.find(e=>e.id===stage.parent);
  const ratings=laterRatings[stage.parent],profiles=laterProfiles[stage.parent];
  assert.equal(ratings.date,parent.asOf);
  assert.ok(ratings.date<stage.start);
  const teams=stage.entrants.map(name=>ratings.teams[name]);
  assert.ok(teams.every(t=>t.vrsCoreOverlap>=3 && profiles[t.name]));
  return {event:{...parent,teams,closeSnapshot:null,regionRisk:null,matchups:null,
       v4Model:{...parent.v4Model,teams:profiles},formatModel:{...parent.formatModel,
       teams:Object.fromEntries(teams.map(t=>[t.name,t.format]))}},
    rounds:stage.rounds,formats:stage.formats};
}

function replayRows(spec,matrices) {
  const {event,rounds,formats}=spec;
  const wins=Array(16).fill(0),losses=Array(16).fill(0),rows=[];
  for(const [round,r] of rounds.entries()) {
    for(const [at,[winner,loser]] of r.entries()) {
      const bestOf=formats?formats[round][at]:CS.bestOf(wins[winner],losses[winner]);
      assert.ok(bestOf===1||bestOf===3);
      const a=Math.min(winner,loser),b=Math.max(winner,loser);
      const row={round:round+1,a:event.teams[a].name,b:event.teams[b].name,bestOf,y:Number(winner===a)};
      for(const [m,odds] of Object.entries(matrices)) row[m]=odds['bo'+bestOf][a][b];
      rows.push(row);
    }
    for(const [w,l] of r) {wins[w]++;losses[l]++;}
  }
  assert.equal(rows.length,33);
  return rows;
}

// Evaluate a separate live-round diagnostic, conditioning on strictly earlier
// complete rounds. The primary pre-stage series probabilities remain fixed.
function applyRoundEvidence(spec,rows,matrices) {
  const names=spec.event.teams.map(t=>t.name);
  const groups=groupMatrices(matrices);
  for(const g of groups) {
    const locks=[];
    for(const [index,results] of spec.rounds.entries()) {
      const roundRows=rows.filter(r=>r.round===index+1);
      if(!g.matrix.state) {
        for(const r of roundRows) for(const m of g.names) r['live_'+m]=r[m];
        continue;
      }
      // The exact posterior is computed when the path is created. The two
      // unused samples satisfy the engine's public minimum budget.
      const path=CS.run(g.matrix,2,productionSeed,locks).path;
      const matchups=path.rounds[index].matches;
      const winners=new Map(results.map(([w,l])=>[Math.min(w,l)*16+Math.max(w,l),w]));
      const newLocks=[];
      for(const match of matchups) {
        const a=Math.min(match.a,match.b),b=Math.max(match.a,match.b);
        const row=roundRows.find(r=>r.a===names[a]&&r.b===names[b]);
        assert.ok(row && match.winner===null && row.bestOf===match.bo);
        const p=a===match.a?match.probability:1-match.probability;
        for(const m of g.names) row['live_'+m]=p;
        const winner=winners.get(a*16+b);
        assert.ok(winner===a||winner===b);
        newLocks.push(winner);
      }
      locks.push(newLocks);
    }
  }
}

function scored(rows,m) {
  const scores={};
  for(const [k,f] of [['all',0],['bo1',1],['bo3',3]]) {
    const probabilities=rows.filter(r=>!f||r.bestOf===f).map(r=>r.y?r[m]:1-r[m]);
    const n=probabilities.length;
    scores[k]={n,correct:sum(probabilities.map(p=>p>.5?1:p===.5?.5:0)),
      brier:n?rounded(sum(probabilities.map(p=>(1-p)**2))/n):null,
      logLoss:n?rounded(-sum(probabilities.map(p=>Math.log(p)))/n):null};
  }
  return scores;
}

// Diagnose the two factors on the correct population. Only teams that really
// started 0–2 contribute to the conditional elimination-match score.
function tailQuality(stageDetails,m) {
  const samples={openingLosses:[],eliminationGiven02:[],allLosses:[]};
  for(const stage of stageDetails) {
    const beaten=new Map();
    for(const g of stage.matches.filter(row=>row.round<=2)) {
      const loser=g.y?g.b:g.a;
      beaten.set(loser,(beaten.get(loser)||0)+1);
    }
    const members=stage.cards[m].teams;
    for(const [i,team] of members.entries()) {
      const reached=beaten.get(team.team)===2,zero=stage.actual[i]===2;
      samples.openingLosses.push([team.p02,Number(reached)]);
      samples.allLosses.push([team.p03,Number(zero)]);
      if(reached && team.pLossGiven02!==null) samples.eliminationGiven02.push([team.pLossGiven02,Number(zero)]);
    }
  }
  return Object.fromEntries(Object.entries(samples).map(([k,items])=>[k,{n:items.length,
    brier:items.length?rounded(sum(items.map(([p,y])=>(p-y)**2))/items.length):null}]));
}

function groupMatrices(matrices) {
  const groups=new Map();
  for(const [name,matrix] of Object.entries(matrices)) {
    const key=matrixHash(matrix);
    if(!groups.has(key)) groups.set(key,{matrix,names:[],robust:false});
    const group=groups.get(key);
    group.names.push(name);
    group.robust ||= !!strategies[name].robustCard;
  }
  return [...groups.values()];
}

function evaluate(id) {
  const spec=getField(id),{event,rounds,formats}=spec;
  const notes=formats?{baseAsOf:event.asOf}:verifySources(event);
  const names=formats?['base','card']:Object.keys(strategies);
  const matrices=Object.fromEntries(names.map(m=>[m,PickLab.seriesMatrices(event,strategies[m])]));
  Object.values(matrices).forEach(checkMatrix);
  assert.deepEqual(matrices.base,matrices.card);
  const rows=replayRows(spec,matrices);
  if(!formats) {
    applyRoundEvidence(spec,rows,matrices);
    const groups={};
    for(const name of ['region','combined']) {
      let enabled=0,changed=0;
      for(const row of rows) {
        const a=event.teams.findIndex(t=>t.name===row.a),b=event.teams.findIndex(t=>t.name===row.b);
        const d=PickLab.duel(event.id,strategies[name],a,b);
        const evidence=row.bestOf===1?d.regionBO1:d.regionBO3;
        assert.ok(evidence);
        enabled+=Number(evidence.active);
        changed+=Number(Math.abs(evidence.probability-evidence.base)>1e-9);
        closeTo(row[name],row.bestOf===1?d.bo1:d.bo3,1e-10);
      }
      groups[name]={enabled,changed,matches:rows.length,persistentState:!!matrices[name].state};
    }
    notes.regionCoverage=groups;
  }
  const replay=CS.replay(rounds);
  assert.ok(replay.ok&&replay.matched===33);
  const original=(formats?historical.later:historical.opening).stages.find(s=>s.id===id).models.v4;
  const models=Object.fromEntries(names.map(m=>[m,scored(rows,m)]));
  if(!formats) for(const m of names) models[m].afterPriorRounds=scored(rows,'live_'+m);
  const detail={id,teams:event.teams.map(t=>t.name),actual:replay.actual,matches:rows,cards:{}};
  const hitsBySeed=Object.fromEntries(names.map(m=>[m,[]]));
  const allBO3=!!formats && formats.flat().every(f=>f===3);
  const seedList=formats?[productionSeed]:seeds;
  for(const g of groupMatrices(matrices)) {
    const odds=allBO3?{bo1:g.matrix.bo3,bo3:g.matrix.bo3}:g.matrix;
    for(const seed of seedList) {
      const sim=PickLab.simulateMatrices(odds,{robustCard:g.robust},budget,seed);
      assert.equal(sim.searchN,12000);assert.equal(sim.evalN,12000);
      const tail=(seed===productionSeed && !formats)?rankedTail(sim,event,replay.actual):null;
      for(const m of g.names) {
        const assignments=chosen(sim,!!strategies[m].robustCard);
        const card=cardScore(assignments,replay.actual);
        hitsBySeed[m].push(card.hits);
        if(seed!==productionSeed) continue;
        models[m].card=card;
        if(tail) models[m].tail=tail.ranking;
        detail.cards[m]={assignments,expectedAssignments:sim.expectedCard,passAssignments:sim.passCard||sim.card,
          matrixSha256:matrixHash(odds),modelPass:rounded(sim.score(assignments).pass)};
        if(tail) detail.cards[m].teams=tail.members;
        if(strategies[m].robustCard) detail.cards[m].gate=sim.robust;
      }
    }
  }
  for(const metric of ['brier','logLoss']) closeTo(models.base.all[metric],original[metric]);
  assert.equal(models.base.all.correct,original.correct);
  assert.deepEqual(models.base.card.bucketHits,original.card.byBucket);
  if(!formats) assert.deepEqual(hitsBySeed.base,original.hitsBySeed);
  if(!formats && !notes.addedSeries) assert.deepEqual(matrices.base,matrices.close);
  // Persist per-team probabilities and gate inputs apart from the lightweight UI report.
  detail.hitsBySeed=hitsBySeed;
  return {stage:{id,label:formats?id:event.label,...notes,models},detail};
}

function totals(results,names) {
  const totals={};
  const allRows=results.flatMap(r=>r.detail.matches);
  for(const m of names) {
    const metrics=scored(allRows,m),models=results.map(r=>r.stage.models[m]);
    metrics.card={hits:sum(models.map(x=>x.card.hits)),passes:models.filter(x=>x.card.passed).length,
      bucketHits:[0,1,2].map(k=>sum(models.map(x=>x.card.bucketHits[k])))};
    if(models.every(x=>x.tail)) {
      metrics.afterPriorRounds=scored(allRows,'live_'+m);
      metrics.tail=Object.fromEntries(['top2','top4','top6','seedBottom2'].map(
        k=>[k,sum(models.map(x=>x.tail[k]))]));
      metrics.tailQuality=tailQuality(results.map(r=>r.detail),m);
      const scores=results.map(r=>r.detail.hitsBySeed[m]);
      const base=results.map(r=>r.detail.hitsBySeed.base);
      const hits=seeds.map((_,i)=>sum(scores.map(s=>s[i])));
      const passes=seeds.map((_,i)=>scores.filter(s=>s[i]>=5).length);
      const delta=passes.map((p,i)=>p-base.filter(s=>s[i]>=5).length);
      metrics.stability={meanHits:rounded(sum(hits)/seeds.length),meanPasses:rounded(sum(passes)/seeds.length),
        improved:delta.filter(d=>d>0).length,unchanged:delta.filter(d=>d===0).length,
        worse:delta.filter(d=>d<0).length};
    }
    totals[m]=metrics;
  }
  return totals;
}

async function run() {
  const ids=[...fields.map(e=>e.id),...Object.keys(laterStages).sort((a,b)=>laterStages[a].start.localeCompare(laterStages[b].start))];
  assert.equal(fields.length,5);assert.equal(ids.length,11);
  const queue=ids.slice(),all=new Map();
  async function next() {
    while(queue.length) {
      const id=queue.shift();
      const result=await new Promise((resolve,reject)=>{
        const worker=new Worker(__filename,{workerData:id});
        worker.once('message',resolve);worker.once('error',reject);
        worker.once('exit',code=>{if(code) reject(Error(id+' exited '+code));});
      });
      all.set(id,result);
    }
  }
  await Promise.all(Array.from({length:4},next));
  const primary=ids.slice(0,5).map(id=>all.get(id)),later=ids.slice(5).map(id=>all.get(id));
  const report={seed:productionSeed,simulationCount:budget,selectionPaths:budget/2,evaluationPaths:budget/2,
    gatePathsWhenCandidatesDiffer:budget/2,sensitivitySeeds:seeds,stageCount:primary.length,labels,
    stages:primary.map(r=>r.stage),totals:totals(primary,Object.keys(strategies)),
    cardTransfer:{stageCount:later.length,stages:later.map(r=>r.stage),totals:totals(later,['base','card'])}};
  assert.equal(report.totals.base.all.n,165);assert.equal(report.cardTransfer.totals.card.all.n,198);
  const details={strategies,seeds,stages:ids.map(id=>all.get(id).detail)};
  for(const [file,obj] of [['report.json',report],['diagnostics.json',details]]) {
    const data=asJSON(obj),target=sourceFile(file);
    if(process.argv.includes('--check')) assert.equal(fs.readFileSync(target,'utf8'),data);
    else {fs.writeFileSync(target+'.tmp',data);fs.renameSync(target+'.tmp',target);}
  }
  console.log(JSON.stringify({opening:report.totals,late:report.cardTransfer.totals}));
}
if(isMainThread) run().catch(e=>{console.error(e);process.exitCode=1;});
else parentPort.postMessage(evaluate(workerData));
