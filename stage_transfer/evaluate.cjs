'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const root=path.resolve(__dirname,'..');
globalThis.self=globalThis;
globalThis.importScripts=(...files)=>files.forEach(n=>require(path.join(root,'dist',n)));
importScripts('history-worker.js');
const {budget,seeds}=require('../strategy_v4_eval/settings.cjs');
const editions=require('../major_form/all_stages.json').editions;
const known=require('../multi_stage_train/report.json').stages;
const groups=['published','targetOnly','earlierDonors','hindsight'];
const round=n=>Number(n.toFixed(8));
const sum=v=>v.reduce((a,b)=>a+b,0);
const aliases={'niko@ba':'niko','lucky@fr':'lucky',snowzin:'snow',dav1d:'dav1deus','dav1deu$':'dav1deus',
  dev1ce:'device',ahang:'l1hang',rmn:'roman'};
function roster(names) {
  const normalized=names.map(p=>p.normalize('NFKC').trim().toLowerCase());
  const result=[...new Set(normalized.map(n=>aliases[n]||n.split('@')[0]))];
  assert.equal(result.length,5);
  return result;
}
const shared=(a,b)=>a.filter(p=>b.includes(p)).length;
function fieldFor(e) {
  const parent=e.parent||e.id,stage=e.stage||1,edition=editions[parent];
  const flags={...PickMethods.defaults('recommended',e),stageTraining:false};
  const matrix=PickLab.seriesMatrices(e,flags);
  const teams=e.teams.map(t=>({name:t.name,roster:roster(t.roster)}));
  function index(five) {
    const matches=teams.map((t,i)=>({i,n:shared(five,t.roster)})).filter(t=>t.n>=3);
    assert.equal(matches.length,1,e.id+' '+five);
    return matches[0].i;
  }
  const records=edition.matches.filter(m=>m.stage===stage).map(g=>{
    const aFive=roster(g.rosterA), bFive=roster(g.rosterB), a=index(aFive), b=index(bFive);
    assert.notEqual(a,b);
    const p=matrix['bo'+g.bo][a][b];
    return {id:parent+':'+g.id,day:g.day,bo:g.bo,a,b,aFive,bFive,p,y:g.y};
  });
  assert.equal(records.length,33);
  assert.equal(new Set(records.map(r=>r.id)).size,33);
  const actualPairs=records.map(r=>r.y?[r.a,r.b]:[r.b,r.a]).map(p=>p.join(':')).sort();
  assert.deepEqual(actualPairs,e.rounds.flat().map(p=>p.join(':')).sort());
  return {id:e.id,parent,stage,start:e.date.slice(0,10),end:records.map(g=>g.day).sort().at(-1),
    teams,matrix,records,actual:CS.replay(e.rounds).actual};
}
function evidence(teams,sources) {
  const stats=teams.map(()=>({n:0,weighted:0,residual:0,information:0}));
  const ids=new Set();
  for(const field of sources) for(const game of field.records) {
    assert(!ids.has(game.id),game.id);ids.add(game.id);
    for(const [i,t] of teams.entries()) {
      const a=shared(t.roster,game.aFive), b=shared(t.roster,game.bFive);
      assert(a<3 || b<3);
      const n=Math.max(a,b);
      if(n<3) continue;
      const w=n/5;
      const s=stats[i];
      s.n++;
      s.weighted+=w;
      s.residual+=w*(a>=3 ? game.y-game.p : game.p-game.y);
      s.information+=w*game.p*(1-game.p);
    }
  }
  return stats;
}
function shifts(sets,n) {
  return Array.from({length:n},(_,i)=>{
    const rows=sets.map(set=>set[i]);
    return sum(rows.map(r=>r.residual))/(5+sum(rows.map(r=>r.information)));
  });
}
function adjust(matrix,delta) {
  if(delta.every(d=>d===0)) return matrix;
  const out={...matrix};
  for(const bo of ['bo1','bo3']) {
    out[bo]=matrix[bo].map(r=>r.slice());
    for(let a=0;a<16;a++) for(let b=a+1;b<16;b++) {
      const p=matrix[bo][a][b], offset=delta[a]-delta[b];
      if(offset===0) continue;
      const q=1/(1+Math.exp(-(Math.log(p/(1-p))+offset)));
      out[bo][a][b]=q;out[bo][b][a]=1-q;
    }
  }
  return out;
}
function errors(records,matrix) {
  const sums={};
  for(const bo of [1,3]) {
    const sample=records.filter(g=>g.bo===bo);
    const winning=sample.map(g=>g.y ? matrix['bo'+bo][g.a][g.b] : matrix['bo'+bo][g.b][g.a]);
    sums['bo'+bo]={n:sample.length,squares:sum(winning.map(p=>(1-p)**2)),nll:sum(winning.map(p=>-Math.log(p)))};
  }
  return sums;
}
function score(field,delta) {
  const matrix=adjust(field.matrix,delta), hits=[],buckets=[];
  let fixedCard;
  for(const seed of seeds) {
    const sim=CS.run(matrix,budget,seed,[],{seedConditionalCard:true});
    const grouped=[0,1,2].map(c=>sim.card.filter((v,i)=>v===c && field.actual[i]===c).length);
    assert.equal(CS.actualScore(sim.card,field.actual),sum(grouped));
    hits.push(sum(grouped));buckets.push(grouped);
    if(seed===seeds[0]) fixedCard=sim.card;
  }
  return {hits,buckets,fixedCard,errors:errors(field.records,matrix)};
}
function cutoff(sources){return sources.map(s=>s.end).sort().at(-1)||null;}
function run({field,past,donors,post}) {
  const {id,parent,stage,start,teams}=field;
  assert(past.every(s=>s.stage===stage) && donors.every(s=>s.stage>stage));
  assert([...past,...donors].every(s=>s.parent!==parent && s.end<editions[parent].start));
  assert(post.every(s=>s.parent===parent && s.stage>stage && s.start>field.end));
  const targetStats=evidence(teams,past), before=evidence(teams,donors), after=evidence(teams,post);
  const exposed=x=>teams.filter((_,i)=>x[i].n>0).map(t=>t.name);
  const postTeams=exposed(after);
  const records={};
  const seen=new Map();
  for(const [key,sets] of Object.entries({published:[],targetOnly:[targetStats],earlierDonors:[targetStats,before],
    hindsight:[targetStats,before,after]})) {
    const delta=shifts(sets,teams.length);
    const hash=JSON.stringify(delta);
    if(!seen.has(hash))seen.set(hash,score(field,delta));
    records[key]={...seen.get(hash),delta:delta.map(round)};
  }
  assert.deepEqual(records.published.hits,known.find(s=>s.id===id).methods.recommended.base.hitsBySeed);
  if(!post.length) assert.deepEqual(records.earlierDonors,records.hindsight);
  const compact={id,parent,stage,start,trainThrough:cutoff([...past,...donors]),postThrough:cutoff(post),
    priorDonorTeams:exposed(before).length,postDonorTeams:postTeams.length,postTeams,postDonorIds:post.map(s=>s.id),
    scores:Object.fromEntries(groups.map(key=>[key,records[key].hits[0]]))};
  return {compact,past:past.map(s=>s.id),donors:donors.map(s=>s.id),targetStats,before,after,
    teams:teams.map(t=>t.name),actual:field.actual,records};
}
function tally(stages,key) {
  const records=stages.map(s=>s.records[key]);
  const hits=seeds.map((_,i)=>sum(records.map(s=>s.hits[i])));
  const passes=seeds.map((_,i)=>records.filter(s=>s.hits[i]>=5).length);
  const out={hits:hits[0],passes:passes[0],meanHits:round(sum(hits)/hits.length),meanPasses:round(sum(passes)/passes.length),
    buckets:[0,1,2].map(i=>sum(records.map(s=>s.buckets[0][i])))};
  for(const bo of ['bo1','bo3']) {
    const rows=records.map(s=>s.errors[bo]), n=sum(rows.map(r=>r.n));
    out[bo]={n,brier:round(sum(rows.map(r=>r.squares))/n),logLoss:round(sum(rows.map(r=>r.nll))/n)};
  }
  return {out,hits,passes};
}
function pair(a,b){
  const diff=(x,y)=>({more:x.filter((v,i)=>v>y[i]).length,same:x.filter((v,i)=>v===y[i]).length,fewer:x.filter((v,i)=>v<y[i]).length});
  return {passes:diff(a.passes,b.passes),hits:diff(a.hits,b.hits)};
}
async function main() {
  const fields=PickLab.allEvents.filter(e=>e.hasResults).sort((a,b)=>a.date.localeCompare(b.date)).map(fieldFor);
  const tasks=fields.filter(s=>s.stage<3).map(field=>{
    const earlier=fields.filter(s=>editions[s.parent].end<editions[field.parent].start);
    return {field,past:earlier.filter(s=>s.stage===field.stage),donors:earlier.filter(s=>s.stage>field.stage),
      post:fields.filter(s=>s.parent===field.parent&&s.stage>field.stage)};
  });
  const results=new Array(tasks.length);
  let next=0;
  async function work() {
    while(next<tasks.length) {
      const i=next++;
      results[i]=await new Promise((resolve,reject)=>{
        const w=new Worker(__filename,{workerData:tasks[i]});
        w.once('message',resolve);w.once('error',reject);w.once('exit',c=>{if(c)reject(Error('worker '+c));});
      });
    }
  }
  await Promise.all(Array.from({length:5},work));
  const summary={asOf:'2026-11-21',model:'recommended',groups:{},stages:results.map(s=>s.compact)};
  for(const phase of [1,2]) {
    const rows=results.filter(s=>s.compact.stage===phase);
    const scores=Object.fromEntries(groups.map(k=>[k,tally(rows,k)]));
    summary.groups['stage'+phase]={...Object.fromEntries(groups.map(k=>[k,scores[k].out])),
      paired:{earlierVsTarget:pair(scores.earlierDonors,scores.targetOnly),hindsightVsEarlier:pair(scores.hindsight,scores.earlierDonors),
              earlierVsPublished:pair(scores.earlierDonors,scores.published)}};
  }
  const details={budget,seeds,stages:results};
  for(const [file,data] of Object.entries({'summary.json':summary,'details.json':details})) {
    const exact=JSON.stringify(data,null,2)+'\n',dest=path.join(__dirname,file);
    if(process.argv.includes('--check')) assert.equal(fs.readFileSync(dest,'utf8'),exact,file);
    else fs.writeFileSync(dest,exact);
  }
  console.log(JSON.stringify(summary.groups));
}
module.exports={fieldFor,roster,evidence,shifts,adjust,score,tally,pair};
if(!isMainThread && require.main===module) parentPort.postMessage(run(workerData));
else if(require.main===module) main().catch(e=>{console.error(e);process.exitCode=1;});
