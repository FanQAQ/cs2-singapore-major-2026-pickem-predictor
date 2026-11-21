/* Run with node engine/validate.cjs from the source checkout. */
"use strict";
const assert = require("node:assert/strict");
require("./engine.js");
const fixtures = require("../fixtures/fixtures.json");
const {CS} = globalThis;
const teams = Array.from({length:16}, (_, i) => i);
const neutral = teams.map(() => teams.map(() => 0.5));

// Stage 1 format documented by PGL and the three historical event pages.
// https://www.pglesports.com/cs2/pgl-major-singapore-2026/
// https://liquipedia.net/counterstrike/PGL/2026/Singapore/Stage_1
// https://liquipedia.net/counterstrike/Intel_Extreme_Masters/2026/Cologne/Stage_1
// https://liquipedia.net/counterstrike/StarLadder/2025/Major/Stage_1
// https://liquipedia.net/counterstrike/BLAST/Major/2025/Austin/Stage_1
const countByRound = [8,8,8,6,3];
const bo3ByRound = [0,0,4,6,3];
for (const event of Object.values(fixtures)) {
  if (!event.rounds.length) continue;
  const actual = event.rounds.map(round => round.map(pair => pair.map(name => event.seeds.indexOf(name))));
  const replay = CS.replay(actual);
  assert.equal(replay.matched,33);
  assert.equal(replay.ok,true);
  let pins = [];
  for (let r = 0; r < 5; r++) {
    const round = CS.scenario(pins).rounds.at(-1);
    assert.equal(round.number,r+1);
    assert.equal(round.matches.length,countByRound[r]);
    assert.equal(round.matches.filter(m => m.bo === 3).length,bo3ByRound[r]);
    const seen = new Set();
    round.matches.forEach((m,i) => {
      const pair = actual[r].find(duo => duo.includes(m.a) && duo.includes(m.b));
      assert.ok(pair, "Manual path failed to reproduce fixture");
      assert.equal(seen.has(m.a) || seen.has(m.b),false);
      seen.add(m.a); seen.add(m.b);
      pins = CS.setWinner(pins,r+1,i,pair[0]);
    });
  }
  // A fully specified path fixes all pairings and outcomes despite coinflip odds.
  const simulation = CS.run(neutral,12,31415,pins);
  assert.equal(simulation.path.complete,true);
  assert.equal(simulation.path.lockedCount,33);
  for (const {team,wins,losses} of simulation.path.records) {
    assert.equal(replay.records[team],wins+"–"+losses);
    assert.equal(simulation.probs[team][replay.actual[team]],1);
  }
  for (const round of simulation.path.rounds) {
    for (const {a,b} of round.matches) assert.equal(simulation.opponents[round.number-1][a][b],1);
  }
  const flipped = CS.setWinner(pins,1,0,pins[0][0] === 0 ? 8 : 0);
  assert.equal(flipped.length,1, "An upstream edit must remove downstream locks");
  assert.deepEqual(flipped[0].slice(1),pins[0].slice(1));
  assert.equal(CS.scenario(flipped).rounds.length,2);
  assert.deepEqual(CS.setWinner(pins,1,0,pins[0][0]),pins);
}

// Legacy flat R1 locks remain equivalent to the nested round notation.
const firstWinners = teams.slice(0,8);
const pathA = CS.scenario(firstWinners), pathB = CS.scenario([firstWinners]);
assert.deepEqual(pathA,pathB);
assert.throws(() => CS.scenario([[0,null],[0]]));
assert.throws(() => CS.setWinner([],1,0,15));
assert.throws(() => CS.setWinner([],2,0,0));
assert.throws(() => CS.scenario([[0,0]]));

// Without pins, the visible manual path contains only round 1. Monte Carlo still
// simulates all five rounds. Later opponent rows are unconditioned on reaching
// that round, so their mass is the team's probability of still being active.
const random = CS.run(neutral,600,97);
assert.equal(random.path.rounds.length,1);
assert.equal(random.path.lockedCount,0);
for (let r=0; r<5; r++) {
  const matrix = random.opponents[r];
  let slots = 0;
  for (const a of teams) {
    assert.equal(matrix[a][a],0);
    const sum = matrix[a].reduce((x,y) => x+y,0);
    assert.ok(sum >= 0 && sum <= 1+1e-7);
    if (r<3) assert.ok(Math.abs(sum-1)<1e-7);
    for (const b of teams) assert.equal(matrix[a][b],matrix[b][a]);
    slots += sum;
  }
  assert.ok(Math.abs(slots-2*countByRound[r])<1e-7);
}
assert.ok(random.opponents[1][0].filter(p => p > 0).length > 1);
assert.equal(random.opponents[1][0][8],0);
const forced = CS.run(neutral,120,97,[firstWinners]);
const next = forced.path.rounds[1].matches.find(m => m.a===0 || m.b===0);
assert.equal(forced.opponents[1][next.a][next.b],1);
const upset = CS.run(neutral,120,97,[CS.setWinner([firstWinners],1,0,8)[0]]);
assert.equal(upset.opponents[1][next.a][next.b],0);

// An oracle makes lower seed number win every BO1, higher number every BO3.
// Independently walk the manual bracket and compare to every unpinned MC trial.
const bo1 = teams.map(a => teams.map(b => a===b?0.5:Number(a<b)));
const bo3 = bo1.map(row => row.map(p => 1-p));
const oppositeFormats = CS.run({bo1,bo3},40,97);
let oracle = [];
for (let round=1; round<=5; round++) {
  const pairs = CS.scenario(oracle).rounds.at(-1).matches;
  oracle.push(pairs.map(m => m.bo===1 ? Math.min(m.a,m.b) : Math.max(m.a,m.b)));
}
for (const {team,wins,losses} of CS.scenario(oracle).records) {
  const category = wins===3 ? Number(losses!==0) : losses===3 && wins===0 ? 2 : 3;
  assert.equal(oppositeFormats.probs[team][category],1);
}
console.log("99 historical pairs, BO1/BO3 dispatch, five-round pins, upstream edits and marginal opponent probabilities verified.");
