// Independent invariants for path-conditional 0–3 counts and tournament-wide state.
'use strict';
const assert = require('node:assert/strict');
const {v4,budget,productionSeed} = require('../strategy_v4_eval/settings.cjs');
require('../engine/engine.js');
const archived = require('../map_eval/report.json').stages;
const indices = Array.from({length:16},(_,i)=>i);
const sum = values=>values.reduce((a,b)=>a+b,0);
function near(a,b,error=1e-10) {assert.ok(Math.abs(a-b)<error, a+' differs from '+b);}
function checkCounts(sim) {
  assert.equal(sim.tailRisk.length,16);
  for (const [i,r] of sim.tailRisk.entries()) {
    assert.equal(r.paths,sim.searchN+sim.evalN);
    assert.equal(r.p03,sim.probs[i][2]);
    assert.equal(r.reached02,sum(r.opponents.map(o=>o.reached02)));
    assert.equal(r.lost03,sum(r.opponents.map(o=>o.lost03)));
    if (!r.reached02) {
      assert.equal(r.pLossGiven02,null);
      assert.equal(r.p03,0);
      continue;
    }
    near(r.p02*r.pLossGiven02,r.p03);
    near(sum(r.opponents.map(o=>o.pOpponentGiven02)),1);
    near(sum(r.opponents.map(o=>o.pOpponentGiven02*o.pLossGivenOpponent)),r.pLossGiven02);
    for (const o of r.opponents) {
      assert.notEqual(o.team,i);
      assert.ok(o.reached02>0 && o.reached02>=o.lost03);
      const other=sim.tailRisk[o.team].opponents.find(a=>a.team===i);
      assert.equal(o.reached02,other.reached02);
      assert.equal(o.reached02,o.lost03+other.lost03);
    }
  }
  assert.equal(sum(sim.tailRisk.map(row=>row.reached02)),4*(sim.searchN+sim.evalN));
  assert.equal(sum(sim.tailRisk.map(row=>row.lost03)),2*(sim.searchN+sim.evalN));
}

const equal=indices.map(()=>indices.map(()=>.5));
const ordinary={bo1:equal,bo3:equal};
const direct=CS.run(ordinary,4000,17);
checkCounts(direct);
const scales=indices.map(i=>i===0 ? 1.05 : 0);
const state={...ordinary,state:{scales}};
const s=CS.run(state,16000,17);
checkCounts(s);
const stronger=1/(1+Math.exp(-scales[0])),weaker=1-stronger;
near(s.tailRisk[0].p02,(stronger**2+weaker**2)/2,.017);
near(s.tailRisk[0].p03,(stronger**3+weaker**3)/2,.016);
near(s.probs[0][0],(stronger**3+weaker**3)/2,.016);
// Independent solution for one nonzero team scale and arbitrary raw BO1/BO3
// probabilities: solve for the weaker-state probability, then apply a known
// 2*scale odds ratio to obtain the stronger-state probability.
function anchoredPair(mean,scale) {
  const ratio=Math.exp(2*scale);
  let lo=0,hi=1;
  for(let i=0;i<60;i++) {
    const w=(lo+hi)/2, strong=ratio*w/(1-w+ratio*w);
    if ((w+strong)/2<mean) lo=w;
    else hi=w;
  }
  const w=(lo+hi)/2;
  return [w,ratio*w/(1-w+ratio*w)];
}
const strengthMatrix=p=>indices.map(a=>indices.map(b=>a===b ? .5 : a===0 ? p : b===0 ? 1-p : .5));
const split={bo1:strengthMatrix(.62),bo3:strengthMatrix(.37),state:{scales}};
const [w1,s1]=anchoredPair(.62,scales[0]),[w3,s3]=anchoredPair(.37,scales[0]);
const splitRun=CS.run(split,16000,74);
near(splitRun.tailRisk[0].p03,((1-w1)**2*(1-w3)+(1-s1)**2*(1-s3))/2,.015);
near(splitRun.probs[0][0],(w1*w1*w3+s1*s1*s3)/2,.015);
const wins=indices.slice(0,8), loses=wins.map(i=>i+8);
for (const [r1,expected] of [[wins,stronger**2+weaker**2],[loses,2*stronger*weaker]]) {
  const r=CS.run(state,2201,900,r1);
  checkCounts(r);
  const m=r.path.rounds[1].matches.find(m=>m.a===0||m.b===0);
  near(m.a===0?m.probability:1-m.probability,expected);
  if (r1===wins) assert.equal(r.tailRisk[0].p02,0);
}
// Each future pairing is evaluated against the correct state. The same seed
// also reproduces the legacy Bernoulli stream whenever shared spread is zero.
const zero={...ordinary,state:{scales:indices.map(()=>0)}};
const zs=CS.run(zero,4000,17);
for(const key of ['card','expectedCard','probs','tailRisk','opponents']) assert.deepEqual(direct[key],zs[key]);

const none=CS.tailRanking(direct.tailRisk);
assert.deepEqual(none.ranked.map(r=>r.team),none.order);
assert.equal(none.ranksByTeam[none.order[3]],4);
const equalRanks=CS.tailRanking(indices.map(()=>({p03:0})));
assert.deepEqual(equalRanks.order,indices);

// Force one selected 0–2 match and verify its conditional outcome probabilities.
const pinned=[];
for(let round=1;round<=2;round++) {
  const row=CS.scenario(pinned).rounds.at(-1).matches.map(m=>m.a);
  pinned.push(row);
}
const third=CS.scenario(pinned).rounds[2].matches;
const index=third.findIndex(m=>m.losses===2);
pinned.push(third.map((m,i)=>i===index?m.a:null));
const conditioned=CS.run(ordinary,501,71,pinned);
checkCounts(conditioned);
const {a,b}=third[index];
assert.deepEqual([conditioned.tailRisk[a].p02,conditioned.tailRisk[a].pLossGiven02],[1,0]);
assert.deepEqual([conditioned.tailRisk[b].p02,conditioned.tailRisk[b].pLossGiven02],[1,1]);

const chosen=direct.card, alt=direct.expectedCard;
const evalSeed=(17^0xc5398da1)>>>0;
const paired=CS.pairedPassSample(ordinary,direct.evalN,evalSeed,[],alt,chosen);
const ref=direct.compareCards(alt,chosen);
assert.deepEqual(paired,{n:direct.evalN,expectedOnly:ref.originalOnly,passOnly:ref.swappedOnly,both:ref.both,neither:ref.neither});
const statePaired=CS.pairedPassSample(state,s.evalN,evalSeed,[],s.expectedCard,s.card);
const stateRef=s.compareCards(s.expectedCard,s.card);
assert.equal(statePaired.passOnly,stateRef.swappedOnly);
assert.equal(statePaired.expectedOnly,stateRef.originalOnly);

const rankingTotals={top2:0,top4:0,top6:0,seedBottom2:0};
for(const e of PickLab.events.filter(e=>e.hasResults)) {
  const odds=PickLab.seriesMatrices(e,v4);
  const r=CS.run(odds,budget,productionSeed), actual=CS.replay(e.rounds).actual;
  checkCounts(r);
  const original=archived.find(row=>row.id===e.id).base.card;
  assert.deepEqual(r.card,original.seedOrder);
  assert.equal(CS.actualScore(r.card,actual),original.hits);
  const ranking=CS.tailRanking(r.tailRisk,actual);
  for(const key of Object.keys(rankingTotals)) rankingTotals[key]+=ranking[key];
}
assert.deepEqual(rankingTotals,{top2:2,top4:5,top6:8,seedBottom2:5});
console.log('Conditional 0–3 paths, dynamic opponents, shared event signs, paired draws and five archived rankings verified.');
