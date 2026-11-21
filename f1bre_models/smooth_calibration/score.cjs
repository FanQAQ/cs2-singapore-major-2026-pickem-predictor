'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {getField,matrices,truth,errors}=require('../evaluate.cjs');
const {screen}=require('../screen.cjs');
const odds=require('./odds.json');
const names=['control','smooth'], pooled={control:[],smooth:[]};
const fields={};
function tails(ps){
  return {games:ps.filter(p=>Math.min(p,1-p)<.05).length,upsets:ps.filter(p=>p<.05).length};
}
for(const [id,candidate] of Object.entries(odds.fields)){
  const f=getField(id), {elo,ml}=matrices(f,['elo','ml']);
  assert.deepEqual(f.teams.map(t=>t.name),candidate.teams);
  const control={...ml,bo1:elo.bo1};
  const arms={control,smooth:{...control,bo3:candidate.bo3}};
  const observed=truth(id,candidate.teams);
  const small=screen(f,arms,observed.actual,observed.matches);
  for(const name of names){
    const probs=observed.matches.filter(m=>m.bo===3).map(({w,l})=>arms[name].bo3[w][l]);
    pooled[name].push(...probs);
    small.methods[name].tails=tails(probs);
  }
  fields[id]=small;
}
const summary={};
for(const name of names){
  assert.equal(pooled[name].length,59);
  const results=Object.values(fields).map(f=>f.methods[name].runs);
  const cards=results[0].map(({seed},i)=>{
    assert(results.every(r=>r[i].seed===seed));
    const scores=results.map(r=>r[i].observed.hits);
    return {seed,scores,passed:scores.filter(s=>s>=5).length,hits:scores.reduce((a,b)=>a+b,0)};
  });
  summary[name]={bo3:errors(pooled[name]),tails:tails(pooled[name]),cards};
}
const {control,smooth}=summary;
const errorGate=smooth.bo3.brier<control.bo3.brier && smooth.bo3.logLoss<control.bo3.logLoss;
const cardGate=smooth.cards.filter((r,i)=>r.passed>=2 && r.hits>=control.cards[i].hits).length>=2;
const raw=JSON.stringify({fields,summary,errorGate,cardGate,advance:errorGate&&cardGate})+'\n';
const file=path.join(__dirname,'report.json');
if(fs.existsSync(file))assert.equal(fs.readFileSync(file,'utf8'),raw);
else fs.writeFileSync(file,raw,{flag:'wx'});
console.log(JSON.stringify({summary,errorGate,cardGate}));
