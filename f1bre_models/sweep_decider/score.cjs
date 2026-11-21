'use strict';
const assert=require('node:assert/strict');
const {fields}=require('./lock.cjs');
const {read,freeze,digest}=require('../format_split/astana/lock.cjs');
const {replayEsl}=require('../../round_form/evaluate.cjs');
const {cardScore,errors}=require('../score.cjs');
function observed(id,f){
  if(id==='katowice'){
    const truth=require('../format_split/epl24/actual.json');
    const r=replayEsl({...f,entrants:f.teams.map(t=>t.name)},truth);
    assert.equal(r.verifiedCount,33);
    return {rounds:truth.rounds,actual:r.actual};
  }
  let rounds;
  if(id==='astana')rounds=read('actual.json').rounds;
  else if(id==='bucharest')rounds=require('../format_split/bucharest26/actual.json').rounds.map(rr=>rr.map(g=>[g.w,g.l]));
  else rounds=PickLab.allEvents.find(e=>e.id===id).rounds;
  const r=CS.replay(rounds.map(rr=>rr.map(g=>g.slice(0,2))));
  assert(r.ok&&r.matched===33);
  return {rounds,actual:r.actual};
}
function evaluate(locked){
  const result={};
  for(const [id,{f,base,ml}] of Object.entries(fields())){
    const {teams,probabilitiesSHA256,rows}=locked[id];
    assert.equal(digest({base,ml}),probabilitiesSHA256);
    assert.deepEqual(teams,f.teams.map(t=>t.name));
    const {rounds,actual}=observed(id,f),wins=new Uint8Array(16);
    for(const rr of rounds.slice(0,2))for(const [w] of rr)wins[w]++;
    const games=rounds[2].filter(([a,b])=>wins[a]===2 && wins[b]===2)
      .map(([w,l])=>({winner:teams[w],loser:teams[l],control:base.bo3[w][l],candidate:ml[w][l]}));
    assert.equal(games.length,2);
    const scored=rows.map(r=>({seed:r.seed,control:cardScore(r.control.card,actual),candidate:cardScore(r.candidate.card,actual)}));
    result[id]={games,scored};
  }
  return result;
}
function totals(events){
  const groups=Object.values(events),games=groups.flatMap(g=>g.games);
  const output={};
  for(const arm of ['control','candidate']){
    const rows=groups[0].scored.map(({seed},i)=>{
      assert(groups.every(g=>g.scored[i].seed===seed));
      const scores=groups.map(g=>g.scored[i][arm]);
      return {seed,passed:scores.filter(s=>s.hits>=5).length,hits:scores.reduce((a,s)=>a+s.hits,0),perfect:scores.reduce((a,s)=>a+s.slots[0],0)};
    });
    output[arm]={deciders:errors(games.map(g=>g[arm])),rows};
  }
  return output;
}
if(require.main===module){
  const fieldsScored=evaluate(read('cards.json',__dirname));
  const group=major=>Object.fromEntries(Object.entries(fieldsScored).filter(([id])=>id.endsWith('-3')===major));
  const majors=totals(group(true)),external=totals(group(false));
  const advance=majors.candidate.rows.filter((r,i)=>r.passed>majors.control.rows[i].passed && r.hits>=majors.control.rows[i].hits).length>=2;
  freeze('report.json',{fields:fieldsScored,majors,external,advance},__dirname);
  console.log(JSON.stringify({majors,external,advance}));
}
module.exports={observed};
