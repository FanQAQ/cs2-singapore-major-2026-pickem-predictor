'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {info,fit}=require('../stage3_maps/evaluate.cjs');
const {budget,seeds}=require('../strategy_v4_eval/settings.cjs');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const id='cologne-2026-3', keys=['noVeto','old25','scheduleControl','added','agreementOnly'];
const sum=values=>values.reduce((a,b)=>a+b,0), round=v=>Number(v.toFixed(8));
const historical=require('../stage3_maps/report.json').stages;
const baseArchive=historical.find(s=>s.id===id);

function groups(){
  const input=require('./eval-profiles.json'),field=info(id);
  const frozen=require('../stage3_maps/profiles.json')[id];
  const withVeto=teams=>({...frozen,mapVeto:{...frozen.mapVeto,teams}});
  const fits={old25:fit(field,frozen),scheduleControl:fit(field,withVeto(input.oldFixedSchedule)),
    added:fit(field,withVeto(input.augmentedVeto)),agreementOnly:fit(field,withVeto(input.agreementOnlyVeto))};
  const matrices={noVeto:field.matrix,...Object.fromEntries(Object.entries(fits).map(([k,r])=>[k,r.matrices.veto]))};
  return {input,field,matrices,fits};
}
function simulate(key){
  const {field,matrices}=groups();
  return seeds.map(seed=>{
    const sim=CS.run(matrices[key],budget,seed,[],{seedConditionalCard:true});
    const actual=baseArchive.actual;
    const bySlot=[0,1,2].map(c=>sim.card.filter((t,i)=>t===c&&actual[i]===c).length);
    assert.equal(sum(bySlot),CS.actualScore(sim.card,actual));
    return {seed,card:sim.card,bySlot,hits:sum(bySlot),simulatedPass:sim.pass};
  });
}
function compare(a,b,field){
  const sign=a.map((r,i)=>Math.sign((field==='passes'?Number(r.hits>=5):r.hits)-
    (field==='passes'?Number(b[i].hits>=5):b[i].hits)));
  return {better:sign.filter(x=>x>0).length,tied:sign.filter(x=>x===0).length,worse:sign.filter(x=>x<0).length};
}
async function main(){
  const {input,field,matrices,fits}=groups(),games=baseArchive.matches;
  assert.equal(games.length,33);assert(games.every(m=>m.bo===3));
  const jobs=await Promise.all(keys.map(k=>new Promise((resolve,reject)=>{
    const w=new Worker(__filename,{workerData:k});
    w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error('Worker '+code));});
  })));
  const rows=Object.fromEntries(keys.map((k,i)=>[k,jobs[i]]));
  assert.deepEqual(rows.noVeto,baseArchive.results.base.rows);
  assert.deepEqual(rows.old25,baseArchive.results.veto.rows);
  const pairs=[];
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){
    const p=Object.fromEntries(keys.map(k=>[k,round(matrices[k].bo3[i][j])]));
    pairs.push({a:field.teams[i],b:field.teams[j],...p});
  }
  const matches=games.map(g=>({winner:field.teams[g.w],loser:field.teams[g.l],id:g.id,
    ...Object.fromEntries(keys.map(k=>[k,round(matrices[k].bo3[g.w][g.l])]))}));
  const summary={};
  const otherScores=historical.filter(s=>!s.external&&s.id!==id).map(s=>s.results.base.rows[0].hits);
  assert.equal(otherScores.length,2);
  for(const k of keys){
    const data=rows[k],first=data[0], p=games.map(g=>matrices[k].bo3[g.w][g.l]);
    const top=arr=>[...arr].sort((a,b)=>Math.abs(b[k]-b.old25)-Math.abs(a[k]-a.old25))[0];
    const formatRows=input.audit.filter(r=>r.bo===3&&r.complete);
    summary[k]={fixedHits:first.hits,bySlot:first.bySlot,fixedPass:first.hits>=5,
      fixedCard:[0,1,2].map(c=>field.teams.filter((_,i)=>first.card[i]===c)),
      majorCombined:{passes:otherScores.filter(x=>x>=5).length+Number(first.hits>=5),hits:sum(otherScores)+first.hits},
      passesAcrossSeeds:data.filter(r=>r.hits>=5).length,meanActualHits:round(sum(data.map(r=>r.hits))/30),
      fixedSimulatedPass:round(first.simulatedPass),bo1:{n:0,brier:null,logLoss:null},
      bo3:{n:33,brier:round(sum(p.map(v=>(1-v)**2))/33),logLoss:round(sum(p.map(v=>-Math.log(v)))/33)},
      vetoTeams:k==='noVeto'?0:fits[k].coverage.vetoTeams,
      changedPossibleVsOld:pairs.filter(v=>v[k]!==v.old25).length,
      changedActualVsOld:matches.filter(v=>v[k]!==v.old25).length,
      pairedVsOld:{hits:compare(data,rows.old25,'hits'),passes:compare(data,rows.old25,'passes')}};
    if(k==='added'){
      summary[k].pairedVsControl={hits:compare(data,rows.scheduleControl,'hits'),passes:compare(data,rows.scheduleControl,'passes')};
      summary[k].largestPotential=top(pairs);
      summary[k].largestPlayed=top(matches);
      summary[k].stage2SourcedSeries=formatRows.length;
    }
  }
  const audit={};
  for(const bo of [1,3]){
    const data=input.audit.filter(row=>row.bo===bo);
    audit['bo'+bo]={total:data.length,verified:data.filter(r=>r.complete).length,
      targetCores:data.filter(r=>r.complete && r.stage3Cores.length).length,
      noMajorCore:data.filter(r=>r.complete && !r.stage3Cores.length).length,
      matchedOldMaps:data.filter(r=>r.fieldMapSeries).length,
      bothVrsChecked:data.filter(r=>r.rankChecks.every(s=>s.overlap>=3)).length,
      missing:data.filter(r=>!r.complete).map(r=>({id:r.hltvId,reason:r.reason}))};
  }
  const report={asOf:'2026-11-21',id,start:field.start,oldVetoBO3:25,additionalEligibleBO3:input.additionalEligibleBO3,
    additionalTeamVotes:input.additionalTeamVotes,qualifiedVetoSeriesWithTargetCore:25+input.additionalEligibleBO3,
    agreementEligibleBO3:input.agreementEligibleBO3,
    uniqueSourceVerifiedBO3:25+audit.bo3.verified,
    sourceCoverage:audit,targetMatches:33,unchangedMapRows:input.frozenMapCount,
    pairsCompared:120,trainingPaths:budget/2,auditPaths:budget/2,seeds,summary,matches,pairs,rows};
  const file=path.join(__dirname,'eval-report.json');
  if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(file)),report);
  else fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({audit,summary}));
}
if(require.main===module){
  if(!isMainThread)parentPort.postMessage(simulate(workerData));
  else main().catch(e=>{console.error(e);process.exitCode=1;});
}
