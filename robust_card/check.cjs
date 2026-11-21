'use strict';
const assert = require('node:assert/strict');
require('../engine/engine.js');
require('./robust.js');

const odds = Array.from({length:16},(_,a)=>Array.from({length:16},(_,b)=>1/(1+Math.exp((a-b)/7))));
const expected = [0,1,0,1,1,1,1,1,3,3,3,3,3,3,2,2];
const pass = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
const seed = 33719;
const pins = [[8]];
const gate = CS.pairedPassSample;
const candidates = {card:pass, expectedCard:expected, evalN:12000,
  score(card) {return {pass:card===pass ? 0.61 : 0.42,expected:4.5,histogram:[],n:this.evalN};}};

function synthetic(cells) {
  let count=0;
  try {
    CS.pairedPassSample = (matrix,n,gateSeed,locks,left,right) => {
      count++;
      assert.equal(matrix,odds);assert.equal(n,12000);assert.equal(locks,pins);
      assert.notEqual(gateSeed,seed);assert.notEqual(gateSeed,(seed^0xc5398da1)>>>0);
      assert.equal(left,expected);assert.equal(right,pass);
      return {n,...cells};
    };
    const chosen=PickRobust.apply(candidates,odds,seed,pins);
    assert.equal(count,1);assert.equal(chosen.pass,candidates.score(chosen.card).pass);
    assert.equal(chosen.passCard,pass);assert.equal(candidates.card,pass);
    return chosen;
  } finally {CS.pairedPassSample=gate;}
}

const strong=synthetic({passOnly:1200,expectedOnly:650,both:4500,neither:5650});
assert.equal(strong.robust.reason,'pass-evidence');assert.equal(strong.card,pass);
assert.ok(strong.robust.ci[0]>0);
const weak=synthetic({passOnly:720,expectedOnly:700,both:4500,neither:6080});
assert.equal(weak.card,expected);assert.ok(weak.robust.ci[0]<0 && weak.robust.ci[1]>0);
const reversed=synthetic({passOnly:650,expectedOnly:1200,both:4500,neither:5650});
assert.equal(reversed.card,expected);assert.equal(reversed.robust.delta,-strong.robust.delta);
assert.ok(Math.abs(reversed.robust.ci[1]+strong.robust.ci[0])<1e-14);
const noDiff=synthetic({passOnly:0,expectedOnly:0,both:5000,neither:7000});
assert.equal(noDiff.card,expected);assert.ok(noDiff.robust.ci[1]>0);
const same=PickRobust.apply({...candidates,card:expected.slice()},odds);
assert.equal(same.robust.reason,'identical');assert.equal(same.robust.n,0);
assert.deepEqual(same.robust.ci,[0,0]);assert.deepEqual(same.card,expected);

const sim=CS.run(odds,800,seed,pins);
const fixed={...sim,card:pass,expectedCard:expected};
const chosen=PickRobust.apply(fixed,odds,seed,pins);
const repeated=PickRobust.apply(fixed,odds,seed,pins);
assert.deepEqual(chosen.robust,repeated.robust);
assert.equal(chosen.robust.n,400);
assert.equal(chosen.robust.expectedOnly+chosen.robust.passOnly+chosen.robust.both+chosen.robust.neither,400);
assert.deepEqual(chosen.histogram,sim.score(chosen.card).histogram);
assert.deepEqual(chosen.card,repeated.card);

// Pin an entire real Swiss stage. Every new gate path must have exactly this outcome.
const fixtures=require('../fixtures/fixtures.json');
const historical=fixtures.austin;
const rounds=historical.rounds.map(r=>r.map(pair=>pair.map(team=>historical.seeds.indexOf(team))));
const roundPins=[];
for (const observed of rounds) {
  const pairs=CS.scenario(roundPins).rounds.at(-1).matches;
  roundPins.push(pairs.map(({a,b})=>observed.find(pair=>pair.includes(a)&&pair.includes(b))[0]));
}
const actual=CS.replay(rounds).actual;
const expectedWins=CS.actualScore(expected,actual)>=5, passWins=CS.actualScore(pass,actual)>=5;
const n=60;
assert.deepEqual(gate(odds,n,91,roundPins,expected,pass), {
  n,expectedOnly:n*Number(expectedWins&&!passWins),passOnly:n*Number(!expectedWins&&passWins),
  both:n*Number(expectedWins&&passWins),neither:n*Number(!expectedWins&&!passWins)
});
console.log('Independent paired holdout, conservative threshold, displayed-score partition, identical cards, symmetry and pinned results verified.');
