'use strict';
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {getField,matrices,truth,errors,cardScore}=require('../evaluate.cjs');
const {freeze}=require('../format_split/astana/lock.cjs');
const {seeds}=require('../../strategy_v4_eval/settings.cjs');
const {samples}=require('../../ml_allocation/draw.cjs');
require('../../robust_card/robust.js');
const source=require('../report.json');
const result={},summary={};
for(const ref of source.fields.filter(x=>x.id!=='cluj-2026')){
  const f=getField(ref.id),e=PickLab.allEvents.find(x=>x.id===f.id);
  const {baseline,elo,ml,blend}=matrices(f,['baseline','elo','ml','blend']);
  const tree=PickLab.seriesMatrices(e,PickMethods.defaults('tree',e));
  const matrix={allBo3:!!f.allBo3};
  for(const k of ['bo1','bo3']){
    matrix[k]=baseline[k].map((row,i)=>row.map((p,j)=>(p+tree[k][i][j]+elo[k][i][j]+ml[k][i][j])/4));
    matrix[k].forEach((row,i)=>row.forEach((p,j)=>assert(p>0 && p<1 && Math.abs(1-p-matrix[k][j][i])<1e-8)));
  }
  const sim=CS.run(matrix,24000,seeds[0],[],{seedConditionalCard:true});
  const hash=createHash('sha256').update(JSON.stringify(matrix)).digest('hex');
  const row=result[f.id]={start:f.start,teams:f.teams.map(t=>t.name),matrixSHA256:hash,card:sim.card};
  if(!ref.actual){assert.equal(f.id,'singapore');row.matrix=matrix;continue;}
  const verified=truth(f.id,row.teams);
  assert.deepEqual(verified.actual,ref.actual);
  const grade=card=>cardScore(card,verified.actual).hits;
  const standard={...sim,card:sim.basePassCard,passCard:sim.basePassCard};
  row.scores={conditional:grade(sim.card),pass:grade(sim.basePassCard),expected:grade(sim.expectedCard),
    robust:grade(PickRobust.apply(standard,matrix,seeds[0]).card),seed:grade([0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2])};
  const group=summary[f.stage]??={fields:[],accuracy:{},passed:{},hits:{}};
  group.fields.push(f.id);
  const models={original:baseline,hybrid:blend,fourWay:matrix};
  for(const [name,m] of Object.entries(models)){
    const main=name==='fourWay'?row.scores.conditional:ref.methods[name==='original'?'baseline':'blend'].fixed.hits;
    group.passed[name]=(group.passed[name]??0)+Number(main>=5);
    group.hits[name]=(group.hits[name]??0)+main;
    const formats=group.accuracy[name]??={bo1:[],bo3:[]};
    for(const {w,l,bo} of verified.matches) formats['bo'+bo].push(m['bo'+bo][w][l]);
    (row.pilot??={})[name]=seeds.slice(0,3).map(s=>grade(CS.cardsFromSamples(samples(f,m,2000,s,'major'),true).card));
  }
}
for(const g of Object.values(summary)){
  for(const p of Object.values(g.accuracy))for(const key of ['bo1','bo3'])p[key]=errors(p[key]);
}
freeze('report.json',{weights:[0.25,0.25,0.25,0.25],summary,fields:result},__dirname);
console.log(Object.fromEntries(Object.entries(summary).map(([k,x])=>[k,[x.passed,x.hits]])));
