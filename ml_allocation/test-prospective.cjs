'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const base=require('../stage_goals/prospective.cjs'),ml=require('./prospective.cjs');
const field=require('../multi_stage/inputs.json').find(f=>f.id==='cologne-2026-3');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cs2-ml-archive-qa-'));
const file=name=>path.join(dir,name),save=(name,v)=>{fs.writeFileSync(file(name),JSON.stringify(v));return file(name);};
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const oldNow=Date.now,at=oldNow(),date=h=>new Date(at+h*3600000).toISOString();
const edition='archive-qa',id=edition+'-stage3',names=field.teams.map(t=>t.name),day=h=>date(h).slice(0,10);
const source=(kind,when)=>({kind,url:'https://example.org/local-qa',publishedAt:date(when),file:'source.txt'});
const matrix=Array.from({length:16},()=>Array(16).fill(.5));
const roster=field.teams.map(t=>({seed:t.seed,name:t.name,points:t.points,roster:t.roster,ratingRoster:t.vrsRoster}));
const input={edition,stage:3,editionStartAt:date(-480),startAt:date(30),lockAt:date(24),qualificationCompleteAt:date(-24),format:'all-bo3',teams:roster,
  probabilities:{model:'recommended',asOf:date(-4),teamOrder:names,bo1:matrix,bo3:matrix,allBo3:true},
  sources:['field','rosters','ratings','rules'].map(k=>source(k,-10))};
const official=(stage,startNames)=>({edition,stage,endAt:date(stage===2?-24:80),source:source('results',stage===2?-23:81),teamOrder:startNames,
  rounds:field.rounds.map(row=>row.map(([w,l])=>({winner:startNames[w],loser:startNames[l],bestOf:3})))});
try{
  assert.equal(ml.selectedPolicy('singapore-2026'),'within');
  assert.throws(()=>ml.selectedPolicy('singapore-2026','grouped'),/registered as within/);
  assert.equal(ml.selectedPolicy(edition),null);
  assert.throws(()=>ml.selectedPolicy(edition,'other'),/Unknown selected policy/);
  fs.writeFileSync(file('source.txt'),'Local regression only. No live prediction or actual tournament source.');
  const original=base.freeze(save('input.json',input),dir),origBytes=fs.readFileSync(original.path);
  const group=CS.replay(field.rounds).actual;
  let qualified=8;const previousNames=group.map((v,j)=>v<2?names[qualified++]:'earlier-team-'+j);
  const previous=official(2,previousNames),prevFile=save('previous.json',previous);
  const q={teams:names,points:roster.map(t=>t.points),rosters:roster.map(t=>t.roster),pool:['A','B','C','D','E','F','G'],cutoffExclusive:day(-48)};
  const modelField={...q,start:day(30),bo1:matrix,bo3:matrix,mapProbabilities:Array.from({length:120},()=>Array(7).fill(.5)),
    rosterSizes:names.map(()=>5),training:{lastObserved:day(-96),latestAvailability:day(-48),targetStageMapsAvailable:0}};
  const model={xgboostVersion:'3.0.2',seed:42,inputs:{},fields:{[id]:modelField}};
  const ex=(kind,time)=>({...source(kind,time),sha256:sha(file('source.txt'))});
  const sources=[ex('training',-10),ex('features',-8)];
  save('ml-queries.json',{fields:{[id]:q}});
  save('ml-training.json',{originalSha256:original.sha256,sourceEvidence:sources});
  save('ml-training.npz','QA hash-only input');
  execFileSync(process.env.PYTHON||'python',['-B','-c','import sys,numpy as np;np.savez(sys.argv[1],**{sys.argv[2]:np.ones((120,7))})',file('ml-queries.npz'),'w_'+id]);
  const inputs=['ml-queries.json','ml-queries.npz','ml-training.json','ml-training.npz'];
  model.inputs=Object.fromEntries(inputs.map(k=>[k,sha(file(k))]));
  const art=save('model.json',model);
  const manifest={originalSha256:original.sha256,selectedPolicy:'within',
    lockEvidence:{...ex('lock',-20),lockAt:input.lockAt},previous:{file:'previous.json',sha256:sha(prevFile),startAt:date(-192),format:'all-bo3'},
    ml:{file:'model.json',sha256:sha(art),generatedAt:date(-1),inputFiles:Object.fromEntries(inputs.map(k=>[k,k])),sources}};
  const freeze=m=>ml.freeze(original.path,save('manifest.json',m),dir);
  const bad=(fn,re)=>{const x=structuredClone(manifest);fn(x);assert.throws(()=>freeze(x),re);};
  bad(x=>x.originalSha256='e'.repeat(64),/Wrong original/);
  bad(x=>x.ml.generatedAt=date(2),/generation/);
  bad(x=>x.ml.sha256='a'.repeat(64),/artifact hash/);
  bad(x=>x.ml.sources[0].publishedAt=date(1),/postdates/);
  bad(x=>x.ml.sources.pop(),/Missing ML source/);
  bad(x=>x.ml.sources[0].url='https://example.org/other',/sources bound to training/);
  bad(x=>{
    const altered=save('other-training.json',{originalSha256:'a'.repeat(64),sourceEvidence:sources});
    const producer=structuredClone(model);producer.inputs['ml-training.json']=sha(altered);
    x.ml.inputFiles['ml-training.json']='other-training.json';x.ml.file='other-model.json';x.ml.sha256=sha(save(x.ml.file,producer));
  },/another original/);
  bad(x=>x.previous.sha256='a'.repeat(64),/Previous results/);
  bad(x=>x.lockEvidence.lockAt=date(23),/Unconfirmed/);
  bad(x=>x.lockEvidence.url='https://unverified.example/test',/Official/);
  const different=official(2,previousNames.map(n=>n===names[8]?'wrong-entrant':n));
  bad(x=>{x.previous.file='bad-previous.json';x.previous.sha256=sha(save(x.previous.file,different));},/eight seeds/);
  const badSource=structuredClone(previous);badSource.source.publishedAt=date(1);
  bad(x=>{x.previous.file='not-finished.json';x.previous.sha256=sha(save(x.previous.file,badSource));},/future/);
  const badModel=(fn,re)=>bad(x=>{
    const m=structuredClone(model);fn(m.fields[id]);x.ml.file='bad-model.json';x.ml.sha256=sha(save(x.ml.file,m));
  },re);
  badModel(m=>m.teams.reverse(),/axes/);
  badModel(m=>m.bo1[0][1]=.52,/symmetry/);
  badModel(m=>m.mapProbabilities[0][0]=.6,/seven-map probabilities/);
  badModel(m=>m.training.targetStageMapsAvailable=1,/contamination/);
  bad(x=>{
    const query=structuredClone(q);query.rosters[0]=query.rosters[1];
    const altered=save('wrong-fives.json',{fields:{[id]:query}}),producer=structuredClone(model);
    producer.inputs['ml-queries.json']=sha(altered);x.ml.inputFiles['ml-queries.json']='wrong-fives.json';
    x.ml.file='wrong-roster-model.json';x.ml.sha256=sha(save(x.ml.file,producer));
  },/Query fives/);
  bad(x=>x.ml.inputFiles['ml-training.npz']='ml-training.json',/Wrong ML input/);
  const good=freeze(manifest),before=fs.readFileSync(good.path);
  assert.deepEqual(Object.keys(ml.inspect(good.path,original.path).payload.cards),['standard','within','grouped']);
  const pooled=ml.inspect(good.path,original.path).payload.highBudget;
  assert.equal(pooled.auditPaths,360000);assert.equal(pooled.trainingPaths,360000);
  assert.deepEqual(ml.webRecords(dir),[],'Ignore unregistered fixtures');
  const registered=require('../stage_goals/tracked-majors.json');
  registered.push({edition,resultsHosts:['example.org']});
  const [waiting]=ml.webRecords(dir);
  assert.deepEqual(waiting.teams,names);assert.equal(waiting.score,null);assert.equal(waiting.archiveSha256,good.sha256);
  assert.equal(waiting.sourceFile,good.path);assert.equal(waiting.webFile,'forecasts/prospective/'+path.basename(good.path));
  assert.deepEqual(waiting.cards,JSON.parse(before).payload.cards);
  assert.throws(()=>freeze(manifest),/EEXIST/);
  const result=official(3,names),resultFile=save('result.json',result);
  assert.throws(()=>ml.score(good.path,original.path,resultFile),/future/);
  Date.now=()=>at+82*3600000;
  assert.throws(()=>freeze(manifest),/deadline/);
  const score=ml.score(good.path,original.path,resultFile);
  assert.deepEqual(score.highBudget,require('../f1bre_models/score.cjs').cardScore(pooled.card,CS.replay(field.rounds).actual));
  assert.equal(score.matched,33);assert.equal(score.formats.bo3.n,33);assert.equal(score.formats.bo3.brier,.25);
  assert.equal(score.selectedPolicy,'within');
  for(const c of Object.values(score.cards))assert.equal(c.passed,c.hits>=5);
  assert.deepEqual(score,ml.score(good.path,original.path,resultFile));
  fs.mkdirSync(file('results'));fs.copyFileSync(file('source.txt'),file('results/source.txt'));
  fs.copyFileSync(resultFile,file('results/'+id+'.json'));
  const [complete]=ml.webRecords(dir);assert.deepEqual(complete.score,score);assert.deepEqual(complete.cards,waiting.cards);
  const ff=structuredClone(result);ff.rounds[0][0].played=false;
  const amended=ml.score(good.path,original.path,save('forfeit.json',ff));
  assert.deepEqual(score.cards,amended.cards);assert.equal(amended.formats.bo3.n,32);
  const invalid=structuredClone(result);invalid.teamOrder.reverse();
  assert.throws(()=>ml.score(good.path,original.path,save('swapped.json',invalid)),/order/);
  save('results/'+id+'.json',invalid);assert.throws(()=>ml.webRecords(dir),/order/);
  registered.pop();
  const tampered=JSON.parse(before);tampered.payload.cards.standard.reverse();
  assert.throws(()=>ml.score(save('tampered.json',tampered),original.path,resultFile),/checksum/);
  assert.deepEqual(fs.readFileSync(good.path),before);assert.deepEqual(fs.readFileSync(original.path),origBytes);
  console.log('Prospective Stage 3 ML seal, official results, deadline, origin/roster, maps, evidence and immutable rescore checks passed.');
}finally{Date.now=oldNow;fs.rmSync(dir,{recursive:true,force:true});}
