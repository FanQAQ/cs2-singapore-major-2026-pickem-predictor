'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path');
const {getField,matrices,truth,cardScore,errors}=require('../evaluate.cjs');
const {samples}=require('../../ml_allocation/draw.cjs');
const {seeds}=require('../../strategy_v4_eval/settings.cjs');
const {audit}=require('../format_split/pooled.cjs');
const astana=require('../format_split/astana/lock.cjs');
const ids=['austin-2025-3','budapest-2025-3','cologne-2026-3','astana-2026'];
const bits=new Uint8Array(65536);
for(let i=1;i<bits.length;i++)bits[i]=bits[i>>>1]+(i&1);

function sources(id){
  if(id==='astana-2026'){
    const {f,recommended,candidate}=astana.inputs();
    const rounds=astana.read('actual.json').rounds.map(row=>row.map(g=>g.slice(0,2)));
    const replay=CS.replay(rounds);
    assert(replay.ok && replay.matched===33);
    return {field:f,control:recommended,ml:candidate,actual:replay.actual,
      games:rounds.flat().map(([w,l])=>({w,l,bo:3}))};
  }
  const field=getField(id),{baseline,ml}=matrices(field,['baseline','ml']);
  const verified=truth(id,field.teams.map(t=>t.name));
  return {field,control:baseline,ml,actual:verified.actual,games:verified.matches};
}
function join(left,right){
  const outcomes=new Uint16Array(left.outcomes.length+right.outcomes.length);
  outcomes.set(left.outcomes);outcomes.set(right.outcomes,left.outcomes.length);
  const frequencies=left.frequencies.map((v,i)=>v.map((n,k)=>n+right.frequencies[i][k]));
  return {count:left.count+right.count,outcomes,frequencies};
}
function passes(card,paths){
  const mask=[0,0,0];
  card.forEach((c,i)=>{if(c<3)mask[c]|=1<<i;});
  let passed=0;
  for(let i=0;i<paths.length;i+=3)
    if(bits[paths[i]&mask[0]]+bits[paths[i+1]&mask[1]]+bits[paths[i+2]&mask[2]]>=5)passed++;
  return passed;
}
const second=s=>(s^0x76d3ba5b)>>>0;
const streams=seeds.flatMap(s=>[s,second(s),audit(s),audit(second(s))]);
assert.equal(new Set(streams).size,streams.length);

function run(id,selectedSeeds,n,testN){
  const {field,control,ml,actual,games}=sources(id);
  const midpoint={allBo3:!!control.allBo3};
  assert.equal(midpoint.allBo3,!!ml.allBo3);
  assert(!control.state && !ml.state,'Stateful probability mixtures need explicit latent state');
  for(const k of ['bo1','bo3'])
    midpoint[k]=control[k].map((row,i)=>row.map((v,j)=>(v+ml[k][i][j])/2));
  const models={control,ml,midpoint};
  const byMatch=Object.fromEntries(Object.entries(models).map(([k,m])=>[k,
    Object.fromEntries([1,3].map(bo=>[bo,errors(games.filter(g=>g.bo===bo).map(g=>m['bo'+bo][g.w][g.l]))]))]));
  const rows=selectedSeeds.map(seed=>{
    const draws={},audits={};
    for(const [k,m] of Object.entries(models)){
      draws[k]=[seed,second(seed)].map(s=>samples(field,m,n/2,s,'major'));
      audits[k]=CS.sampleTerminalMasks(m,testN,audit(seed));
    }
    const training=Object.fromEntries(Object.entries(draws).map(([k,x])=>[k,join(...x)]));
    training.mixture=join(draws.control[0],draws.ml[1]);
    const methods=Object.fromEntries(Object.entries(training).map(([k,train])=>{
      const card=CS.cardsFromSamples(train,true).card;
      return [k,{card,...cardScore(card,actual),auditPass:Object.fromEntries(Object.entries(audits).map(([name,s])=>[name,passes(card,s)]))}];
    }));
    return {seed,methods};
  });
  return {id,byMatch,rows};
}
const pilot=ids.map(id=>run(id,seeds.slice(0,3),2000,4000));
const passGate=pilot.slice(0,3).filter(e=>e.rows[0].methods.mixture.hits>=5).length>=2 &&
  pilot.at(-1).rows[0].methods.mixture.hits>=5;
const result={search:2000,auditPerModel:4000,pilot,passGate};
if(passGate)result.confirmation=ids.map(id=>run(id,seeds,12000,12000));
const file=path.join(__dirname,'results.json'),data=JSON.stringify(result)+'\n';
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),data);
else fs.writeFileSync(file,data);
console.log('pilot',pilot.map(e=>[e.id,...e.rows.map(r=>Object.fromEntries(Object.entries(r.methods).map(([k,v])=>[k,v.hits])))]),passGate);
