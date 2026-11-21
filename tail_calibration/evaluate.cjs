'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const {Worker, isMainThread, workerData, parentPort} = require('node:worker_threads');
const {fieldFor,roster} = require('../stage_transfer/evaluate.cjs');
const {budget,seeds} = require('../strategy_v4_eval/settings.cjs');
const {elo,slope,calibrateMatrix,bin} = require('./model.cjs');
const esl = require('../stage1_holdout/evaluate.cjs');
const {replayEsl} = require('../round_form/evaluate.cjs');
const majors = PickLab.allEvents.filter(e=>e.hasResults).sort((a,b)=>a.date.localeCompare(b.date));
const externalIds = ['epl22-stage2','epl23-stage2','epl21-stage2'];
const sum = xs=>xs.reduce((a,b)=>a+b,0);
const round = n=>Number(n.toFixed(9));
const absolute = file=>path.join(__dirname,file);
const methodPairs = [['recommended','recommendedCal'],['vrs','vrsCal']];
const externalDocs = {
  'epl22-stage2':()=>({target:require('../round_form/epl22-inputs.json').target,truth:require('../round_form/epl22-results.json')}),
  'epl23-stage2':()=>({target:{...require('../epl_transfer/field.json'),teams:require('../epl_transfer/rosters.json').teams},truth:require('../epl_transfer/actual.json')}),
  'epl21-stage2':()=>({target:require('./epl21-field.json'),truth:require('./epl21-results.json')})
};

function majorData(event) {
  const f = fieldFor(event);
  assert.equal(f.records.length,33);
  const r = CS.replay(event.rounds);
  assert(r.ok && r.matched===33);
  return {...f,teams:event.teams,external:false,verifiedMatchups:r.matched};
}

function vrsFit(id,start,archive) {
  const cutoff = archive.targets[id];
  assert.equal(cutoff.start,start);
  assert(cutoff.cutoffExclusive<=start);
  assert.equal(cutoff.indices.length,cutoff.n);
  const seen = new Set();
  let newest = null;
  const rows = cutoff.indices.map(i=>{
    const g = archive.rows[i];
    assert(!seen.has(g.id),g.id);seen.add(g.id);
    assert(g.day<cutoff.cutoffExclusive && g.day>=cutoff.windowStart && g.day<start);
    assert(g.rankPublished.slice(0,10)<g.day && g.rankDay<g.day);
    assert(Number.isFinite(g.pointsA) && Number.isFinite(g.pointsB) && g.pointsA-g.pointsB===g.gap);
    assert(g.bo===3 && g.fiveA.length===5 && g.fiveB.length===5);
    assert(g.overlapA>=3 && g.overlapB>=3);
    assert.equal(new Set(g.fiveA).size,5);assert.equal(new Set(g.fiveB).size,5);
    if (!newest || g.day>newest) newest=g.day;
    return {p:elo(g.pointsA,g.pointsB),y:Number(g.y)};
  });
  const b = slope(rows);
  return {b,n:rows.length,newest,cutoffExclusive:cutoff.cutoffExclusive,windowStart:cutoff.windowStart,
    excluded:cutoff.excluded};
}

function recommendedFit(target,earlier) {
  const sources = earlier.filter(f=>f.end<target.start);
  const rows = sources.flatMap(s=>s.records.filter(g=>g.bo===3));
  assert.equal(new Set(rows.map(g=>g.id)).size,rows.length);
  assert(rows.every(g=>g.day<target.start));
  return {b:slope(rows.map(g=>({p:g.p,y:Number(g.y)}))),n:rows.length,
    stages:sources.map(s=>s.id),newest:rows.map(g=>g.day).sort().at(-1)??null,cutoffExclusive:target.start};
}

function odds(field,rawFit,prodFit) {
  const teams=field.teams;
  assert.equal(teams.length,16);
  assert(teams.every(t=>Number.isFinite(t.points)&&t.points>0));
  for (const t of teams) {
    if(!field.external) assert(t.vrsCoreOverlap>=3);
    const vrsFive=t.vrsRoster??t.ratingRoster;
    if (vrsFive) {
      const played=roster(t.roster);
      // Some Valve lines publish four names. Retain the actual four-name core in the converted source.
      const ranked=vrsFive.length===5?roster(vrsFive):vrsFive.map(n=>n.normalize('NFKC').trim().toLowerCase());
      assert(played.filter(n=>ranked.includes(n)).length>=3,t.name);
    }
  }
  const bo3=teams.map(a=>teams.map(b=>elo(a.points,b.points)));
  const vrs=field.external?{allBo3:true,bo1:bo3,bo3}:{...field.matrix,bo3};
  const matrices={vrs,vrsCal:calibrateMatrix(vrs,rawFit.b)};
  if(!field.external){
    matrices.recommended=field.matrix;
    matrices.recommendedCal=calibrateMatrix(field.matrix,prodFit.b);
    assert.strictEqual(matrices.recommended.bo1,matrices.vrsCal.bo1);
    assert.strictEqual(matrices.recommended.bo1,matrices.recommendedCal.bo1);
  }
  for(const m of Object.values(matrices))for(let i=0;i<16;i++)for(let j=i+1;j<16;j++)
    assert(Math.abs(m.bo3[i][j]+m.bo3[j][i]-1)<1e-9 && m.bo3[i][j]>0 && m.bo3[i][j]<1);
  return matrices;
}

function forecast(field,matrix,seed) {
  if (!field.external) {
    const s=CS.run(matrix,budget,seed,[],{seedConditionalCard:true});
    return {seed,card:s.card,auditPass:s.pass};
  }
  if (field.id==='epl21-stage2') return require('./evaluate-esl21.cjs').forecast(field,matrix,seed,budget/2);
  const s=esl.predict(matrix.bo3,field.liveRatings,seed,budget/2);
  return {seed,card:s.card,auditPass:s.auditPasses/(budget/2)};
}

function getEplTruth(target,truth) {
  const out=target.id==='epl21-stage2' ? require('./evaluate-esl21.cjs').replay(target,truth) : replayEsl(target,truth);
  const sourceRows=new Map((truth.matches??[]).map(g=>[g.id,g]));
  const sourceUrls=new Map((Array.isArray(truth.sources)?truth.sources:[]).map(url=>[Number(url.split('/')[4]),url]));
  return {actual:out.actual,verifiedMatchups:out.verifiedCount,administrativeExcluded:out.excluded,
    records:out.matches.map(g=>({id:g.id,day:sourceRows.get(g.id)?.day??null,bo:3,a:g.w,b:g.l,y:1,
      source:sourceRows.get(g.id)?.sourceUrl??sourceUrls.get(g.id)??truth.source??null}))};
}

function metric(ps) {
  const n=ps.length, squares=sum(ps.map(p=>(1-p)**2)), nll=sum(ps.map(p=>-Math.log(p)));
  return {n,squares,nll,brier:n?round(squares/n):null,logLoss:n?round(nll/n):null};
}

function emptyBins() {
  return ['50–60%','60–70%','70–80%','80–90%','90–100%','50/50'].map(label=>({label,n:0,expected:0,after:0,actual:0}));
}

function countUpsets(matches,a,b) {
  const bins=emptyBins();
  for(const g of matches.filter(g=>g.bo===3)) {
    const v=bin(g.winProbability[a],g.winProbability[b]),t=bins[v.index];
    t.n++; t.expected+=v.expected; t.after+=v.after; t.actual+=v.actual;
  }
  return bins;
}

function evaluate(field,matrices,fits,getTruth) {
  const names=field.teams.map(t=>t.name);
  const forecasts={},cache=new Map();
  for(const [key,matrix] of Object.entries(matrices)) {
    if(!cache.has(matrix))cache.set(matrix,seeds.map(seed=>forecast(field,matrix,seed)));
    forecasts[key]=cache.get(matrix);
  }
  const {actual,verifiedMatchups,records,administrativeExcluded=[]}=getTruth();
  const matches=records.map(g=>{
    const w=g.y?g.a:g.b,l=g.y?g.b:g.a;
    return {id:g.id,day:g.day,source:g.source??null,bo:g.bo,w,l,winner:names[w],loser:names[l],
      winProbability:Object.fromEntries(Object.entries(matrices).map(([k,m])=>[k,m['bo'+g.bo][w][l]]))};
  });
  const methods={};
  for(const [key,rows] of Object.entries(forecasts)) {
    methods[key]={rows:rows.map(row=>{
      const bySlot=[0,1,2].map(c=>row.card.filter((v,i)=>v===c && actual[i]===c).length);
      const hits=sum(bySlot);assert.equal(CS.actualScore(row.card,actual),hits);
      return {...row,hits,bySlot};
    }),errors:Object.fromEntries([1,3].map(bo=>['bo'+bo,metric(matches.filter(g=>g.bo===bo).map(g=>g.winProbability[key]))]))};
  }
  if(!field.external){
    for(const m of Object.values(methods))assert.deepEqual(m.errors.bo1,methods.recommended.errors.bo1);
    const h=require('../multi_stage_train/report.json').stages.find(s=>s.id===field.id);
    if(h)assert.deepEqual(methods.recommended.rows.map(r=>r.hits),h.methods.recommended.base.hitsBySeed);
    if(field.stage===3)assert.deepEqual(methods.recommended.rows.map(r=>r.hits),require('../round_form/summary.json').byStage[field.id].base.hits);
  } else if(field.id!=='epl21-stage2'){
    assert.deepEqual(methods.vrs.rows.map(r=>r.hits),require('../round_form/summary.json').byStage[field.id].base.hits);
  }
  const probabilities=[];
  const fixedBo1=(matrices.recommended??matrices.vrs).bo1;
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++)probabilities.push({a:names[i],b:names[j],bo1:fixedBo1[i][j],
    bo3:Object.fromEntries(Object.entries(matrices).map(([k,m])=>[k,m.bo3[i][j]]))});
  const upsetBins=Object.fromEntries(methodPairs.filter(([a])=>methods[a]).map(([a,b])=>[a,countUpsets(matches,a,b)]));
  return {id:field.id,start:field.start,stage:field.stage??2,external:field.external,teams:names,actual,
    fits,verifiedMatchups,administrativeExcluded,matches,upsetBins,probabilities,methods};
}

const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
function trainingArchive(expectedHash) {
  const bytes=fs.readFileSync(absolute('training.json.gz'));
  if(expectedHash)assert.equal(digest(bytes),expectedHash,'training changed during run');
  return JSON.parse(zlib.gunzipSync(bytes));
}

function run(id,productionOnly=false,expectedHash) {
  if(productionOnly){
    const fields=majors.map(majorData),target=fields.find(f=>f.id===id);
    const fitting=recommendedFit(target,fields);
    return evaluate(target,{recommended:target.matrix,recommendedCal:calibrateMatrix(target.matrix,fitting.b)},
      {recommended:fitting},()=>target);
  }
  const archive=trainingArchive(expectedHash);
  if(externalIds.includes(id)){
    const {target,truth}=externalDocs[id](), field={...target,external:true};
    assert.deepEqual(field.teams.map(t=>t.name),field.entrants);
    const fits={vrs:vrsFit(id,field.start,archive)};
    return evaluate(field,odds(field,fits.vrs),fits,()=>getEplTruth(target,truth));
  }
  const fields=majors.map(majorData),target=fields.find(f=>f.id===id);
  const fits={vrs:vrsFit(id,target.start,archive),recommended:recommendedFit(target,fields)};
  return evaluate(target,odds(target,fits.vrs,fits.recommended),fits,()=>target);
}

function compare(own,baseline) {
  return {better:own.filter((x,i)=>x>baseline[i]).length,tied:own.filter((x,i)=>x===baseline[i]).length,
    worse:own.filter((x,i)=>x<baseline[i]).length};
}

function summarize(stages) {
  const out={events:stages.map(s=>s.id),methods:{},upsetBins:{}};
  for(const key of Object.keys(stages[0].methods)) {
    const hits=seeds.map((_,i)=>sum(stages.map(s=>s.methods[key].rows[i].hits)));
    const passes=seeds.map((_,i)=>stages.filter(s=>s.methods[key].rows[i].hits>=5).length);
    out.methods[key]={fixedByStage:stages.map(s=>s.methods[key].rows[0].hits),hits:hits[0],passes:passes[0],
      slots:[0,1,2].map(c=>sum(stages.map(s=>s.methods[key].rows[0].bySlot[c]))),
      meanHits:round(sum(hits)/30),meanPasses:round(sum(passes)/30),hitsBySeed:hits,passesBySeed:passes,
      errors:Object.fromEntries([1,3].map(bo=>['bo'+bo,metric(stages.flatMap(s=>s.matches.filter(g=>g.bo===bo).map(g=>g.winProbability[key])))]))};
  }
  for(const [a,b] of methodPairs.filter(([a])=>out.methods[a])) {
    const m=out.methods[b],base=out.methods[a];
    m.paired={hits:compare(m.hitsBySeed,base.hitsBySeed),passes:compare(m.passesBySeed,base.passesBySeed)};
    out.upsetBins[a]=countUpsets(stages.flatMap(s=>s.matches),a,b);
  }
  return out;
}

async function main(){
  const productionOnly=process.argv.includes('--production');
  const trainingSha256=productionOnly?null:digest(fs.readFileSync(absolute('training.json.gz')));
  const ids=[...majors.map(m=>m.id),...(productionOnly?[]:externalIds)],stages=new Array(ids.length);
  let next=0;
  async function work(){
    while(next<ids.length){
      const i=next++,id=ids[i];
      stages[i]=await new Promise((resolve,reject)=>{
        const w=new Worker(__filename,{workerData:{id,productionOnly,trainingSha256}});
        w.once('message',resolve);w.once('error',reject);w.once('exit',s=>{if(s)reject(Error(id+' worker '+s));});
      });
    }
  }
  await Promise.all(Array.from({length:5},work));
  const summary={asOf:'2026-11-21',byStage:Object.fromEntries(stages.map(s=>[s.id,summarize([s])]))};
  for(const k of [1,2,3])summary['stage'+k]=summarize(stages.filter(s=>!s.external && s.stage===k));
  if(productionOnly){
    for(const k of ['stage1','stage2','stage3'])for(const [name,m] of Object.entries(summary[k].methods))
      console.log(k,name,m.fixedByStage,m.hits,m.passes,m.meanHits,m.meanPasses,m.errors.bo3,m.paired);
    return;
  }
  for(const n of [21,22,23])summary['s'+n]=summary.byStage['epl'+n+'-stage2'];
  assert.equal(digest(fs.readFileSync(absolute('training.json.gz'))),trainingSha256);
  for(const [file,data] of Object.entries({'report.json':{seeds,searchN:budget/2,auditN:budget/2,trainingSha256,stages},'summary.json':summary})){
    const dest=absolute(file),content=JSON.stringify(data,null,2)+'\n';
    if(process.argv.includes('--check'))assert.equal(fs.readFileSync(dest,'utf8'),content,file);
    else fs.writeFileSync(dest,content);
  }
  for(const k of ['stage1','stage2','stage3','s21','s22','s23'])console.log(k,Object.fromEntries(Object.entries(summary[k].methods).map(([k,v])=>[k,[v.hits,v.passes,v.errors.bo3.brier]])));
}

module.exports={majorData,recommendedFit,vrsFit,odds,evaluate,summarize,externalDocs,trainingArchive,run};
if(require.main===module) {
  if(!isMainThread)parentPort.postMessage(run(workerData.id,workerData.productionOnly,workerData.trainingSha256));
  else main().catch(e=>{console.error(e);process.exitCode=1;});
}
