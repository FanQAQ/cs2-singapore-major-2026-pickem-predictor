/* Independently audit the dated daily observations against each event's announced five. */
'use strict';
const assert = require('node:assert/strict');
const dated = require('./ratings.json');
const anchors = require('../datajob/stage_rosters.json');
const provenance = require('../datajob/stage_roster_sources.json');
const fixtures = require('../fixtures/fixtures.json');
const starts = {austin:'2025-06-03',budapest:'2025-11-24',cologne:'2026-06-02',singapore:'2026-11-24'};

function playerSet(players) {
  if (!Array.isArray(players) || players.length !== 5) return null;
  const five = new Set(players.map(name => typeof name === 'string' ? name.normalize('NFKC').trim().toLowerCase() : ''));
  return five.size === 5 && !five.has('') ? five : null;
}

function matchingRating(target, candidates) {
  const five = playerSet(target);
  if (!five) return null;
  const scored = [];
  for (const row of candidates) {
    const opposing = playerSet(row.roster);
    if (!opposing) continue;
    const overlap = [...five].filter(player => opposing.has(player)).length;
    if (overlap >= 3) scored.push({overlap,row});
  }
  scored.sort((a,b) => b.overlap-a.overlap);
  return scored.length && scored[0].overlap !== scored[1]?.overlap ? scored[0] : null;
}

for (const [event,seeded] of Object.entries(fixtures)) {
  assert.deepEqual(Object.keys(anchors[event]).sort(),[...seeded.seeds].sort());
  assert.ok(Object.values(anchors[event]).every(five => playerSet(five)));
  const source = provenance[event];
  assert.ok(source.sources.length && source.rosterAsOf < starts[event]);
  for (const record of [...source.sources,...Object.values(source.teamUpdates)])
    assert.ok(record.date <= source.rosterAsOf);
}

const summary = [];
for (const [event, item] of Object.entries(dated)) {
  assert.ok(item.monthlyAsOf < item.asOf && item.asOf < starts[event]);
  const candidates = Object.values(item.teams);
  const observations = {event,asOf:item.asOf,full:0,partial:[],missing:[],changed:[]};
  for (const [team,five] of Object.entries(anchors[event])) {
    const result = matchingRating(five,candidates);
    if (!result) {
      observations.missing.push(team);
      continue;
    }
    const {row,overlap} = result;
    assert.ok(Number.isInteger(row.points) && row.points > 0);
    assert.ok(Number.isInteger(row.rank) && row.rank > 0);
    if (overlap === 5) observations.full++;
    else observations.partial.push({team,overlap});
    if (overlap !== row.overlap) observations.changed.push({team,monthly:row.overlap,stage:overlap});
  }
  summary.push(observations);
}

const ef = anchors.singapore['Eternal Fire'];
const unrelated = {roster:['MAJ3R','XANTARES','Wicadia','woxic','jottAAA']};
assert.equal(matchingRating(ef,[unrelated]),null);
assert.equal(matchingRating(ef,[]),null);
assert.equal(matchingRating(ef,[{roster:[...ef.slice(0,4),ef[0]]}]),null);
assert.equal(matchingRating(ef,[{roster:[...ef.slice(0,3),'a','b']},{roster:[...ef.slice(0,3),'c','d']}]),null);
assert.equal(matchingRating(ef,[{sourceName:'different organisation',roster:ef}]).overlap,5);
assert.equal(matchingRating(anchors.budapest.FaZe,Object.values(dated.budapest.teams)).overlap,5);
assert.equal(matchingRating(anchors.singapore['9z'],Object.values(dated.singapore.teams)).overlap,4);
console.log(JSON.stringify(summary));
