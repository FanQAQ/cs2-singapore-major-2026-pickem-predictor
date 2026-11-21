'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const {confirmSingaporeResult}=require('../stage_goals/public-records.cjs');
const {readResults}=require('../stage_goals/prospective.cjs');
const {errors,cardScore}=require('./score.cjs');
const schedule=require('../stage_goals/singapore-schedule.json').stages[0];
const file=path.join(__dirname,'singapore-forecast.json');
const official=path.join(__dirname,'../forecast_archive/prospective/results/singapore-2026-stage1.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const modelIds=['baseline','elo','ml','blend'];

function forecast(frozenAt) {
  assert.equal(new Date(frozenAt).toISOString(),frozenAt);
  assert(Date.parse(frozenAt)<Date.parse(schedule.firstMatchScheduledUtc));
  if(schedule.valvePickemLockUtc) assert(Date.parse(frozenAt)<Date.parse(schedule.valvePickemLockUtc));
  const {getField,matrices}=require('./evaluate.cjs');
  const f=getField('singapore'), models=matrices(f), teams=f.teams.map(t=>t.name);
  const exact=require('./exact.json').singapore, report=require('./report.json').fields.find(f=>f.id==='singapore');
  assert.equal(report.actual,null);assert.deepEqual(teams,report.teams);
  const cards={};
  for(const id of modelIds) {
    const ex=exact[id],sim=report.methods[id].runs[0], chosen=ex.full.top[ex.full.selected];
    assert.equal(ex.full.visited,10090080);assert.deepEqual(sim.card,ex.standard.card);
    cards[id]={standard:sim.card,search:chosen.card,searchRank:ex.full.selected+1,
      topThree:ex.full.top.map(c=>({card:c.card,rerankPasses:c.counts.select,confirmPasses:c.counts.confirm})),
      standardConfirm:ex.standard.counts.confirm,searchConfirm:chosen.counts.confirm};
  }
  assert.deepEqual(cards.baseline.standard,require('../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json').card);
  const pairs=[];
  for(let a=0;a<16;a++)for(let b=a+1;b<16;b++) {
    const probs={};
    for(const id of modelIds) probs[id]=[models[id].bo1[a][b],models[id].bo3[a][b]];
    pairs.push({a,b,probs});
  }
  const files=['elo.json.gz','ml.json.gz','PROTOCOL.md','ELO-PROTOCOL.md','ML.md'];
  const inputHash=name=>{
    const bytes=fs.readFileSync(path.join(__dirname,name));
    return hash(name.endsWith('.md')?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes);
  };
  return {edition:'singapore-2026',stage:1,frozenAt,startAt:schedule.firstMatchScheduledUtc,
    cutoffExclusive:f.cutoffExclusive,seed:exact.elo.seed,searchPaths:12000,rerankPaths:12000,auditPaths:12000,confirmPaths:60000,
    inputs:Object.fromEntries(files.map(name=>[name,inputHash(name)])),
    teams:f.teams.map(t=>({name:t.name,seed:t.seed,roster:t.roster})),pairs,cards};
}
function load() {
  const envelope=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(hash(JSON.stringify(envelope.forecast)),envelope.sha256);
  return envelope.forecast;
}
function grade(f,result) {
  const pairs=new Map(f.pairs.map(p=>[p.a*16+p.b,p.probs]));assert.equal(pairs.size,120);
  const scores={};
  for(const [id,cards] of Object.entries(f.cards)) {
    const formats={};
    for(const [index,key] of ['bo1','bo3'].entries()) {
      const games=result.games.filter(g=>g.key===key&&g.played!==false);
      formats[key]=errors(games.map(({w,l})=>{
        const p=pairs.get(Math.min(w,l)*16+Math.max(w,l))[id][index];return w<l?p:1-p;
      }));
    }
    scores[id]={standard:cardScore(cards.standard,result.actual),search:cardScore(cards.search,result.actual),formats};
  }
  return {status:'scored',endAt:result.endAt,source:result.verified,actual:result.actual,scores};
}
function status(f) {
  if(!fs.existsSync(official)) return {status:'pending'};
  confirmSingaporeResult(official,1);
  return grade(f,readResults(official,f.edition,f.stage,f.startAt,'mixed',f.teams.map(t=>t.name)));
}
if(require.main===module) {
  const [action]=process.argv.slice(2);assert(['--seal','--check','--score'].includes(action));
  if(action==='--seal') {
    assert(!fs.existsSync(file)&&!fs.existsSync(official),'Stage already sealed or scored');
    const data=forecast(new Date().toISOString()), temp=file+'.'+randomUUID()+'.tmp';
    try {
      fs.writeFileSync(temp,JSON.stringify({sha256:hash(JSON.stringify(data)),forecast:data},null,2)+'\n',{flag:'wx'});
      assert(Date.now()<Date.parse(schedule.valvePickemLockUtc||schedule.firstMatchScheduledUtc) && !fs.existsSync(official));
      fs.copyFileSync(temp,file,fs.constants.COPYFILE_EXCL);
    } finally {fs.rmSync(temp,{force:true});}
  }
  const f=load();
  if(action==='--check') assert.deepEqual(forecast(f.frozenAt),f);
  console.log(JSON.stringify({frozenAt:f.frozenAt,models:Object.keys(f.cards),...status(f)}));
}
module.exports={load,status,grade,modelIds};
