'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const archive=require('./singapore-forecast.json').forecast,report=require('./report.json');
globalThis.self=globalThis;
globalThis.importScripts=(...files)=>files.forEach(f=>require(path.join(__dirname,'../dist',f)));
importScripts('history-worker.js');
const event=PickLab.events.find(e=>e.id==='singapore');
assert.deepEqual(event.teams.map(t=>t.name),archive.teams.map(t=>t.name));
async function check(){
  for(const [family,source] of [['elo','elo'],['ml','ml'],['hybrid','blend']]){
    const flags={family,seedConditionalCard:true};
    const result=PickLab.run(event.id,flags);
    assert.deepEqual(result.card,archive.cards[source].standard);
    assert.deepEqual([0,1,2,3].map(c=>result.card.filter(v=>v===c).length),[2,6,2,6]);
    for(const {a,b,probs} of archive.pairs) {
      const pair=PickLab.duel(event.id,flags,a,b),reverse=PickLab.duel(event.id,flags,b,a);
      assert.deepEqual([pair.bo1,pair.bo3],probs[source]);
      assert(Math.abs(pair.bo1+reverse.bo1-1)<1e-9 && Math.abs(pair.bo3+reverse.bo3-1)<1e-9);
    }
    const locks=PickLab.setWinner([],1,0,0);
    assert.equal(PickLab.run(event.id,{...flags,locks},2000).path.lockedCount,1);
    const rows=await PickHistory.compare(flags);
    assert.equal(rows.length,13);
    const totals=[1,2,3].map(stage=>{
      const stages=report.fields.filter(f=>f.stage===stage && f.actual && f.id!=='cluj-2026');
      const hits=stages.map(f=>{
        const value=rows.find(r=>r.id===f.id).scores.model;
        assert.equal(value,f.methods[source].fixed.hits);
        return value;
      });
      return [hits.filter(v=>v>=5).length,hits.reduce((a,b)=>a+b,0)];
    });
    console.log(family,JSON.stringify(totals));
  }
}
check().catch(err=>{console.error(err);process.exitCode=1;});
