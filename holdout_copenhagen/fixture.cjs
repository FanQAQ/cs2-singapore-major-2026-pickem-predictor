'use strict';
const assert = require('node:assert/strict');
const {checkMatrix} = require('../integrated_eval/runtime.cjs');
require('../dist/region-vrs.js');
require('../dist/methods.js');
function forecastFor(parent, field) {
  // Only date-locked coefficients and switches are transferred from the first stage.
  const opening = PickLab.events.find(e => e.id === parent);
  const flags = PickMethods.defaults('recommended', opening);
  assert.equal(opening.asOf, field.asOf);
  assert.equal(opening.formatWeight.weight, 0);
  assert.ok(!opening.regionVrsModel.officialGlobal ||
            (!opening.regionVrsModel.variants.solo.validation.passed &&
             opening.regionVrsModel.variants.solo.coefficient === 0));
  assert.ok(!flags.lanSignal && !flags.pickSignal);
  const event = {
    id: parent+'-2024-elimination', date: field.stageStart, asOf: field.asOf,
    teams: field.teams, model: opening.model, formatWeight: opening.formatWeight,
    v4Model: {...opening.v4Model, teams: Object.fromEntries(field.teams.map(t => [t.name, t.profile]))},
    formatModel: opening.formatModel, regionVrsModel: opening.regionVrsModel
  };
  const matrix = PickLab.seriesMatrices(event, flags);
  checkMatrix(matrix);
  assert.deepEqual(matrix.bo1, matrix.bo3);
  return {event, flags, matrix};
}

function outcomesFor(parent, field) {
  const aliases = {'G2 Esports':'G2', 'FURIA Esports':'FURIA', 'The Mongolz':'The MongolZ',
    'Imperial Esports':'Imperial', 'paiN Gaming':'paiN', 'Team Vitality':'Vitality',
    'FaZe Clan':'FaZe', 'Heroic':'HEROIC', 'Team Spirit':'Spirit',
    'Team Liquid':'Liquid', 'Team 3DMAX':'3DMAX', 'Wildcard Gaming':'Wildcard'};
  const games = require('../major_form/all_stages.json').editions[parent].matches.filter(g => g.stage === 2);
  const rounds = Array.from({length:5}, () => []);
  const played = Array(16).fill(0), wins = Array(16).fill(0);
  const nameToIndex = new Map(field.teams.map((t,i) => [t.name, i]));
  // Match IDs in the raw archive need not follow kickoff order on the two-round opening day.
  const isOpening = g => Math.abs(nameToIndex.get(aliases[g.a] || g.a) -
                                   nameToIndex.get(aliases[g.b] || g.b)) === 8;
  const sorted = games.slice().sort((a,b) => a.day.localeCompare(b.day) ||
    (a.day === field.stageStart ? Number(isOpening(b)) - Number(isOpening(a)) : 0));
  for (const game of sorted) {
    const [a,b] = [game.a,game.b].map(n => nameToIndex.get(aliases[n] || n));
    assert.ok(Number.isInteger(a) && Number.isInteger(b) && a !== b);
    assert.ok(game.day >= field.stageStart);
    for (const [i,roster] of [[a,game.rosterA],[b,game.rosterB]]) {
      const names = {'niko@ba':'niko', 'lucky@fr':'lucky', snowzin:'snow'};
      const normalized = xs => xs.map(p => names[p.toLowerCase()] || p.toLowerCase()).sort();
      assert.deepEqual(normalized(roster), normalized(field.teams[i].roster));
    }
    const r = played[a];
    assert.equal(r, played[b]);
    assert.equal(wins[a], wins[b]);
    assert.equal(game.bo, CS.bestOf(wins[a], r - wins[a]));
    assert.ok(game.y === 0 || game.y === 1);
    const pair = game.y ? [a,b] : [b,a];
    rounds[r].push(pair);
    wins[pair[0]]++;
    played[a]++;
    played[b]++;
  }
  assert.deepEqual(rounds.map(r => r.length), [8,8,8,6,3]);
  const replay = CS.replay(rounds);
  assert.equal(replay.ok, true);
  assert.equal(replay.matched, 33);
  return {rounds, actual:replay.actual, records:replay.records};
}
function forStage(parent, field) {
  return {makeForecast:() => forecastFor(parent,field), readOutcomes:() => outcomesFor(parent,field)};
}
module.exports = {...forStage('copenhagen', require('./field.json')), forStage};
