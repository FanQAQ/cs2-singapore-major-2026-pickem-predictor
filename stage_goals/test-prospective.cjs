'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {freeze,score}=require('./prospective.cjs');
const {publicRecords}=require('./public-records.cjs');
const field=require('../multi_stage/inputs.json').find(s=>s.id==='cologne-2026-3');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'pickem-prospective-test-'));
const at=Date.now(), date=hours=>new Date(at+hours*3600000).toISOString();
const write=(name,data)=>{const dest=path.join(home,name);fs.writeFileSync(dest,JSON.stringify(data));return dest;};
const clone=v=>JSON.parse(JSON.stringify(v));
const axes=field.teams.map(t=>t.name);
const matrix=field.teams.map((a,i)=>field.teams.map((b,j)=>i===j?.5:1/(1+10**((b.points-a.points)/400))));
const source=(kind,publishedAt)=>({kind,url:'https://example.org/fixture',publishedAt,file:'evidence.txt'});
const input={edition:'local-test-fixture',stage:3,editionStartAt:date(-400),startAt:date(3),lockAt:date(2),
  qualificationCompleteAt:date(-10),format:'all-bo3',
  teams:field.teams.map(t=>({seed:t.seed,name:t.name,points:t.points,roster:t.roster,ratingRoster:t.vrsRoster})),
  probabilities:{model:'recommended',asOf:date(-1),teamOrder:axes,bo1:matrix,bo3:matrix,allBo3:true},
  sources:['field','rosters','ratings','rules'].map(k=>source(k,date(-5)))};
const mutate=(fn,reason)=>{const x=clone(input);fn(x);assert.throws(()=>freeze(write('bad.json',x),home),reason);};
try{
  fs.writeFileSync(path.join(home,'evidence.txt'),'Temporary QA evidence, never an actual submitted forecast.');
  mutate(x=>{x.lockAt=date(-1);},/deadline/i);
  mutate(x=>{x.edition='singapore-2026';},/Singapore edition start|preceding final round|qualification|deadline/i);
  for(const finishedId of ['cologne','cologne-2026']) {
    mutate(x=>{x.edition=finishedId;},/completed edition/);
  }
  mutate(x=>{x.probabilities.teamOrder.reverse();},/order/);
  mutate(x=>{x.teams[0].roster=x.teams[1].roster; x.teams[0].ratingRoster=x.teams[1].roster;},/two teams/);
  mutate(x=>{x.probabilities.bo3[0][1]=2;},/probability/);
  mutate(x=>{x.probabilities.allBo3=false;},/format/);
  mutate(x=>{x.teams[0].ratingRoster=x.teams[1].ratingRoster;},/retain/);
  mutate(x=>{x.probabilities.bo3[0][1]=.51;},/sum/);
  mutate(x=>{x.sources=x.sources.filter(s=>s.kind!=='field');},/Missing evidence/);
  mutate(x=>{x.sources[0].publishedAt=date(3);},/postdates/);
  mutate(x=>{x.qualificationCompleteAt=date(1);},/Previous stage/);
  mutate(x=>{x.rounds=field.rounds;},/Unexpected/);
  const inputPath=write('input.json',input), archived=freeze(inputPath,home);
  const original=fs.readFileSync(archived.path);
  assert.throws(()=>freeze(inputPath,home),/EEXIST/);
  assert.deepEqual(fs.readFileSync(archived.path),original);
  const parsed=JSON.parse(original);
  assert.deepEqual(publicRecords('singapore-2026',home).map(r=>r.stage),[1]);
  const pending=publicRecords(input.edition,home);
  assert.deepEqual(pending.map(r=>r.stage),[3]);
  assert.equal(pending[0].source,null);
  assert(pending[0].cards.every(c=>c.hits===null));
  for(const c of pending[0].cards) {
    assert.deepEqual(c.groups,[0,1,2].map(k=>axes.filter((_,i)=>parsed.payload.cards[c.id][i]===k)));
  }
  assert.deepEqual(Object.keys(parsed.payload.cards),['recommended','standardComparison']);
  const reference=CS.run({...input.probabilities,allBo3:true},parsed.payload.budget,parsed.payload.seed,[],{seedConditionalCard:true});
  assert.deepEqual(parsed.payload.cards.standardComparison,reference.card);
  assert.deepEqual(parsed.payload.cards.recommended,PickFinalCard.card('historical',reference,input.teams.map(t=>t.points),parsed.payload.training.prior));
  assert.ok(parsed.payload.training.sources.every(s=>s.editionEnd<input.editionStartAt.slice(0,10)));
  for(const stage of [1,2]){
    const b={...input,stage};
    if(stage===1){b.editionStartAt=b.startAt;delete b.qualificationCompleteAt;}
    const f=freeze(write('stage'+stage+'.json',b),home);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f.path)).payload.cards),['recommended']);
  }
  const result={edition:input.edition,stage:input.stage,endAt:date(50),source:source('results',date(51)),teamOrder:axes,
    rounds:field.rounds.map((r,idx)=>r.map(([w,l],j)=>({winner:axes[w],loser:axes[l],bestOf:field.formats[idx][j]})))};
  const resultPath=write('results.json',result);
  assert.throws(()=>score(archived.path,resultPath),/future/);
  const originalNow=Date.now;
  const knownEditions=require('../major_form/all_stages.json').editions;
  try{
    Date.now=()=>at+52*3600000;
    // Newly imported historical results must never invalidate an earlier seal.
    knownEditions[input.edition]={end:result.endAt.slice(0,10)};
    const first=score(archived.path,resultPath);
    fs.mkdirSync(path.join(home,'results'));
    fs.copyFileSync(path.join(home,'evidence.txt'),path.join(home,'results/evidence.txt'));
    fs.copyFileSync(resultPath,path.join(home,'results',input.edition+'-stage3.json'));
    const listed=publicRecords(input.edition,home);
    assert.deepEqual(listed.map(r=>r.stage),[1,2,3]);
    assert.equal(listed[2].source.sha256,first.source.sha256);
    for(const c of listed[2].cards) assert.equal(c.hits,first.cards[c.id].hits);
    assert.equal(first.matched,33);assert.equal(first.formats.bo3.n,33);assert.equal(first.formats.bo1.n,0);
    const forfeit=clone(result);forfeit.rounds[0][0].played=false;
    const amended=score(archived.path,write('forfeit.json',forfeit));
    assert.equal(amended.matched,33);assert.equal(amended.formats.bo3.n,32);
    assert.deepEqual(amended.cards,first.cards);
    forfeit.rounds[0][0].played='false';
    assert.throws(()=>score(archived.path,write('invalid-played.json',forfeit)),/boolean/);
    assert.deepEqual(score(archived.path,resultPath),first);
    assert.deepEqual(fs.readFileSync(archived.path),original);
    const digest=value=>require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const legacy=clone(parsed);
    legacy.payload.version=1;
    legacy.payload.cards={recommended:reference.card,stage3Candidate:parsed.payload.cards.recommended};
    legacy.sha256=digest(legacy.payload);
    assert.deepEqual(score(write('legacy-stage3.json',legacy),resultPath).cards.recommended,first.cards.standardComparison);
    const missing=clone(parsed);
    delete missing.payload.input.sources[0].bytes;
    missing.sha256=digest(missing.payload);
    assert.throws(()=>score(write('missing-evidence.json',missing),resultPath),/byte count/);
    const missingCode=clone(parsed);
    delete missingCode.payload.ruleSha256;
    missingCode.sha256=digest(missingCode.payload);
    assert.throws(()=>score(write('missing-rule.json',missingCode),resultPath),/string|digest/);
    const swapped=clone(result);swapped.teamOrder.reverse();
    assert.throws(()=>score(archived.path,write('swap.json',swapped)),/order/);
    const badFormat=clone(result);badFormat.rounds[0][0].bestOf=1;
    assert.throws(()=>score(archived.path,write('format.json',badFormat)),/format/);
    const badPairs=clone(result);badPairs.rounds[0][0].winner=badPairs.rounds[0][1].winner;
    assert.throws(()=>score(archived.path,write('pairs.json',badPairs)));
    parsed.payload.cards.recommended.reverse();
    assert.throws(()=>score(write('tampered.json',parsed),resultPath),/checksum/);
  }finally{Date.now=originalNow;delete knownEditions[input.edition];}
  // Map a known valid bracket onto the seed indices purely to exercise Singapore's publication gates.
  const legacy=require('../external_forecasts/score.cjs').load(), names=legacy.teams;
  const wins=Array(16).fill(0), losses=Array(16).fill(0);
  const sample={edition:'singapore-2026',stage:1,teamOrder:names,endAt:'2026-11-27T14:00:00Z',
    source:source('results','2026-11-27T16:00:00Z'),rounds:field.rounds.map(round=>round.map(([w,l])=>{
      const bestOf=CS.bestOf(wins[w],losses[w]);wins[w]++;losses[l]++;
      return {winner:names[w],loser:names[l],bestOf};
    }))};
  const resultName='results/singapore-2026-stage1.json';
  try{
    Date.now=()=>Date.parse('2026-11-28T00:00:00Z');
    write(resultName,sample);
    assert.throws(()=>publicRecords('singapore-2026',home),/official results URL/);
    sample.source.url='https://www.pglesports.com/fixture-for-local-test';
    write(resultName,{...sample,endAt:'2026-11-24T04:01:00Z'});
    assert.throws(()=>publicRecords('singapore-2026',home),/final round date/);
    write(resultName,sample);
    const records=publicRecords('singapore-2026',home);
    assert(records[0].cards.every(c=>Number.isInteger(c.hits)));
    const windows=require('./rolling.cjs').build(home).windows;
    const latest=windows[0].rows[0], recommended=records[0].cards.find(card=>card.id==='recommended');
    assert.equal(windows[0].rows.length,5);
    assert.equal(latest.hits,recommended.hits);
    assert.equal(latest.sha256,recommended.sha256);
    assert.equal(latest.sourceUrl,sample.source.url);
    assert.equal(latest.provenance,'sealed');
    assert.equal(windows[0].pending.length,0);
    const {loadRecord,scoreVerified}=require('../tail_calibration/singapore.cjs');
    const sg=loadRecord();
    const read=()=>require('./prospective.cjs').readResults(path.join(home,resultName),sample.edition,1,sg.startAt,'mixed',names);
    const experiment=scoreVerified(sg,read());
    assert.equal(experiment.cards.recommended.hits,latest.hits);
    assert.equal(experiment.cards.recommendedCal.hits,latest.hits);
    assert.equal(experiment.cards.vrs.hits,experiment.cards.vrsCal.hits);
    assert.equal(experiment.cards.vrs.formats.bo3.n,13);
    sample.rounds[0][0].played=false;
    write(resultName,sample);
    const revised=scoreVerified(sg,read());
    assert.equal(revised.cards.recommended.hits,latest.hits);
    for(const card of Object.values(revised.cards)) {
      assert.equal(card.formats.bo1.n,19);assert.equal(card.formats.bo1.unplayed,1);
      assert(Number.isFinite(card.formats.bo3.logLoss) && Number.isFinite(card.formats.bo1.brier));
    }
  } finally {Date.now=originalNow;}
  console.log('Prospective stages 1/2/3: freeze deadlines, names, source dates, matrices, earlier-only profiles, exclusive archives and immutable repeat scoring passed.');
}finally{
  assert.equal(path.dirname(home),path.resolve(os.tmpdir()));
  assert.match(path.basename(home),/^pickem-prospective-test-[a-zA-Z0-9]+$/);
  fs.rmSync(home,{recursive:true,force:true});
}
