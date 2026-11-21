'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {roster}=require('../stage_transfer/evaluate.cjs');
const {budget,seeds}=require('../strategy_v4_eval/settings.cjs');
const swiss=require('../epl_transfer/swiss.cjs'),esl=require('../stage1_holdout/evaluate.cjs');
const {residual,shift,adjustBO3}=require('./model.cjs');
const majors=['austin-2025-3','budapest-2025-3','cologne-2026-3'];
const methods=['base','series','mapScore','roundShare'];
const sum=x=>x.reduce((a,b)=>a+b,0), rounded=v=>Number(v.toFixed(9));
const shared=(a,b)=>a.filter(x=>b.includes(x)).length;
function match(five,field){
  const matches=field.map((t,i)=>({i,n:shared(five,t)})).filter(x=>x.n>=3).sort((a,b)=>b.n-a.n);
  assert(matches.length<2||matches[0].n>matches[1].n);
  return matches[0]??null;
}
function fit(target,donor,expected){
  assert.equal(target.id,donor.id);assert.equal(target.start,donor.start);assert(donor.stage2End<target.start);
  const cores=target.teams.map(t=>roster(t.roster)),obs=cores.map(()=>[]),games=[];
  const seen=new Set();
  for(const g of donor.series){
    assert(!seen.has(g.id));seen.add(g.id);
    assert(donor.stage2Start<=g.day && g.day<=donor.stage2End && g.day<target.start);
    const fives=[g.fiveA,g.fiveB].map(roster),owners=fives.map(x=>match(x,cores));
    assert(!owners[0]||!owners[1]||owners[0].i!==owners[1].i);
    const prior=expected(g,fives);
    if(!prior || !g.score){
      games.push({id:g.id,day:g.day,reason:prior?'no-played-score':'no-prior'});continue;
    }
    const {p,ref}=prior,y=Number(g.score[0]>g.score[1]),raw=residual(p,g.bo,y,g.score,g.maps);
    for(const [i,o] of owners.entries())if(o){
      obs[o.i].push({id:g.id,p:i?1-p:p,y:i?1-y:y,
        mapResidual:(i?-1:1)*raw.mapResidual,roundResidual:(i?-1:1)*raw.roundResidual});
    }
    games.push({id:g.id,day:g.day,bo:g.bo,a:g.a,b:g.b,p,y,probabilitySource:ref,score:g.score,
      mapCount:g.maps?.length??0,overtimeMaps:g.maps?.filter(([,a,b])=>Math.max(a,b)>13).length??0,
      inherited:owners.map(o=>o?{team:target.teams[o.i].name,overlap:o.n}:null),...raw});
  }
  assert.equal(games.length,33);
  const effects={base:cores.map(()=>0),series:obs.map(x=>shift(x)),mapScore:obs.map(x=>shift(x,'mapResidual')),
    roundShare:obs.map(x=>shift(x,'roundResidual'))};
  const matrices=Object.fromEntries(methods.map(k=>[k,k==='base'?target.matrix:adjustBO3(target.matrix,effects[k])]));
  for(const k of methods)assert.strictEqual(target.matrix.bo1,matrices[k].bo1);
  return {games,obs,effects,matrices};
}
function replayEsl(target,truth){
  const state={wins:new Uint8Array(16),losses:new Uint8Array(16),met:new Uint16Array(16),ratings:target.liveRatings.slice()};
  const administrative=new Set((truth.administrativeMatchIds??[]).map(String));
  const all=[],matches=[],key=(a,b)=>Math.min(a,b)*16+Math.max(a,b);
  assert.deepEqual(truth.rounds.map(r=>r.length),[8,8,8,6,3]);
  if(administrative.size)assert(truth.matchIds);
  for(const [r,rr] of truth.rounds.entries()){
    assert.deepEqual(swiss.pairs(state,r).map(p=>key(...p)).sort((a,b)=>a-b),
      rr.map(([a,b])=>key(a,b)).sort((a,b)=>a-b),target.id+' R'+(r+1));
    for(const [i,[w,l,loserMaps]] of rr.entries()){
      const matchId=truth.matchIds?.[r][i]??(r+1)+'-'+(i+1);
      const admin=administrative.has(String(matchId));
      const ratings=admin && truth.administrativeRatingPolicy==='no-change'?state.ratings.slice():null;
      swiss.result(state,w,l,loserMaps);
      if(ratings)state.ratings=ratings;
      const g={w,l,bo:3,id:matchId,administrative:admin};
      all.push(g);if(!admin)matches.push(g);
    }
  }
  assert.equal(all.length,33);assert.equal(all.length-matches.length,administrative.size);
  return {actual:target.entrants.map((_,i)=>swiss.category(state,i)),matches,verifiedCount:all.length,excluded:all.filter(g=>g.administrative)};
}
function majorContext(id){
  const e=PickLab.allEvents.find(e=>e.id===id),prev=PickLab.allEvents.find(p=>p.parent===e.parent && p.stage===2);
  const matrix=x=>PickLab.seriesMatrices(x,{...PickMethods.defaults('recommended',x),stageTraining:false});
  const entrants=e.teams.map(t=>t.name),direct=[0,1,2,3,4,5,6,7];
  const target={id,teams:e.teams,entrants,direct,matrix:matrix(e),start:e.date};
  const prior=matrix(prev),cores=prev.teams.map(t=>roster(t.roster));
  const wls=new Set(prev.rounds.flat().map(([w,l])=>w+':'+l));
  const expected=(g,fives)=>{
    const [a,b]=fives.map(x=>match(x,cores)?.i);assert(Number.isInteger(a)&&Number.isInteger(b)&&a!==b);
    const y=g.score[0]>g.score[1], pair=y?a+':'+b:b+':'+a;
    assert(wls.delete(pair),id+' '+g.id+' donor result');
    return {p:prior['bo'+g.bo][a][b],ref:prev.id+' frozen v4'};
  };
  const getTruth=()=>{
    const r=CS.replay(e.rounds);assert(r.ok && r.matched===33);
    const matches=e.rounds.flatMap((rr,i)=>rr.map(([w,l],j)=>({w,l,bo:e.formats[i][j],id:(i+1)+'-'+(j+1)})));
    return {actual:r.actual,matches,verifiedCount:33,excluded:[]};
  };
  return {target,expected,getTruth};
}
function evaluate(target,priorStage,expected,getTruth,external){
  const {games,obs,effects,matrices}=fit(target,priorStage,expected);
  const names=target.teams.map(t=>t.name);
  const forecasts={};
  for(const k of methods){
    forecasts[k]=seeds.map(seed=>{
      if(external) {
        const f=esl.predict(matrices[k].bo3,target.liveRatings,seed,budget/2);
        return {seed,card:f.card,simulatedPass:f.auditPasses/(budget/2)};
      }
      const f=CS.run(matrices[k],budget,seed,[],{seedConditionalCard:true});
      return {seed,card:f.card,simulatedPass:f.pass};
    });
  }
  const truth=getTruth(),records={};
  for(const k of methods){
    const rows=forecasts[k].map(f=>{
      const bySlot=[0,1,2].map(c=>f.card.filter((v,i)=>v===c&&truth.actual[i]===c).length);
      const hits=CS.actualScore(f.card,truth.actual);assert.equal(sum(bySlot),hits);
      return {...f,hits,bySlot};
    });
    const errors={};
    for(const bo of [1,3]){
      const p=truth.matches.filter(g=>g.bo===bo).map(g=>matrices[k]['bo'+bo][g.w][g.l]);
      const squares=sum(p.map(v=>(1-v)**2)),nll=sum(p.map(v=>-Math.log(v)));
      errors['bo'+bo]={n:p.length,squares,nll,brier:p.length?rounded(squares/p.length):null,logLoss:p.length?rounded(nll/p.length):null};
    }
    records[k]={rows,errors};
  }
  const pairs=[];
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++)
    pairs.push({a:names[i],b:names[j],bo1:rounded(target.matrix.bo1[i][j]),
      bo3:Object.fromEntries(methods.map(k=>[k,rounded(matrices[k].bo3[i][j])]))});
  const matches=truth.matches.map(g=>({...g,winner:names[g.w],loser:names[g.l],winProbability:
    Object.fromEntries(methods.map(k=>[k,rounded(matrices[k]['bo'+g.bo][g.w][g.l])]))}));
  const teams=names.map((name,i)=>({name,donorSeries:obs[i].map(g=>g.id),offsets:Object.fromEntries(methods.map(k=>[k,effects[k][i]]))}));
  for(const k of methods.slice(1))assert.deepEqual(records.base.errors.bo1,records[k].errors.bo1);
  return {id:target.id,start:target.start,donorStart:priorStage.stage2Start,donorEnd:priorStage.stage2End,
    external,teams,actual:truth.actual,verifiedMatchups:truth.verifiedCount,administrativeExcluded:truth.excluded,
    probabilities:pairs,donorRows:games,matches,records};
}
function evaluateMajor(id){
  const data=require('./major-inputs.json').fields[id];
  const {target,expected,getTruth}=majorContext(id);
  const out=evaluate(target,data,expected,getTruth,false);
  const old=require('../final_ratings/bo3-report.json').stages.find(s=>s.id===id);
  for(const [a,b] of [['base','base'],['series','priorStageBO3Only']]){
    assert.deepEqual(out.records[a].rows.map(r=>r.hits),old.alternatives[b].hits,id+' old scores '+a);
    assert.deepEqual(out.records[a].rows[0].card,old.alternatives[b].card);
    for(const bo of [1,3]){
      const before=old.alternatives[b].series[String(bo)];
      assert.equal(before.n,out.records[a].errors['bo'+bo].n);
      assert(Math.abs(before.brierSum-out.records[a].errors['bo'+bo].squares)<1e-8);
    }
  }
  const archive=require('../final_ratings/inputs.json').find(s=>s.id===id);
  out.teams.forEach((t,i)=>assert(Math.abs(t.offsets.series-archive.teams[i].delta)<2e-9,id+t.name));
  return out;
}
function externalContext(target,priorStage,truth) {
  assert.deepEqual(target.teams.map(t=>t.name),target.entrants);
  assert.equal(target.teams.length,16);assert.equal(target.liveRatings.length,16);
  const points=target.teams.map(t=>t.points);
  assert(points.every(p=>Number.isFinite(p)&&p>0));
  const m=points.map(a=>points.map(b=>1/(1+10**((b-a)/400))));
  const field={...target,matrix:{allBo3:true,bo1:m,bo3:m}};
  const expected=g=>{
    const useStage=Number.isFinite(g.stageStartPointsA)&&Number.isFinite(g.stageStartPointsB);
    const [a,b,d]=useStage?[g.stageStartPointsA,g.stageStartPointsB,g.stageStartRankDay]:
      [g.pointsA,g.pointsB,g.rankDay];
    if(!Number.isFinite(a)||!Number.isFinite(b))return null;
    assert(d<g.day && (!useStage||d<priorStage.stage2Start));assert.equal(g.bo,3);
    return {p:1/(1+10**((b-a)/400)),ref:'VRS '+d};
  };
  return {target:field,expected,getTruth:()=>replayEsl(target,truth)};
}
function evaluateExternal(target,priorStage,truth){
  const context=externalContext(target,priorStage,truth);
  return evaluate(context.target,priorStage,context.expected,context.getTruth,true);
}
function allocationInputs(id){
  let context,donor;
  const external=!majors.includes(id);
  if(!external){
    donor=require('./major-inputs.json').fields[id];
    context=majorContext(id);
  }else if(id==='epl23-stage2'){
    const field=require('../epl_transfer/field.json');
    const target={...field,teams:require('../epl_transfer/rosters.json').teams};
    donor=require('./epl-inputs.json').fields[id];
    context=externalContext(target,donor,require('../epl_transfer/actual.json'));
  }else{
    assert.equal(id,'epl22-stage2');
    const {target,priorStage}=require('./epl22-inputs.json');
    donor=priorStage;
    context=externalContext(target,donor,require('./epl22-results.json'));
  }
  const {target,expected,getTruth}=context;
  const {matrices}=fit(target,donor,expected);
  const qualified=target.entrants.map((_,i)=>i).filter(i=>!target.direct.includes(i));
  assert.equal(target.direct.length,8);assert.equal(qualified.length,8);
  return {id,external,target:{...target,qualified},matrices,actual:getTruth().actual,seeds,budget};
}
function eplSamples(matrix,ratings,count,seed){
  return esl.samples((matrix.bo3??matrix).map(row=>row.map(esl.scoreThresholds)),ratings,count,seed);
}
function evaluateS23(){
  const field=require('../epl_transfer/field.json');
  const target={...field,teams:require('../epl_transfer/rosters.json').teams};
  const out=evaluateExternal(target,require('./epl-inputs.json').fields[field.id],require('../epl_transfer/actual.json'));
  const old=require('../epl_transfer/report.json').rows;
  assert.deepEqual(out.records.base.rows.map(r=>r.hits),old.map(r=>r.original.actualHits));
  assert.deepEqual(out.records.base.rows[0].card,old[0].original.card);
  return out;
}
function evaluateS22(){
  const {target,priorStage}=require('./epl22-inputs.json');
  const truth=require('./epl22-results.json');
  const out=evaluateExternal(target,priorStage,truth);
  assert.equal(out.verifiedMatchups,33);assert.equal(out.matches.length,32);
  assert.deepEqual(out.administrativeExcluded.map(x=>Number(x.id)),[2385936]);
  return out;
}
function summarize(stages){
  const output={};
  for(const k of methods){
    const hits=seeds.map((_,i)=>sum(stages.map(s=>s.records[k].rows[i].hits)));
    const passes=seeds.map((_,i)=>stages.filter(s=>s.records[k].rows[i].hits>=5).length);
    const errors={};
    for(const bo of ['bo1','bo3']){
      const rows=stages.map(s=>s.records[k].errors[bo]),n=sum(rows.map(r=>r.n));
      errors[bo]={n,brier:n?rounded(sum(rows.map(r=>r.squares))/n):null,logLoss:n?rounded(sum(rows.map(r=>r.nll))/n):null};
    }
    function compare(a,b){return {better:a.filter((v,i)=>v>b[i]).length,tied:a.filter((v,i)=>v===b[i]).length,worse:a.filter((v,i)=>v<b[i]).length};}
    output[k]={fixedByStage:stages.map(s=>s.records[k].rows[0].hits),fixedHits:hits[0],fixedPasses:passes[0],
      fixedSlots:[0,1,2].map(c=>sum(stages.map(s=>s.records[k].rows[0].bySlot[c]))),
      meanHits:rounded(sum(hits)/seeds.length),meanPasses:rounded(sum(passes)/seeds.length),hits,passes,errors};
    if(k!=='base')output[k].pairedVsBase={hits:compare(hits,output.base.hits),passes:compare(passes,output.base.passes)};
    if(k==='mapScore'||k==='roundShare')output[k].pairedVsSeries={hits:compare(hits,output.series.hits),passes:compare(passes,output.series.passes)};
    if(k==='roundShare')output[k].pairedVsMapScore={hits:compare(hits,output.mapScore.hits),passes:compare(passes,output.mapScore.passes)};
  }
  return output;
}
function run(id){return majors.includes(id)?evaluateMajor(id):id==='epl22-stage2'?evaluateS22():evaluateS23();}
async function main(){
  const stages=await Promise.all([...majors,'epl23-stage2','epl22-stage2'].map(id=>new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:id});
    worker.once('message',resolve);worker.once('error',reject);worker.once('exit',c=>{if(c)reject(Error('Round-model worker exit '+c));});
  })));
  const report={asOf:'2026-11-21',seeds,searchN:budget/2,auditN:budget/2,stages};
  const summary={major:summarize(stages.filter(s=>!s.external)),s23:summarize(stages.filter(s=>s.id==='epl23-stage2')),
    s22:summarize(stages.filter(s=>s.id==='epl22-stage2')),
    byStage:Object.fromEntries(stages.map(s=>[s.id,summarize([s])])),
    coverage:Object.fromEntries(stages.map(s=>[s.id,{start:s.start,donorStart:s.donorStart,donorEnd:s.donorEnd,
      donorMatches:s.donorRows.length,withPrior:s.donorRows.filter(g=>Number.isFinite(g.p)).length,
      playedMaps:sum(s.donorRows.map(g=>g.mapCount??0)),overtimeMaps:sum(s.donorRows.map(g=>g.overtimeMaps??0)),
      eligibleTeams:s.teams.filter(t=>t.donorSeries.length).length,verifiedMatches:s.verifiedMatchups,
      administrativeExcluded:s.administrativeExcluded}]))};
  for(const [file,data] of Object.entries({'report.json':report,'summary.json':summary})){
    const dest=path.join(__dirname,file);
    if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(dest)),data,file);
    else fs.writeFileSync(dest,JSON.stringify(data,null,2)+'\n');
  }
  console.log(Object.fromEntries(methods.map(k=>[k,[summary.major[k].fixedByStage,summary.major[k].errors.bo3,summary.s23[k].fixedHits]])));
}
module.exports={evaluateExternal,replayEsl,summarize,evaluateMajor,allocationInputs,eplSamples};
if(require.main===module){
  if(!isMainThread)parentPort.postMessage(run(workerData));
  else main().catch(e=>{console.error(e);process.exitCode=1;});
}
