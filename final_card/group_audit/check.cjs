'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const controlStudy=require('../report.json');
const stability=require('../stability.json');
const transfer=require('../../ml_allocation/report.json');
const {cardScore}=require('../../f1bre_models/score.cjs');

const major=controlStudy.stages.filter(s=>s.stage===3);
assert.equal(major.length,3);
assert.deepEqual(controlStudy.seeds,transfer.seeds);
assert.equal(new Set(controlStudy.seeds.concat(stability.seeds)).size,60);
assert.equal(transfer.searchN,12000);
assert.equal(transfer.auditN,12000);

function paired(before,after){
  assert.equal(before.length,after.length);
  const delta=after.map((n,i)=>n-before[i]);
  return {more:delta.filter(n=>n>0).length,same:delta.filter(n=>n===0).length,fewer:delta.filter(n=>n<0).length};
}
function counts(events,policy){
  return controlStudy.seeds.map((_,i)=>events.filter(s=>s[policy][i]>=5).length);
}
function readRuns(stage,method){
  const runs=stage.methods[method].runs;
  assert.deepEqual(runs.map(r=>r.seed),controlStudy.seeds);
  assert.equal(stage.direct.length,8);
  assert.equal(new Set(stage.direct).size,8);
  assert.equal(stage.teams.length,16);
  const scores={id:stage.id,scheme:stage.scheme};
  for(const key of ['standard','grouped']){
    scores[key]=runs.map(r=>{
      assert.equal(r.paths.length,2);
      assert.notEqual(r.paths[0],r.paths[1]);
      const scored=cardScore(r[key],stage.actual);
      assert.deepEqual(scored,r.scores[key]);return scored.hits;
    });
  }
  return scores;
}
function summarize(events){
  return {events:events.map(s=>({id:s.id,scheme:s.scheme,
    primary:[s.standard[0],s.grouped[0]],passesAcrossSeeds:[s.standard,s.grouped].map(h=>h.filter(n=>n>=5).length)})),
    primaryHits:['standard','grouped'].map(k=>events.reduce((acc,s)=>acc+s[k][0],0)),
    primaryPasses:['standard','grouped'].map(k=>counts(events,k)[0]),
    pairedPassCounts:paired(counts(events,'standard'),counts(events,'grouped'))};
}
const fields=transfer.stages;
const main=fields.filter(s=>s.group==='stage3').map(s=>readRuns(s,'baseline'));
for(const stage of major){
  const once=main.find(s=>s.id===stage.id);
  assert.deepEqual(once.standard,stage.results.current.hits);
  assert.deepEqual(once.grouped,stage.results.historical.hits);
}
const external=fields.filter(s=>s.group==='esl'||s.group==='elisa');
const primary=external.filter(s=>s.scheme!=='ranked');
assert.equal(primary.length,5);
assert.equal(new Set(primary.map(s=>s.id)).size,5);
const second=stability.stages.map(s=>({standard:s.values.base,grouped:s.values.full}));
const result={
  major:summarize(main),
  forwardSelection:major.map(s=>({id:s.id,selected:s.selected,hits:s.results.forward.hits[0]})),
  additionalSeeds:paired(counts(second,'standard'),counts(second,'grouped')),
  vrsExternal:summarize(primary.map(s=>readRuns(s,'baseline'))),
  mlExternal:summarize(primary.map(s=>readRuns(s,'ml'))),
  alternativeElisaPairing:summarize(external.filter(s=>s.scheme==='ranked').map(s=>readRuns(s,'baseline'))),
  removedEditions:stability.summary
};
const encoded=JSON.stringify(result,null,2)+'\n', file=path.join(__dirname,'summary.json');
if(process.argv.includes('--write'))fs.writeFileSync(file,encoded);
else assert.equal(fs.readFileSync(file,'utf8'),encoded);
console.log(JSON.stringify([result.major,result.vrsExternal,result.mlExternal].map(s=>[s.primaryPasses,s.primaryHits,s.pairedPassCounts])));
