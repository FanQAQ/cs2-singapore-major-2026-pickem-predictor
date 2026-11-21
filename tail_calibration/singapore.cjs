'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash, randomUUID} = require('node:crypto');
const {budget, productionSeed} = require('../strategy_v4_eval/settings.cjs');
const {confirmSingaporeResult} = require('../stage_goals/public-records.cjs');
const {readResults} = require('../stage_goals/prospective.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(__dirname, 'singapore-study.json');
const official = path.join(root, 'forecast_archive/prospective/results/singapore-2026-stage1.json');
const reference = 'forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json';
const referenceHash = 'ae1c25551ac4ce23737b2e69ef3aa5ad57488f5bc7e67bc3f1d088d1725c594c';
const schedule = require('../stage_goals/singapore-schedule.json');
const edition = 'singapore-2026';
const methodNames = {
  recommended:'生产推荐 · 原始 BO3', recommendedCal:'生产推荐 · 校准 BO3',
  vrs:'Valve 积分 / 400 · 原始 BO3', vrsCal:'Valve 积分 / 400 · 校准 BO3'
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const lfText = file => fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
const read = file => JSON.parse(lfText(file));

function makeRecord(frozenAt, checkLive = false) {
  const {majorData,recommendedFit,vrsFit,odds,trainingArchive}=require('./evaluate.cjs');
  const stageSchedule=schedule.stages.find(s=>s.stage===1);
  const startAt=stageSchedule.firstMatchScheduledUtc, start=startAt.slice(0,10);
  assert.equal(new Date(frozenAt).toISOString(),frozenAt);
  assert(Date.parse(frozenAt)<Date.parse(startAt) && Date.parse(frozenAt)<=Date.now());
  if(stageSchedule.valvePickemLockUtc) assert(Date.parse(frozenAt)<Date.parse(stageSchedule.valvePickemLockUtc));
  const base=read(reference);
  assert.equal(digest(lfText(reference)),referenceHash);
  assert.equal(base.startsOn,start);
  assert.equal(base.seed,productionSeed);
  assert.equal(base.searchPaths+base.evaluationPaths,budget);
  assert.equal(base.flags.seedConditionalCard,true);
  assert.deepEqual(base.locks,[]);
  const {matrixReference:ref}=base, matrixRecord=read(ref.file);
  assert.equal(digest(lfText(ref.file)),ref.sha256);
  const matrix=matrixRecord[ref.field];
  assert.equal(digest(JSON.stringify(matrix)),base.matrixSha256);
  const featureSource=require('../datajob/features.json').singapore;
  assert.equal(featureSource.asOf,base.pointsAsOf);
  const teams=base.teams.map(({seed,team:name,roster},i)=>{
    const matching=featureSource.teams.filter(t=>t.name===name);
    assert.equal(matching.length,1);
    const t=matching[0], prior=matrixRecord.teams[i];
    assert.equal(seed,i+1); assert.equal(prior.seed,seed); assert.equal(prior.name,name);
    assert.deepEqual(prior.roster,roster); assert.deepEqual(t.roster,roster);
    assert.equal(t.points,prior.points);
    return {seed,name,roster,points:t.points,vrsRoster:t.vrsRoster,vrsCoreOverlap:t.vrsCoreOverlap,rankSource:t.source};
  });
  const report=read('tail_calibration/report.json');
  const archive=trainingArchive(report.trainingSha256);
  const vrs=vrsFit('singapore',start,archive);
  const cutoff=frozenAt.slice(0,10);
  assert(vrs.cutoffExclusive<=cutoff);
  const fields=report.stages.filter(s=>!s.external && !s.id.startsWith('singapore') && s.start<cutoff)
    .map(s=>{
      const end=s.matches.map(g=>g.day).sort().at(-1);
      assert.equal(s.verifiedMatchups,33);
      return {id:s.id,end,records:s.matches.map(g=>({id:g.id,bo:g.bo,day:g.day,p:g.winProbability.recommended,y:1}))};
    }).filter(s=>s.end<cutoff);
  assert.equal(fields.length,13);
  const f={id:'singapore',start,external:false,teams,matrix};
  const recommended=recommendedFit(f,fields);
  if(checkLive) {
    const event=PickLab.allEvents.find(e=>e.id==='singapore');
    assert(event && !event.hasResults && !event.rounds.length && !fs.existsSync(official));
    assert.deepEqual(PickLab.seriesMatrices(event,PickMethods.defaults('recommended',event)),matrix);
    const current=PickLab.allEvents.filter(e=>fields.some(s=>s.id===e.id)).map(majorData);
    const direct=recommendedFit(f,current);
    assert.equal(direct.n,recommended.n);
    assert(Math.abs(direct.b-recommended.b)<1e-12);
  }
  const matrices=odds(f,vrs,recommended), probabilities=[];
  for(let a=0;a<16;a++) for(let b=a+1;b<16;b++) {
    probabilities.push({a:teams[a].name,b:teams[b].name,bo1:matrix.bo1[a][b],
      bo3:Object.fromEntries(Object.keys(methodNames).map(k=>[k,matrices[k].bo3[a][b]]))});
  }
  assert.equal(probabilities.length,120);
  const cards={};
  for(const [id,name] of Object.entries(methodNames)) {
    const sim=CS.run(matrices[id],budget,productionSeed,[],{seedConditionalCard:true});
    assert.equal(sim.searchN,base.searchPaths); assert.equal(sim.evalN,base.evaluationPaths);
    const groups=[0,1,2].map(slot=>teams.filter((t,i)=>sim.card[i]===slot).map(t=>t.name));
    assert.deepEqual(groups.map(g=>g.length),[2,6,2]);
    cards[id]={name,card:sim.card,groups,probabilities:sim.probs,passProbability:sim.pass,
      expectedHits:sim.expected,scoreDistribution:sim.histogram};
  }
  for(const k of ['card','probabilities','passProbability','expectedHits','scoreDistribution']) {
    assert.deepEqual(cards.recommended[k],base[k],k);
  }
  return {edition,stage:1,frozenAt,startAt,verifiedValveLockAt:stageSchedule.valvePickemLockUtc,
    format:'mixed',reference:{file:reference,sha256LF:referenceHash,matrixReference:ref},
    protocol:{file:'tail_calibration/PROTOCOL.md',sha256LF:digest(lfText('tail_calibration/PROTOCOL.md'))},
    pointsAsOf:base.pointsAsOf,startingFiveAsOf:base.startingFiveAsOf,
    training:{vrs:{...vrs,archiveSha256:report.trainingSha256},recommended:{...recommended,
      completedBefore:cutoff,reportFile:'tail_calibration/report.json',reportSha256LF:digest(lfText('tail_calibration/report.json'))}},
    searchSeed:productionSeed,evaluationSeed:(productionSeed^0xc5398da1)>>>0,searchPaths:base.searchPaths,
    evaluationPaths:base.evaluationPaths,categoryOrder:base.categoryOrder,teams,probabilities,cards};
}

function loadRecord() {
  const envelope=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.equal(digest(JSON.stringify(envelope.forecast)),envelope.sha256,'研究封存校验失败');
  return envelope.forecast;
}

function scoreVerified(record,result) {
  const names=record.teams.map(t=>t.name);
  const pairs=new Map(record.probabilities.map(g=>[names.indexOf(g.a)*16+names.indexOf(g.b),g]));
  assert.equal(pairs.size,120);
  const cards=Object.fromEntries(Object.entries(record.cards).map(([k,c])=>{
    const hits=CS.actualScore(c.card,result.actual);
    const formats=Object.fromEntries(['bo1','bo3'].map(key=>{
      const games=result.games.filter(g=>g.key===key);
      const played=games.filter(g=>g.played!==false);
      const ps=played.map(({w,l})=>{
        const pair=pairs.get(Math.min(w,l)*16+Math.max(w,l));
        const p=key==='bo1'?pair.bo1:pair.bo3[k];
        assert(p>0 && p<1);
        return w<l?p:1-p;
      });
      return [key,{n:ps.length,unplayed:games.length-ps.length,
        brier:ps.length?ps.reduce((s,p)=>s+(1-p)**2,0)/ps.length:null,
        logLoss:ps.length?ps.reduce((s,p)=>s-Math.log(p),0)/ps.length:null}];
    }));
    return [k,{name:c.name,hits,passed:hits>=5,formats,
      hitTeams:[0,1,2].map(slot=>names.filter((_,i)=>c.card[i]===slot && result.actual[i]===slot))}];
  }));
  return {status:'scored',edition,stage:1,endAt:result.endAt,source:result.verified,verifiedMatchups:result.games.length,cards};
}

function score(record) {
  if(!fs.existsSync(official)) return {status:'pending',label:'待评分',file:path.relative(root,official).split(path.sep).join('/')};
  confirmSingaporeResult(official,1);
  const result=readResults(official,edition,1,record.startAt,'mixed',record.teams.map(t=>t.name));
  return scoreVerified(record,result);
}

if(require.main===module) {
  const [action,...rest]=process.argv.slice(2);
  assert(!rest.length && [undefined,'--check','--seal','--score'].includes(action));
  if(action==='--seal') {
    assert(!fs.existsSync(output),'研究卡已经封存');
    const forecast=makeRecord(new Date().toISOString(),true);
    const envelope={sha256:digest(JSON.stringify(forecast)),forecast};
    const temp=output+'.'+randomUUID()+'.tmp';
    try {
      fs.writeFileSync(temp,JSON.stringify(envelope,null,2)+'\n',{flag:'wx'});
      assert(Date.now()<Date.parse(forecast.startAt) && !fs.existsSync(official));
      fs.copyFileSync(temp,output,fs.constants.COPYFILE_EXCL);
    } finally { fs.rmSync(temp,{force:true}); }
  }
  const record=loadRecord();
  if(action==='--check') assert.deepEqual(makeRecord(record.frozenAt),record);
  console.log(JSON.stringify({frozenAt:record.frozenAt,cardCount:Object.keys(record.cards).length,...score(record)},null,2));
}
module.exports={loadRecord,score,scoreVerified};
