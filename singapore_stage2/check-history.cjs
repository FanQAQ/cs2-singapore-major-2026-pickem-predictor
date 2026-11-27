'use strict';
// Reuse the archived per-game rosters and original event-specific probabilities.
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const {fieldFor,evidence,shifts,adjust}=require('../stage_transfer/evaluate.cjs');
const events=PickLab.allEvents.filter(e=>e.hasResults);
const seeds=[33719,35783,39079], paths=24000;
const previous=require('../final_card/report.json');
const rows=[];
for (const item of events.filter(e=>e.stage===2)) {
  const source=fieldFor(events.find(e=>e.id===item.parent));
  const target=fieldFor(item);
  assert(source.end < target.start && source.stage===1 && source.parent===target.parent);
  const observations=evidence(target.teams,[source]);
  assert.equal(observations.filter(e=>e.n>0).length,8);
  const revised=adjust(target.matrix,shifts([observations],16));
  function measure(matrix) {
    const hits=seeds.map(seed=>CS.actualScore(CS.run(matrix,paths,seed,[],{seedConditionalCard:true}).card,target.actual));
    const errors={};
    for (const bo of [1,3]) {
      const played=target.records.filter(g=>g.bo===bo);
      const p=played.map(g=>g.y ? matrix['bo'+bo][g.a][g.b] : matrix['bo'+bo][g.b][g.a]);
      errors['bo'+bo]={n:p.length,brier:p.reduce((s,x)=>s+(1-x)**2,0)/p.length,
        logLoss:p.reduce((s,x)=>s-Math.log(x),0)/p.length};
    }
    return {hits,errors};
  }
  const base=measure(target.matrix), withStage1=measure(revised);
  const published=previous.stages.find(s=>s.id===item.id);
  assert.equal(base.hits[0],published.results.current.hits[0]);
  rows.push({edition:item.parent,sourceEnd:source.end,stage2Start:target.start,base,withStage1});
}
const aggregate={};
for (const variant of ['base','withStage1']) {
  aggregate[variant]=seeds.map((seed,i)=>({seed,
    pass:rows.filter(r=>r[variant].hits[i]>=5).length,hits:rows.reduce((s,r)=>s+r[variant].hits[i],0)}));
}
const out={seeds,paths,editions:rows,aggregate};
const file=path.join(__dirname,'historical.json');
if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),out);
else fs.writeFileSync(file,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({scores:rows.map(r=>[r.edition,r.base.hits[0],r.withStage1.hits[0]]),aggregate}));
