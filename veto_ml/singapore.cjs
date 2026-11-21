'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const {confirmSingaporeResult}=require('../stage_goals/public-records.cjs'),{readResults}=require('../stage_goals/prospective.cjs');
const {cardScore,errors}=require('../f1bre_models/score.cjs');
const s=require('../stage_goals/singapore-schedule.json').stages[0];
const sourceFile=path.join(__dirname,'singapore-forecast.json'),webFile='forecasts/veto-ml-singapore-stage1.json';
const originalFile=path.join(__dirname,'../f1bre_models/singapore-forecast.json');
const official=path.join(__dirname,'../forecast_archive/prospective/results/singapore-2026-stage1.json');
const oldSeal='1aa45aeb970df7d1ff5b6e17d246b03e9ef36de859204c8279acfe6672664459';
const studyCutoff='2026-11-22T00:00:00Z',methods=['original','candidate'];
const hash=b=>createHash('sha256').update(b).digest('hex'),hashJson=v=>hash(JSON.stringify(v));
const doc=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function beforeDeadline(now){
  assert(now<Date.parse(studyCutoff) && now<Date.parse(s.firstMatchScheduledUtc),'Research cutoff or stage start has passed');
  if(s.valvePickemLockUtc)assert(now<Date.parse(s.valvePickemLockUtc),'Verified game deadline has passed');
}
function prior(){
  const x=doc(originalFile);assert.equal(x.sha256,oldSeal,'Unexpected original ML seal');
  assert.equal(hashJson(x.forecast),x.sha256);return x.forecast;
}
function verifyRecord(r){
  const p=r.forecast,old=prior();assert.equal(hashJson(p),r.sha256,'Invalid veto ML seal checksum');
  assert.equal(p.edition,old.edition);assert.equal(p.stage,1);assert.equal(p.originalSha256,oldSeal);
  assert.equal(p.startAt,s.firstMatchScheduledUtc);assert.equal(p.researchCutoffUtc,studyCutoff);
  const t=Date.parse(p.frozenAt);assert.equal(new Date(t).toISOString(),p.frozenAt);
  assert(t>=Date.parse(old.frozenAt) && t<=Date.now());beforeDeadline(t);
  if(p.officialLockUtc!==null)assert(t<Date.parse(p.officialLockUtc));
  assert.equal(p.cutoffExclusive,old.cutoffExclusive);assert(t>=Date.parse(p.cutoffExclusive+'T00:00:00Z'));
  assert(p.coverage.lastObservation<p.cutoffExclusive && p.coverage.both+p.coverage.one+p.coverage.neither===120);
  assert.deepEqual(p.teams,old.teams);assert.equal(p.seed,old.seed);assert.equal(p.searchPaths,12000);assert.equal(p.auditPaths,12000);
  assert.deepEqual(p.cards.original.card,old.cards.ml.standard);assert.equal(p.pairs.length,120);
  for(const [i,pair] of p.pairs.entries()){
    const comparison=old.pairs[i];assert.equal(pair.a,comparison.a);assert.equal(pair.b,comparison.b);
    assert.deepEqual(pair.original,comparison.probs.ml);
    assert.equal(pair.candidate[0],pair.original[0]);assert.equal(pair.candidate.length,2);
    assert(pair.candidate.every(v=>Number.isFinite(v) && v>0 && v<1));
  }
  for(const k of methods){const c=p.cards[k];assert.equal(c.card.length,16);cardScore(c.card,null);
    assert(Number.isInteger(c.auditPasses) && c.auditPasses>=0 && c.auditPasses<=p.auditPaths);}
  for(const h of Object.values(p.inputs))assert.match(h,/^[a-f0-9]{64}$/);
  return r;
}
function build(){
  const old=prior(),cardsRaw=fs.readFileSync(path.join(__dirname,'cards.json')),cards=JSON.parse(cardsRaw);
  const modelsRaw=fs.readFileSync(path.join(__dirname,'models.json.gz')),modelHash=hash(modelsRaw);
  assert.equal(cards.modelSha256,modelHash,'Card evaluation predates final veto inputs');
  const models=JSON.parse(gunzipSync(modelsRaw)),m=models.fields.singapore,r=cards.fields.find(f=>f.id==='singapore');
  const names=old.teams.map(t=>t.name);
  assert(r && r.actual===null && r.actualRecord===null && r.matches.length===0 && r.played===null && r.matched===null);
  assert.deepEqual(r.teams,names);assert.deepEqual(names,m.teams);assert.equal(cards.seed,old.seed);
  assert.equal(m.start,old.startAt.slice(0,10));assert.equal(m.cutoffExclusive,old.cutoffExclusive);
  assert.equal(m.pairs.length,120);assert.equal(r.coverage.both,m.coverage.both);
  // This research snapshot includes both independently recovered Griffin rosters.
  assert.equal(m.coverage.both,120,'Final material for all 16 Singapore teams is required');
  const pairs=m.pairs.map(({a,b,nA,nB},i)=>{
    const base=old.pairs[i];assert.equal(base.a,a);assert.equal(base.b,b);
    const original=[m.baseline.bo1[a][b],m.baseline.bo3[a][b]];
    assert.deepEqual(original,base.probs.ml);assert.equal(m.bo1[a][b],original[0]);
    return {a,b,preVetoCounts:[nA,nB],original,candidate:[m.bo1[a][b],m.bo3[a][b]]};
  });
  const forecasts={};
  for(const k of methods){
    const z=r.methods[k].main;assert.equal(z.hits,null);assert.equal(z.passed,null);
    const matrix=k==='original'?m.baseline:m;
    const sim=CS.run({bo1:matrix.bo1,bo3:matrix.bo3},cards.pathsPerPartition*2,cards.seed,[],{seedConditionalCard:true});
    assert.deepEqual(z.card,sim.card);assert.equal(z.simulatedPass,sim.pass);
    forecasts[k]={card:z.card,auditPasses:Math.round(z.simulatedPass*cards.pathsPerPartition)};
  }
  assert.deepEqual(forecasts.original.card,old.cards.ml.standard);
  const inputs={'old-ml-envelope':hash(fs.readFileSync(originalFile)),'cards.json':hash(cardsRaw),'models.json.gz':modelHash};
  for(const [f,h] of Object.entries(models.sources)){assert.equal(hash(fs.readFileSync(path.resolve(__dirname,'..',f))),h);inputs[f]=h;}
  for(const f of ['./cards.cjs','./build.py','./profiles.py','../engine/engine.js'])inputs[f]=hash(fs.readFileSync(path.resolve(__dirname,f)));
  return {edition:'singapore-2026',stage:1,startAt:s.firstMatchScheduledUtc,researchCutoffUtc:studyCutoff,
    officialLockUtc:s.valvePickemLockUtc??null,lockEvidence:s.lockEvidence,originalSha256:oldSeal,
    cutoffExclusive:m.cutoffExclusive,seed:cards.seed,searchPaths:cards.pathsPerPartition,auditPaths:cards.pathsPerPartition,
    teams:old.teams,pool:m.pool,rules:m.rules,coverage:{both:r.coverage.both,one:r.coverage.one,neither:r.coverage.neither,
      uniqueBO3:m.coverage.uniqueBO3,lastObservation:m.coverage.last},pairs,cards:forecasts,inputs};
}
function seal(){
  beforeDeadline(Date.now());assert(!fs.existsSync(sourceFile),'This supplementary forecast is already sealed');
  assert(!fs.existsSync(official),'Target-stage results already exist');
  const forecast={...build(),frozenAt:new Date().toISOString()},record={sha256:hashJson(forecast),forecast};
  verifyRecord(record);const tmp=sourceFile+'.'+randomUUID()+'.tmp';
  try{
    fs.writeFileSync(tmp,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    beforeDeadline(Date.now());assert(!fs.existsSync(official),'Target-stage results already exist');
    fs.linkSync(tmp,sourceFile);
  }finally{fs.rmSync(tmp,{force:true});}
  return {path:sourceFile,sha256:record.sha256,frozenAt:forecast.frozenAt};
}
function grade(f,result){
  const pairMap=new Map(f.pairs.map(g=>[g.a*16+g.b,g]));assert.equal(pairMap.size,120);assert.equal(result.games.length,33);
  const scores={};for(const k of methods){
    const scored=cardScore(f.cards[k].card,result.actual),formats={};
    for(const [i,key] of ['bo1','bo3'].entries()){
      const games=result.games.filter(g=>g.key===key && g.played!==false);
      formats[key]=errors(games.map(({w,l})=>{const p=pairMap.get(Math.min(w,l)*16+Math.max(w,l))[k][i];return w<l?p:1-p;}));
    }
    scores[k]={...scored,passed:scored.hits>=5,formats};
  }
  return {endAt:result.endAt,source:result.verified,matched:33,actual:result.actual,scores};
}
function status(){
  if(!fs.existsSync(sourceFile))return {status:'unsealed'};
  const {forecast:f,sha256}=verifyRecord(doc(sourceFile)),names=f.teams.map(t=>t.name);
  let result=null;
  if(fs.existsSync(official)){
    confirmSingaporeResult(official,1);
    result=grade(f,readResults(official,f.edition,f.stage,f.startAt,'mixed',names));
  }
  return {edition:f.edition,stage:f.stage,status:result?'scored':'pending',frozenAt:f.frozenAt,sha256,webFile,
    teams:names,cards:f.cards,searchPaths:f.searchPaths,auditPaths:f.auditPaths,coverage:f.coverage,
    scores:result?.scores??null,actual:result?.actual??null,result};
}
module.exports={status,seal,grade,verifyRecord,sourceFile,webFile};
if(require.main===module){try{
  const [action]=process.argv.slice(2);assert(['--seal','--check','--status','--score'].includes(action));
  if(action==='--seal')console.log(JSON.stringify(seal()));
  else if(action==='--check'){
    const {forecast,sha256}=verifyRecord(doc(sourceFile));
    assert.deepEqual(forecast,{...build(),frozenAt:forecast.frozenAt});
    console.log('Verified veto ML research forecast',sha256);
  }else console.log(JSON.stringify(status()));
}catch(e){console.error(e.message);process.exitCode=1;}}
