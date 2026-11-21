'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {root, productionSeed, budget} = require('../integrated_eval/runtime.cjs');
for (const module of ['region-vrs','pick-signal','lan-signal','methods']) require(path.join(root,'dist',module+'.js'));
const seeds = [1151,98761,148367,298451];
const each = 10000;
const rounded = p => Number(p.toFixed(6));

// Same generator as CS.run, allowing exact verification against the published marginals.
function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), state | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function paths(matrix, seed, count, consume) {
  assert.ok(!matrix.state, 'The experiment requires fixed match probabilities');
  const random = randomSource(seed);
  for (let trial=0;trial<count;trial++) {
    const rounds=[], wins=new Uint8Array(16), losses=new Uint8Array(16);
    for (let round=0;round<5;round++) {
      const pairs=CS.nextPairs(rounds), played=[];
      for (const [a,b] of pairs) {
        const p=CS.bestOf(wins[a],losses[a])===3?matrix.bo3[a][b]:matrix.bo1[a][b];
        const result=random()<p?[a,b]:[b,a];
        wins[result[0]]++; losses[result[1]]++;
        played.push(result);
      }
      rounds.push(played);
    }
    consume(wins,losses);
  }
}
function category(w,l) { return w===3 ? (l===0?0:1) : (w===0?2:3); }
function study(event) {
  const flags={...PickMethods.defaults('recommended',event),seedConditionalCard:true};
  const sim=PickLab.run(event.id,flags,budget,productionSeed);
  if (event.hasResults) assert.ok(sim.replay.ok,'Historical pairing mismatch '+event.id);
  const advance=sim.probabilities.map(p=>p[0]+p[1]);
  const top=advance.map((_,i)=>i).sort((a,b)=>advance[b]-advance[a] || a-b).slice(0,4);
  const groups={model:top,seeds:[0,1,2,3]};
  const audit=advance.map(()=>[0,0,0,0]);
  for (const s of [productionSeed,(productionSeed^0xc5398da1)>>>0]) {
    paths(sim.matchups,s,budget/2,(w,l)=>{for(let i=0;i<16;i++) audit[i][category(w[i],l[i])]++;});
  }
  assert.deepEqual(audit.map(r=>r.map(n=>n/budget)),sim.probabilities);
  const bySeed=[], histogram=Array(11).fill(0);
  for(const seed of seeds) {
    const bins={model:Array(5).fill(0),seeds:Array(5).fill(0)};
    paths(sim.matchups,seed,each,(w,l)=>{
      let hits=0;
      for(let i=0;i<16;i++) if(sim.card[i]<3 && sim.card[i]===category(w[i],l[i])) hits++;
      histogram[hits]++;
      for(const [kind,group] of Object.entries(groups)) bins[kind][group.filter(i=>w[i]<3).length]++;
    });
    bySeed.push(bins);
  }
  const n=seeds.length*each;
  const result={};
  for(const [kind,group] of Object.entries(groups)) {
    const out=Array.from({length:5},(_,k)=>bySeed.reduce((s,b)=>s+b[kind][k],0));
    const perSeed=bySeed.map(b=>rounded(1-b[kind][0]/each));
    result[kind]={teams:group.map(i=>({name:event.teams[i].name,qualify:rounded(advance[i])})),
      counts:out,atLeastOne:rounded(1-out[0]/n),atLeastTwo:rounded(1-(out[0]+out[1])/n),perSeed,
      actualOut:event.hasResults?group.filter(i=>sim.observed[i]>1).map(i=>event.teams[i].name):null};
  }
  const hits=event.hasResults?CS.actualScore(sim.card,sim.observed):null;
  result.card={actual:hits,scoreHistogram:histogram,
    atOrBelowObserved:hits===null?null:rounded(histogram.slice(0,hits+1).reduce((a,b)=>a+b,0)/n)};
  return result;
}
const report={asOf:'2026-11-21',seeds,pathsPerStage:seeds.length*each,stages:{}};
for(const e of PickLab.events) report.stages[e.id]=study(e);
const file=path.join(__dirname,'report.json');
if(process.argv.includes('--check')) assert.deepEqual(report,JSON.parse(fs.readFileSync(file,'utf8')));
else fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
for(const [id,s] of Object.entries(report.stages)) console.log(id,s.model.atLeastOne,s.model.atLeastTwo,s.model.actualOut,s.card.actual,s.card.atOrBelowObserved);
