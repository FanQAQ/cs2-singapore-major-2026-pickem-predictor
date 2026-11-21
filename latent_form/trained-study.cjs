'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto'),{Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const old=require('../f1bre_models/evaluate.cjs'),allocation=require('../ml_allocation/evaluate.cjs');
const {samples,inSeedOrder,teams}=require('../ml_allocation/draw.cjs'),swiss=require('../epl_transfer/swiss.cjs');
const {scoreThresholds}=require('../stage1_holdout/evaluate.cjs');
const {cardScore,errors}=require('../f1bre_models/score.cjs');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const n=budget/2,keys=['baseline','ml'],groups=['S1','S2','S3','Cluj','EPL','Bucharest','Elisa'];
const ids=[...Object.keys(require('../f1bre_models/major-fields.json').fields).filter(id=>id!=='singapore'),'cluj-2026','epl21-stage2','epl22-stage2','epl23-stage2','bucharest-2025-april'];
const elisa=['elisa-spring','elisa-fall'];
const digest=data=>createHash('sha256').update(data).digest('hex'),hash=v=>digest(JSON.stringify(v));
const read=file=>JSON.parse(fs.readFileSync(file)),sum=xs=>xs.reduce((a,b)=>a+b,0),mean=xs=>sum(xs)/xs.length;
const trainingPath=path.join(__dirname,'training.json');
const report=path.join(__dirname,'trained-summary.json');
const previous=require('../f1bre_models/report.json');
const pop=new Uint8Array(65536);for(let i=1;i<pop.length;i++)pop[i]=pop[i>>>1]+(i&1);
function fieldData(id) {
  if(id==='bucharest-2025-april'){
    const source=read(path.join(__dirname,'bucharest-field.json')),result=read(path.join(__dirname,'bucharest-results.json'));
    const ml=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(__dirname,'bucharest-ml/ml.json.gz')))).fields[id];
    assert.equal(source.id,id);assert.equal(result.id,id);assert.equal(ml.start,source.start);
    const order=source.seedOrder,slot=a=>order.indexOf(a);
    assert.deepEqual(order.slice().sort((a,b)=>a-b),teams);assert.deepEqual(ml.teams,source.teams.map(t=>t.name));
    const sorted=order.map(a=>source.teams[a]),actual=order.map(a=>result.actual[a]);
    const rounds=result.rounds.map(r=>r.map(([w,l])=>[slot(w),slot(l)]));
    const replay=CS.replay(rounds);assert(replay.ok && replay.matched===33);assert.deepEqual(replay.actual,actual);
    const matches=result.matches.map(g=>{assert.equal(g.bo,3);assert(g.maps.length>=2);return {w:slot(g.w),l:slot(g.l),bo:3,id:g.id};});
    assert.deepEqual(matches.map(g=>[g.w,g.l]),rounds.flat());
    const vrs=sorted.map(a=>sorted.map(b=>1/(1+10**((b.points-a.points)/400))));
    const align=m=>order.map(a=>order.map(b=>m[a][b]));
    const f={id,start:source.start,teams:sorted,allBo3:true,scheme:'major',seedOrder:teams};
    return {f,group:'Bucharest',truth:{actual,matches},models:{baseline:{allBo3:true,bo1:vrs,bo3:vrs},
      ml:{allBo3:true,bo1:align(ml.bo1),bo3:align(ml.bo3)}}};
  }
  if(id.startsWith('epl') || id.startsWith('elisa-')){
    const f=allocation.fieldFor(id),truth=allocation.truthFor(f),models=allocation.modelsFor(f);
    const name=id+'-'+f.scheme+'.json',cache=path.join(__dirname,'../ml_allocation/cache',name);
    const published=fs.existsSync(cache)?read(cache):null;
    return {f,truth,models,group:f.group==='esl'?'EPL':'Elisa',published};
  }
  const raw=old.getField(id),f={...raw,scheme:'major',seedOrder:teams};
  const truth=old.truth(id,f.teams.map(t=>t.name)),models=old.matrices(f,keys);
  return {f,truth,models,group:id==='cluj-2026'?'Cluj':'S'+f.stage,published:previous.fields.find(p=>p.id===id)};
}
function trainingRow(t,id) {return t.targets[id]??t.targets[id+'-2024'];}
function table(matrix,scale) {
  let maxMarginalError=0;
  const cases=teams.map(a=>teams.map(b=>{
    const p=matrix.bo3[a][b],c=CS.stateCases(p,scale,scale);
    maxMarginalError=Math.max(maxMarginalError,Math.abs(mean(c)-p));return c;
  }));
  assert(maxMarginalError<1e-12,'BO3 marginal probability changed');
  for(const a of teams)for(const b of teams)for(let sign=0;sign<4;sign++)
    assert(Math.abs(cases[a][b][sign]+cases[b][a][((sign&1)<<1)|(sign>>1)]-1)<1e-7);
  return {cases,maxMarginalError};
}
function eplDraw(field,matrix,n,seed,cases) {
  const random=CS.rng(seed),signs=CS.rng((seed^0x1b873593)>>>0),outcomes=new Uint16Array(3*n);
  const frequencies=teams.map(()=>[0,0,0,0]),full=field.ratingMargin==='full';
  const thresholds=matrix.bo3.map((row,a)=>row.map((p,b)=>{
    const [sweep,,reverse]=scoreThresholds(p);
    const conditional=cases[a][b].map(q=>[q*sweep/p,q,q+(1-q)*(reverse-p)/(1-p)]);
    for(const [j,expected] of [sweep,p,reverse].entries())assert(Math.abs(mean(conditional.map(t=>t[j]))-expected)<1e-12);
    return conditional;
  }));
  for(let trial=0;trial<n;trial++){
    const sign=Math.floor(signs()*65536);
    const s={wins:new Uint8Array(16),losses:new Uint8Array(16),met:new Uint16Array(16),ratings:field.liveRatings.slice()};
    for(let r=0;r<5;r++)for(const [a,b] of swiss.pairs(s,r)){
      const t=thresholds[a][b][2*((sign>>a)&1)+((sign>>b)&1)],v=random();
      if(v<t[1])swiss.result(s,a,b,full?0:Number(v>=t[0]));
      else swiss.result(s,b,a,full?0:Number(v>=t[2]));
    }
    for(const i of teams){const c=swiss.category(s,i);frequencies[i][c]++;if(c<3)outcomes[3*trial+c]|=1<<i;}
  }
  return {count:n,frequencies,outcomes};
}
// The released Elisa sampler reads bo3[a][b] once per game, exactly 33 times per path.
// Expose the current path's conditional odds while keeping its draw RNG and pairing code identical.
function elisaDraw(field,n,seed,cases) {
  const signs=CS.rng((seed^0x1b873593)>>>0);let games=0,mask;
  const rows=teams.map(a=>{const row=[];for(const b of teams)Object.defineProperty(row,b,{get(){
    if(games%33===0)mask=Math.floor(signs()*65536);
    games++;return cases[a][b][((mask>>a)&1)*2+((mask>>b)&1)];
  }});return row;});
  const drawn=samples(field,{bo3:rows},n,seed,field.scheme);assert.equal(games,n*33);return drawn;
}
function makeDraw(f,m,scale) {
  assert(!m.state,'The independent control already contains correlated state');
  const {cases,maxMarginalError}=table(m,scale);
  if(f.scheme==='major'){
    const matrix=scale?{...m,state:{scales:teams.map(()=>scale),bo3Only:true}}:m;
    return {maxMarginalError,draw:(count,seed)=>samples(f,matrix,count,seed,'major')};
  }
  const conditional=(count,seed)=>f.scheme==='esl'?eplDraw(f,m,count,seed,cases):elisaDraw(f,count,seed,cases);
  if(!scale){
    const simple=samples(f,m,7,seeds[0],f.scheme),check=conditional(7,seeds[0]);
    assert.deepEqual(simple.outcomes,check.outcomes,'Zero state must reproduce external simulation paths');
  }
  return {maxMarginalError,draw:scale?conditional:(count,seed)=>samples(f,m,count,seed,f.scheme)};
}
function auditPass(card,sample) {
  const masks=[0,0,0];card.forEach((k,i)=>{if(k<3)masks[k]|=1<<i;});
  let pass=0;for(let j=0;j<sample.outcomes.length;j+=3){
    const hit=pop[masks[0]&sample.outcomes[j]]+pop[masks[1]&sample.outcomes[j+1]]+pop[masks[2]&sample.outcomes[j+2]];
    pass+=Number(hit>=5);
  }return pass/sample.count;
}
function tail(perfect,zero,actual) {
  const binary=(ps,c)=>mean(ps.map((p,i)=>(p-Number(actual[i]===c))**2));
  const rank=(ps,c)=>teams.slice().sort((a,b)=>ps[b]-ps[a]||a-b).slice(0,2).filter(i=>actual[i]===c).length;
  const a=binary(perfect,0),b=binary(zero,2);
  return {perfect:a,zero:b,mean:(a+b)/2,perfectTop2:rank(perfect,0),zeroTop2:rank(zero,2)};
}
function simulate(f,m,scale,actual,published,k) {
  const {draw,maxMarginalError}=makeDraw(f,m,scale),pooledPerfect=teams.map(()=>0),pooledZero=teams.map(()=>0);
  const hitsBySeed=[],cardsBySeed=[],mainData={};
  for(const [i,seed] of seeds.entries()){
    const search=draw(n,seed),audit=draw(n,(seed^0xc5398da1)>>>0);
    const bySeed=CS.cardsFromSamples(inSeedOrder(search,f.seedOrder),true).card;
    const card=teams.map(t=>bySeed[f.seedOrder.indexOf(t)]),score=cardScore(card,actual),pass=auditPass(card,audit);
    if(scale===0 && published){
      const past=published.methods[k].runs[i];
      assert.deepEqual(card,past.card??past.standard,'Published control card differs: '+f.id+' '+k+' '+i);
      const oldPass=typeof past.audit==='number'?past.audit:past.audit.standard.passes/n;
      assert(Math.abs(pass-oldPass)<1e-8,'Published control audit differs: '+f.id+' '+i);
    }
    cardsBySeed.push(card);hitsBySeed.push(score.hits);
    const perfect=audit.frequencies.map(row=>row[0]/n),zero=audit.frequencies.map(row=>row[2]/n);
    for(const t of teams){pooledPerfect[t]+=audit.frequencies[t][0];pooledZero[t]+=audit.frequencies[t][2];}
    if(!i)Object.assign(mainData,{...score,passed:score.hits>=5,card,simulatedPass:pass,perfect,zero});
  }
  for(const t of teams){pooledPerfect[t]/=n*seeds.length;pooledZero[t]/=n*seeds.length;}
  return {main:mainData,hitsBySeed,cardsBySeed,pooledPerfect,pooledZero,maxMarginalError,
    tailBrier:{main:tail(mainData.perfect,mainData.zero,actual),pooled:tail(pooledPerfect,pooledZero,actual)}};
}
const sources=['./trained-study.cjs','../engine/engine.js','../dist/engine.js','../ml_allocation/draw.cjs','../epl_transfer/swiss.cjs','../stage1_holdout/evaluate.cjs','../tail_calibration/evaluate-esl21.cjs'];
const cacheRoot=path.join(os.tmpdir(),'pickem-trained-state-'+hash(sources.map(f=>digest(fs.readFileSync(require.resolve(f))))).slice(0,16));
function evaluate(id,k,scale) {
  assert(Number.isFinite(scale) && scale>=0 && scale<=.5);
  const {f,models,truth,group,published}=fieldData(id),m=models[k];
  const names=f.teams.map(t=>t.name), sig=hash({f,m,truth,scale,k,seeds,n}).slice(0,16);
  const file=path.join(cacheRoot,id+'-'+k+'-'+sig+'.json');
  if(fs.existsSync(file))return read(file);
  const pred=simulate(f,m,scale,truth.actual,published,k);
  const seriesErrors=Object.fromEntries([1,3].map(bo=>['bo'+bo,errors(truth.matches.filter(g=>g.bo===bo).map(g=>m['bo'+bo][g.w][g.l]))]));
  const row={id,group,start:f.start,teams:names,actual:truth.actual,scale,pred,seriesErrors,matrixSha256:hash(m),matches:truth.matches.length};
  fs.mkdirSync(cacheRoot,{recursive:true});fs.writeFileSync(file,JSON.stringify(row));return row;
}
function summarizeGroup(fields,k) {
  const sides={};
  for(const side of ['control','trained']){
    const ms=fields.map(f=>f.models[k][side]),hitsBySeed=seeds.map((_,i)=>sum(ms.map(m=>m.hitsBySeed[i])));
    const passesBySeed=seeds.map((_,i)=>ms.filter(m=>m.hitsBySeed[i]>=5).length);
    sides[side]={passes:passesBySeed[0],hits:hitsBySeed[0],denominator:fields.length,slots:[0,1,2].map(c=>sum(ms.map(m=>m.main.slots[c]))),
      passesBySeed,hitsBySeed,tailBrier:Object.fromEntries(['main','pooled'].map(stream=>[stream,
        Object.fromEntries(['perfect','zero','mean'].map(c=>[c,mean(ms.map(m=>m.tailBrier[stream][c]))]))]))};
  }
  const control=sides.control,trained=sides.trained;
  const countDiff=(a,b)=>({better:seeds.filter((_,i)=>b[i]>a[i]).length,same:seeds.filter((_,i)=>b[i]===a[i]).length,worse:seeds.filter((_,i)=>b[i]<a[i]).length});
  return {...sides,direction:countDiff(control.passesBySeed,trained.passesBySeed),hitsDirection:countDiff(control.hitsBySeed,trained.hitsBySeed)};
}
async function main(){
  const controlOnly=process.argv.includes('--controls'),training=controlOnly?null:read(trainingPath);
  const useElisa=elisa.filter(id=>training && trainingRow(training,id));
  const fixtures=ids.concat(useElisa),jobs=[],data={};
  for(const id of fixtures)for(const k of keys){
    const scale=controlOnly?0:trainingRow(training,id)?.scale;
    assert(Number.isFinite(scale),'Missing pre-stage scale '+id);
    for(const s of new Set([0,scale]))jobs.push({id,k,scale:s});
  }
  let at=0,done=0;
  async function thread(){
    while(at<jobs.length){
      const job=jobs[at++],key=[job.id,job.k,job.scale].join('/');
      data[key]=await new Promise((resolve,reject)=>{const w=new Worker(__filename,{workerData:job});
        w.on('message',resolve);w.on('error',reject);w.on('exit',code=>{if(code)reject(Error('worker '+code));});});
      if(++done%5===0)console.log(done+'/'+jobs.length);
    }
  }
  await Promise.all(Array.from({length:Math.min(8,jobs.length)},thread));
  if(controlOnly){console.log('Independent control replays verified.',fixtures.length);return;}
  const fields=fixtures.map(id=>{
    const t=trainingRow(training,id),r=data[[id,'baseline',0].join('/')];assert(t.cutoffExclusive<=r.start);
    const {truth}=fieldData(id),games=truth.matches.concat(truth.excluded??[]);assert.equal(games.length,33);
    const actualRecord=teams.map(i=>r.actual[i]===4?null:[games.filter(g=>g.w===i).length,games.filter(g=>g.l===i).length]);
    for(const [i,v] of actualRecord.entries())if(v){
      const [wins,losses]=v;assert.equal(Math.max(wins,losses),3);assert.equal(r.actual[i],wins===3?(losses===0?0:1):(wins===0?2:3));
    }
    return {id,group:r.group,start:r.start,teams:r.teams,actual:r.actual,scale:t.scale,covarianceCI95:t.covarianceCI95,
      covariance:t.covariance,events:t.events,pairs:t.pairs,cutoffExclusive:t.cutoffExclusive,actualRecord,
      scaleStatus:t.status,zeroReasons:t.zeroReasons,windowStart:t.windowStart,
      models:Object.fromEntries(keys.map(k=>{
        const c=data[[id,k,0].join('/')],s=data[[id,k,t.scale].join('/')];
        assert.deepEqual(c.seriesErrors,s.seriesErrors);assert.equal(c.matrixSha256,s.matrixSha256);
        return [k,{seriesErrors:c.seriesErrors,matrixSha256:c.matrixSha256,control:c.pred,trained:s.pred}];
      }))};
  });
  const summaryGroups={};for(const group of groups){
    const subset=fields.filter(f=>f.group===group);
    if(subset.length)summaryGroups[group]=Object.fromEntries(keys.map(k=>[k,summarizeGroup(subset,k)]));
  }
  const gate={};for(const k of keys){
    const m=summaryGroups.S3[k],h=summaryGroups.Cluj[k];
    const tests={mainPass:m.trained.passes>m.control.passes,mainHits:m.trained.hits>=m.control.hits,
      seeds:m.direction.same+m.direction.better>=24 && m.direction.better>m.direction.worse,
      S1:['hits','passes'].every(s=>summaryGroups.S1[k].trained[s]>=summaryGroups.S1[k].control[s]),
      S2:['hits','passes'].every(s=>summaryGroups.S2[k].trained[s]>=summaryGroups.S2[k].control[s]),
      clujHits:h.trained.hits>=h.control.hits,clujTails:h.trained.tailBrier.main.mean<=h.control.tailBrier.main.mean+.01};
    gate[k]={...tests,passed:Object.values(tests).every(Boolean)};
  }
  const omitted=elisa.filter(id=>!useElisa.includes(id)).map(id=>({id,reason:'No independently fitted complete pre-stage training window supplied for this fixture.'}));
  const result={seed:seeds[0],seeds,pathsPerPartition:n,trainingSha256:digest(fs.readFileSync(trainingPath)),fields,groups:summaryGroups,gate,omitted};
  const bytes=JSON.stringify(result)+'\n';
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(report,'utf8'),bytes,'Recorded results differ');
  else fs.writeFileSync(report,bytes);
  console.log('Verified',report,fields.length,'fields');
}
module.exports={evaluate,fieldData,table,tail,makeDraw};
if(require.main===module){
  if(!isMainThread)parentPort.postMessage(evaluate(workerData.id,workerData.k,workerData.scale));
  else main().catch(e=>{console.error(e);process.exitCode=1;});
}
