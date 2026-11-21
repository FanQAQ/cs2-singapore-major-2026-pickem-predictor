'use strict';
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {fieldFor}=require('../stage_transfer/evaluate.cjs');
const esl=require('../stage1_holdout/evaluate.cjs');
const {budget,seeds}=require('../strategy_v4_eval/settings.cjs');
require('../map_model/model.js');
const ids=['austin-2025-3','budapest-2025-3','cologne-2026-3','epl23-stage2'];
const methods=['base','veto','appearance'];
const triples=[];
for(let a=0;a<5;a++)for(let b=a+1;b<6;b++)for(let c=b+1;c<7;c++)triples.push([a,b,c]);
const sum=xs=>xs.reduce((a,b)=>a+b,0), round=x=>Number(x.toFixed(8));

function appearanceForecast(profile,i,j,p) {
  const {pool,teams:strengths}=profile.mapStrength;
  const [a,b]=[i,j].map(k=>profile.teams[k]);
  const off=pool.map(m=>{
    const sa=strengths[a].maps[m], sb=strengths[b].maps[m];
    return sa.n && sb.n ? Math.min(.7,Math.max(-.7,sa.logitOffset-sb.logitOffset)) : 0;
  });
  const counts=[a,b].map(t=>pool.map(m=>profile.appearances[t][m]));
  const status=counts.every(x=>sum(x)>0)?'both':counts.some(x=>sum(x)>0)?'one':'no-appearance';
  if(!off.some(x=>x!==0) || status==='no-appearance')return {p,status};
  const weight=pool.map((_,k)=>Math.sqrt((1+counts[0][k])*(1+counts[1][k])));
  const masses=triples.map(([a,b,c])=>weight[a]*weight[b]*weight[c]);
  const total=sum(masses);
  const probabilities=intercept=>{
    const probs=off.map(x=>1/(1+Math.exp(-(intercept+x))));
    return triples.map(([a,b,c])=>{
      const [x,y,z]=[probs[a],probs[b],probs[c]];return x*y+(x+y-2*x*y)*z;
    });
  };
  let low=-44,high=44;
  for(let n=0;n<46;n++){
    const mid=(low+high)/2;
    if(sum(probabilities(mid))/35<p)low=mid;else high=mid;
  }
  const probs=probabilities((low+high)/2);
  assert(Math.abs(sum(probs)/35-p)<1e-10);
  const prob=sum(probs.map((x,k)=>x*masses[k]/total));
  return {p:Math.abs(prob-p)>1e-11?prob:p,status};
}

function info(id) {
  if(id==='epl23-stage2') {
    const field=require('../epl_transfer/field.json'), roster=require('../epl_transfer/rosters.json').teams;
    assert.deepEqual(roster.map(t=>t.name),field.entrants);
    const m=roster.map(a=>roster.map(b=>1/(1+10**((b.points-a.points)/400))));
    return {id,teams:field.entrants,start:field.start,matrix:{bo1:m,bo3:m,allBo3:true},ratings:field.liveRatings,external:true};
  }
  const event=PickLab.allEvents.find(e=>e.id===id);
  const flags=PickMethods.defaults('recommended',event);
  assert(!flags.mapVeto && !flags.stageTraining);
  return {id,start:event.date.slice(0,10),teams:event.teams.map(t=>t.name),matrix:PickLab.seriesMatrices(event,flags),external:false};
}
function fit(field,profile) {
  assert.equal(field.id,profile.id);assert.equal(field.start,profile.start);
  assert.deepEqual(field.teams,profile.teams);
  assert(profile.asOf<field.start);
  const event={...profile,mapVeto:{...profile.mapVeto,lastBansAB:field.external},
    teams:field.teams.map(name=>({name}))};
  const matrices={base:field.matrix};
  for(const key of methods.slice(1))matrices[key]={...field.matrix,bo3:field.matrix.bo3.map(row=>row.slice())};
  const pairs=[];
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++) {
    const p=field.matrix.bo3[i][j];
    const v=PickMap.apply(event,i,j,3,p), a=appearanceForecast(profile,i,j,p);
    for(const [k,probability] of [['veto',v.probability],['appearance',a.p]]){
      assert(probability>0 && probability<1);
      matrices[k].bo3[i][j]=probability;matrices[k].bo3[j][i]=1-probability;
    }
    pairs.push({i,j,base:round(p),veto:round(v.probability),appearance:round(a.p),
      sharedMaps:v.sharedMaps,vetoStatus:v.status,appearanceStatus:a.status});
  }
  assert.equal(pairs.length,120);
  assert.strictEqual(matrices.base.bo1,matrices.veto.bo1);assert.strictEqual(matrices.base.bo1,matrices.appearance.bo1);
  return {matrices,pairs,coverage:{strengthTeams:Object.values(profile.mapStrength.teams).filter(t=>t.n).length,
    vetoTeams:Object.values(profile.mapVeto.teams).filter(t=>t.bo3.n).length,
    proxyTeams:Object.values(profile.appearances).filter(r=>sum(Object.values(r))>0).length,
    pairsWithChangedBO3:Object.fromEntries(methods.slice(1).map(k=>[k,pairs.filter(p=>p.base!==p[k]).length])),
    teamsRepeatedOpponent:Object.values(profile.coverage).filter(t=>t.seriesWithRepeatOpponent>0).length}};
}
function realized(field) {
  if(field.external) {
    const data=esl.replay(require('../epl_transfer/field.json'),require('../epl_transfer/actual.json'));
    return {actual:data.actual,matches:data.matches.map(({w,l,round})=>({w,l,round,bo:3}))};
  }
  const e=PickLab.allEvents.find(x=>x.id===field.id), historic=fieldFor(e);
  const replay=CS.replay(e.rounds);
  assert(replay.ok && replay.matched===33);
  const matches=historic.records.map(g=>({w:g.y?g.a:g.b,l:g.y?g.b:g.a,bo:g.bo,id:g.id}));
  assert.equal(matches.length,33);
  return {actual:replay.actual,matches};
}
function predict(field,matrix,seed) {
  if(field.external) {
    const p=esl.predict(matrix.bo3,field.ratings,seed,budget/2);
    return {seed,card:p.card,pass:p.auditPasses/(budget/2)};
  }
  const p=CS.run(matrix,budget,seed,[],{seedConditionalCard:true});
  return {seed,card:p.card,pass:p.pass};
}
function evaluate(id,profiles) {
  const field=info(id), {matrices,pairs,coverage}=fit(field,profiles[id]);
  const events={};
  for(const k of methods) events[k]=seeds.map(s=>predict(field,matrices[k],s));
  const {actual,matches}=realized(field), results={};
  for(const k of methods){
    const matrix=matrices[k];
    const forecast=events[k];
    const rows=forecast.map(({seed,card,pass})=>{
      const bySlot=[0,1,2].map(c=>card.filter((v,i)=>v===c&&actual[i]===c).length);
      return {seed,hits:CS.actualScore(card,actual),bySlot,card,simulatedPass:pass};
    });
    const errors={};
    for(const bo of [1,3]){
      const games=matches.filter(g=>g.bo===bo);
      const p=games.map(g=>matrix['bo'+bo][g.w][g.l]);
      const squares=sum(p.map(v=>(1-v)**2)),nll=sum(p.map(v=>-Math.log(v)));
      errors['bo'+bo]={n:p.length,squares,nll,brier:p.length?round(squares/p.length):null,
        logLoss:p.length?round(nll/p.length):null,
        changed:games.filter(g=>Math.abs(matrix['bo'+bo][g.w][g.l]-matrices.base['bo'+bo][g.w][g.l])>1e-10).length};
    }
    results[k]={rows,errors};
  }
  for(const k of methods.slice(1))assert.deepEqual(results[k].errors.bo1,results.base.errors.bo1);
  const original=field.external?require('../epl_transfer/report.json').rows.map(x=>x.original.actualHits):
    require('../final_card/report.json').stages.find(s=>s.id===id).results.current.hits;
  assert.deepEqual(results.base.rows.map(r=>r.hits),original,id+' baseline');
  return {id,start:field.start,external:field.external,teams:field.teams,actual,coverage,pairs,results,
    matches:matches.map(g=>({...g,winProbability:Object.fromEntries(methods.map(k=>[k,round(matrices[k]['bo'+g.bo][g.w][g.l])]))}))};
}
function summarize(stages) {
  const reduced={};
  for(const k of methods){
    const hits=seeds.map((_,i)=>sum(stages.map(s=>s.results[k].rows[i].hits)));
    const passes=seeds.map((_,i)=>sum(stages.map(s=>Number(s.results[k].rows[i].hits>=5))));
    const errors={};
    for(const bo of ['bo1','bo3']){
      const series=stages.map(s=>s.results[k].errors[bo]),n=sum(series.map(s=>s.n));
      errors[bo]={n,brier:n?round(sum(series.map(s=>s.squares))/n):null,logLoss:n?round(sum(series.map(s=>s.nll))/n):null,
        changed:sum(series.map(s=>s.changed))};
    }
    const compare=(ours,base)=>({better:ours.filter((v,i)=>v>base[i]).length,equal:ours.filter((v,i)=>v===base[i]).length,
      worse:ours.filter((v,i)=>v<base[i]).length});
    reduced[k]={hits,passes,fixedHits:hits[0],fixedPasses:passes[0],meanHits:round(sum(hits)/30),meanPasses:round(sum(passes)/30),
      fixedByStage:stages.map(s=>s.results[k].rows[0].hits),bo1:errors.bo1,bo3:errors.bo3,
      fixedBySlot:[0,1,2].map(c=>sum(stages.map(s=>s.results[k].rows[0].bySlot[c])))};
    if(k!=='base')reduced[k].paired={hits:compare(hits,reduced.base.hits),passes:compare(passes,reduced.base.passes)};
  }
  return reduced;
}
function stageSummary(s) {
  const groups={};
  for(const k of methods) {
    const {rows,errors}=s.results[k], fixed=rows[0];
    groups[k]={fixedHits:fixed.hits,bySlot:fixed.bySlot,passed:fixed.hits>=5,
      card:[0,1,2].map(c=>s.teams.filter((_,i)=>fixed.card[i]===c)),
      fixedSimulatedPass:round(fixed.simulatedPass),passesAcrossSeeds:rows.filter(r=>r.hits>=5).length,
      bo3Brier:errors.bo3.brier,bo3LogLoss:errors.bo3.logLoss,changedBo3:errors.bo3.changed};
    if(k==='base')continue;
    const largest=(a,b)=>Math.abs(b.delta)-Math.abs(a.delta);
    groups[k].largestPotential=s.pairs.map(p=>({teams:[s.teams[p.i],s.teams[p.j]],base:p.base,
      adjusted:p[k],delta:round(p[k]-p.base)})).sort(largest)[0];
    groups[k].largestPlayed=s.matches.filter(g=>g.bo===3).map(g=>({winner:s.teams[g.w],loser:s.teams[g.l],
      base:g.winProbability.base,adjusted:g.winProbability[k],delta:round(g.winProbability[k]-g.winProbability.base)})).sort(largest)[0];
  }
  return {id:s.id,start:s.start,external:s.external,coverage:s.coverage,groups};
}
async function main() {
  const stages=await Promise.all(ids.map(id=>new Promise((resolve,reject)=>{
    const w=new Worker(__filename,{workerData:id});
    w.once('message',resolve);w.once('error',reject);w.once('exit',c=>{if(c)reject(Error('Map worker '+c));});
  })));
  const summary={asOf:'2026-11-21',major:summarize(stages.filter(s=>!s.external)),
    external:summarize(stages.filter(s=>s.external)),byStage:stages.map(stageSummary)};
  for(const [filename,data] of Object.entries({'report.json':{seeds,searchN:budget/2,evaluationN:budget/2,stages},'summary.json':summary})){
    const file=path.join(__dirname,filename),text=JSON.stringify(data,null,2)+'\n';
    if(process.argv.includes('--check'))assert.deepEqual(JSON.parse(fs.readFileSync(file)),data,filename);
    else fs.writeFileSync(file,text);
  }
  console.log(JSON.stringify(summary));
}
if(require.main===module) {
  if(!isMainThread) parentPort.postMessage(evaluate(workerData,require('./profiles.json')));
  else main().catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={appearanceForecast,fit,info,evaluate,summarize};
