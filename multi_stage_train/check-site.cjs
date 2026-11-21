'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const report = require('./report.json');
const models = require('./models.json');
const dist = path.resolve(__dirname,'../dist');
const html = fs.readFileSync(path.join(dist,'index.html'),'utf8');
// Use the same script versions and ordering as the published page.
for (const [,src] of html.matchAll(/<script\b[^>]*\bsrc="([^"?]+\.js)(?:\?[^"]*)?"/g)) {
  require(path.join(dist,src));
  if (src==='adapter.js') break;
}

const historical = new Map(report.stages.map(s=>[s.id,s]));
const all = PickLab.allEvents;
const pooledExamples = {recommended:[],tree:[]};
assert.equal(all.length,14);
for (const event of all) {
  assert.deepEqual(event.stageTraining,models[event.id],event.id);
  for (const method of ['recommended','tree']) {
    const stage=historical.get(event.id);
    let flags=PickMethods.defaults(method,event);
    if (event.stage>1) flags=PickStageInputs.localFlags(event,flags).flags;
    const base=PickLab.seriesMatrices(event,{...flags,stageTraining:false});
    const adjusted=PickLab.seriesMatrices(event,{...flags,stageTraining:true});
    const combinedFlags={...flags,format:false,shrinkBO:false};
    const combinedBase=PickLab.seriesMatrices(event,{...combinedFlags,stageTraining:false});
    const combinedAdjusted=PickLab.seriesMatrices(event,{...combinedFlags,stageTraining:true});
    for (const bo of [1,3]) {
      for (const [raw,adjustedMatrix,key] of [[base,adjusted,'bo'+bo],[combinedBase,combinedAdjusted,'pooled']]) {
        const slope=models[event.id][method][key];
        for (let a=0;a<16;a++) for (let b=0;b<16;b++) {
          const p=raw['bo'+bo][a][b], q=adjustedMatrix['bo'+bo][a][b];
          const expected=1/(1+Math.exp(-slope*Math.log(p/(1-p))));
          assert.ok(Math.abs(q-expected)<1e-10,event.id+' '+method+' '+key+' '+bo);
        }
      }
    }
    if (stage) {
      const actual=CS.replay(event.rounds).actual;
      for(const [variant,odds] of Object.entries({base,multiStage:adjusted})) {
        const wins=Array(16).fill(0), losses=Array(16).fill(0);
        const byBo={1:[],3:[]};
        event.rounds.forEach((r,k)=>r.forEach(([winner,loser],g)=>{
          const bo=event.formats?.[k][g] ?? CS.bestOf(wins[winner],losses[winner]);
          byBo[bo].push(odds['bo'+bo][winner][loser]);
          if (variant==='base') {
            const p=combinedBase['bo'+bo][winner][loser];
            pooledExamples[method].push({parent:stage.parent,x:Math.log(p/(1-p))});
          }
          wins[winner]++;
          losses[loser]++;
        }));
        for(const [bo,values] of Object.entries(byBo)) {
          const series=stage.methods[method][variant].series['bo'+bo];
          assert.equal(series.n,values.length);
          if(values.length) {
            const squared=values.reduce((s,p)=>s+(1-p)**2,0)/values.length;
            const nll=values.reduce((s,p)=>s-Math.log(p),0)/values.length;
            assert.ok(Math.abs(series.brier-squared)<1e-9);
            assert.ok(Math.abs(series.logLoss-nll)<1e-9);
          }
        }
        const run=CS.run(odds,report.budget,report.seed,[],{seedConditionalCard:method==='recommended'});
        assert.deepEqual(run.card,stage.methods[method][variant].assignments,event.id+' '+method+' '+variant);
        assert.equal(CS.actualScore(run.card,actual),stage.methods[method][variant].hitsBySeed[0]);
        if(event.allBo3) assert.ok(run.path.rounds[0].matches.every(m=>m.bo===3));
      }
    }
  }
}
// Independently check that the fitted pooled coefficient minimizes the penalized
// loss on exactly the earlier, format-disabled, published series probabilities.
for(const event of all) for(const method of Object.keys(pooledExamples)) {
  const training=models[event.id], slope=training[method].pooled;
  const earlier=pooledExamples[method].filter(row=>training.editions.includes(row.parent));
  assert.equal(earlier.length,Object.values(training.nByStage).reduce((a,b)=>a+b));
  const gradient=earlier.reduce((sum,{x})=>sum+x*(1/(1+Math.exp(-slope*x))-1),12*(slope-1));
  if(slope===0.25) assert.ok(gradient>=-1e-6);
  else if(slope===3) assert.ok(gradient<=1e-6);
  else assert.ok(Math.abs(gradient)<1e-6,event.id+' '+method+' pooled optimum');
}
console.log('14 stages × both families: calibrated matrices, fixed-seed cards and official formats agree with the published engine.');
