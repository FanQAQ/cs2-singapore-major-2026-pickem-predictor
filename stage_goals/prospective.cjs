'use strict';
const assert=require('node:assert/strict');
const {createHash,randomUUID}=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
require('../engine/engine.js');
require('../final_card/rules.js');
const historical=require('../multi_stage/inputs.json');
const editions=require('../major_form/all_stages.json').editions;
const seed=33719, budget=24000;
const digest=data=>createHash('sha256').update(data).digest('hex');
const hash=obj=>digest(JSON.stringify(obj));
const canonical=s=>s.normalize('NFKC').trim().toLowerCase();
function utc(value) {
  assert.equal(typeof value,'string','UTC timestamp required');
  assert.match(value,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/,'Specify UTC with Z');
  const n=Date.parse(value);
  assert.ok(Number.isFinite(n) && new Date(n).toISOString()===value.replace(/(?<=\d{2}:\d{2}:\d{2})Z$/,'.000Z'),'Invalid UTC time');
  return n;
}
function exactKeys(object,keys) {
  assert.ok(object && typeof object==='object' && !Array.isArray(object),'Expected a record');
  for(const key of Object.keys(object)) assert.ok(keys.includes(key),'Unexpected field: '+key);
}
function named(name) {
  assert.ok(typeof name==='string' && name.trim()===name && name.length>0 && !/^(?:tbd|tba|unknown|待定|待公布)$/i.test(name),'Confirmed name required');
  return canonical(name);
}
function five(roster) {
  assert.ok(Array.isArray(roster) && roster.length===5,'Five confirmed starters required');
  const names=new Set(roster.map(named));
  assert.equal(names.size,5,'Duplicate player in lineup');
  return names;
}
function webSource(url) {
  const u=new URL(url);
  assert.ok(u.protocol==='https:' && !u.username && !u.password,'Public HTTPS source URL required');
}
function evidence(source,dir,now) {
  exactKeys(source,['kind','url','publishedAt','file']);
  webSource(source.url);
  assert.ok(utc(source.publishedAt)<=now,'Source publication is in the future');
  assert.ok(typeof source.file==='string' && source.file.length,'Missing saved source document');
  const raw=fs.readFileSync(path.resolve(dir,source.file));
  assert.ok(raw.length,'Empty source document');
  return {kind:source.kind,url:source.url,publishedAt:source.publishedAt,bytes:raw.length,sha256:digest(raw)};
}
function validateMatrix(m,order,format) {
  exactKeys(m,['model','asOf','teamOrder','bo1','bo3','allBo3','state']);
  assert.equal(m.model,'recommended','Supply production recommended-model odds');
  assert.deepEqual(m.teamOrder,order,'Matrix axes differ from seed order');
  if(m.allBo3!==undefined) assert.equal(m.allBo3,format==='all-bo3','Matrix and official stage format differ');
  for(const key of ['bo1','bo3']){
    const matrix=m[key];
    assert.ok(Array.isArray(matrix) && matrix.length===16 && matrix.every(row=>Array.isArray(row)&&row.length===16),'Matrix must be 16 × 16');
    for(let i=0;i<16;i++) for(let j=0;j<16;j++){
      const p=matrix[i][j];
      assert.ok(Number.isFinite(p) && p>0 && p<1 && (i!==j || p===.5),'Invalid probability');
      assert.ok(Math.abs(p+matrix[j][i]-1)<1e-9,'Paired odds must sum to one');
    }
  }
  if(m.state!==undefined) {
    exactKeys(m.state,['scales']);
    assert.ok(Array.isArray(m.state.scales) && m.state.scales.length===16 && m.state.scales.every(s=>Number.isFinite(s) && s>=0),'Invalid shared-state scales');
  }
}
function validate(input,now) {
  exactKeys(input,['edition','stage','editionStartAt','startAt','lockAt','qualificationCompleteAt','format','teams','probabilities','sources']);
  assert.match(input.edition,/^[a-z0-9]+(?:-[a-z0-9]+)*$/,'Use a stable edition ID');
  assert.ok([1,2,3].includes(input.stage) && ['mixed','all-bo3'].includes(input.format),'Unknown stage or format');
  const start=utc(input.startAt), editionStart=utc(input.editionStartAt),lock=utc(input.lockAt);
  assert.ok(now<lock && lock<=start,'Forecast deadline has passed or exceeds first match');
  if(input.stage===1) {
    assert.equal(start,editionStart,'Stage 1 begins the edition');
    assert.ok(input.qualificationCompleteAt===undefined);
  } else {
    const qualified=utc(input.qualificationCompleteAt);
    assert.ok(editionStart<qualified && qualified<=now && qualified<lock,'Previous stage must have completed before locking this field');
  }
  assert.ok(Array.isArray(input.teams) && input.teams.length===16,'A complete 16-team field is required');
  const names=new Set(),starters=new Set();
  input.teams.forEach((team,i)=>{
    exactKeys(team,['seed','name','roster','points','ratingRoster']);
    assert.equal(team.seed,i+1,'Team order must match official seeds');
    const name=named(team.name);
    assert.ok(!names.has(name),'Duplicate team');
    names.add(name);
    const roster=five(team.roster), rated=five(team.ratingRoster);
    assert.ok(Array.from(roster).filter(n=>rated.has(n)).length>=3,'Rating must retain at least three actual starters');
    for(const player of roster){assert.ok(!starters.has(player),'Player listed for two teams');starters.add(player);}
    assert.ok(Number.isFinite(team.points) && team.points>0,'Verified pre-stage rating required');
  });
  const m=input.probabilities;
  validateMatrix(m,input.teams.map(t=>t.name),input.format);
  assert.ok(utc(m.asOf)<=now,'Odds postdate freeze');
  assert.ok(Array.isArray(input.sources));
  const kinds=new Set(input.sources.map(s=>s.kind));
  for(const k of ['field','rosters','ratings','rules']) assert.ok(kinds.has(k),'Missing evidence: '+k);
  for(const s of input.sources) {
    webSource(s.url);
    const published=utc(s.publishedAt);
    assert.ok(published<=now && published<lock,'Source postdates prediction');
    if (s.kind==='field' && input.stage>1) assert.ok(published>=utc(input.qualificationCompleteAt),'Field source predates qualification');
    if (s.kind==='ratings') assert.ok(published<=utc(m.asOf),'Ratings postdate odds');
  }
}
function confirmSingaporeStage(input) {
  const stages=require('./singapore-schedule.json').stages;
  const s=stages[input.stage-1];
  assert.equal(Date.parse(input.editionStartAt),Date.parse(stages[0].firstMatchScheduledUtc),'Wrong Singapore edition start');
  assert.equal(Date.parse(input.startAt),Date.parse(s.firstMatchScheduledUtc),'Singapore stage start differs from the verified schedule');
  assert.equal(input.format,s.openingRoundBestOf===3?'all-bo3':'mixed','Wrong Singapore stage format');
  if(input.stage===1) return;
  const previousEnd=Date.parse(stages[input.stage-2].lastScheduledDateLocal+'T00:00:00+08:00');
  assert(Date.parse(input.qualificationCompleteAt)>=previousEnd,'Qualification predates the preceding final round date');
  const direct=input.teams.slice(0,8);
  const normalize=x=>x.normalize('NFKC').trim().toLowerCase();
  const owners=s.directInvites.map(team=>{
    const five=team.announcedStartingFive.map(normalize);
    const matches=direct.filter(t=>normalize(t.name)===normalize(team.team) ||
      t.roster.map(normalize).filter(p=>five.includes(p)).length>=3);
    assert.equal(matches.length,1,'Unverified direct-entry lineup: '+team.team);
    return matches[0].seed;
  });
  assert.equal(new Set(owners).size,8,'Duplicate Singapore direct entrant');
}
function belongsToEdition(stage,id) {
  return stage.parent===id || stage.id===id+'-'+stage.stage;
}
function earlierPrior(input) {
  const fields=historical.filter(s=>s.stage>1 && !belongsToEdition(s,input.edition) &&
    editions[s.parent].end<input.editionStartAt.slice(0,10));
  assert.ok(fields.length,'No completed earlier editions for Stage 3 candidate');
  const history=fields.map(s=>{
    const r=CS.replay(s.rounds);
    assert.ok(r.ok && r.matched===33);
    return {id:s.id,editionEnd:editions[s.parent].end,points:s.teams.map(t=>t.points),actual:r.actual};
  });
  return {sources:history.map(s=>({id:s.id,editionEnd:s.editionEnd,sha256:hash(s)})),
    prior:PickFinalCard.prior(input.teams.map(t=>t.points),history)};
}
function simulation(input,training) {
  const m=input.probabilities;
  const matrix={bo1:m.bo1,bo3:m.bo3,...(m.state && {state:m.state}),...(input.format==='all-bo3' && {allBo3:true})};
  const sim=CS.run(matrix,budget,seed,[],{seedConditionalCard:true});
  const cards={recommended:sim.card};
  if(input.stage===3) cards.stage3Candidate=PickFinalCard.card('historical',sim,input.teams.map(t=>t.points),training.prior);
  return cards;
}
function freeze(inputPath,archiveDir) {
  const raw=fs.readFileSync(inputPath), input=JSON.parse(raw);
  validate(input,Date.now());
  if(input.edition==='singapore-2026') {
    assert(input.stage!==1,'Singapore Stage 1 already has a pre-event archive');
    confirmSingaporeStage(input);
  }
  const knownStage=historical.find(s=>belongsToEdition(s,input.edition));
  const knownEdition=editions[knownStage?.parent || input.edition];
  assert.ok(!knownEdition?.end || knownEdition.end>new Date().toISOString().slice(0,10),
    'Cannot create a prospective forecast for a completed edition');
  const sources=input.sources.map(s=>evidence(s,path.dirname(inputPath),Date.now()));
  const training=input.stage===3 ? earlierPrior(input) : null;
  const cards=simulation(input,training);
  const dir=path.resolve(archiveDir);
  fs.mkdirSync(dir,{recursive:true});
  const target=path.join(dir,input.edition+'-stage'+input.stage+'.json');
  const temp=path.join(dir,'.'+randomUUID()+'.tmp');
  const frozenAt=new Date().toISOString(), archivedInput={...input,sources};
  validate(archivedInput,utc(frozenAt));
  const payload={version:1,frozenAt,sourceInputSha256:digest(raw),matrixSha256:hash(input.probabilities),
    engineSha256:digest(fs.readFileSync(require.resolve('../engine/engine.js'))),
    ruleSha256:digest(fs.readFileSync(require.resolve('../final_card/rules.js'))),input:archivedInput,training,seed,budget,cards};
  const record={sha256:hash(payload),payload};
  try {
    fs.writeFileSync(temp,JSON.stringify(record,null,2)+'\n',{flag:'wx'});
    assert.ok(Date.now()<utc(input.lockAt),'Deadline elapsed during preparation');
    fs.linkSync(temp,target); // Atomic exclusive publication on the same filesystem.
  } finally {fs.rmSync(temp,{force:true});}
  return {path:target,sha256:record.sha256,frozenAt};
}
function inspect(archivePath) {
  const record=JSON.parse(fs.readFileSync(archivePath,'utf8'));
  const p=record.payload;
  assert.equal(record.sha256,hash(p),'Archive checksum mismatch');
  assert.ok(utc(p.frozenAt)<=Date.now(),'Archive is timestamped in the future');
  assert.equal(p.version,1);assert.equal(p.seed,seed);assert.equal(p.budget,budget);
  validate(p.input,utc(p.frozenAt));
  if(p.input.edition==='singapore-2026') confirmSingaporeStage(p.input);
  for(const key of ['sourceInputSha256','engineSha256','ruleSha256']) assert.match(p[key],/^[a-f0-9]{64}$/,'Missing archive digest '+key);
  for(const s of p.input.sources) {
    exactKeys(s,['kind','url','publishedAt','sha256','bytes']);
    assert.ok(Number.isSafeInteger(s.bytes) && s.bytes>0,'Missing source byte count');
    assert.match(s.sha256,/^[a-f0-9]{64}$/,'Missing source document digest');
  }
  assert.equal(p.matrixSha256,hash(p.input.probabilities));
  const keys=p.input.stage===3?['recommended','stage3Candidate']:['recommended'];
  assert.deepEqual(Object.keys(p.cards).sort(),keys);
  for(const card of Object.values(p.cards)) {
    assert.equal(card.length,16);
    assert.deepEqual([0,1,2,3].map(k=>card.filter(v=>v===k).length),[2,6,2,6]);
  }
  return record;
}
function readResults(resultsPath,edition,stage,startAt,format,names) {
  const result=JSON.parse(fs.readFileSync(resultsPath,'utf8'));
  exactKeys(result,['edition','stage','endAt','source','teamOrder','rounds']);
  assert.equal(result.edition,edition);assert.equal(result.stage,stage);
  assert.deepEqual(result.teamOrder,names,'Official team order differs from archive');
  const verified=evidence(result.source,path.dirname(resultsPath),Date.now());
  assert.equal(verified.kind,'results');
  assert.ok(utc(result.endAt)>=utc(startAt) && utc(verified.publishedAt)>=utc(result.endAt),'Results must be confirmed after the stage');
  assert.ok(Array.isArray(result.rounds) && result.rounds.length===5,'Five official rounds required');
  const wins=Array(16).fill(0), losses=Array(16).fill(0),games=[];
  const rounds=result.rounds.map((row,r)=>{
    assert.ok(Array.isArray(row) && row.length===[8,8,8,6,3][r]);
    return row.map(game=>{
      exactKeys(game,['winner','loser','bestOf','played']);
      if(Object.hasOwn(game,'played')) assert.equal(typeof game.played,'boolean','played must be boolean');
      const w=names.indexOf(game.winner),l=names.indexOf(game.loser);
      assert.ok(w>=0 && l>=0 && w!==l,'Unknown match participants');
      assert.equal(game.bestOf,format==='all-bo3'?3:CS.bestOf(wins[w],losses[w]),'Official format differs from archive');
      wins[w]++;losses[l]++;
      games.push({w,l,key:'bo'+game.bestOf,played:game.played!==false}); return [w,l];
    });
  });
  const replay=CS.replay(rounds);
  assert.ok(replay.ok && replay.matched===33,replay.error || 'Invalid official pairings');
  return {verified,endAt:result.endAt,rounds,games,actual:replay.actual};
}
function score(archivePath,resultsPath) {
  const record=inspect(archivePath), p=record.payload,i=p.input,names=i.teams.map(t=>t.name);
  const {verified,games,actual}=readResults(resultsPath,i.edition,i.stage,i.startAt,i.format,names);
  const series={bo1:[],bo3:[]};
  for(const {w,l,key,played} of games) if(played) series[key].push(i.probabilities[key][w][l]);
  const cards=Object.fromEntries(Object.entries(p.cards).map(([k,card])=>{
    const hits=CS.actualScore(card,actual);
    const bucketHits=[0,1,2].map(c=>names.filter((_,idx)=>card[idx]===c && actual[idx]===c));
    return [k,{hits,passed:hits>=5,bucketHits}];
  }));
  const formats=Object.fromEntries(Object.entries(series).map(([k,ps])=>[k,{n:ps.length,
    brier:ps.length?ps.reduce((s,p)=>s+(1-p)**2,0)/ps.length:null,
    logLoss:ps.length?ps.reduce((s,p)=>s-Math.log(p),0)/ps.length:null}]));
  return {edition:i.edition,stage:i.stage,archiveSha256:record.sha256,source:verified,matched:33,cards,formats};
}
module.exports={freeze,score,inspect,readResults};
if(require.main===module) {
  try{
    const [action,...args]=process.argv.slice(2);
    assert.ok(['freeze','score'].includes(action) && args.length===2,'freeze <confirmed-input.json> <archive-dir> | score <archive.json> <official-results.json>');
    console.log(JSON.stringify(action==='freeze'?freeze(...args):score(...args),null,2));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
