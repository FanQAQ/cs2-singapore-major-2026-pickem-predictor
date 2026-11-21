'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const {samples,teams:indices}=require('../ml_allocation/draw.cjs');
const {cardScore}=require('../f1bre_models/score.cjs');
const folder=__dirname,target='cluj-2025',development=['austin-2025-3','budapest-2025-3','cologne-2026-3'];
const retired='b5042b6fb7c270f7692071486417ca8e471250c4487b4dec72ba5addf0e23713';
const hash=b=>createHash('sha256').update(b).digest('hex'),load=f=>JSON.parse(fs.readFileSync(path.join(folder,f)));
const n=budget/2,arms=['original','candidate'];
function loadMatrix(file,expected){
  assert(/^[a-f0-9]{64}$/.test(expected),'Provide the approved frozen forecast digest');
  assert.notEqual(expected,retired,'First roster lock was retired, without scoring, after checking pre-stage evidence');
  const r=JSON.parse(fs.readFileSync(file));
  assert.equal(r.sha256,expected);assert.equal(hash(JSON.stringify(r.forecast)),expected);
  assert.deepEqual(Object.keys(r.forecast.fields).sort(),[target,...development].sort());
  return r.forecast;
}
function probabilities(f){
  assert.equal(f.teams.length,16);assert.equal(new Set(f.teams).size,16);
  const m=new Map();assert.equal(f.pairs.length,120);
  for(const p of f.pairs){
    assert(indices.includes(p.a)&&indices.includes(p.b)&&p.a<p.b);
    assert([p.bo1,p.bo3,p.adjusted].every(v=>Number.isFinite(v)&&v>0&&v<1));
    assert(typeof p.eligible==='boolean' && typeof p.triggered==='boolean');
    assert.equal(p.triggered,Math.abs(p.bo3-p.adjusted)>1e-12);
    assert(!p.triggered||p.eligible);
    assert(!m.has(16*p.a+p.b));m.set(16*p.a+p.b,p);
  }
  return m;
}
function historical(id,teams) {
  if(id===target){
    const f=load('field.json'),r=load('truth.json');
    assert.equal(f.start,r.start);assert.deepEqual(teams,f.entrants);assert.deepEqual(f.seedOrder,indices);
    const ix=name=>{const i=teams.indexOf(name);assert(i>=0);return i;};
    const canon=p=>p.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
    const matches=r.matches.map(g=>{
      const [a,b,w,l]=[g.a,g.b,g.w,g.l].map(ix);
      const overlap=[g.fiveA,g.fiveB].map((five,j)=>{
        const roster=new Set(f.teams[[a,b][j]].roster.map(canon));
        return five.filter(p=>roster.has(canon(p))).length;
      });
      assert(g.played && g.bo===3 && Math.min(...overlap)>=3);
      assert.equal(g.maps.length,g.score[0]+g.score[1]);assert.equal(Math.max(...g.score),2);
      return {id:g.id,round:g.round,day:g.day,a,b,w,l,bo:g.bo,score:g.score,maps:g.maps,rosterOverlap:overlap,source:g.source};
    });
    return {matches,perfect:r.perfect,actual:teams.map(t=>{const [w,l]=r.records[t];return w===3?(l===0?0:1):w===0?2:3;})};
  }
  const old=load('../veto_ml/cards.json').fields.find(f=>f.id===id);
  assert.deepEqual(teams,old.teams);assert.equal(old.matched,33);
  const rows=load('truth-development.json')[id];
  const pairKey=(a,b)=>[a,b].sort().join('/');
  const cover=new Map(rows.map(g=>[pairKey(...g.teams),g]));
  assert.equal(cover.size,33);
  const matches=old.matches.map(g=>{
    const a=Math.min(g.w,g.l),b=Math.max(g.w,g.l);
    const board=cover.get(pairKey(teams[a],teams[b]));
    assert(board && board.winner===teams[g.w]);assert.equal(board.bo,g.bo);assert.equal(board.round,g.round);
    // The earlier team-stage database dates seven late series one calendar day later
    // than the archived HLTV start timestamp. Both result sources are preserved.
    const later=new Set([2382592,2382593,2382594,2382595,2382612,2388105,2388106]);
    assert.equal((Date.parse(g.day)-Date.parse(board.day))/86400000,later.has(board.id)?1:0);
    const same=board.teams[0]===teams[a],maps=board.maps.map(([m,x,y])=>same?[m,x,y]:[m,y,x]);
    const score=same?board.score:[...board.score].reverse();
    assert.equal(maps.length,score[0]+score[1]);assert.equal(maps.filter(([,x,y])=>x>y).length,score[0]);
    return {id:board.id,round:g.round,day:board.day,stageArchiveDay:g.day,a,b,w:g.w,l:g.l,bo:g.bo,
      score,maps,source:board.source,
      publishedBaseline:g.winnerProbability.original};
  });
  return {matches,actual:old.actual,perfect:teams.filter((_,i)=>old.actual[i]===0).sort()};
}
function losses(rows,k){
  if(!rows.length)return {brier:null,logLoss:null};
  let brier=0,logLoss=0;
  for(const r of rows){const pw=r.w===r.a?r[k]:1-r[k];brier+=(1-pw)**2;logLoss-=Math.log(pw);}
  return {brier:brier/rows.length,logLoss:logLoss/rows.length};
}
function metrics(rows){return {n:rows.length,original:losses(rows,'original'),candidate:losses(rows,'candidate')};}
function gate(m){
  const checks={};
  for(const subset of ['all','eligible'])for(const loss of ['brier','logLoss']){
    checks[subset+'_'+loss]=m[subset].n>0 && m[subset].candidate[loss]<m[subset].original[loss];
  }
  return {passed:Object.values(checks).every(Boolean),criteria:checks};
}
function confirm(matches,truth){
  const rounds=[1,2,3,4,5].map(i=>matches.filter(m=>m.round===i).map(m=>[m.w,m.l]));
  const replay=CS.replay(rounds);
  if(replay.ok)assert.deepEqual(truth.actual,replay.actual);
  return {matched:replay.matched,total:33,byRound:replay.rounds.map(r=>r.matched),ok:replay.ok};
}
const pop=new Uint8Array(65536);for(let i=1;i<pop.length;i++)pop[i]=pop[i>>>1]+(i&1);
function auditPass(card,sample){
  const masks=[0,0,0];card.forEach((c,i)=>{if(c<3)masks[c]|=1<<i;});let pass=0;
  for(let k=0;k<sample.outcomes.length;k+=3)pass+=Number(pop[sample.outcomes[k]&masks[0]]+
    pop[sample.outcomes[k+1]&masks[1]]+pop[sample.outcomes[k+2]&masks[2]]>=5);
  return pass/sample.count;
}
function cardAudit(model,truth){
  const probabilitiesByArm={};
  for(const arm of arms){
    const grid=indices.map(()=>indices.map(()=>.5));
    for(const p of model.pairs){const q=arm==='original'?p.bo3:p.adjusted;grid[p.a][p.b]=q;grid[p.b][p.a]=1-q;}
    probabilitiesByArm[arm]={bo1:grid,bo3:grid,allBo3:true};
  }
  const out={seed:seeds[0],seeds,pathsPerPartition:n,arms:{}};
  for(const arm of arms){
    const m=probabilitiesByArm[arm],f={id:target,scheme:'major'};
    const runs=seeds.map(seed=>{
      const train=samples(f,m,n,seed,'major'),test=samples(f,m,n,(seed^0xc5398da1)>>>0,'major');
      const {card}=CS.cardsFromSamples(train,true),real=cardScore(card,truth.actual);
      const perfect=test.frequencies.map(freq=>freq[0]/n),zero=test.frequencies.map(freq=>freq[2]/n);
      const brier=(ps,category)=>ps.reduce((s,p,i)=>s+(p-Number(truth.actual[i]===category))**2,0)/16;
      return {seed,card,hits:real.hits,passed:real.hits>=5,slots:real.slots,
        simulatedPass:auditPass(card,test),perfect,zero,perfectBrier:brier(perfect,0),zeroBrier:brier(zero,2)};
    });
    out.arms[arm]={main:runs[0],runs};
  }
  const sign=key=>{const d=seeds.map((_,i)=>Number(out.arms.candidate.runs[i][key])-Number(out.arms.original.runs[i][key]));
    return {better:d.filter(x=>x>0).length,same:d.filter(x=>x===0).length,worse:d.filter(x=>x<0).length};};
  out.passDirection=sign('passed');out.hitDirection=sign('hits');
  return out;
}
function score(id,model){
  const holdout=id===target,lookup=probabilities(model),truth=historical(id,model.teams);
  const matches=truth.matches.map(g=>{
    const p=lookup.get(16*Math.min(g.a,g.b)+Math.max(g.a,g.b)),orient=q=>g.a===p.a?q:1-q;
    const original=orient(g.bo===3?p.bo3:p.bo1),candidate=orient(g.bo===3?p.adjusted:p.bo1);
    assert(g.score.length===2 && ((g.score[0]>g.score[1])===(g.w===g.a)));
    const {publishedBaseline,...fact}=g;
    if(publishedBaseline!==undefined)assert(Math.abs(publishedBaseline-(g.w===g.a?original:1-original))<=1.1e-9);
    return {...fact,original,candidate,eligible:g.bo===3&&p.eligible,triggered:g.bo===3&&p.triggered};
  });
  const result={all:metrics(matches),bo1:metrics(matches.filter(g=>g.bo===1)),bo3:metrics(matches.filter(g=>g.bo===3)),
    eligible:metrics(matches.filter(g=>g.eligible)),changed:metrics(matches.filter(g=>g.triggered))};
  const replay=confirm(matches,truth);
  assert.equal(matches.length,33);assert.equal(result.bo3.n,id===target||id==='cologne-2026-3'?33:13);
  const rule=holdout?gate(result):{passed:null,criteria:null};
  const canDraw=holdout && rule.passed && replay.ok && replay.matched===33;
  const reason=!holdout?'development-only':!rule.passed?'loss-gate-not-met':!canDraw?'pairings-not-reproduced':'passed';
  return {role:holdout?'holdout':'development',start:model.start,teams:model.teams,replay,actual:truth.actual,perfect:truth.perfect,
    matches,metrics:result,gate:{...rule,reason},simulation:canDraw?cardAudit(model,truth):null};
}
function main(argv){
  const option=key=>{const i=argv.indexOf(key);assert(i>=0 && argv[i+1] && !argv[i+1].startsWith('--'),key+' required');return argv[i+1];};
  const file=path.resolve(option('--matrix')),digest=option('--sha256'),lock=loadMatrix(file,digest);
  const fields=Object.fromEntries([target,...development].map(id=>[id,score(id,lock.fields[id])]));
  const output={lockSha256:digest,axes:'a,b,w,l are zero-based in field.teams; original/candidate are P(a wins); score gives maps won by a,b in that order.',fields};
  const dest=path.join(folder,'scores.json'),text=JSON.stringify(output,null,2)+'\n';
  if(argv.includes('--check'))assert.equal(fs.readFileSync(dest,'utf8'),text);
  else fs.writeFileSync(dest,text);
  console.log('Verified 33 external Swiss series and three separate historical stages; external card search:',fields[target].gate.reason);
}
module.exports={loadMatrix,probabilities,metrics,gate,confirm,score};
if(require.main===module)main(process.argv.slice(2));
