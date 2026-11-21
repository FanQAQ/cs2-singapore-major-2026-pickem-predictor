'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
require('./rules.js');
const fields=require('./legacy_fields.json').stages;
const floor=[2/16,6/16,2/16,6/16];
const round=n=>Number(n.toFixed(7));
const history=[], results=[];
const meanBrier=(ps,actual)=>ps.reduce((total,p,i)=>total+
  p.reduce((sum,v,c)=>sum+(v-Number(c===actual[i]))**2,0),0)/ps.length;
for(const field of fields) {
  const {date,teams,actual}=field;
  assert.equal(teams.length,16);
  assert(teams.every(t=>t.lastSeen<date && t.roster.length===5));
  assert(history.every(h=>h.end<date));
  const points=teams.map(t=>t.points);
  const prior=PickFinalCard.prior(points,history);
  if(history.length) {
    const grouped=[],ranked=[];
    for(let i=0;i<teams.length;i++) {
      const hits=prior[i], weight=hits.reduce((a,b)=>a+b);
      const counts=[0,0,0,0];
      for(const h of history)
        for(let j=0;j<teams.length;j++) if((i<8)===(j<8)) counts[h.actual[j]]++;
      const denominator=9+weight;
      grouped.push(floor.map((p,c)=>(9*p+weight*counts[c]/(8*history.length))/denominator));
      ranked.push(floor.map((p,c)=>(9*p+hits[c])/denominator));
    }
    results.push({name:field.name,dates:history.map(h=>h.end),n:16,
      flat:round(meanBrier(teams.map(()=>floor),actual)),group:round(meanBrier(grouped,actual)),
      rank:round(meanBrier(ranked,actual))});
  }
  history.push({end:field.end,points,actual});
}
const pooled=Object.fromEntries(['flat','group','rank'].map(k=>
  [k,round(results.reduce((s,r)=>s+r[k],0)/results.length)]));
const report={evaluationTeams:results.length*16,results,pooled};
const file=path.join(__dirname,'legacy_report.json'),output=JSON.stringify(report,null,2)+'\n';
if(process.argv.includes('--check')) assert.equal(fs.readFileSync(file,'utf8'),output);
else fs.writeFileSync(file,output);
console.log(output);
