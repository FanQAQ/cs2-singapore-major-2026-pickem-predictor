'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const {execFileSync}=require('node:child_process');
const base=require('../stage_goals/prospective.cjs');
const {confirmSingaporeResult}=require('../stage_goals/public-records.cjs');
const {grouping,chooseCards,policies}=require('./evaluate.cjs');
const {samples,teams}=require('./draw.cjs');
const {cardScore,errors}=require('../f1bre_models/score.cjs');
const {productionSeed,budget}=require('../strategy_v4_eval/settings.cjs');
const digest=data=>createHash('sha256').update(data).digest('hex');
const hash=data=>digest(JSON.stringify(data));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const codeFiles=['./evaluate.cjs','./draw.cjs','../final_card/rules.js','../engine/engine.js',
  '../dist/engine.js','../strategy_v4_eval/settings.cjs','../stage_goals/prospective.cjs','./prospective.cjs'];
const inputFiles=['ml-queries.json','ml-queries.npz','ml-training.json','ml-training.npz'];
const sampleCount=budget/2;

function timestamp(s) {
  assert.equal(typeof s,'string');assert.match(s,/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/,'UTC timestamp required');
  const t=Date.parse(s);
  assert(Number.isFinite(t) && new Date(t).toISOString()===s.replace(/(\d\d:\d\d:\d\d)Z$/,'$1.000Z'),'Invalid calendar timestamp');
  return t;
}
function official(url,i) {
  const u=new URL(url);
  assert(u.protocol==='https:' && !u.username && !u.password,'Public HTTPS evidence required');
  const listed=require('../stage_goals/tracked-majors.json').find(r=>r.edition===i.edition);
  const hosts=listed?.resultsHosts ?? i.sources.filter(s=>s.kind==='field'||s.kind==='rules').map(s=>new URL(s.url).hostname);
  assert(hosts.some(h=>h===u.hostname || u.hostname.endsWith('.'+h)),'Official organizer or Valve source required');
}
function snapshot(s,dir,latest) {
  const u=new URL(s.url);
  assert(u.protocol==='https:' && !u.username && !u.password,'Public HTTPS evidence required');
  assert(timestamp(s.publishedAt)<=latest,'Evidence postdates its use');
  const raw=fs.readFileSync(path.resolve(dir,s.file));
  assert(raw.length && digest(raw)===s.sha256,'Evidence snapshot hash mismatch');
  return {url:s.url,publishedAt:s.publishedAt,sha256:s.sha256,bytes:raw.length};
}
function checkPaths(time,i) {
  assert(time<timestamp(i.lockAt) && time<timestamp(i.startAt),'Stage deadline has passed');
}
function selectedPolicy(edition, requested) {
  const selected=requested ?? (edition==='singapore-2026'?'within':null);
  assert(selected===null || policies.includes(selected),'Unknown selected policy');
  if(edition==='singapore-2026')assert.equal(selected,'within','Singapore Stage 3 primary was registered as within');
  return selected;
}
function verifyPrevious(config,i,dir,now) {
  const file=path.resolve(dir,config.file), r=read(file);
  assert.equal(digest(fs.readFileSync(file)),config.sha256,'Previous results snapshot hash mismatch');
  official(r.source.url,i);
  if(i.edition==='singapore-2026'){
    confirmSingaporeResult(file,2);
    const previous=require('../stage_goals/singapore-schedule.json').stages[1];
    assert.equal(timestamp(config.startAt),timestamp(previous.firstMatchScheduledUtc));
    assert.equal(config.format,previous.openingRoundBestOf===3?'all-bo3':'mixed');
  }
  assert(['mixed','all-bo3'].includes(config.format) && timestamp(config.startAt)>=timestamp(i.editionStartAt));
  assert(Array.isArray(r.teamOrder) && r.teamOrder.length===16 && new Set(r.teamOrder).size===16);
  const data=base.readResults(file,i.edition,2,config.startAt,config.format,r.teamOrder);
  assert.equal(timestamp(data.endAt),timestamp(i.qualificationCompleteAt),'Previous stage completion differs from sealed field');
  assert(timestamp(data.verified.publishedAt)<=now,'Previous results still pending');
  const advanced=r.teamOrder.filter((_,index)=>data.actual[index]<2),next=i.teams.slice(8);
  let rosterArchiveSha256=null;
  if(config.rosterArchive){
    const earlier=base.inspect(path.resolve(dir,config.rosterArchive.file)),prev=earlier.payload.input;
    assert.equal(earlier.sha256,config.rosterArchive.sha256);assert.equal(prev.edition,i.edition);assert.equal(prev.stage,2);
    assert.equal(timestamp(prev.startAt),timestamp(config.startAt));assert.equal(prev.format,config.format);
    assert.deepEqual(prev.teams.map(t=>t.name),r.teamOrder);
    const canonical=s=>s.normalize('NFKC').trim().toLowerCase();
    const assigned=advanced.map(name=>{
      const five=new Set(prev.teams.find(t=>t.name===name).roster.map(canonical));
      const owners=next.filter(t=>t.roster.filter(p=>five.has(canonical(p))).length>=3);
      assert.equal(owners.length,1,'Unproven qualification roster core');return owners[0].name;
    });
    assert.equal(new Set(assigned).size,8);rosterArchiveSha256=earlier.sha256;
  }else assert.deepEqual(advanced.slice().sort(),next.map(t=>t.name).sort(),'Final eight seeds must be the official Stage 2 qualifiers');
  return {sha256:config.sha256,source:data.verified,startAt:config.startAt,endAt:data.endAt,advanced,rosterArchiveSha256};
}
function matrixChecks(m,weights) {
  const bounded=p=>Number.isFinite(p) && p>0 && p<1;
  assert.equal(m.pool.length,7);assert.equal(new Set(m.pool).size,7);assert(m.pool.every(s=>typeof s==='string' && s.trim().length));
  assert.equal(m.mapProbabilities.length,120);assert.equal(weights.length,120);
  for(const key of ['bo1','bo3']){
    assert.equal(m[key].length,16);
    for(const [i,r] of m[key].entries()){
      assert.equal(r.length,16);assert.equal(r[i],.5);
      for(const [j,p] of r.entries())assert(bounded(p) && Math.abs(p+m[key][j][i]-1)<1e-9,'Invalid matrix probability or symmetry');
    }
  }
  let row=0;
  for(let a=0;a<16;a++)for(let b=a+1;b<16;b++,row++){
    const p=m.mapProbabilities[row],raw=weights[row];
    assert(p.length===7 && p.every(bounded) && raw.length===7 && raw.every(v=>Number.isFinite(v)&&v>0),'Invalid seven-map inputs');
    const total=raw.reduce((t,v)=>t+v,0),w=raw.map(v=>v/total);
    let first=0,series=0;
    for(let i=0;i<7;i++){
      first+=w[i]*p[i];
      for(let j=0;j<7;j++)if(j!==i)for(let k=0;k<7;k++)if(k!==j && k!==i){
        const prob=w[i]*w[j]/(1-w[i])*w[k]/(1-w[i]-w[j]);
        series+=prob*(p[i]*p[j]+((1-p[i])*p[j]+p[i]*(1-p[j]))*p[k]);
      }
    }
    assert(Math.abs(first-m.bo1[a][b])<2e-8 && Math.abs(series-m.bo3[a][b])<2e-8,'Series matrix differs from seven-map probabilities and query weights');
  }
}
function loadModel(cfg,i,dir,now,originalSha256) {
  const generated=timestamp(cfg.generatedAt);
  assert(generated>=timestamp(i.qualificationCompleteAt) && generated<=now,'ML generation must follow qualification and precede freeze');
  const file=fs.readFileSync(path.resolve(dir,cfg.file));
  assert.equal(digest(file),cfg.sha256,'ML artifact hash mismatch');
  const payload=JSON.parse(file[0]===31 && file[1]===139?gunzipSync(file):file);
  assert.equal(payload.xgboostVersion,'3.0.2');assert.equal(payload.seed,42);
  assert.deepEqual(Object.keys(payload.inputs).sort(),inputFiles);
  const paths=Object.fromEntries(inputFiles.map(k=>[k,path.resolve(dir,cfg.inputFiles[k])]));
  for(const k of inputFiles)assert.equal(digest(fs.readFileSync(paths[k])),payload.inputs[k],'Wrong ML input: '+k);
  const id=i.edition+'-stage3',m=payload.fields[id],q=read(paths['ml-queries.json']).fields[id];
  assert(m && q,'Missing edition-specific Stage 3 ML field');
  assert.deepEqual(m.teams,i.teams.map(t=>t.name),'ML axes differ from sealed seed order');
  assert.deepEqual(q.teams,m.teams);assert.deepEqual(q.pool,m.pool);
  assert.deepEqual(q.rosters,i.teams.map(t=>t.roster),'Query fives differ from sealed lineups');
  assert.deepEqual(q.points,i.teams.map(t=>t.points),'Query VRS differs from sealed ratings');
  assert.deepEqual(m.rosterSizes,i.teams.map(()=>5));assert.equal(m.start,i.startAt.slice(0,10));
  assert.equal(m.training.targetStageMapsAvailable,0,'Target-stage training contamination');
  assert.equal(q.cutoffExclusive,m.cutoffExclusive);
  const cutoff=timestamp(m.cutoffExclusive+'T00:00:00Z');
  const last=timestamp(m.training.lastObserved+'T00:00:00Z');
  const ready=timestamp(m.training.latestAvailability+'T00:00:00Z');
  assert(last<cutoff && last<=ready && ready<=cutoff && cutoff<=generated,'ML dates exceed the pre-stage cutoff');
  const queryCode='import sys,json,numpy as np\nwith np.load(sys.argv[1],allow_pickle=False) as z:\n w=z["w_"+sys.argv[2]]\n assert w.shape==(120,7)\n print(json.dumps(w.tolist(),allow_nan=False))';
  const weights=JSON.parse(execFileSync(process.env.PYTHON || 'python',['-B','-c',queryCode,paths['ml-queries.npz'],id],{encoding:'utf8'}));
  matrixChecks(m,weights);
  const sources=cfg.sources.map(s=>({kind:s.kind,...snapshot(s,dir,generated)}));
  for(const kind of ['training','features'])assert(sources.some(s=>s.kind===kind),'Missing ML source evidence: '+kind);
  const trainingMeta=read(paths['ml-training.json']);
  if(originalSha256)assert.equal(trainingMeta.originalSha256,originalSha256,'ML training used another original forecast');
  const evidence=rows=>rows.map(s=>JSON.stringify([s.kind,s.url,s.publishedAt,s.sha256])).sort();
  assert.deepEqual(evidence(trainingMeta.sourceEvidence),evidence(sources),'ML evidence differs from the sources bound to training');
  return {model:'full-map-xgboost',generatedAt:cfg.generatedAt,artifactSha256:cfg.sha256,inputs:payload.inputs,
    versions:{xgboost:payload.xgboostVersion,seed:payload.seed},sources,cutoffExclusive:m.cutoffExclusive,training:m.training,
    pool:m.pool,teamOrder:m.teams,rosters:q.rosters,points:q.points,bo1:m.bo1,bo3:m.bo3,mapProbabilities:m.mapProbabilities,mapWeights:weights};
}
function freeze(basePath,manifestPath,archiveDir) {
  const original=base.inspect(basePath),i=original.payload.input,manifestRaw=fs.readFileSync(manifestPath),manifest=JSON.parse(manifestRaw),dir=path.dirname(manifestPath);
  assert.equal(i.stage,3,'Only genuine Stage 3 archives qualify');
  assert.equal(manifest.originalSha256,original.sha256,'Wrong original forecast');
  const now=Date.now();checkPaths(now,i);
  const previous=verifyPrevious(manifest.previous,i,dir,now);
  official(manifest.lockEvidence.url,i);
  const lockEvidence=snapshot(manifest.lockEvidence,dir,now);
  assert.equal(timestamp(manifest.lockEvidence.lockAt),timestamp(i.lockAt),'Unconfirmed game lock');
  const ml=loadModel(manifest.ml,i,dir,now,original.sha256);
  const field={id:i.edition+'-stage3',teams:i.teams,direct:teams.slice(0,8),seedOrder:teams,cutoff:i.editionStartAt.slice(0,10)};
  const profile=grouping(field),matrix={bo1:ml.bo1,bo3:ml.bo3,allBo3:i.format==='all-bo3'};
  const search=samples(field,matrix,sampleCount,productionSeed,'major');
  const cards=chooseCards(search,field,profile),selected=selectedPolicy(i.edition,manifest.selectedPolicy);
  const frozenAt=new Date().toISOString();
  checkPaths(timestamp(frozenAt),i);
  const payload={version:1,edition:i.edition,stage:3,frozenAt,originalSha256:original.sha256,originalFrozenAt:original.payload.frozenAt,
    manifestSha256:digest(manifestRaw),startAt:i.startAt,lockAt:i.lockAt,format:i.format,
    previous,lockEvidence,ml,seed:productionSeed,samples:sampleCount,selectedPolicy:selected,cards,profile,
    pathsSha256:digest(Buffer.from(search.outcomes.buffer,search.outcomes.byteOffset,search.outcomes.byteLength)),
    codeSha256:Object.fromEntries(codeFiles.map(f=>[f,digest(fs.readFileSync(require.resolve(f)))]))};
  const record={sha256:hash(payload),payload};
  fs.mkdirSync(archiveDir,{recursive:true});
  const out=path.join(archiveDir,field.id+'-ml-allocation.json'),tmp=path.join(archiveDir,'.'+randomUUID()+'.tmp');
  try{
    fs.writeFileSync(tmp,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    checkPaths(Date.now(),i);fs.linkSync(tmp,out);
  }finally{fs.rmSync(tmp,{force:true});}
  return {path:out,sha256:record.sha256,frozenAt};
}
function inspect(file,basePath) {
  const r=read(file),p=r.payload,orig=base.inspect(basePath),i=orig.payload.input;
  assert.equal(hash(p),r.sha256,'Research archive checksum mismatch');
  assert.equal(p.originalSha256,orig.sha256,'Wrong original forecast');
  assert.equal(p.version,1);assert.equal(p.stage,3);assert.equal(i.stage,3);assert.equal(p.edition,i.edition);
  assert.equal(p.startAt,i.startAt);assert.equal(p.lockAt,i.lockAt);assert.equal(p.format,i.format);
  assert.equal(p.originalFrozenAt,orig.payload.frozenAt);
  const at=timestamp(p.frozenAt);
  assert(timestamp(p.originalFrozenAt)<=at && at<=Date.now());checkPaths(at,i);
  assert.equal(p.seed,productionSeed);assert.equal(p.samples,sampleCount);assert.deepEqual(Object.keys(p.cards).sort(),policies.slice().sort());
  assert.deepEqual(p.ml.teamOrder,i.teams.map(t=>t.name));assert.deepEqual(p.ml.rosters,i.teams.map(t=>t.roster));
  assert.deepEqual(p.ml.points,i.teams.map(t=>t.points));
  assert(timestamp(p.ml.generatedAt)<=at && timestamp(p.ml.generatedAt)>=timestamp(i.qualificationCompleteAt));
  assert.equal(p.selectedPolicy,selectedPolicy(i.edition,p.selectedPolicy));
  assert.equal(p.ml.model,'full-map-xgboost');assert.equal(p.ml.versions.xgboost,'3.0.2');assert.equal(p.ml.versions.seed,42);
  const sha=s=>assert.match(s,/^[a-f0-9]{64}$/,'Missing or invalid SHA-256');
  for(const v of [p.manifestSha256,p.pathsSha256,p.previous.sha256,p.ml.artifactSha256,...inputFiles.map(k=>p.ml.inputs[k]),...codeFiles.map(k=>p.codeSha256[k])])sha(v);
  const checkedSource=(s,until)=>{
    assert(Number.isSafeInteger(s.bytes) && s.bytes>0 && timestamp(s.publishedAt)<=until,'Invalid source size or publication date');
    const u=new URL(s.url);assert(u.protocol==='https:' && !u.username && !u.password);sha(s.sha256);
  };
  for(const kind of ['training','features'])assert(p.ml.sources.some(s=>s.kind===kind),'Missing ML source');
  for(const s of p.ml.sources)checkedSource(s,timestamp(p.ml.generatedAt));
  official(p.lockEvidence.url,i);checkedSource(p.lockEvidence,at);
  official(p.previous.source.url,i);checkedSource(p.previous.source,at);
  assert.equal(timestamp(p.previous.endAt),timestamp(i.qualificationCompleteAt));
  assert(timestamp(p.previous.source.publishedAt)>=timestamp(p.previous.endAt));
  if(p.previous.rosterArchiveSha256)sha(p.previous.rosterArchiveSha256);
  else assert.deepEqual(p.previous.advanced.slice().sort(),i.teams.slice(8).map(t=>t.name).sort());
  for(const k of policies){assert.equal(p.cards[k].length,16);cardScore(p.cards[k],null);}
  matrixChecks(p.ml,p.ml.mapWeights);
  return r;
}
function score(file,basePath,resultsPath) {
  const r=inspect(file,basePath),p=r.payload,i=base.inspect(basePath).payload.input;
  official(read(resultsPath).source.url,i);
  if(i.edition==='singapore-2026')confirmSingaporeResult(resultsPath,3);
  const {actual,games,verified}=base.readResults(resultsPath,i.edition,3,i.startAt,i.format,p.ml.teamOrder);
  const cards=Object.fromEntries(policies.map(k=>{
    const s=cardScore(p.cards[k],actual);return [k,{...s,passed:s.hits>=5}];
  }));
  const formats=Object.fromEntries(['bo1','bo3'].map(k=>[k,errors(games.filter(g=>g.key===k && g.played).map(g=>p.ml[k][g.w][g.l]))]));
  return {edition:i.edition,stage:3,archiveSha256:r.sha256,originalSha256:p.originalSha256,matched:games.length,
    source:verified,resultsSha256:digest(fs.readFileSync(resultsPath)),selectedPolicy:p.selectedPolicy,cards,formats};
}
function webRecords(dir=path.join(__dirname,'../forecast_archive/prospective')) {
  const records=[];
  for(const {edition} of require('../stage_goals/tracked-majors.json')){
    assert.match(edition,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const baseName=edition+'-stage3',file=baseName+'-ml-allocation.json',sourceFile=path.resolve(dir,file);
    if(!fs.existsSync(sourceFile))continue;
    const original=path.join(dir,baseName+'.json'),result=path.join(dir,'results',baseName+'.json');
    const {payload:p,sha256}=inspect(sourceFile,original);
    assert.equal(p.edition,edition,'Research archive saved under another edition');
    records.push({edition,stage:3,teams:p.ml.teamOrder,cards:p.cards,selectedPolicy:p.selectedPolicy,
      frozenAt:p.frozenAt,archiveSha256:sha256,score:fs.existsSync(result)?score(sourceFile,original,result):null,
      webFile:'forecasts/prospective/'+file,sourceFile});
  }
  return records;
}
module.exports={freeze,score,inspect,webRecords,loadModel,selectedPolicy};
if(require.main===module){try{
  const [action,...args]=process.argv.slice(2);
  const web=action==='web' && args.length<=1;
  assert(web || (['score','freeze'].includes(action) && args.length===3),'freeze <original> <ML manifest> <archive-dir> | score <ML archive> <original> <results> | web [archive-dir]');
  console.log(JSON.stringify((web?webRecords:action==='freeze'?freeze:score)(...args),null,2));
}catch(e){console.error(e.message);process.exitCode=1;}}
