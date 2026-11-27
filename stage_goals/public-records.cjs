'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {inspect,readResults,score}=require('./prospective.cjs');
const legacy=require('../external_forecasts/score.cjs');
const schedule=require('./singapore-schedule.json');
const forecastDir=path.join(__dirname,'../forecast_archive');
const entryFor=stage=>schedule.stages.find(row=>row.stage===stage);
const earliestFinalDay=stage=>Date.parse(entryFor(stage).lastScheduledDateLocal+'T00:00:00+08:00');
function confirmSingaporeResult(resultFile,stage) {
  const r=JSON.parse(fs.readFileSync(resultFile,'utf8'));
  assert(Date.parse(r.endAt)>=earliestFinalDay(stage),'Singapore result predates the scheduled final round date');
  const {hostname:host,pathname}=new URL(r.source.url);
  const steam=host==='store.steampowered.com' && pathname.startsWith('/news/app/730/') ||
    host==='steamcommunity.com' && /^\/games\/(?:CSGO|730)\/announcements\//i.test(pathname);
  assert(steam || ['pglesports.com','counter-strike.net'].some(d=>host===d || host.endsWith('.'+d)),
    'Provide the organizer or Valve official results URL for Singapore');
}
function ticket(id,source,webFile,frozenAt,teams,card,result) {
  const groups=[0,1,2].map(slot=>teams.filter((_,i)=>card[i]===slot));
  assert.deepEqual(groups.map(g=>g.length),[2,6,2]);
  return {id,webFile,sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
    frozenAt,groups,hits:result?.hits??null};
}
function singaporeFirst(resultFile) {
  const data=legacy.load(); // Checks hashes and identical seed order for both original records.
  const start=schedule.stages[0].firstMatchScheduledUtc;
  let scores=null,source=null;
  if(fs.existsSync(resultFile)) {
    confirmSingaporeResult(resultFile,1);
    const checked=readResults(resultFile,'singapore-2026',1,start,'mixed',data.teams);
    const named=checked.rounds.map(row=>row.map(([w,l])=>[data.teams[w],data.teams[l]]));
    scores=legacy.scoreResults(data,{stage:'pgl-singapore-2026-stage-1',source:checked.verified.url,rounds:named}).completedStage;
    source=checked.verified;
  }
  const definitions=[
    ['recommended','singapore-stage1-seed-conditional-2026-11-21.json',data.currentCard],
    ['earlierStageChallenger','singapore-stage1-earlier-stages-2026-11-21.json',data.challengerCard]
  ];
  const cards=definitions.map(([key,file,slots])=>{
    const recordPath=path.join(forecastDir,file), record=JSON.parse(fs.readFileSync(recordPath,'utf8'));
    return ticket(key,recordPath,'forecasts/'+file,record.sealedAt||record.sealedOn,data.teams,slots,scores?.[key]);
  });
  return {edition:'singapore-2026',editionStart:start.slice(0,10),stage:1,stageStart:start.slice(0,10),source,cards};
}
const singaporeSecondFile='singapore-stage2-2026-11-27.json';
const singaporeSecondHash='673ede0a76e6d7aed93a33187072829aca6c60f125eb3f48c10dca181e1c05bf';
function singaporeSecond(archive,resultFile) {
  const raw=fs.readFileSync(archive);
  assert.equal(createHash('sha256').update(raw).digest('hex'),singaporeSecondHash,'Singapore Stage 2 archive checksum');
  const f=JSON.parse(raw);
  assert.equal(f.id,'singapore-2026-stage2');
  assert.equal(f.startsAt,entryFor(2).firstMatchScheduledUtc);
  const frozen=Date.parse(f.sealedAt);
  assert(frozen<=Date.now() && frozen<Date.parse(f.startsAt),'Singapore Stage 2 must be sealed before its first match');
  const names=f.teams.map(t=>t.name);
  assert.deepEqual(f.teams.map(t=>t.seed),Array.from({length:16},(_,i)=>i+1));
  assert.deepEqual(names,['FUT ESPORTS','Nemiga Gaming','G2 Esports','The One','Natus Vincere','Astralis','The MongolZ','MIBR',
    'FlyQuest','Ninjas in Pyjamas','Liquid','Eternal Fire','PARIVISION','Imperial','Lynn Vision','100 Thieves'],'Singapore Stage 2 seed order');
  const first=fs.readFileSync(path.join(path.dirname(resultFile),'singapore-2026-stage1.json'));
  assert.equal(createHash('sha256').update(first).digest('hex'),f.audit.hashes.stage1WinnerInput,'Singapore Stage 1 input checksum');
  assert(Date.parse(JSON.parse(first).endAt)<=frozen,'Stage 2 forecast precedes qualification');
  let checked=null;
  if(fs.existsSync(resultFile)) {
    confirmSingaporeResult(resultFile,2);
    checked=readResults(resultFile,'singapore-2026',2,f.startsAt,'mixed',names);
  }
  const cards=[['recommended',f.card,f.matrix],['withoutStage1',f.baseCard,f.baseMatrix]].map(([id,card,matrix])=>{
    assert.deepEqual([0,1,2,3].map(slot=>card.filter(p=>p===slot).length),[2,6,2,6]);
    const entry=ticket(id,archive,'forecasts/'+singaporeSecondFile,f.sealedAt,names,card,null);
    if(checked) {
      entry.hits=CS.actualScore(card,checked.actual);
      entry.passed=entry.hits>=5;
      entry.bucketHits=[0,1,2].map(slot=>names.filter((_,i)=>card[i]===slot && checked.actual[i]===slot));
      entry.formats={};
      for(const key of ['bo1','bo3']) {
        const ps=checked.games.filter(game=>game.played && game.key===key).map(game=>matrix[key][game.w][game.l]);
        entry.formats[key]={n:ps.length,brier:ps.length?ps.reduce((v,p)=>v+(1-p)**2,0)/ps.length:null,
          logLoss:ps.length?ps.reduce((v,p)=>v-Math.log(p),0)/ps.length:null};
      }
    }
    return entry;
  });
  return {edition:'singapore-2026',editionStart:entryFor(1).firstMatchScheduledUtc.slice(0,10),stage:2,
    stageStart:f.startsAt.slice(0,10),source:checked?.verified??null,cards};
}
function publicRecords(edition,dir) {
  assert.match(edition,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const stages=[];
  for(const stage of [1,2,3]) {
    const file=edition+'-stage'+stage+'.json', archive=path.join(dir,file);
    const results=path.join(dir,'results',file);
    if(edition==='singapore-2026' && stage===1) {
      assert(!fs.existsSync(archive),'Singapore Stage 1 already has its original pre-event archives');
      stages.push(singaporeFirst(results));
      continue;
    }
    if(edition==='singapore-2026' && stage===2) {
      const file=path.resolve(dir,'..',singaporeSecondFile);
      if(path.resolve(dir)===path.join(forecastDir,'prospective') || fs.existsSync(file)) {
        assert(!fs.existsSync(archive),'Duplicate Singapore Stage 2 pre-event archive');
        stages.push(singaporeSecond(file,results));
        continue;
      }
    }
    if(!fs.existsSync(archive)) {
      assert(!fs.existsSync(results),'Results require an existing pre-event archive: '+file);
      continue;
    }
    const {payload:p}=inspect(archive);
    assert.equal(p.input.edition,edition);assert.equal(p.input.stage,stage);
    if(edition==='singapore-2026') {
      if(fs.existsSync(results)) confirmSingaporeResult(results,stage);
    }
    const resultsRecord=fs.existsSync(results)?score(archive,results):null;
    const teams=p.input.teams.map(t=>t.name);
    stages.push({edition,editionStart:p.input.editionStartAt.slice(0,10),stage,stageStart:p.input.startAt.slice(0,10),
      source:resultsRecord?.source??null,cards:Object.entries(p.cards).map(([key,slots])=>
      ticket(key,archive,'forecasts/prospective/'+file,p.frozenAt,teams,slots,resultsRecord?.cards[key]))});
  }
  return stages;
}
module.exports={publicRecords,confirmSingaporeResult};
if(require.main===module) console.log(JSON.stringify(publicRecords('singapore-2026',path.join(forecastDir,'prospective'))));
