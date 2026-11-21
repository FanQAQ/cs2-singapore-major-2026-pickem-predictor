'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const verified = require('../external_forecasts/score.cjs');

function score(input) {
  const text = fs.readFileSync(path.join(__dirname, 'singapore.json'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(crypto.createHash('sha256').update(text).digest('hex'),
    '0e7f084c9e2ebd90bdbf87a84b57ee5680da8711c82db504c21dfbb2ffa97ac5');
  const frozen = JSON.parse(text).rows[0];
  const data = verified.load();
  const checked = verified.scoreResults(data, input);
  assert.deepEqual(frozen.teams, data.teams);
  assert.deepEqual(frozen.results.released.card, data.currentCard);
  const rounds = input.rounds.map(round => round.map(pair => pair.map(data.index)));
  const actual = CS.replay(rounds).actual;
  const exhaustive = frozen.results.all;
  const cards = {released: data.currentCard, searchFirst: exhaustive.top[0].card,
    searchRechecked: exhaustive.top[exhaustive.selected].card};
  const scored = Object.fromEntries(Object.entries(cards).map(([key,card]) => {
    const hits = CS.actualScore(card, actual);
    const groups = ['3-0','3-1 / 3-2','0-3'].map((slot,c) => ({
      slot, hitTeams: data.teams.filter((_,i) => card[i]===c && actual[i]===c)
    }));
    return [key,{hits,passed: hits>=5,groups}];
  }));
  assert.equal(scored.released.hits, checked.completedStage.recommended.hits);
  return {stage: input.stage, source: checked.source, verifiedPairings: checked.verifiedPairings, cards: scored};
}

if (require.main === module) {
  try {
    assert.equal(process.argv.length, 3, 'Usage: node f1bre_card/score.cjs verified-results.json');
    const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    console.log(JSON.stringify(score(input), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {score};
