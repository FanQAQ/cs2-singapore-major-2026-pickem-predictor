'use strict';
const assert=require('node:assert/strict');
const {getField,matrices,truth,keys}=require('./evaluate.cjs');
const {errors,cardScore}=require('./score.cjs');
const report=require('./report.json'),summary=require('./summary.json'),exact=require('./exact.json'),extras=require('./exact-seeds.json');
const sg=require('./singapore.cjs'), grid=require('./website.cjs').build();
const old=require('../final_card/report.json');
function legal(card){assert.equal(card.length,16);assert.deepEqual([0,1,2,3].map(c=>card.filter(v=>v===c).length),[2,6,2,6]);}
function sum(rows){return rows.reduce((s,n)=>s+n,0);}
let staged=0,reviewed=0;
for(const r of report.fields){
  const f=getField(r.id),ms=matrices(f), t=truth(r.id,r.teams);
  const past=old.stages.find(s=>s.id===r.id);
  if(past) assert.deepEqual(r.methods.baseline.runs[0].card,past.results.current.card);
  for(const k of keys){
    assert.equal(r.methods[k].runs.length,30);
    for(const [i,row] of r.methods[k].runs.entries()){
      legal(row.card);legal(row.local);
      if(!t) {assert.equal(r.methods[k].hits[i],null);continue;}
      let score=0;
      row.card.forEach((v,j)=>{if(v<3 && v===t.actual[j])score++;});
      assert.equal(score,r.methods[k].hits[i]);staged++;
    }
    const ps=(t?.matches||[]).map(g=>ms[k]['bo'+g.bo][g.w][g.l]);
    assert.deepEqual(ps,r.methods[k].matchPs);
    for(const bo of [1,3]) assert.deepEqual(errors(ps.filter((_,i)=>t.matches[i].bo===bo)),r.methods[k].errors['bo'+bo]);
  }
  for(const id of sg.modelIds) {
    const check=(v,index)=>{
      assert.equal(v.seed,report.seeds[index]);assert.equal(v.full.visited,10090080);
      assert.deepEqual(v.standard.card,r.methods[id].runs[index].card);
      assert.deepEqual(v.local.card,r.methods[id].runs[index].local);
      assert.equal(v.full.top.length,3);assert.equal(new Set(v.full.top.map(x=>x.card.join(''))).size,3);
      for(const candidate of [v.standard,v.local,...v.full.top]){legal(candidate.card);assert.equal(candidate.hits,null);}
      const [best]=v.full.top;
      assert(best.counts.train>=v.standard.counts.train && best.counts.train>=v.local.counts.train);
      const ranking=v.full.top.map((c,i)=>[c.counts.select,c.totalHits.select,i]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]||a[2]-b[2]);
      assert.equal(v.full.selected,ranking[0][2]);
      assert.equal(new Set(Object.values(v.streams)).size,Object.keys(v.streams).length);reviewed++;
    };
    check(exact[r.id][id],0);
    if(extras[r.id])for(const i of [1,2])check(extras[r.id][id+'-'+i],i);
  }
}
for(const [key,g] of Object.entries(grid.groups)){
  for(const [id,m] of Object.entries(g.methods)){
    assert.equal(m.hits,sum(m.byEvent.map(b=>b.fixed.hits)));
    assert.equal(m.passes,m.byEvent.filter(b=>b.fixed.hits>=5).length);
    assert.equal(sum(m.slots),m.hits);assert.equal(sum(Object.values(m.paired)),30);
    assert.equal(m.hits,summary[key][id].hitsBySeed[0]);
    if(m.search){assert.equal(m.search.hits,sum(m.byEvent.map(b=>b.search.hits)));assert.equal(m.search.passes,m.byEvent.filter(b=>b.search.hits>=5).length);}
  }
}
assert.equal(report.fields.length,15);assert.equal(staged,14*30*6);assert.equal(reviewed,(15+4*2)*4);
const forecast=sg.load(), model=matrices(getField('singapore'));
for(const p of forecast.pairs)for(const id of sg.modelIds)assert.deepEqual(p.probs[id],[model[id].bo1[p.a][p.b],model[id].bo3[p.a][p.b]]);
// Exercise score handling on a past bracket in isolation from the Singapore archive.
const fixture=truth('budapest',getField('budapest').teams.map(t=>t.name));
const matches=fixture.matches.map(g=>({...g,key:'bo'+g.bo,played:true}));matches[0].played=false;
const scored=sg.grade(forecast,{games:matches,actual:fixture.actual,verified:{},endAt:null});
for(const [k,m] of Object.entries(scored.scores)){
  assert.equal(m.formats.bo1.n+m.formats.bo3.n,32);
  assert.deepEqual(m.standard,cardScore(forecast.cards[k].standard,fixture.actual));
}
console.log(staged+' scored model/seed cards, '+reviewed+' exact searches, all historical series and frozen Singapore pairs verified.');
