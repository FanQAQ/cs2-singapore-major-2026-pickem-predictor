'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {seeds,stages}=require('./report.json');
const policies=['standard','within','grouped'],sum=xs=>xs.reduce((a,b)=>a+b,0);
const labels={stage3:'三届 Major · Stage 3',stage2:'五届 Major · Stage 2',esl:'三届 ESL · 第二阶段',
  'elisa-spring':'Elisa 春季 2024','elisa-fall':'Elisa 秋季 2024','epl21-stage2':'EPL S21','epl22-stage2':'EPL S22','epl23-stage2':'EPL S23'};
const majorNames={copenhagen:'哥本哈根',shanghai:'上海',austin:'奥斯汀',budapest:'布达佩斯',cologne:'科隆'};
function label(id){
  if(labels[id])return labels[id];
  const [city,year,stage]=id.split('-');return majorNames[city]+' '+year+' · Stage '+stage;
}
function summarize(rows,key) {
  const ns=rows.length,policiesData={};
  const records=rows.flatMap(r=>r.methods[key].runs.slice(0,1));
  for(const p of policies){
    const fixed=records.map(r=>r.scores[p]);
    const bySeed=seeds.map((_,i)=>{
      const scores=rows.map(r=>r.methods[key].runs[i].scores[p]);
      return {hits:sum(scores.map(s=>s.hits)),passes:scores.filter(s=>s.hits>=5).length};
    });
    const changes=Object.fromEntries(['hits','passes'].map(metric=>{
      const d=bySeed.map((v,i)=>v[metric]-(policiesData.standard?.bySeed??bySeed)[i][metric]);
      return [metric,[d.filter(x=>x>0).length,d.filter(x=>!x).length,d.filter(x=>x<0).length]];
    }));
    const stats={...bySeed[0],qualified:sum(fixed.map(s=>s.qualified)),wrongTier:sum(fixed.map(s=>s.wrongTier)),
      slots:[0,1,2].map(c=>sum(fixed.map(s=>s.slots[c]))),changes,bySeed};
    assert.equal(stats.hits,sum(stats.slots));
    if(rows.length===1 && records[0].seatHits)stats.seatHits=records[0].seatHits[p];
    policiesData[p]=stats;
  }
  const bo3=rows.map(s=>s.methods[key].errors.bo3),n=sum(bo3.map(g=>g.n));
  const errors={n,brier:n?sum(bo3.map(g=>g.n*g.brier))/n:null};
  if(rows.length===1)errors.core=rows[0].methods[key].coreErrors;
  const byEvent=rows.map(s=>{
    const r=s.methods[key].runs[0];
    return {label:label(s.id),hits:policies.map(p=>r.scores[p].hits)};
  });
  const result={ns,policies:policiesData,byEvent,bo3:errors};
  for(const p of policies)delete policiesData[p].bySeed;
  if(ns===1){
    const r=records[0];result.teams=rows[0].teams;
    result.cards=Object.fromEntries(policies.map(p=>[p,r[p]]));
    result.actual=rows[0].actual;result.history=rows[0].history.map(label);
  }
  return result;
}
function build(){
  const groups={};
  function save(id,rows,scheme) {
    const d=groups[id]??={label:label(id),views:{}};
    d.views[scheme]=Object.fromEntries(['baseline','ml'].map(k=>[k,summarize(rows,k)]));
  }
  for(const group of ['stage3','stage2','esl'])save(group,stages.filter(r=>r.group===group),'primary');
  for(const r of stages)save(r.id,[r],r.group==='elisa'?r.scheme:'primary');
  const donors=require('./donor-check.json').models;
  for(const [k,model] of Object.entries(donors)){
    const group=groups.stage3.views.primary[k];
    assert.equal(model.summary.full.within.mainPasses,group.policies.within.passes);
    assert.equal(model.summary.full.within.mainHits,group.policies.within.hits);
    group.donors=['full','copenhagen','shanghai','austin','budapest','none'].map(id=>{
      const d=model.summary[id].within;
      return {label:id==='full'?'使用完整历史':id==='none'?'移除全部来源':'移除'+majorNames[id],passes:d.mainPasses,hits:d.mainHits};
    });
  }
  return {seeds:seeds.length,groups};
}
module.exports={build,label};
if(require.main===module){
  const value=JSON.stringify(build())+'\n',dest=path.join(__dirname,'summary.json');
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(dest,'utf8'),value);else fs.writeFileSync(dest,value);
}
