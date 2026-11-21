'use strict';
const assert=require('node:assert/strict');
const {getField,matrices,truth,cardScore}=require('../evaluate.cjs');
const {screen}=require('../screen.cjs');
const {freeze}=require('../format_split/astana/lock.cjs');
const inputs=require('./inputs.json');
function tail(card,points){
  const updated=card.map(c=>c===2?3:c);
  const bench=updated.map((c,i)=>c===3?i:-1).filter(i=>i>=0);
  assert.equal(bench.length,8);
  bench.sort((a,b)=>points[a]-points[b] || b-a);
  for(const idx of bench.slice(0,2))updated[idx]=2;
  return updated;
}
const results={};
for(const [id,input] of Object.entries(inputs)){
  const field=getField(id),names=field.teams.map(t=>t.name);
  const baseline=matrices(field,['baseline']).baseline;
  const {actual}=truth(id,names);
  const pilots=screen(field,{baseline}).methods.baseline.runs;
  const rows=pilots.map(({card,seed})=>{
    const arms={official:card,raw:tail(card,input.raw),adjusted:tail(card,input.adjusted)};
    return {seed,arms:Object.fromEntries(Object.entries(arms).map(([k,c])=>[k,{card:c,...cardScore(c,actual)}]))};
  });
  assert.deepEqual(field.teams.map(t=>t.points),input.raw);
  results[id]={teams:names,coverage:Object.values(input.summary).filter(t=>t.played).length,games:input.games.length,rows};
}
const any=Object.values(results)[0],arms=['official','raw','adjusted'];
const summary=any.rows.map(({seed},i)=>{
  const result={seed};
  for(const k of arms){
    const rows=Object.values(results).map(f=>f.rows[i].arms[k]);
    result[k]={passes:rows.filter(r=>r.hits>=5).length,hits:rows.reduce((s,r)=>s+r.hits,0),zero:rows.reduce((s,r)=>s+r.slots[2],0)};
  }
  return result;
});
const advance=summary.filter(r=>['official','raw'].every(k=>r.adjusted.passes>r[k].passes && r.adjusted.hits>=r[k].hits)).length>=2;
freeze('report.json',{results,summary,advance},__dirname);
console.log(JSON.stringify({summary,advance,coverage:Object.values(results).map(f=>[f.games,f.coverage])}));
