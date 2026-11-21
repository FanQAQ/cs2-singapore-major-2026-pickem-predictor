'use strict';
const assert = require('node:assert/strict');
require('../engine/engine.js');
require('./swap.js');
const seed = 33719;
const card = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];

// Reproduce paths independently using visible round pairings and per-team scores.
function testRandom(seed) {
  let state = (seed ^ 0xc5398da1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let v = Math.imul(state ^ (state >>> 15), state | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0)/4294967296;
  };
}

const matrix = scale=>Array.from({length:16},(_,i)=>Array.from({length:16},(_,j)=>
  1/(1+Math.exp((i-j)*scale))));
const odds = {bo1:matrix(.045),bo3:matrix(.14)};
function oracle(cardA, cardB, locks, n) {
  const draw = testRandom(seed);
  const counts = {originalOnly:0,swappedOnly:0,both:0,neither:0};
  const losses = [];
  for (let sample=0;sample<n;sample++) {
    const rounds = [], wins=Array(16).fill(0), defeats=Array(16).fill(0);
    for (let r=0;r<5;r++) {
      const pairs=CS.nextPairs(rounds);
      const round = pairs.map(([a,b],i)=>{
        const table=CS.bestOf(wins[a],defeats[a])===3 ? odds.bo3 : odds.bo1;
        const prediction=draw()<table[a][b]?a:b;
        const w=locks[r]?.[i] ?? prediction, l=w===a?b:a;
        wins[w]++;
        defeats[l]++;
        return [w,l];
      });
      rounds.push(round);
    }
    const field=wins.map((w,i)=>w===3?(defeats[i]===0?0:1):w===0?2:3);
    const a=CS.actualScore(cardA,field)>=5, b=CS.actualScore(cardB,field)>=5;
    const key=a?(b?'both':'originalOnly'):(b?'swappedOnly':'neither');
    counts[key]++;
    losses.push(Number(b)-Number(a));
  }
  return {counts,losses};
}

function check(locks,n) {
  const sim=CS.run(odds,n,seed,locks), before=[...card];
  const x=PickSwap.compare(sim,card,0,4);
  const a=sim.score(card), b=sim.score(x.card);
  assert.deepEqual(card,before);
  assert.equal(x.n,n-Math.floor(n/2));
  assert.deepEqual(x.original.histogram,a.histogram);
  assert.deepEqual(x.swapped.histogram,b.histogram);
  assert.equal(x.original.passRate,a.pass);
  assert.equal(x.swapped.passRate,b.pass);
  assert.equal(x.original.expected,a.expected);
  assert.equal(x.swapped.expected,b.expected);
  const {counts,losses}=oracle(card,x.card,locks,x.n);
  for (const k of Object.keys(counts)) assert.equal(x[k],counts[k]/x.n);
  const mean=losses.reduce((s,d)=>s+d,0)/x.n;
  assert.equal(x.delta,mean);
  if (x.n>1) {
    const se=Math.sqrt(losses.reduce((s,d)=>s+(d-mean)**2,0)/(x.n-1)/x.n);
    assert.ok(Math.abs(x.se-se)<1e-12);
  } else {
    assert.equal(x.se,null);
    assert.equal(x.ci95,null);
  }
  const back=PickSwap.compare(sim,x.card,4,0);
  assert.deepEqual(back.card,card);
  assert.equal(back.originalOnly,x.swappedOnly);
  assert.equal(back.swappedOnly,x.originalOnly);
  assert.equal(back.se,x.se);
  assert.equal(back.nearTie,x.nearTie);
  assert.throws(()=>PickSwap.compare(sim,card,4,0));
  assert.throws(()=>PickSwap.compare(sim,card,0,0));
  assert.throws(()=>PickSwap.compare(sim,card.slice(0,11),0,4));
}

check([],1601);
const opening = Array.from({length:8},(_,i)=>i%2?i+8:i);
check([opening,[null,CS.round2(opening)[1][0]]],401);
check([],2);
const locks = [], rounds=[];
for(let r=0;r<5;r++) {
  const pairs=CS.nextPairs(rounds);
  locks.push(pairs.map(([a])=>a));
  rounds.push(pairs);
}
check(locks,80);
console.log('Paired pass rates, four joint outcomes, score histograms and MC sampling error match an independent path replay, including locked rounds.');
