'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const here = __dirname, root = path.dirname(here);
const dist = path.join(root,'dist');
for (const [,s] of fs.readFileSync(path.join(dist,'index.html'),'utf8').matchAll(/<script\b[^>]*\bsrc="([^"?]+\.js)(?:\?[^"]*)?"/g)) {
  require(path.join(dist,s));
  if (s === 'adapter.js') break;
}
const {budget,seeds} = require('../strategy_v4_eval/settings.cjs');
const archive = require('../major_form/all_stages.json').editions;
const previous = require('../multi_stage_train/report.json').stages;
const formatTrial = process.argv.includes('--bo3-trial');
const variants = formatTrial ? ['base','priorStageBO3Only'] : ['base','official','priorStage','both'];
const releases = {
  'copenhagen-2024-2':['2024-03-04T23:55:04Z','99a0ba5fff938345d10d500f8b29cd297076573e'],
  'shanghai-2024-2':['2024-12-02T17:28:02Z','c408eada80b0aae06b10da5a90409694f4a5b019','40b5ab42ba82f7e435f5d65a01d2fd8c01d93a5b'],
  'austin-2025-2':['2025-06-02T17:58:00Z','1ce8398c0be1970319488c23cfd0d4077eaec04a'],
  'austin-2025-3':['2025-06-02T17:58:00Z','1ce8398c0be1970319488c23cfd0d4077eaec04a'],
  'budapest-2025-2':['2025-11-03T18:33:49Z','468a448707996aa7067b8201c5fc77b9b95c247e'],
  'budapest-2025-3':['2025-12-01T18:11:40Z','6b92cd657bfd7c281a3930a842fe2393b5bdb40b','864671e52f2c636b2b38ee287a99753470101555'],
  'cologne-2026-2':['2026-06-01T17:15:49Z','510968f54723dcb698ad3b04d396140fc263c239'],
  'cologne-2026-3':['2026-06-01T17:15:49Z','510968f54723dcb698ad3b04d396140fc263c239']
};
const repo='ValveSoftware/counter-strike_regional_standings';
const aliases={snowzin:'snow',dav1d:'dav1deus','dav1deu$':'dav1deus',dev1ce:'device',ahang:'l1hang',rmn:'roman'};
const names=row=>new Set(row.map(p=>p.trim().normalize('NFKC').toLowerCase().split('@')[0]).map(p=>aliases[p]||p));
const sigmoid=x=>1/(1+Math.exp(-x));
const logit=p=>Math.log(p/(1-p));
const rounded=n=>Number(n.toFixed(9));
function findCore(roster,rows) {
  const five=names(roster);
  assert.equal(five.size,5);
  const matches=rows.map((row,index)=>({index,overlap:[...names(row.roster)].filter(p=>five.has(p)).length})).filter(r=>r.overlap>=3);
  matches.sort((a,b)=>b.overlap-a.overlap);
  return matches[0] && matches[0].overlap!==matches[1]?.overlap ? matches[0] : null;
}
function getRelease(event) {
  const [published,sha,blob] = releases[event.id];
  const date=published.slice(0,10);
  assert.ok(date>=event.asOf && date<event.date);
  const day=new Date(event.date+'T00:00:00Z');
  day.setUTCDate(day.getUTCDate()-1);
  const asOf=day.toISOString().slice(0,10)+'T23:59:59Z';
  const source='https://github.com/'+repo+'/commit/'+sha;
  const history='https://api.github.com/repos/'+repo+'/commits?until='+asOf+'&per_page=1';
  if (date===event.asOf) return {date,published,sha,source,history,rows:[]};
  const filename=date.replaceAll('-','_'), raw=fs.readFileSync(path.join(here,filename+'.md'));
  const actualBlob=crypto.createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
  assert.equal(actualBlob,blob);
  const rows=[];
  for(const line of raw.toString('utf8').split('\n')) {
    if(!/^\|\s*\d+\s*\|/.test(line))continue;
    const [,rank,points,club,players]=line.split('|').map(x=>x.trim());
    const roster=players.split(',').map(x=>x.trim());
    if(roster.length===5 && names(roster).size===5)rows.push({rank:Number(rank),points:Number(points),club,roster});
  }
  return {date,published,sha,blob,source:'https://github.com/'+repo+'/blob/'+sha+'/invitation/'+date.slice(0,4)+'/standings_global_'+filename+'.md',history,rows};
}
function baseline(event) {
  const flags = {...PickMethods.defaults('recommended',event),stageTraining:false};
  return PickLab.seriesMatrices(event, flags);
}
function makePrior(event) {
  const prev = PickLab.allEvents.find(e=>(e.parent||e.id)===event.parent && (e.stage||1)===event.stage-1);
  const expected=baseline(prev), obs=prev.teams.map(()=>[]);
  const games=archive[event.parent].matches.filter(g=>g.stage===event.stage-1);
  assert.equal(games.length,33);
  const pairs=new Map(prev.rounds.flat().map(([w,l])=>[w+':'+l,true]));
  for(const g of games) {
    assert.ok(g.day>=prev.date.slice(0,10) && g.day<event.date);
    const aa=findCore(g.rosterA,prev.teams),bb=findCore(g.rosterB,prev.teams);
    assert.ok(aa && bb && aa.index!==bb.index,g.id);
    const [a,b]=[aa.index,bb.index], [w,l]=g.y?[a,b]:[b,a];
    assert.ok(pairs.delete(w+':'+l),g.id+' winner');
    const p=expected['bo'+g.bo][a][b];
    for(const [team,prob,y] of [[a,p,g.y],[b,1-p,1-g.y]]) {
      obs[team].push({id:g.id,day:g.day,bo:g.bo,p:prob,y});
    }
  }
  assert.equal(pairs.size,0);
  return event.teams.map(t=>{
    const match=findCore(t.roster,prev.teams);
    return match ? {games:obs[match.index],priorTeam:prev.teams[match.index].name,overlap:match.overlap} : {games:[]};
  });
}
function estimate(games) {
  if(!games.length)return 0;
  let lo=-3,hi=3;
  for(let i=0;i<48;i++){
    const mid=(lo+hi)/2;
    const score=games.reduce((s,g)=>s+g.y-sigmoid(logit(g.p)+mid),-4*mid);
    if(score>0)lo=mid;else hi=mid;
  }
  return rounded((lo+hi)/2);
}
function inputs(event) {
  const release=getRelease(event);
  const previousStage=makePrior(event);
  const teams=event.teams.map((t,i)=>{
    const core=findCore(t.roster,release.rows);
    const row=core && release.rows[core.index];
    const cutoff=row?release.date:event.asOf;
    const prev=previousStage[i];
    const eligible=prev.games.filter(g=>g.day>cutoff);
    return {name:t.name,original:t.points,points:row?.points??t.points,official:row?{...row,overlap:core.overlap}:null,
      priorTeam:prev.priorTeam||null,previousOverlap:prev.overlap||0,previousGames:prev.games,
      delta:estimate(prev.games),combinedDelta:estimate(eligible),combinedGames:eligible.length};
  });
  const {rows,...source}=release;
  return {id:event.id,stage:event.stage,asOf:event.asOf,start:event.date,source,teams};
}
function candidate(event,data,variant) {
  const updated = variant==='official' || variant==='both';
  const view=updated?{...event,teams:event.teams.map((t,i)=>({...t,points:data.teams[i].points}))}:event;
  const matrix=baseline(view);
  if(variant==='base'||variant==='official')return matrix;
  const shifts=data.teams.map(t=>variant==='both'?t.combinedDelta:t.delta);
  const formats = variant==='priorStageBO3Only' ? ['bo3'] : ['bo1','bo3'];
  for(const key of formats) for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){
    if(shifts[i]===shifts[j])continue;
    const p=sigmoid(logit(matrix[key][i][j])+shifts[i]-shifts[j]);
    matrix[key][i][j]=p;matrix[key][j][i]=1-p;
  }
  return matrix;
}
function measure(event,odds) {
  const all={1:{n:0,brierSum:0,lossSum:0},3:{n:0,brierSum:0,lossSum:0}};
  event.rounds.forEach((rr,r)=>rr.forEach(([winner,loser],i)=>{
    const bo=event.formats[r][i],p=odds['bo'+bo][winner][loser],s=all[bo];
    s.n++;s.brierSum+=(1-p)**2;s.lossSum-=Math.log(p);
  }));
  return all;
}
function score(id) {
  const event=PickLab.allEvents.find(e=>e.id===id),data=inputs(event),actual=CS.replay(event.rounds).actual;
  const alternatives={},cache=new Map();
  for(const variant of variants) {
    const odds=candidate(event,data,variant);
    const hash=crypto.createHash('sha256').update(JSON.stringify(odds)).digest('hex');
    if(cache.has(hash)){ alternatives[variant]=cache.get(hash);continue; }
    const series=measure(event,odds), buckets=[], hits=[];
    let card;
    for(const seed of seeds) {
      const sim=CS.run(odds,budget,seed,[],{seedConditionalCard:true});
      if(!card)card=sim.card;
      const bySlot=[0,1,2].map(k=>sim.card.filter((b,i)=>b===k && b===actual[i]).length);
      buckets.push(bySlot);hits.push(CS.actualScore(sim.card,actual));
    }
    alternatives[variant]={hash,series,hits,buckets,card};
    cache.set(hash,alternatives[variant]);
  }
  assert.deepEqual(alternatives.base.hits,previous.find(e=>e.id===id).methods.recommended.base.hitsBySeed);
  return {id,stage:event.stage,data,alternatives};
}
function summarize(stages) {
  const out={};
  for(const name of variants) {
    const group=stages.map(s=>s.alternatives[name]);
    const counts=seeds.map((_,i)=>group.filter(r=>r.hits[i]>=5).length);
    const hits=seeds.map((_,i)=>group.reduce((n,r)=>n+r.hits[i],0));
    const mean=xs=>rounded(xs.reduce((a,b)=>a+b,0)/xs.length);
    const series={};
    for(const bo of [1,3]) {
      const rec=group.map(g=>g.series[bo]);
      const n=rec.reduce((s,v)=>s+v.n,0);
      series['bo'+bo]={n,brier:n?rounded(rec.reduce((s,v)=>s+v.brierSum,0)/n):null,logLoss:n?rounded(rec.reduce((s,v)=>s+v.lossSum,0)/n):null};
    }
    out[name]={hits:hits[0],passes:counts[0],meanHits:mean(hits),meanPasses:mean(counts),series,counts,hitsBySeed:hits};
    const base=out.base.counts;
    out[name].pairedPasses={more:counts.filter((x,i)=>x>base[i]).length,same:counts.filter((x,i)=>x===base[i]).length,fewer:counts.filter((x,i)=>x<base[i]).length};
  }
  return out;
}
async function main() {
  const parents=Object.keys(releases);
  const results=await Promise.all(parents.map(id=>new Promise((resolve,reject)=>{
    const w=new Worker(__filename,{workerData:id,argv:process.argv.slice(2)});
    w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error('Worker '+code))});
  })));
  const reports=results.map(({id,stage,alternatives})=>({id,stage,alternatives}));
  const groups={stage2:summarize(reports.filter(s=>s.stage===2)),stage3:summarize(reports.filter(s=>s.stage===3)),
    preCologne3:summarize(reports.filter(s=>s.stage===3&&!s.id.startsWith('cologne'))),cologne3:summarize(reports.filter(s=>s.id==='cologne-2026-3'))};
  const report={seeds,budget,stages:reports,groups};
  const outputs=formatTrial ? {'bo3-report.json':report} : {'inputs.json':results.map(r=>r.data),'report.json':report};
  for(const [file,object] of Object.entries(outputs)) {
    const json=JSON.stringify(object,null,2)+'\n', dest=path.join(here,file);
    if(process.argv.includes('--check'))assert.equal(fs.readFileSync(dest,'utf8'),json,file);
    else fs.writeFileSync(dest,json);
  }
  console.log(reports.map(s=>[s.id,...variants.map(n=>s.alternatives[n].hits[0])]));
  for(const [name,group] of Object.entries(groups))console.log(name,variants.map(n=>[n,group[n].hits,group[n].passes,group[n].meanPasses,group[n].pairedPasses]));
}
if(!isMainThread && require.main===module) parentPort.postMessage(score(workerData));
else if(require.main===module) main().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={baseline,candidate};
