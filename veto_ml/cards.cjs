'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const old=require('../f1bre_models/evaluate.cjs');
const {fieldData}=require('../latent_form/trained-study.cjs');
const {samples,teams}=require('../ml_allocation/draw.cjs');
const {cardScore,errors}=require('../f1bre_models/score.cjs');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const n=budget/2,methods=['reference','original','candidate'],root=__dirname;
const modelsFile=path.join(root,'models.json.gz'),cardsFile=path.join(root,'cards.json');
const sourceFields=require('../f1bre_models/major-fields.json').fields;
const fixed=['austin-2025-3','budapest-2025-3','cologne-2026-3','epl23-stage2','cluj-2026','bucharest-2025-april','astana-2025'];
const historic=Object.keys(sourceFields).filter(id=>id!=='singapore' && sourceFields[id].stage<3);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex'),read=f=>JSON.parse(fs.readFileSync(f));
const pop=new Uint8Array(65536);for(let i=1;i<65536;i++)pop[i]=pop[i>>>1]+(i&1);
function group(id){
  return sourceFields[id]?(id==='singapore'?'Singapore':'S'+sourceFields[id].stage):
    ({'epl23-stage2':'EPL','astana-2025':'Astana','bucharest-2025-april':'Bucharest','cluj-2026':'Cluj'})[id];
}
function astanaData() {
  const raw=read(path.join(root,'astana-field.json')),t=read(path.join(root,'astana-results.json'));
  assert.equal(raw.id,'astana-2025');assert.equal(t.id,raw.id);
  const order=raw.seedOrder;assert.deepEqual(order.slice().sort((a,b)=>a-b),teams);
  const slot=a=>order.indexOf(a),sorted=order.map(i=>raw.teams[i]);
  const rounds=t.rounds.map(row=>row.map(([w,l])=>[slot(w),slot(l)]));
  const replay=CS.replay(rounds);assert(replay.ok && replay.matched===33,'Astana schedule must replay all official pairings');
  assert.deepEqual(replay.actual,order.map(i=>t.actual[i]));
  const matches=t.matches.map(m=>{assert(m.maps.length>=2 && m.bo===3);return {id:m.id,w:slot(m.w),l:slot(m.l),bo:m.bo};});
  assert.deepEqual(matches.map(m=>[m.w,m.l]),rounds.flat());
  const f={id:raw.id,teams:sorted,start:raw.start,scheme:'major',allBo3:true,seedOrder:teams};
  const points=sorted.map(t=>t.points);assert(points.every(p=>Number.isFinite(p)&&p>0));
  const vrs=points.map(a=>points.map(b=>1/(1+10**((b-a)/400))));
  const archive=JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'astana-ml/ml.json.gz')))).fields[raw.id];
  const axes=archive.teams;assert.deepEqual(axes.slice().sort(),sorted.map(t=>t.name).sort());
  const idx=sorted.map(t=>axes.indexOf(t.name)),align=m=>idx.map(i=>idx.map(j=>m[i][j]));
  return {f,truth:{actual:replay.actual,matches},models:{baseline:{bo1:vrs,bo3:vrs,allBo3:true},ml:{bo1:align(archive.bo1),bo3:align(archive.bo3),allBo3:true}}};
}
function context(id) {
  if(id==='astana-2025')return astanaData();
  if(id!=='singapore')return fieldData(id);
  const f={...old.getField(id),scheme:'major',seedOrder:teams};
  return {f,truth:null,models:old.matrices(f,['baseline','ml'])};
}
function schedule(f,truth,allBo3){
  if(!truth)return {matches:[],actualRecord:null};
  const id=f.id,annotated=new Map();
  let rounds,rows=[];
  if(sourceFields[id]){
    const e=PickLab.allEvents.find(e=>e.id===id),official=require('../stage_transfer/evaluate.cjs').fieldFor(e);
    rounds=e.rounds;rows=official.records.map(m=>({w:m.y?m.a:m.b,l:m.y?m.b:m.a,id:m.id,day:m.day}));
  }else if(id==='epl23-stage2')rounds=require('../epl_transfer/actual.json').rounds;
  else if(id==='cluj-2026'){
    const r=require('../f1bre_models/cluj-results.json');rounds=r.rounds;
    const names=f.teams.map(t=>t.name);
    rows=r.matches.map(m=>{const a=names.indexOf(m.a),b=names.indexOf(m.b);assert(a>=0 && b>=0);
      return {...m,w:m.score[0]>m.score[1]?a:b,l:m.score[0]>m.score[1]?b:a};});
  }else{
    const field=id==='astana-2025'?read(path.join(root,'astana-field.json')):require('../latent_form/bucharest-field.json');
    const r=id==='astana-2025'?read(path.join(root,'astana-results.json')):require('../latent_form/bucharest-results.json');
    const slot=x=>field.seedOrder.indexOf(x);
    rounds=r.rounds.map(row=>row.map(([w,l])=>[slot(w),slot(l)]));
    rows=r.matches.map(g=>({...g,w:slot(g.w),l:slot(g.l)}));
  }
  const score=teams.map(()=>[0,0]),meta=new Map(rows.map(g=>[g.w+','+g.l,g]));
  assert.deepEqual(rounds.map(r=>r.length),[8,8,8,6,3]);
  for(const [r,round] of rounds.entries()){
    const used=new Set();
    for(const [w,l] of round){
      assert(!used.has(w) && !used.has(l));used.add(w);used.add(l);
      assert.deepEqual(score[w],score[l]);const [wins,losses]=score[w],key=w+','+l;
      assert(!annotated.has(key));const extra=meta.get(key);
      annotated.set(key,{round:r+1,groupRecord:[wins,losses],phase:wins===2?(losses===2?'both':'advancement'):(losses===2?'elimination':'early'),
        id:extra?.id??null,day:extra?.day??null,bo:allBo3?3:CS.bestOf(wins,losses)});
      score[w][0]++;score[l][1]++;
    }
  }
  assert.equal(annotated.size,33);
  assert.deepEqual(score.map(([w,l])=>w===3?(l===0?0:1):w===0?2:3),truth.actual);
  const matches=truth.matches.map(g=>{
    const row=annotated.get(g.w+','+g.l);assert(row && row.bo===g.bo);
    return {...g,...row,id:row.id??g.id??null};
  });
  return {matches,actualRecord:score};
}
function prepare(id,model) {
  const {f,models,truth}=context(id),names=f.teams.map(t=>t.name),axis=model.teams;
  assert.deepEqual(axis.slice().sort(),names.slice().sort(),id+' listed teams differ');
  assert.equal(new Set(axis).size,16);
  assert.equal(model.start,f.start);assert.equal(model.cutoffExclusive,f.cutoffExclusive??f.start);
  assert.equal(new Set(model.pool).size,7);
  const triples=model.triples.map(names=>{const maps=names.map(x=>model.pool.indexOf(x));
    assert(maps.length===3 && new Set(maps).size===3 && maps.every(i=>i>=0));return maps;});
  assert.equal(triples.length,35);assert.equal(new Set(triples.map(t=>t.slice().sort().join(','))).size,35);
  const idx=names.map(name=>axis.indexOf(name)),align=m=>idx.map(i=>idx.map(j=>m[i][j]));
  assert.deepEqual(f.seedOrder,teams,'Matrix and Swiss bracket must use the official seed order');
  const original=models.ml,candidate={bo1:original.bo1,bo3:align(model.bo3),allBo3:original.allBo3};
  for(const [label,expected] of [['bo1',original.bo1],['bo3',original.bo3]]){
    const baseline=align(model.baseline[label]);
    const compared=label==='bo1'?[baseline,align(model.bo1)]:[baseline];
    for(const m of compared)for(const i of teams)for(const j of teams)
      assert(Math.abs(m[i][j]-expected[i][j])<2.1e-8,id+' fails published '+label+' reproduction');
  }
  const origin=Array.from({length:16},()=>Array(16).fill(null));let both=0,one=0,neither=0,changed=0,bothAtLeastFive=0;
  assert.equal(model.pairs.length,120);
  for(const p of model.pairs){
    const position=v=>typeof v==='string'?axis.indexOf(v):v;
    const a=idx.indexOf(position(p.a)),b=idx.indexOf(position(p.b));
    assert(teams.includes(a)&&teams.includes(b)&&a!==b&&origin[a][b]===null,'Duplicate or invalid matrix pair');
    assert([p.nA,p.nB].every(x=>Number.isInteger(x) && x>=0),'Missing pre-stage veto counts');
    origin[a][b]=[p.nA,p.nB];origin[b][a]=[p.nB,p.nA];
    const q=candidate.bo3[a][b],delta=q-original.bo3[a][b];
    assert(q>0 && q<1 && Math.abs(q+candidate.bo3[b][a]-1)<1e-8);
    assert.equal(p.maps.length,7);assert(p.maps.every(v=>Number.isFinite(v) && v>=0 && v<=1));
    const series=triples.map(t=>{const [x,y,z]=t.map(i=>p.maps[i]);return x*y+x*z+y*z-2*x*y*z;});
    for(const [mass,expected] of [[p.original,original.bo3[a][b]],[p.veto,q]]){
      assert(mass.length===35 && mass.every(v=>Number.isFinite(v) && v>=0));
      assert(Math.abs(mass.reduce((s,v)=>s+v,0)-1)<1e-10,'Invalid triple probabilities');
      assert(Math.abs(mass.reduce((s,v,j)=>s+v*series[j],0)-expected)<2.1e-8,'BO3 differs from seven-map evidence');
    }
    if(p.nA && p.nB)both++;else if(p.nA || p.nB)one++;else{neither++;assert(Math.abs(delta)<2.1e-8,'Fully unseen pair must use the original ML weights');}
    if(Math.abs(delta)>2.1e-8)changed++;
    if(Math.min(p.nA,p.nB)>=5)bothAtLeastFive++;
  }
  assert.equal(both+one+neither,120);
  return {f,names,truth,origin,coverage:{both,one,neither,bothAtLeastFive,changed},matrices:{reference:models.baseline,original,candidate}};
}
function audit(card,sample,other) {
  const masks=c=>[0,1,2].map(k=>c.reduce((bits,v,i)=>v===k?bits|(1<<i):bits,0)),cm=masks(card),om=other?masks(other):null;
  let passed=0,both=0,otherPassed=0;
  for(let j=0;j<sample.outcomes.length;j+=3){
    const enough=m=>pop[sample.outcomes[j]&m[0]]+pop[sample.outcomes[j+1]&m[1]]+pop[sample.outcomes[j+2]&m[2]]>=5;
    const a=enough(cm);passed+=Number(a);
    if(om){const b=enough(om);otherPassed+=Number(b);both+=Number(a&&b);}
  }
  return om?{original:passed,candidate:otherPassed,both,originalOnly:passed-both,candidateOnly:otherPassed-both}:passed;
}
function marginals(freq,actual){
  return freq.map((row,i)=>{
    const [perfect,ordinary,zero,other]=row.map(v=>v/n),qualified=perfect+ordinary;
    return {perfect,ordinary,zero,qualified,perfectGivenQualified:qualified?perfect/qualified:null,
      zeroGivenEliminated:other+zero?zero/(other+zero):null,actual:actual?.[i]??null};
  });
}
function publicControl(id,k){
  const previous=require('../latent_form/trained-summary.json').fields.find(f=>f.id===id);
  if(previous)return previous.models[k==='reference'?'baseline':'ml'].control;
  if(id==='singapore'){
    const prior=require('../f1bre_models/report.json').fields.find(f=>f.id===id).methods[k==='reference'?'baseline':'ml'];
    return {cardsBySeed:prior.runs.map(r=>r.card)};
  }
  return null;
}
function evaluate(id,archive) {
  const {f,names,truth,origin,coverage,matrices}=prepare(id,archive);
  const actual=truth?.actual??null,s=schedule(f,truth,matrices.original.allBo3),methodsOut={};
  const matches=s.matches.map(({w,l,bo,id:matchId,round,groupRecord,phase,day},index)=>{
    const ps=Object.fromEntries(methods.map(k=>[k,matrices[k]['bo'+bo][w][l]]));
    return {index,id:matchId??null,round,groupRecord,phase,day,w,l,bo,preVetoCounts:origin[w][l],winnerProbability:ps};
  });
  const references={reference:publicControl(id,'reference'),original:publicControl(id,'original')},crossAudit=[];
  for(const k of methods){
    const errorsByFormat=Object.fromEntries([1,3].map(bo=>['bo'+bo,errors(matches.filter(m=>m.bo===bo).map(m=>m.winnerProbability[k]))]));
    methodsOut[k]={errors:errorsByFormat,runs:[],main:null};
  }
  for(const [index,seed] of seeds.entries()){
    const tests={},cards={};
    for(const k of methods){
      const matrix=matrices[k],train=samples(f,matrix,n,seed,f.scheme),test=samples(f,matrix,n,(seed^0xc5398da1)>>>0,f.scheme);
      const card=CS.cardsFromSamples(train,true).card,score=cardScore(card,actual),simulatedPass=audit(card,test)/n;
      if(references[k])assert.deepEqual(card,references[k].cardsBySeed[index],id+' '+k+' differs from published card at '+seed);
      if(references[k]?.main && index===0)assert.equal(simulatedPass,references[k].main.simulatedPass);
      const row={seed,card,hits:score?.hits??null,passed:score?score.hits>=5:null,slots:score?.slots??null,qualified:score?.qualified??null,
        wrongTier:score?.wrongTier??null,simulatedPass};
      if(index===0)methodsOut[k].main={...row,teams:marginals(test.frequencies,actual)};
      methodsOut[k].runs.push(row);cards[k]=card;tests[k]=test;
    }
    crossAudit.push({seed,originalPaths:audit(cards.original,tests.original,cards.candidate),candidatePaths:audit(cards.original,tests.candidate,cards.candidate)});
  }
  assert.deepEqual(methodsOut.original.errors.bo1,methodsOut.candidate.errors.bo1);
  return {id,group:group(id),start:f.start,teams:names,actual,actualRecord:s.actualRecord,coverage,matches,
    matched:truth?33:null,played:truth?matches.length:null,matrixSha256:Object.fromEntries(methods.map(k=>[k,digest(JSON.stringify(matrices[k]))])),
    methods:methodsOut,crossAudit};
}
function aggregate(fields){
  const result={};
  for(const k of methods){
    const rs=fields.map(f=>f.methods[k]),hitsBySeed=seeds.map((_,i)=>rs.reduce((s,m)=>s+m.runs[i].hits,0));
    const passesBySeed=seeds.map((_,i)=>rs.filter(m=>m.runs[i].passed).length);
    const matches=fields.flatMap(f=>f.matches);
    const lossOf=games=>errors(games.map(m=>m.winnerProbability[k]));
    const boErrors=Object.fromEntries([1,3].map(bo=>['bo'+bo,lossOf(matches.filter(m=>m.bo===bo))]));
    const bo3ByPhase=Object.fromEntries(['early','advancement','elimination','both'].map(phase=>[phase,lossOf(matches.filter(m=>m.bo===3 && m.phase===phase))]));
    result[k]={passes:passesBySeed[0],hits:hitsBySeed[0],slots:[0,1,2].map(c=>rs.reduce((s,m)=>s+m.main.slots[c],0)),
      qualified:rs.reduce((s,m)=>s+m.main.qualified,0),wrongTier:rs.reduce((s,m)=>s+m.main.wrongTier,0),passesBySeed,hitsBySeed,errors:boErrors,bo3ByPhase};
  }
  const delta=(a,b)=>({better:b.filter((x,i)=>x>a[i]).length,same:b.filter((x,i)=>x===a[i]).length,worse:b.filter((x,i)=>x<a[i]).length});
  return {n:fields.length,ids:fields.map(f=>f.id),methods:result,passDirection:delta(result.original.passesBySeed,result.candidate.passesBySeed),
    hitDirection:delta(result.original.hitsBySeed,result.candidate.hitsBySeed)};
}
async function main(){
  const src=fs.readFileSync(modelsFile),models=JSON.parse(gunzipSync(src)).fields;
  for(const id of fixed)assert(models[id],'Missing preregistered original field '+id);
  const wanted=[...fixed,...historic,'singapore'],ids=wanted.filter(id=>models[id]);
  const groups={},rows=new Array(ids.length);let next=0;
  async function work(){while(next<ids.length){
    const i=next++,id=ids[i];
    rows[i]=await new Promise((resolve,reject)=>{
      const w=new Worker(__filename,{workerData:{id,model:models[id]}});
      w.on('message',resolve);w.on('error',reject);w.on('exit',code=>{if(code)reject(Error('Worker exit '+code));});
    });
  }}
  await Promise.all(Array.from({length:Math.min(7,ids.length)},work));
  for(const g of ['S3','S1','S2','EPL','Cluj','Bucharest','Astana']){
    const subset=rows.filter(r=>r.group===g && r.actual);
    if(subset.length)groups[g]=aggregate(subset);
  }
  const guards=Object.fromEntries(['S1','S2'].map(g=>{
    const selected=historic.filter(id=>group(id)===g);
    return [g,{expected:selected.length,available:selected.filter(id=>models[id]),missing:selected.filter(id=>!models[id]),
      allFallback:rows.filter(r=>r.group===g && r.coverage.neither===120).map(r=>r.id),withChangedPair:rows.filter(r=>r.group===g && r.coverage.changed>0).map(r=>r.id)}];
  }));
  const output={modelSha256:digest(src),seed:seeds[0],seeds,pathsPerPartition:n,fields:rows,groups,guards,
    prospective:rows.filter(r=>!r.actual).map(r=>r.id)};
  const bytes=JSON.stringify(output)+'\n';
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(cardsFile,'utf8'),bytes,'Card study differs from previous run');
  else fs.writeFileSync(cardsFile,bytes);
  console.log('Verified',rows.length,'fields,',rows.filter(f=>f.actual).length,'completed');
}
module.exports={prepare,evaluate,aggregate,astanaData};
if(require.main===module){
  if(!isMainThread)parentPort.postMessage(evaluate(workerData.id,workerData.model));
  else main().catch(e=>{console.error(e);process.exitCode=1;});
}
