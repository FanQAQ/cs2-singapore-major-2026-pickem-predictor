'use strict';
const assert=require('node:assert/strict');
const {cardScore}=require('./score.cjs');
const sg=require('./singapore.cjs');
const report=require('./report.json'),exact=require('./exact.json'),sensitivity=require('./exact-seeds.json');
const summary=require('./summary.json');
const sourceFields=require('./major-fields.json').fields;
const sum=items=>items.reduce((n,v)=>n+v,0);
const selected=entry=>entry.full.top[entry.full.selected];
function group(rows,key) {
  const methods={};
  for(const [id,m] of Object.entries(summary[key])) {
    const withSearch=sg.modelIds.includes(id);
    const byEvent=rows.map(r=>{
      const scored=r.methods[id], item={id:r.id,label:r.id==='cluj-2026'?'克卢日 2026':sourceFields[r.id].label.split(' ·')[0].replace(/\s*Major\s*/i,' ').trim(),
        fixed:scored.fixed,local:scored.localHits[0]};
      if(withSearch) {
        const entry=exact[r.id][id];
        assert.deepEqual(entry.standard.card,scored.runs[0].card);assert.deepEqual(entry.local.card,scored.runs[0].local);
        assert.equal(entry.seed,report.seeds[0]);assert.equal(entry.full.visited,10090080);
        item.search=cardScore(selected(entry).card,r.actual);
      }
      return item;
    });
    const scoreBySeed=rows[0].id==='cluj-2026'||key==='stage3' ? report.seeds.slice(0,3).map((seed,i)=>{
      if(!withSearch) return null;
      const cards=rows.map(r=>{
        const entry=i===0?exact[r.id][id]:sensitivity[r.id][id+'-'+i];
        assert.equal(entry.seed,seed);assert.deepEqual(entry.standard.card,r.methods[id].runs[i].card);
        return cardScore(selected(entry).card,r.actual).hits;
      });
      return {seed,hits:sum(cards),passes:cards.filter(h=>h>=5).length};
    }):[];
    methods[id]={passes:m.passes,hits:m.hits,slots:m.slots,errors:m.errors,paired:m.passDifference,byEvent,
      local:{passes:byEvent.filter(r=>r.local>=5).length,hits:sum(byEvent.map(r=>r.local))}};
    if(withSearch) methods[id].search={passes:byEvent.filter(r=>r.search.hits>=5).length,hits:sum(byEvent.map(r=>r.search.hits)),seeds:scoreBySeed};
  }
  return {events:rows.length,methods};
}
function build(){
  const groups={};
  for(const stage of [1,2,3]) {
    const rows=report.fields.filter(r=>sourceFields[r.id]&&r.actual&&r.stage===stage);
    groups['stage'+stage]=group(rows,'stage'+stage);
  }
  groups.cluj=group(report.fields.filter(r=>r.id==='cluj-2026'),'cluj');
  const f=sg.load(),status=sg.status(f);
  const first=f.pairs.filter(p=>p.b===p.a+8).map(p=>({a:f.teams[p.a].name,b:f.teams[p.b].name,
    probs:Object.fromEntries(sg.modelIds.map(k=>[k,p.probs[k][0]]))}));
  assert.equal(first.length,8);
  const spread=p=>Math.max(...Object.values(p.probs))-Math.min(...Object.values(p.probs));
  first.sort((a,b)=>spread(b)-spread(a));
  const cross=require('./cross-audit.json');assert.equal(cross.n,f.confirmPaths);
  const audit=require('./upstream-audit.json');
  const teams=f.teams.map(t=>t.name);
  assert.deepEqual(audit.teams,teams);
  assert.equal(audit.pathsPerModel,f.confirmPaths);
  assert(Date.parse(audit.observedAt)<Date.parse(f.startAt));
  const cards=audit.rows.filter(c=>c.card).map(c=>({
    id:c.method+c.rank,label:(c.method==='elo'?'Elo':'ML')+' · 第 '+c.rank+' 张',reportedRate:c.reportedRate,
    groups:[c.groups.perfect,c.groups.advance,c.groups.zero],commonSlots:c.models.baseline.references.standard.commonSlots,
    pass:Object.fromEntries(sg.modelIds.map(k=>[k,c.models[k].passProbability])),
    score:cardScore(c.card,status.actual)
  }));
  const homePass=Object.fromEntries(sg.modelIds.map(k=>[k,cross.rows[k].baseline.standard.passes/f.confirmPaths]));
  const marginals=require('./upstream-gaps.json');
  assert.deepEqual(marginals.rows.map(t=>t.name),teams);
  assert.equal(marginals.pathsPerModel,f.confirmPaths);
  const cologne=require('./upstream-cologne.json').stages.map(r=>{
    const local=groups['stage'+r.stage].methods.baseline.byEvent.find(x=>x.id.startsWith('cologne')).fixed;
    assert.equal(local.hits,r.site.hits);
    return {stage:r.stage,source:r.source,site:local.hits,cards:r.cards.map(c=>({label:c.label,hits:c.hits,slots:c.slots}))};
  });
  const probabilities={rows:marginals.rows,top:marginals.top};
  if(status.actual) {
    probabilities.scores={};
    for(const who of ['baseline','elo','ml']) {
      probabilities.scores[who]={};
      for(const key of ['qualified','zero']) {
        const residuals=marginals.rows.map((row,i)=>{
          const p=(who==='baseline'?row.local.baseline:row.authors[who])[key]/100;
          const observed=key==='qualified'?status.actual[i]<2:status.actual[i]===2;
          return (p-Number(observed))**2;
        });
        probabilities.scores[who][key]=sum(residuals)/teams.length;
      }
    }
  }
  const run=require('./format_split/cards.json'),external=require('./format_split/scores.json');
  const formatGroups={};
  for(const [id,g] of Object.entries(run.groups)){
    const events=id==='holdout'?1:groups[id].events;
    const entry=m=>({passes:m.passes[0],hits:m.hits[0],zero:m.slots[2]});
    formatGroups[id]={events,baseline:entry(g.baseline),hybrid:entry(g.hybrid),site:g.site?entry(g.site):null,
      direction:g.baselineComparison.passes};
  }
  const formatStudy={groups:formatGroups,uncorrected:external.initial.metrics['1'],corrected:external.corrected.metrics['1'],
    stage3:run.fields.filter(r=>r.stage===3).map(r=>({id:r.id,hybrid:r.hybrid[0].hits,
      passedSeeds:r.hybrid.filter(v=>v.hits>=5).length})),standIn:require('./format_split/correction.json').source};
  return {groups,formatStudy,singapore:{frozenAt:f.frozenAt,teams,cards:f.cards,confirmPaths:f.confirmPaths,first,status,cross:cross.rows,
    authorCards:{cards,homePass,source:audit.source},marginals:probabilities},cologne};
}
module.exports={build};
if(require.main===module) console.log(JSON.stringify(build()));
