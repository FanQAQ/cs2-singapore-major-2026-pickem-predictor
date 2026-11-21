'use strict';
const assert = require('node:assert/strict');
require('../engine/engine.js');
require('./pick-constraints.js');
const teams = Array.from({length:16}, (_,i) => ({name:'队' + (i+1)}));
const empty = () => Array(16).fill(3);
const notes = (card, pins) => PickConstraints.messages(card, CS.scenario(pins), teams);

function finish(pins, number) {
  return CS.scenario(pins).rounds[number - 1].matches.reduce(
    (locks, match, index) => CS.setWinner(locks, number, index, match.a), pins);
}
const locked = finish(finish([], 1), 2);
const matches = CS.scenario(locked).rounds[2].matches;
const upper = matches.findIndex(m => m.wins === 2);
const lower = matches.findIndex(m => m.losses === 2);
const card = empty();
for (const i of [matches[upper].a, matches[upper].b]) card[i] = 0;
for (const i of [matches[lower].a, matches[lower].b]) card[i] = 2;
assert.equal(notes(card, locked).filter(t => t.includes('最多命中一格')).length, 2);
const decided = CS.setWinner(locked, 3, upper, matches[upper].a);
assert.ok(notes(card, decided).some(t=>t.includes(teams[matches[upper].b].name+'（2–1）')));
const flipped = CS.setWinner(decided, 3, upper, matches[upper].b);
assert.ok(notes(card, flipped).some(t=>t.includes(teams[matches[upper].a].name+'（2–1）')));
assert.deepEqual(notes(card, CS.setWinner(flipped,3,upper,null)), notes(card,locked));
const decoded = CS.setWinner(decided, 3, lower, matches[lower].a);
const ordinary = empty();
for (const i of [matches[upper].a,matches[upper].b,matches[lower].a,matches[lower].b]) ordinary[i]=1;
const aggregate = notes(ordinary, decoded);
assert.equal(aggregate.length, 1);
assert.ok(aggregate[0].includes(teams[matches[upper].a].name+'（3–0）'));
assert.ok(aggregate[0].includes(teams[matches[lower].b].name+'（0–3）'));
assert.ok(!aggregate[0].includes('（2–1）') && !aggregate[0].includes('（1–2）'));
assert.deepEqual(notes(ordinary, []), []);
assert.ok(notes(card, []).every(t=>!t.includes('第 3 轮') && !t.includes('已无法')));
console.log('Verified guaranteed collision, impossible records, reversal and clearing of locks.');
