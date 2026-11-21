'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {getField,matrices}=require('../../evaluate.cjs');
const {samples}=require('../../../ml_allocation/draw.cjs');
const {cardScore}=require('../../score.cjs');
const {seeds}=require('../../../strategy_v4_eval/settings.cjs');
const {pass}=require('../../../final_card/path_weights/weighted.cjs');
const major=require('../convergence.json').results;
const actuals=require('../cards.json').fields;
const astana=require('../astana/lock.cjs');
const rmr=require('../rmr_a/odds.json');
const ids=[...new Set(major.map(s=>s.id)),rmr.id,'astana-2026'];
function square(values,round){
  assert.equal(values.length,120);
  const m=Array.from({length:16},()=>Array(16).fill(.5));let k=0;
  for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){
    const p=values[k++];m[i][j]=p;m[j][i]=round?Number((1-p).toFixed(10)):1-p;
  }
  return m;
}
function input(id){
  if(id===rmr.id)return {odds:{bo1:square(rmr.eloBO1,false),bo3:square(rmr.mlBO3,true),allBo3:false},
    actual:require('../rmr_a/scores.json').actual,large:require('../rmr_a/budgets.json').results.map(r=>({seed:r.seed,...r.large}))};
  if(id==='astana-2026'){
    const replay=CS.replay(astana.read('actual.json').rounds.map(r=>r.map(m=>m.slice(0,2))));
    assert(replay.ok && replay.matched===33);
    return {odds:astana.inputs().candidate,actual:replay.actual,large:astana.read('scores.json').rows.map(r=>({seed:r.seed,...r.pooled}))};
  }
  const {elo,ml}=matrices(getField(id),['elo','ml']);
  return {odds:{...ml,bo1:elo.bo1},actual:actuals.find(f=>f.id===id).actual,large:major.filter(f=>f.id===id)};
}
const keys=[0,0x6a09e667,0xbb67ae85,0x3c6ef372];
const streams=seeds.flatMap(seed=>keys.map(k=>(seed^k)>>>0));
assert.equal(new Set(streams).size,streams.length);
function select(id,odds,seed){
  const [a,b,c,d]=keys.map(k=>(seed^k)>>>0);
  const proposals=[a,b,c].map(s=>samples({id},odds,2000,s,'major'));
  const aggregate={count:6000,outcomes:new Uint16Array(18000),frequencies:proposals[0].frequencies.map((row,i)=>
    row.map((_,k)=>proposals.reduce((acc,p)=>acc+p.frequencies[i][k],0)))};
  proposals.forEach((p,i)=>aggregate.outcomes.set(p.outcomes,6000*i));
  const options=[aggregate,...proposals].map(sample=>CS.cardsFromSamples(sample,true).card);
  const validation=CS.sampleTerminalMasks(odds,4000,d);
  const passed=options.map(card=>Math.round(pass(card,validation)*4000));
  const winner=passed.indexOf(Math.max(...passed));
  return {options,passed,winner};
}
function evaluate(rows){
  return ids.map(id=>{
    const {odds,actual,large}=input(id);
    return {id,rows:rows.map(seed=>{
      const {options,passed,winner}=select(id,odds,seed);
      const benchmark=large.find(r=>r.seed===seed);
      assert.equal(benchmark.hits,cardScore(benchmark.card,actual).hits);
      const report=card=>({...cardScore(card,actual),card,sharedPicks:card.filter((v,i)=>v<3 && v===benchmark.card[i]).length});
      return {seed,validationPassCounts:passed,winner,first:report(options[1]),pooled:report(options[0]),selected:report(options[winner]),large:report(benchmark.card)};
    })};
  });
}
const pilot=evaluate(seeds.slice(0,3));
const passes=seeds.slice(0,3).map((_,i)=>pilot.slice(0,3).filter(s=>s.rows[i].selected.hits>=5).length);
const gate=passes[0]>=2 && passes.filter(n=>n>=2).length>=2 && pilot.slice(3).every(s=>s.rows[0].selected.hits>=5);
const result={pilot,passes,gate};
if(gate)result.confirmation=evaluate(seeds);
const bytes=JSON.stringify(result)+'\n',file=path.join(__dirname,'results.json');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),bytes);else fs.writeFileSync(file,bytes);
console.log(JSON.stringify({pilot:pilot.map(s=>[s.id,...s.rows.map(r=>[r.first.hits,r.pooled.hits,r.selected.hits,r.large.hits])]),passes,gate}));
