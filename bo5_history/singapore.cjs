'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const previous=require('../veto_ml/singapore.cjs');
const {confirmSingaporeResult}=require('../stage_goals/public-records.cjs'),{readResults}=require('../stage_goals/prospective.cjs');
const {cardScore,errors}=require('../f1bre_models/score.cjs');
const schedule=require('../stage_goals/singapore-schedule.json').stages[0];
const sourceFile=path.join(__dirname,'singapore-forecast.json'),webFile='forecasts/bo5-history-singapore-stage1.json';
const official=path.join(__dirname,'../forecast_archive/prospective/results/singapore-2026-stage1.json');
const earlier='b680b8ca578316a1f3a3e139a874b9e0d9a09791b614fc47a11833e1bef218e6';
const keys={original:['original','standard'],candidate:['candidate','standard'],originalPure:['original','pure'],candidatePure:['candidate','pure']};
const hash=b=>createHash('sha256').update(b).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f));
function prior(){
  const archive=previous.verifyRecord(read(previous.sourceFile));assert.equal(archive.sha256,earlier);
  return archive.forecast;
}
function checkTime(t,p,old){
  assert(Number.isFinite(t) && t>=Date.parse(old.frozenAt) && t<=Date.now(),'Expected a present, post-control freeze time');
  assert(t<Date.parse(old.researchCutoffUtc) && t<Date.parse(old.startAt),'Research deadline or scheduled start passed');
  if(p.officialLockUtc)assert(t<Date.parse(p.officialLockUtc),'Verified game lock passed');
  if(schedule.valvePickemLockUtc)assert(t<Date.parse(schedule.valvePickemLockUtc),'Published game lock passed');
}
function verifyRecord(record){
  const f=record.forecast,old=prior();assert.equal(record.sha256,hash(JSON.stringify(f)),'Forecast checksum mismatch');
  assert.equal(f.edition,old.edition);assert.equal(f.stage,1);assert.equal(f.stage,old.stage);
  assert.equal(f.startAt,old.startAt);assert.equal(f.startAt,schedule.firstMatchScheduledUtc);
  assert.equal(f.researchCutoffUtc,old.researchCutoffUtc);assert.equal(f.cutoffExclusive,old.cutoffExclusive);
  assert(f.training.lastObserved<f.cutoffExclusive && f.training.treeLastDay<f.training.calibrationStart);
  assert.equal(f.training.newBO5LabelCount,0);assert.equal(f.training.originalReproduced,true);
  const t=Date.parse(f.frozenAt);assert.equal(new Date(t).toISOString(),f.frozenAt);checkTime(t,f,old);
  assert.equal(f.originalSha256,old.originalSha256);assert.equal(f.previousResearchSha256,earlier);
  assert.deepEqual(f.teams,old.teams);assert.deepEqual(f.pool,old.pool);assert.equal(f.seed,old.seed);
  assert.equal(f.searchPaths,12000);assert.equal(f.auditPaths,12000);assert.equal(f.pairs.length,120);
  for(const [i,p] of f.pairs.entries()){
    const oldPair=old.pairs[i];assert.equal(p.a,oldPair.a);assert.equal(p.b,oldPair.b);assert.deepEqual(p.original,oldPair.original);
    assert(p.candidate.length===2 && p.candidate.every(x=>Number.isFinite(x)&&x>0&&x<1));
  }
  assert.deepEqual(Object.keys(f.cards).sort(),Object.keys(keys).sort());
  for(const c of Object.values(f.cards)){
    cardScore(c.card,null);assert(Number.isSafeInteger(c.auditPasses)&&c.auditPasses>=0&&c.auditPasses<=f.auditPaths);
  }
  assert.deepEqual(f.cards.original,old.cards.original);
  for(const ps of [f.zeroProbabilities.original,f.zeroProbabilities.candidate]){
    assert.equal(ps.length,16);assert(ps.every(p=>Number.isFinite(p) && p>=0 && p<=1));
    assert(Math.abs(ps.reduce((a,b)=>a+b,0)-2)<1e-8);
  }
  for(const h of Object.values(f.inputs))assert.match(h,/^[a-f0-9]{64}$/);
  return record;
}
function build(){
  const {align,play}=require('./cards.cjs');
  const old=prior(),names=old.teams.map(t=>t.name);
  const modelBytes=fs.readFileSync(path.join(__dirname,'models.json.gz')),models=JSON.parse(gunzipSync(modelBytes)),m=models.fields.singapore;
  const cardBytes=fs.readFileSync(path.join(__dirname,'cards.json')),study=JSON.parse(cardBytes),r=study.fields.find(f=>f.id==='singapore');
  assert.equal(study.modelSha256,hash(modelBytes));
  assert.equal(m.start,old.startAt.slice(0,10));assert.equal(m.cutoffExclusive,old.cutoffExclusive);assert.deepEqual(m.pool,old.pool);
  assert.deepEqual(r.teams,names);assert(r.actual===null && r.matched===null && r.matches.length===0);
  const matrices=align(m,names),cards={},zeroProbabilities={};
  for(const k of ['original','candidate']){
    const fresh=play({id:'singapore',scheme:'major'},{...matrices[k],allBo3:false},study.seed,null,true);
    assert.deepEqual(fresh,r.arms[k].main);
    for(const [alias,[arm,policy]] of Object.entries(keys))if(arm===k){
      const c=fresh.cards[policy];assert(c.passed===null && c.hits===null);
      cards[alias]={card:c.card,auditPasses:Math.round(c.simulatedPass*study.pathsPerPartition)};
    }
    zeroProbabilities[k]=fresh.teams.map(p=>p.zero);
  }
  const pairs=old.pairs.map(({a,b,original})=>{
    const control=[matrices.original.bo1[a][b],matrices.original.bo3[a][b]];assert.deepEqual(control,original);
    return {a,b,original:control,candidate:[matrices.candidate.bo1[a][b],matrices.candidate.bo3[a][b]]};
  });
  const inputs={'models.json.gz':hash(modelBytes),'cards.json':hash(cardBytes),'previous-envelope':hash(fs.readFileSync(previous.sourceFile))};
  for(const [file,digest] of Object.entries(models.sources)){
    assert.equal(hash(fs.readFileSync(path.resolve(__dirname,'..',file))),digest,'Stale model evidence: '+file);
    inputs[file]=digest;
  }
  for(const file of ['cards.cjs','singapore.cjs','bo5-maps.json.gz','../engine/engine.js','../veto_ml/NEXT-STRENGTH.md'])
    inputs[file]=hash(fs.readFileSync(path.join(__dirname,file)));
  return {edition:old.edition,stage:1,startAt:old.startAt,researchCutoffUtc:old.researchCutoffUtc,officialLockUtc:schedule.valvePickemLockUtc??null,
    lockEvidence:schedule.lockEvidence,cutoffExclusive:m.cutoffExclusive,previousResearchSha256:earlier,originalSha256:old.originalSha256,
    seed:study.seed,searchPaths:study.pathsPerPartition,auditPaths:study.pathsPerPartition,
    teams:old.teams,pool:old.pool,training:m.training,pairs,zeroProbabilities,cards,inputs};
}
function seal(){
  assert(!fs.existsSync(sourceFile),'BO5-history research forecast is already sealed');
  const old=prior();checkTime(Date.now(),schedule,old);assert(!fs.existsSync(official),'Official stage result already exists');
  const f={...build(),frozenAt:new Date().toISOString()},record={sha256:hash(JSON.stringify(f)),forecast:f};
  verifyRecord(record);const temp=sourceFile+'.'+randomUUID()+'.tmp';
  try{
    fs.writeFileSync(temp,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    checkTime(Date.now(),f,old);assert(!fs.existsSync(official),'Official stage result already exists');
    fs.linkSync(temp,sourceFile);
  }finally{fs.rmSync(temp,{force:true});}
  return {file:sourceFile,sha256:record.sha256,frozenAt:f.frozenAt};
}
function grade(f,result){
  assert.equal(result.games.length,33);const matches=new Map(f.pairs.map(p=>[16*p.a+p.b,p]));
  assert.equal(matches.size,120);const scores={};
  for(const [alias,[arm]] of Object.entries(keys)){
    const scored=cardScore(f.cards[alias].card,result.actual);
    const formats=Object.fromEntries(['bo1','bo3'].map((key,j)=>{
      const games=result.games.filter(g=>g.key===key && g.played!==false);
      return [key,errors(games.map(({w,l})=>{const p=matches.get(16*Math.min(w,l)+Math.max(w,l))[arm][j];return w<l?p:1-p;}))];
    }));
    const zeroBrier=f.zeroProbabilities[arm].reduce((v,p,i)=>v+(p-Number(result.actual[i]===2))**2,0)/16;
    scores[alias]={...scored,passed:scored.hits>=5,formats,zeroBrier,
      falseZeroQualified:result.actual.map((c,i)=>c<2&&f.cards[alias].card[i]===2?i:null).filter(i=>i!==null)};
  }
  return {endAt:result.endAt,source:result.verified,matched:33,actual:result.actual,scores};
}
function status(){
  if(!fs.existsSync(sourceFile))return {status:'unsealed'};
  const {forecast:f,sha256}=verifyRecord(read(sourceFile)),names=f.teams.map(t=>t.name);
  let result=null;
  if(fs.existsSync(official)){
    confirmSingaporeResult(official,1);
    result=grade(f,readResults(official,f.edition,f.stage,f.startAt,'mixed',names));
  }
  return {edition:f.edition,stage:f.stage,status:result?'scored':'pending',frozenAt:f.frozenAt,sha256,webFile,teams:names,cards:f.cards,
    zeroProbabilities:f.zeroProbabilities,searchPaths:f.searchPaths,auditPaths:f.auditPaths,scores:result?.scores??null,actual:result?.actual??null,result};
}
module.exports={sourceFile,webFile,grade,verifyRecord,seal,status};
if(require.main===module){try{
  const [arg]=process.argv.slice(2);assert(['--check','--status','--score','--seal'].includes(arg));
  if(arg==='--seal')console.log(JSON.stringify(seal()));
  else if(arg==='--check'){const {forecast:f,sha256}=verifyRecord(read(sourceFile));assert.deepEqual(f,{...build(),frozenAt:f.frozenAt});console.log('Verified BO5-history seal',sha256);}
  else console.log(JSON.stringify(status()));
}catch(error){console.error(error.message);process.exitCode=1;}}
