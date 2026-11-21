'use strict';
const assert=require('node:assert/strict');
const {events,prepare}=require('./lock.cjs');
const {truth,cardScore,errors}=require('../evaluate.cjs');
const {digest,read,freeze}=require('../format_split/astana/lock.cjs');
const prefix=process.argv.includes('--full')?'full-':'',cards=read(prefix+'cards.json',__dirname);
const stages={},individual={};
for(const stage of [2,3]){
  const probabilities={baseline:{bo1:[],bo3:[]},candidate:{bo1:[],bo3:[]}};
  const totals={baseline:[],candidate:[]};
  for(const e of events.filter(e=>e.stage===stage)){
    const {f,baseline,candidate}=prepare(e),data=cards[e.id];
    assert.equal(data.odds,digest([baseline,candidate]));
    const {matches,actual}=truth(e.id,f.teams.map(t=>t.name));
    const rows=data.rows.map(r=>({seed:r.seed,baseline:cardScore(r.baseline,actual),candidate:cardScore(r.candidate,actual)}));
    for(const [k,m] of Object.entries({baseline,candidate})){
      for(const g of matches)probabilities[k]['bo'+g.bo].push(m['bo'+g.bo][g.w][g.l]);
      rows.forEach((r,i)=>{totals[k][i]=(totals[k][i]||0)+Number(r[k].hits>=5);});
    }
    individual[e.id]=rows;
  }
  const accuracy=Object.fromEntries(Object.entries(probabilities).map(([k,p])=>[k,{bo1:errors(p.bo1),bo3:errors(p.bo3)}]));
  stages[stage]={accuracy,passed:totals};
}
const {passed,accuracy}=stages[3];
const passedGate=passed.candidate[0]>=2 && passed.candidate.slice(1,3).some(n=>n>=2) && stages[2].passed.candidate[0]>=3 &&
  ['bo1','bo3'].every(fmt=>['brier','logLoss'].every(metric=>accuracy.candidate[fmt][metric]<=accuracy.baseline[fmt][metric]));
freeze(prefix+'report.json',{individual,stages,passedGate},__dirname);
console.log(JSON.stringify({stages,passedGate}));
