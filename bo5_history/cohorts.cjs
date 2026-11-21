'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const entrants=require('./entrants.json');
const arms=['original','candidate'],levels=['direct','3-0','3-1','3-2'];

function summarize(fields) {
  const groups={};
  for(const stage of fields){
    const entry=entrants[stage.id];if(!entry)continue;
    assert(entry.previousEnd<stage.start && stage.start===entry.start);
    const group=groups[stage.group]??={stages:[],rows:Object.fromEntries(levels.map(key=>[key,{n:0,actualZero:0,actualQualified:0,
      arms:Object.fromEntries(arms.map(k=>[k,{expectedZero:0,brierSum:0,chosen:0,correct:0,qualified:0}]))}]))};
    group.stages.push(stage.id);
    const counts=Object.fromEntries(levels.map(k=>[k,0]));
    for(const [i,t] of stage.teams.entries()){
      const key=entry.teams[t].entry,r=group.rows[key];counts[key]++;
      const zero=Number(stage.actual[i]===2),qualified=Number(stage.actual[i]<2);
      r.n++;r.actualZero+=zero;r.actualQualified+=qualified;
      for(const k of arms){
        const m=stage.arms[k].main,p=m.teams[i].zero,a=r.arms[k],chosen=Number(m.cards.standard.card[i]===2);
        assert(p>=0 && p<=1);
        a.expectedZero+=p;a.brierSum+=(p-zero)**2;a.chosen+=chosen;a.correct+=chosen*zero;a.qualified+=chosen*qualified;
      }
    }
    assert.deepEqual(Object.values(counts),[8,2,3,3]);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([k,g])=>[k,g.stages.length])),{S3:3,S2:5,EPL:3});
  for(const g of Object.values(groups)){
    const rows=Object.values(g.rows);
    assert.equal(rows.reduce((n,r)=>n+r.n,0),16*g.stages.length);
    assert.equal(rows.reduce((n,r)=>n+r.actualZero,0),2*g.stages.length);
    for(const k of arms){
      const total=rows.reduce((n,r)=>n+r.arms[k].expectedZero,0);
      assert(Math.abs(total-2*g.stages.length)<1e-8);
      assert.equal(rows.reduce((n,r)=>n+r.arms[k].chosen,0),2*g.stages.length);
      for(const r of rows){const a=r.arms[k];a.brier=a.brierSum/r.n;delete a.brierSum;}
    }
  }
  return groups;
}
module.exports={summarize};
if(require.main===module){
  const data=summarize(require('./cards.json').fields),file=path.join(__dirname,'cohorts.json');
  if(process.argv.includes('--check'))assert.deepEqual(data,JSON.parse(fs.readFileSync(file)));
  else fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
  console.log('Classified all 176 team-stage entries across 11 Swiss stages');
}
