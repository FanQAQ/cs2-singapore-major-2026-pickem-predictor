/* Contrast tournament fields using only pre-stage features. Run after site assembly. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('../dist/data.js');
const cards = require('../research_cards/conditionalSeed.json').stages;
const diagnostic = require('../method_eval/diagnostics.json').stages;
const playerIds = require('../experience/history.json');
const regions = ['europe', 'americas', 'asia'];
const metricLabels = {topTail:'头尾四队实力差', bubble:'晋级线两侧实力差', opening:'首轮热门优势', regions:'赛区席位', entry:'首阶段准入'};
const entry = {copenhagen:'24 队 · RMR', shanghai:'24 队 · RMR', austin:'32 队 · MRQ',
  budapest:'32 队 · VRS 直邀', cologne:'32 队 · VRS 直邀', singapore:'32 队 · VRS 直邀'};
const sources = [
  {label:'Valve · Major 规则与邀请制度',url:'https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md'},
  {label:'HLTV · 科隆首阶段参赛队与赛前强队',url:'https://www.hltv.org/news/44735/iem-cologne-major-stage-1-teams-format-schedule-talent-fantasy'},
  {label:'HLTV · 科隆首阶段完整赛果',url:'https://www.hltv.org/events/9028/iem-cologne-major-2026-stage-1'},
  {label:'HLTV · 上海首阶段完整赛果',url:'https://www.hltv.org/events/7861/perfect-world-shanghai-major-2024-opening-stage'},
  {label:'HLTV · 新加坡 Stage 1 分区名额',url:'https://www.hltv.org/major/invites'},
  {label:'HLTV · 奥斯汀扩至 32 队',url:'https://www.hltv.org/news/40670/valve-confirm-move-to-32-team-majors'},
  {label:'HLTV · 布达佩斯起取消 MRQ',url:'https://www.hltv.org/news/41930/valve-cancels-mrqs-ahead-of-budapest-major'},
  {label:'HLTV · 上海美洲区 RMR 的 Liquid 与 Wildcard',url:'https://www.hltv.org/events/7863/perfect-world-shanghai-major-2024-americas-rmr'},
  {label:'HLTV · 奥斯汀北美资格赛的 Wildcard',url:'https://www.hltv.org/events/8384/blasttv-austin-major-2025-north-america-regional-qualifier'}
];
sources.push(
  {label:'Valve · 2026 年 7 月 8 日 CS2 更新',url:'https://steamcommunity.com/games/CSGO/announcements/detail/701021228894259246'},
  {label:'HLTV · Cache 接替 Overpass 后的七图列表',url:'https://www.hltv.org/news/44984/cache-replaces-overpass-in-active-duty-pool'},
  {label:'HLTV · Sharks 五人以 DENDELE 队名参赛',url:'https://www.hltv.org/news/45166/sharks-to-play-as-dendele-following-partnership'}
);
const namedRegions = {shanghai:{Liquid:'americas', Wildcard:'americas'}, austin:{Wildcard:'americas'}};
const mean = arr => arr.reduce((s,x)=>s+x,0)/arr.length;
const rounded = x => Math.round(x*1e8)/1e8;
const calcP = (diff,scale=400) => 1/(1+10**(-diff/scale));
const foldN = (roster,base) => {
  const canonical = a => a.normalize('NFKC').trim().toLowerCase();
  const source = new Set(base.map(canonical));
  return roster.map(canonical).filter(p=>source.has(p)).length;
};

function preStage(event,scale=400,baseOnly=false) {
  const ratings = event.recentRating;
  const start = event.date.slice(0,10);
  assert.ok(ratings.asOf<start && event.rosterAsOf<start && event.regionRisk.asOf<start);
  const points = event.teams.map(t=>{
    const record=ratings.teams[t.name];
    if(!baseOnly && record && foldN(t.roster,record.roster)>=3 && Number.isFinite(record.points)) return record.points;
    return foldN(t.roster,t.vrsRoster)>=3 && Number.isFinite(t.points) ? t.points : null;
  });
  const known=points.filter(Number.isFinite).sort((a,b)=>a-b);
  assert.ok(known.length>0);
  const median = (known[Math.floor((known.length-1)/2)]+known[Math.floor(known.length/2)])/2;
  const filled=points.map(x=>x??median), sorted=[...filled].sort((a,b)=>b-a);
  const regional=Object.fromEntries(regions.map(k=>[k,0]));
  for(const t of event.teams) {
    const r = event.regionRisk.teams[t.name]?.region || namedRegions[event.id]?.[t.name];
    assert.ok(regions.includes(r),event.id+' '+t.name);
    regional[r]++;
  }
  const opener=filled.slice(0,8).map((p,i)=>calcP(Math.abs(p-filled[i+8]),scale));
  const context={topTail:mean(sorted.slice(0,4).flatMap(p=>sorted.slice(-4).map(q=>calcP(p-q,scale)))),
    bubble:calcP(sorted[5]-sorted[10],scale),opening:mean(opener),regions:regional,observed:known.length};
  return {id:event.id,label:event.label,start,snapshot:ratings.asOf,entry:entry[event.id],context,
    ratingSource:ratings.source,ratingBasis:ratings.basis,points};
}

function compare(a,b,omit) {
  const parts={};
  for(const key of ['topTail','bubble','opening']) parts[key]=10*Math.abs(a.context[key]-b.context[key]);
  parts.regions = regions.reduce((s,k)=>s+Math.abs(a.context.regions[k]-b.context.regions[k]),0)/8;
  parts.entry=Number(a.entry!==b.entry);
  return {id:b.id,distance:mean(Object.entries(parts).filter(([k])=>k!==omit).map(([,v])=>v)),parts};
}
function rank(target,available,omit) {
  return available.map(s=>compare(target,s,omit)).sort((a,b)=>a.distance-b.distance || a.id.localeCompare(b.id));
}
function withWeights(ranking){
  const raw=ranking.map(r=>1/(1+r.distance));
  const total=raw.reduce((s,w)=>s+w,0);
  return ranking.map((r,i)=>({...r,weight:raw[i]/total}));
}

function lineup(team) {
  const canonical = handle=>{
    const key=handle.normalize('NFKC').trim().toLowerCase();
    const scoped=playerIds.teamAliases[team.name.toLowerCase()]?.[key];
    assert.ok(!playerIds.unresolved.includes(key) || scoped,'Ambiguous player: '+team.name+' '+handle);
    return scoped || playerIds.aliases[key] || (key==='rmn'?'roman':key);
  };
  const five=new Map(team.roster.map(p=>[canonical(p),p]));
  assert.equal(five.size,5);return five;
}
function transfer(old,target){
  const leftPool=old.mapStrength.pool,rightPool=target.mapStrength.pool;
  assert.equal(new Set(leftPool).size,7);assert.equal(new Set(rightPool).size,7);
  const pairs=[];
  for(const a of old.teams){
    const left=lineup(a);
    for(const b of target.teams){
      const right=lineup(b);
      const retained=[...right].filter(([k])=>left.has(k)).map(([,name])=>name);
      if(retained.length<3) continue;
      pairs.push({oldName:a.name,newName:b.name,overlap:retained.length,retained,
        departed:[...left].filter(([k])=>!right.has(k)).map(([,name])=>name),
        joined:[...right].filter(([k])=>!left.has(k)).map(([,name])=>name)});
    }
  }
  assert.equal(new Set(pairs.map(p=>p.oldName)).size,pairs.length);
  assert.equal(new Set(pairs.map(p=>p.newName)).size,pairs.length);
  return {maps:leftPool.filter(m=>rightPool.includes(m)),oldOnly:leftPool.filter(m=>!rightPool.includes(m)),
    newOnly:rightPool.filter(m=>!leftPool.includes(m)),coreTeams:pairs.length,fullTeams:pairs.filter(p=>p.overlap===5).length,
    pairs,poolSource:old.mapStrength.poolSource.url};
}
function upsets(rows,field) {
  const count = list => ({n:list.length,upsets:list.filter(x=>x[field]<0.5).length,major:list.filter(x=>x[field]<=0.3).length,
    expected:list.reduce((s,x)=>s+Math.min(x[field],1-x[field]),0),
    brier:mean(list.map(x=>(1-x[field])**2))});
  const valid=rows.filter(x=>Number.isFinite(x[field]));
  return {all:count(valid),bo1:count(valid.filter(r=>r.bo===1)),bo3:count(valid.filter(r=>r.bo===3))};
}
function outcome(event,stage) {
  const recorded=cards.find(s=>s.id===stage.id);
  const data=diagnostic.find(s=>s.id===stage.id).models.recommended.base;
  assert.equal(data.matrixSha256,recorded.matrixSha256);
  const card=recorded.trials.find(t=>t.seed===33719);
  assert.deepEqual(recorded.teams,event.teams.map(t=>t.name));
  const teams=event.teams.map((t,i)=>({name:t.name,seed:i+1,points:stage.points[i],wins:0,losses:0,slot:card.candidate[i]}));
  const series=data.rows.map(r=>{
    const [w,l]=r.y?[r.i,r.j]:[r.j,r.i];
    assert.ok(event.rounds[r.round-1].some(([a,b])=>a===w && b===l));
    teams[w].wins++;teams[l].losses++;
    return {round:r.round,bo:r.bestOf,winner:teams[w].name,loser:teams[l].name,
      vrs:Number.isFinite(teams[w].points)&&Number.isFinite(teams[l].points)?calcP(teams[w].points-teams[l].points):null,
      model:r.y?r.p:1-r.p};
  });
  for(const [i,t] of teams.entries()){
    t.record=t.wins+'–'+t.losses;
    t.actual=t.wins===3?(t.losses===0?0:1):(t.wins===0?2:3);
    t.hit=t.slot<3 && t.slot===t.actual;
    assert.equal(t.actual,data.actual[i]);
  }
  const bucketHits=[0,1,2].map(slot=>teams.filter(t=>t.slot===slot && t.hit).length);
  assert.equal(series.length,33);assert.deepEqual(bucketHits,card.candidateScore.bucketHits);
  return {hits:card.candidateScore.hits,bucketHits,teams,upsets:{vrs:upsets(series,'vrs'),model:upsets(series,'model')},series};
}
function validate(history,mode) {
  const rows=[];
  for(const stage of history) {
    const available = history.filter(s=>s.id!==stage.id && (mode!=='forward' || s.start<stage.start));
    if(!available.length) continue;
    const ranked = withWeights(rank(stage,available));
    const nearest = ranked[0].id;
    const nearestHits=available.find(s=>s.id===nearest).result.hits;
    const scores=available.map(s=>s.result.hits);
    const weighted = transform=>ranked.reduce((sum,r)=>sum+r.weight*transform(available.find(s=>s.id===r.id).result.hits),0);
    rows.push({id:stage.id,nearest,n:scores.length,actual:stage.result.hits,nearestHits,meanHits:mean(scores),
      weightedHits:weighted(h=>h),weightedPass:weighted(h=>Number(h>=5)),
      nearestPass:Number(nearestHits>=5),meanPass:mean(scores.map(h=>Number(h>=5)))});
  }
  const summary=list=>({n:list.length,nearestMAE:mean(list.map(r=>Math.abs(r.actual-r.nearestHits))),
    meanMAE:mean(list.map(r=>Math.abs(r.actual-r.meanHits))),
    weightedMAE:mean(list.map(r=>Math.abs(r.actual-r.weightedHits))),
    weightedBrier:mean(list.map(r=>(Number(r.actual>=5)-r.weightedPass)**2)),
    nearestBrier:mean(list.map(r=>(Number(r.actual>=5)-r.nearestPass)**2)),
    meanBrier:mean(list.map(r=>(Number(r.actual>=5)-r.meanPass)**2))});
  return {rows,...summary(rows),multiple:summary(rows.filter(r=>r.n>=2))};
}

function build() {
  const events=[...PICK_DATA].sort((a,b)=>a.date.localeCompare(b.date));
  const stages=events.map(e=>preStage(e));
  const target=stages.find(s=>s.id==='singapore');
  const history=stages.filter(s=>s.id!==target.id);
  const ranking=withWeights(rank(target,history));
  const sensitivity=Object.keys(metricLabels).map(k=>({variant:'omit_'+k,order:rank(target,history,k).map(x=>x.id)}));
  for(const scale of [300,500]){
    const all=events.map(e=>preStage(e,scale));
    sensitivity.push({variant:'scale_'+scale,order:rank(all.find(s=>s.id===target.id),all.filter(s=>s.id!==target.id)).map(x=>x.id)});
  }
  const basic=events.map(e=>preStage(e,400,true));
  const baseSnapshotOrder=rank(basic.find(s=>s.id===target.id),basic.filter(s=>s.id!==target.id)).map(x=>x.id);
  const targetEvent=events.find(e=>e.id===target.id);
  for(let i=0;i<stages.length;i++){
    stages[i].transfer=transfer(events[i],targetEvent);
    if(stages[i].id===target.id) {
      assert.equal(events[i].hasResults,false);stages[i].result=null;
    } else stages[i].result=outcome(events[i],stages[i]);
  }
  const report={asOf:'2026-11-21',metricLabels,stages:Object.fromEntries(stages.map(s=>[s.id,s])),
    singapore:{ranking,sensitivity,baseSnapshotOrder,sameEntry:ranking.filter(r=>stages.find(s=>s.id===r.id).entry===target.entry).map(r=>r.id)},
    validation:{loo:validate(history,'loo'),forward:validate(history,'forward')},sources};
  return JSON.parse(JSON.stringify(report,(_,x)=>typeof x==='number'?rounded(x):x));
}

const filename=path.join(__dirname,'report.json');
const report=build();
if(process.argv.includes('--check')) assert.deepEqual(report,JSON.parse(fs.readFileSync(filename)));
else fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n');
console.log(report.singapore.ranking.map(r=>[r.id,r.distance]),report.validation.forward.multiple);
