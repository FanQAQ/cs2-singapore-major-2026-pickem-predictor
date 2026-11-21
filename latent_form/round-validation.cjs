'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const models=require('../f1bre_models/evaluate.cjs'),external=require('../ml_allocation/evaluate.cjs');
const {externalDocs}=require('../tail_calibration/evaluate.cjs'),{errors}=require('../f1bre_models/score.cjs');
const {fields}=require('../f1bre_models/major-fields.json');
const dir=__dirname,read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const masks=1<<16;
const groups={allBo3:g=>g.bo===3,lateBo3:g=>g.bo===3 && g.round>=3,bo1:g=>g.bo===1};

function alignRounds(draw,truth){
  const key=(w,l)=>w*16+l;
  const played=new Map(truth.matches.map(g=>[key(g.w,g.l),g]));
  const excluded=new Set((truth.excluded??[]).map(g=>key(g.w,g.l)));
  const seen=new Set();
  const rounds=draw.map(r=>r.map(([w,l])=>{
    const k=key(w,l);
    assert(!seen.has(k) && (played.has(k)!==excluded.has(k)),'Unknown or repeated official matchup');
    seen.add(k);return played.get(k)??{w,l,bo:3,administrative:true};
  }));
  assert.deepEqual(rounds.map(r=>r.length),[8,8,8,6,3]);assert.equal(seen.size,33);
  assert.equal(played.size+excluded.size,33);
  return rounds;
}

function tournament(id){
  if(id==='bucharest-2025-april'){
    const f=read('bucharest-field.json'),r=read('bucharest-results.json');
    const p=f.teams.map(a=>f.teams.map(b=>1/(1+10**((b.points-a.points)/400))));
    const ml=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(dir,'bucharest-ml/ml.json.gz')))).fields[id];
    assert.deepEqual(ml.teams,f.teams.map(t=>t.name));assert.equal(ml.start,f.start);
    return {id,group:'Bucharest',teams:ml.teams,odds:{baseline:{bo1:p,bo3:p},ml},
      rounds:alignRounds(r.rounds,{matches:r.rounds.flat().map(([w,l])=>({w,l,bo:3}))})};
  }
  if(externalDocs[id]){
    const f=external.fieldFor(id),r=external.truthFor(f);
    return {id,group:'EPL',teams:f.teams.map(t=>t.name),odds:external.modelsFor(f),
      rounds:alignRounds(externalDocs[id]().truth.rounds,r)};
  }
  const f=models.getField(id),teams=f.teams.map(t=>t.name),cluj=id==='cluj-2026';
  const draw=cluj?require('../f1bre_models/cluj-results.json').rounds:PickLab.allEvents.find(e=>e.id===id).rounds;
  return {id,group:cluj?'Cluj':'S'+f.stage,teams,odds:models.matrices(f,['baseline','ml']),
    rounds:alignRounds(draw,models.truth(id,teams))};
}

// Predict a whole round from its initial posterior. Only then apply this round's outcomes.
function predict(rounds,odds,s){
  assert(Number.isFinite(s) && s>=0 && s<=.5);
  const weights=new Float64Array(masks).fill(1/masks);
  const records=[];
  for(const [r,matches] of rounds.entries()){
    const updates=[];
    for(const {w,l,bo,administrative} of matches){
      if(administrative)continue;
      assert(bo===1 || bo===3);
      const a=Math.min(w,l),b=Math.max(w,l),p=odds['bo'+bo][a][b];
      let posterior=p;
      if(s>0 && bo===3){
        const prob=CS.stateCases(p,s,s),mass=[0,0,0,0],bitA=1<<a,bitB=1<<b;
        for(let k=0;k<masks;k++)mass[(k&bitA?2:0)+(k&bitB?1:0)]+=weights[k];
        posterior=mass.reduce((total,v,j)=>total+v*prob[j],0);
        updates.push({bitA,bitB,likelihood:w===a?prob:prob.map(x=>1-x)});
      }
      const base=w===a?p:1-p,conditional=w===a?posterior:1-posterior;
      assert(conditional>0 && conditional<1);
      records.push({round:r+1,w,l,bo,base,conditional});
    }
    if(updates.length){
      let norm=0;
      for(let k=0;k<masks;k++){
        for(const {bitA,bitB,likelihood} of updates)weights[k]*=likelihood[(k&bitA?2:0)+(k&bitB?1:0)];
        norm+=weights[k];
      }
      assert(norm>0);for(let k=0;k<masks;k++)weights[k]/=norm;
    }
  }
  return records;
}
function summarize(games){
  return Object.fromEntries(Object.entries(groups).map(([k,fn])=>{
    const rows=games.filter(fn),baseline=errors(rows.map(g=>g.base)),trained=errors(rows.map(g=>g.conditional));
    return [k,{baseline,trained}];
  }));
}
function validateFilter(){
  const p=.62,mt=Array.from({length:16},(_,a)=>Array.from({length:16},(_,b)=>a===b?.5:a<b?p:1-p));
  const odds={bo1:mt,bo3:mt},s=.35,game=(w,l,bo=3)=>({w,l,bo});
  const rounds=[[game(0,1),game(2,3)],[game(0,2)]];
  const actual=predict(rounds,odds,s);
  const cases=CS.stateCases(p,s,s),c=(mask,a,b)=>cases[2*((mask>>a)&1)+((mask>>b)&1)];
  let norm=0,next=0;
  for(let mask=0;mask<16;mask++){const likelihood=c(mask,0,1)*c(mask,2,3);norm+=likelihood;next+=likelihood*c(mask,0,2);}
  assert(Math.abs(actual[2].conditional-next/norm)<1e-10);
  const afterWin=predict([[game(0,1)],[game(0,2)]],odds,s)[1].conditional;
  assert(afterWin>p);
  const afterLoss=predict([[game(1,0)],[game(0,2)]],odds,s)[1].conditional;assert(afterLoss<p);
  for(const first of [{...game(0,1),administrative:true},game(0,1,1)])assert(Math.abs(predict([[first],[game(0,2)]],odds,s).at(-1).conditional-p)<1e-10);
  const orderA=predict([[game(0,1),game(2,3)],[game(1,2),game(0,3)]],odds,s);
  const orderB=predict([[game(0,1),game(2,3)],[game(0,3),game(2,1)]],odds,s);
  assert(Math.abs(orderA[3].conditional-orderB[2].conditional)<1e-12,'A same-round outcome leaked into the prediction');
  for(const g of predict(rounds,odds,0))assert.equal(g.base,g.conditional);
}
function build(){
  validateFilter();
  const trained=read('training.json').targets,all=[];
  const ids=[...Object.keys(fields).filter(id=>id!=='singapore'),'cluj-2026',...Object.keys(externalDocs),'bucharest-2025-april'];
  for(const id of ids){
    const {group,teams,odds,rounds}=tournament(id),s=trained[id].scale;
    for(const [name,m] of Object.entries(odds)){
      const games=predict(rounds,m,s);
      for(const g of games)if(g.round===1 || g.bo===1 || s===0)assert(Math.abs(g.base-g.conditional)<1e-10);
      all.push({id,group,name,teams,scale:s,games,metrics:summarize(games)});
    }
  }
  const summary={};
  for(const group of new Set(all.map(a=>a.group))){
    const rows=all.filter(a=>a.group===group);
    summary[group]=Object.fromEntries([...new Set(rows.map(a=>a.name))].map(n=>[n,summarize(rows.filter(a=>a.name===n).flatMap(a=>a.games))]));
  }
  const trainingSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(dir,'training.json'))).digest('hex');
  return {trainingSha256,summary,fields:all};
}
module.exports={tournament,alignRounds,predict,summarize,validateFilter};
if(require.main===module){
  if(process.argv.includes('--test')){validateFilter();console.log('Round-boundary posterior and administrative/BO1 checks passed.');}
  else{
    const out=path.join(dir,'round-validation.json'),json=JSON.stringify(build())+'\n';
    if(process.argv.includes('--check'))assert.equal(fs.readFileSync(out,'utf8'),json);else fs.writeFileSync(out,json);
  }
}
