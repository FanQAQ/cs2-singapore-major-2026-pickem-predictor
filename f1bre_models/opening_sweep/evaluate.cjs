'use strict';
const assert=require('node:assert/strict');
const {getField,matrices,truth,cardScore}=require('../evaluate.cjs');
const {screen}=require('../screen.cjs');
const {freeze}=require('../format_split/astana/lock.cjs');
function unbeaten(matrix){
  assert(!matrix.state,'Enumeration assumes independent games with static series probabilities');
  const p=matrix.allBo3?matrix.bo3:matrix.bo1;
  const opening=CS.nextPairs([]),scores=Array(16).fill(0);
  let mass=0;
  for(let bits=0;bits<256;bits++){
    let weight=1;
    const wins=opening.map(([a,b],i)=>{
      const other=Boolean(bits & (1<<i));
      weight*=other?p[b][a]:p[a][b];
      return other?b:a;
    });
    for(const [a,b] of CS.round2(wins)){
      if(!wins.includes(a))continue;
      assert(wins.includes(b));
      scores[a]+=weight*p[a][b];
      scores[b]+=weight*p[b][a];
    }
    mass+=weight;
  }
  assert(Math.abs(mass-1)<1e-8 && Math.abs(scores.reduce((a,b)=>a+b,0)-4)<1e-8);
  return scores;
}
function assign(card,probs){
  const updated=card.map(c=>c===0?1:c);
  const group=updated.map((c,i)=>c===1?i:-1).filter(i=>i>=0);
  assert.equal(group.length,8);
  group.sort((a,b)=>probs[b]-probs[a] || a-b);
  for(const i of group.slice(0,2))updated[i]=0;
  return updated;
}
const fields={};
for(const id of ['austin-2025-3','budapest-2025-3','cologne-2026-3']){
  const f=getField(id),names=f.teams.map(t=>t.name),{baseline}=matrices(f,['baseline']);
  const probabilities=unbeaten(baseline),observed=truth(id,names);
  const runs=screen(f,{baseline}).methods.baseline.runs.map(({seed,card})=>{
    const proposed=assign(card,probabilities);
    return {seed,baseline:{card,...cardScore(card,observed.actual)},opening:{card:proposed,...cardScore(proposed,observed.actual)}};
  });
  fields[id]={teams:names,probabilities,runs};
}
const totals=Object.values(fields)[0].runs.map(({seed},i)=>{
  const result={seed};
  for(const arm of ['baseline','opening']){
    const rows=Object.values(fields).map(f=>f.runs[i][arm]);
    result[arm]={passed:rows.filter(r=>r.hits>=5).length,hits:rows.reduce((s,r)=>s+r.hits,0),sweeps:rows.reduce((s,r)=>s+r.slots[0],0)};
  }
  return result;
});
const advance=totals.filter(r=>r.opening.passed>r.baseline.passed && r.opening.hits>=r.baseline.hits).length>=2;
freeze('report.json',{fields,totals,advance},__dirname);
console.log(JSON.stringify({totals,advance}));
