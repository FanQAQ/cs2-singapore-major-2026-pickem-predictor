'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {fieldFor}=require('../stage_transfer/evaluate.cjs');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const {errors,cardScore}=require('./score.cjs');
const reference=require('../tail_calibration/report.json');
const majors=require('./major-fields.json').fields;
const read=file=>JSON.parse(fs.readFileSync(path.join(__dirname,file),'utf8'));
const frozenModels=new Map();
function readModel(file) {
  if(!frozenModels.has(file))
    frozenModels.set(file,JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname,file)))).fields);
  return frozenModels.get(file);
}
const keys=['baseline','elo','ml','ablation','teamOnly','blend'];
const round=x=>Number(x.toFixed(9));
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const cells=(matrix,fn)=>matrix.map((r,i)=>r.map((v,j)=>fn(v,i,j)));

function getField(id) {
  if(id==='cluj-2026') return read('cluj-field.json');
  const f=majors[id];assert(f);
  return f;
}
function prodMatrix(f) {
  if(f.id==='cluj-2026') {
    const p=f.teams.map(a=>f.teams.map(b=>1/(1+10**((b.points-a.points)/400))));
    return {bo1:p,bo3:p};
  }
  const event=PickLab.allEvents.find(e=>e.id===f.id);
  return PickLab.seriesMatrices(event,PickMethods.defaults('recommended',event));
}
function validate(matrix,teams) {
  for(const bo of ['bo1','bo3']) {
    const m=matrix[bo];
    assert.equal(m.length,teams.length);
    for(let i=0;i<16;i++) {
      assert.equal(m[i].length,16);
      for(let j=i+1;j<16;j++) {
        assert(m[i][j]>0 && m[i][j]<1 && Math.abs(m[i][j]+m[j][i]-1)<1e-8,bo+' '+i+'/'+j);
      }
    }
  }
}
function matrices(f,requested=keys) {
  const teams=f.teams.map(t=>t.name);
  const needElo=requested.some(k=>k==='elo'||k==='blend'),needMl=requested.some(k=>['ml','ablation','teamOnly','blend'].includes(k));
  const elo=needElo?readModel('elo.json.gz')[f.id]:null,ml=needMl?readModel('ml.json.gz')[f.id]:null;
  for(const m of [elo,ml].filter(Boolean)){assert.equal(m.start,f.start);assert.deepEqual(m.teams,teams);}
  const source={elo,ml,ablation:ml?.ablation,teamOnly:ml?.teamOnly};
  if(requested.includes('blend'))source.blend=Object.fromEntries(['bo1','bo3'].map(k=>[k,cells(elo[k],(v,i,j)=>(v+ml[k][i][j])/2)]));
  if(requested.includes('baseline'))source.baseline=prodMatrix(f);
  const result={};
  for(const k of requested) {
    const m=source[k];
    validate(m,teams);
    result[k]={bo1:m.bo1,bo3:m.bo3,allBo3:!!f.allBo3,...(m.state?{state:m.state}:{})};
  }
  return result;
}
function truth(id,names) {
  if(id==='singapore') return null;
  if(id==='cluj-2026') {
    const data=read('cluj-results.json'), rounds=data.rounds.map(r=>r.map(p=>p.slice(0,2)));
    assert.equal(data.id,id);assert.equal(data.administrativeMatchIds.length,0);
    const replay=CS.replay(rounds);assert(replay.ok && replay.matched===33);
    return {actual:replay.actual,matches:rounds.flat().map(([w,l])=>({w,l,bo:3}))};
  }
  const f=fieldFor(PickLab.allEvents.find(e=>e.id===id));
  assert.deepEqual(f.teams.map(t=>t.name),names);
  return {actual:f.actual,matches:f.records.map(g=>({w:g.y?g.a:g.b,l:g.y?g.b:g.a,bo:g.bo}))};
}
function evaluate(id) {
  const field=getField(id), teams=field.teams.map(t=>t.name), models=matrices(field), methods={};
  for(const k of keys) {
    const runs=seeds.map(seed=>{
      const sim=CS.run(models[k],budget,seed,[],{seedConditionalCard:true});
      return {card:sim.card,local:sim.basePassCard,audit:round(sim.pass),
        localAudit:round(sim.score(sim.basePassCard).pass)};
    });
    methods[k]={runs};
  }
  const actual=truth(id,teams);
  const matches=actual?.matches??[];
  for(const k of keys) {
    const m=methods[k];
    m.fixed=cardScore(m.runs[0].card,actual?.actual);
    m.hits=m.runs.map(r=>cardScore(r.card,actual?.actual)?.hits??null);
    m.localHits=m.runs.map(r=>cardScore(r.local,actual?.actual)?.hits??null);
    const matchPs=matches.map(g=>models[k]['bo'+g.bo][g.w][g.l]);
    m.matchPs=matchPs;
    m.errors=Object.fromEntries([1,3].map(bo=>['bo'+bo,errors(matchPs.filter((_,i)=>matches[i].bo===bo))]));
  }
  const saved=reference.stages.find(s=>s.id===id);
  if(saved) assert.deepEqual(methods.baseline.hits,saved.methods.recommended.rows.map(r=>r.hits));
  if(id==='singapore') assert.deepEqual(methods.baseline.runs[0].card,require('../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json').card);
  return {id,start:field.start,stage:field.stage,teams,actual:actual?.actual??null,matches,methods};
}
function summarize(rows) {
  return Object.fromEntries(keys.map(k=>{
    const hits=seeds.map((_,i)=>sum(rows.map(r=>r.methods[k].hits[i])));
    const passes=seeds.map((_,i)=>rows.filter(r=>r.methods[k].hits[i]>=5).length);
    const better=passes.filter((p,i)=>p>rows.filter(r=>r.methods.baseline.hits[i]>=5).length).length;
    const worse=passes.filter((p,i)=>p<rows.filter(r=>r.methods.baseline.hits[i]>=5).length).length;
    return [k,{hits:hits[0],passes:passes[0],slots:[0,1,2].map(c=>sum(rows.map(r=>r.methods[k].fixed.slots[c]))),
      hitsBySeed:hits,passesBySeed:passes,passDifference:{better,same:seeds.length-better-worse,worse},
      errors:Object.fromEntries([1,3].map(bo=>['bo'+bo,errors(rows.flatMap(r=>r.methods[k].matchPs.filter((p,i)=>r.matches[i].bo===bo)))]))}];
  }));
}
async function main(){
  const ids=[...Object.keys(majors),'cluj-2026'],rows=new Array(ids.length);let next=0;
  async function work() {
    while(next<ids.length) {
      const i=next++;
      rows[i]=await new Promise((resolve,reject)=>{
        const w=new Worker(__filename,{workerData:ids[i]});
        w.once('message',resolve);w.once('error',reject);w.once('exit',n=>{if(n) reject(Error(ids[i]+' worker '+n));});
      });
    }
  }
  await Promise.all(Array.from({length:4},work));
  const summary={};
  for(const stage of [1,2,3])summary['stage'+stage]=summarize(rows.filter(r=>majors[r.id]&&r.actual&&r.stage===stage));
  summary.cluj=summarize(rows.filter(r=>r.id==='cluj-2026'));
  for(const [file,data] of Object.entries({'report.json':{seeds,searchN:budget/2,auditN:budget/2,fields:rows},'summary.json':summary})) {
    const dest=path.join(__dirname,file),text=JSON.stringify(data)+'\n';
    if(process.argv.includes('--check')) assert.equal(fs.readFileSync(dest,'utf8'),text,file);
    else fs.writeFileSync(dest,text);
  }
}
module.exports={getField,prodMatrix,matrices,truth,errors,cardScore,keys};
if(require.main===module) {
  if(!isMainThread) parentPort.postMessage(evaluate(workerData));
  else if(process.argv.includes('--check') || process.argv.includes('--full'))
    main().catch(e=>{console.error(e);process.exitCode=1;});
  else require('./screen.cjs').cli(process.argv.slice(2));
}
