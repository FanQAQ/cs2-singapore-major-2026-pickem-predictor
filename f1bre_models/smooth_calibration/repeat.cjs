'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {seeds,budget}=require('../../strategy_v4_eval/settings.cjs');
const {play}=require('../../bo5_history/cards.cjs');
const {getField,matrices}=require('../evaluate.cjs');
const history=require('../format_split/cards.json').fields;
const odds=require('./odds.json'),screen=require('./report.json');
assert(screen.advance && budget===24000);
const fields={};
for(const [id,data] of Object.entries(odds.fields)){
  const f=getField(id),{elo,ml}=matrices(f,['elo','ml']);
  const control=history.find(s=>s.id===id);
  assert.deepEqual(data.teams,f.teams.map(t=>t.name));
  const actual=control.actual;
  const m={...ml,bo1:elo.bo1,bo3:data.bo3};
  fields[id]=seeds.map((seed,i)=>{
    const r=play({id,scheme:'major'},m,seed,actual,false).cards.standard;
    return {seed,card:r.card,hits:r.hits,slots:r.slots,audit:r.simulatedPass,control:control.hybrid[i].hits};
  });
}
const results=seeds.map((seed,i)=>{
  const events=Object.values(fields).map(rows=>rows[i]);
  const result={seed};
  for(const key of ['hits','control']){
    const scores=events.map(r=>r[key]);
    result[key]={scores,passes:scores.filter(h=>h>=5).length,total:scores.reduce((a,b)=>a+b,0)};
  }
  return result;
});
const raw=JSON.stringify({fields,results})+'\n',dest=path.join(__dirname,'repeat.json');
if(fs.existsSync(dest))assert.equal(fs.readFileSync(dest,'utf8'),raw);
else fs.writeFileSync(dest,raw,{flag:'wx'});
console.log('Main',results[0],'seeds passing at least two Majors',
  ...['control','hits'].map(k=>results.filter(r=>r[k].passes>=2).length));
