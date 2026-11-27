'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {load, scoreResults} = require('../external_forecasts/score.cjs');
const {readResults} = require('../stage_goals/prospective.cjs');
const root = path.join(__dirname, '..');
const output = path.join(root, 'dist');
const files = path.join(output, 'forecasts');
const official = path.join(root, 'forecast_archive/prospective/results/singapore-2026-stage1.json');
const forecastPath = path.join(root, 'singapore_stage2/forecast.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const frozen = load();
const start = require('../stage_goals/singapore-schedule.json').stages[0].firstMatchScheduledUtc;
const results = readResults(official, 'singapore-2026', 1, start, 'mixed', frozen.teams);
const rawResults = require('../forecast_archive/prospective/results/pgl-stage1-2026-11-27.json');
const aliases = {'Imperial Esports':'Imperial', '9z Globant':'9z', 'Lynn Vision Gaming':'Lynn Vision',
  'Team Liquid':'Liquid', PVISION:'PARIVISION', 'FaZe Clan':'FaZe'};
const canonical = name => aliases[name] || name;
assert.equal(rawResults.length, 33);
const seriesKey = (round, winner, loser, bestOf) => JSON.stringify([round,winner,loser,bestOf]);
const seen = rawResults.map(match => {
  const {round, format, status, leftScore, rightScore} = match;
  assert.equal(status, 'end');
  const bestOf = Number(format.slice(2));
  assert.equal(Math.max(leftScore, rightScore), Math.ceil(bestOf/2));
  const [a,b] = [match.leftTeam, match.rightTeam].map(canonical);
  const roundNumber = round.startsWith('opening') ? 1 : Number(/^round (\d+)/.exec(round)[1]);
  return seriesKey(roundNumber,leftScore>rightScore?a:b,leftScore>rightScore?b:a,bestOf);
});
const expected = require(official).rounds.flatMap((round,i) =>
  round.map(g => seriesKey(i+1,g.winner,g.loser,g.bestOf)));
assert.deepEqual(seen.sort(), expected.sort(), 'Stored round winners differ from the organizer');
const rounds = results.rounds.map(r => r.map(pair => pair.map(i => frozen.teams[i])));
const report = scoreResults(frozen, {
  stage: 'pgl-singapore-2026-stage-1', source: results.verified.url, rounds
});
const records = frozen.teams.map((_, i) => {
  const games = results.games;
  return games.filter(g => g.w === i).length + '-' + games.filter(g => g.l === i).length;
});
const history = require('../stage_goals/rolling.cjs').build(path.join(root, 'forecast_archive/prospective'));
const stage1 = {teams: frozen.teams, records, cardA: frozen.currentCard, cardB: frozen.challengerCard,
  source: results.verified.url, confirmedBy: results.verified.publishedAt,
  officialWindows: history.windows, prospectiveStages: history.records.filter(r => r.edition === 'singapore-2026')};
const raw = fs.readFileSync(forecastPath);
assert(raw.equals(fs.readFileSync(path.join(root, 'forecast_archive/singapore-stage2-2026-11-27.json'))),
  'Research and scoring copies of the Stage 2 forecast differ');
const stage2 = JSON.parse(raw);
const names = stage2.teams.map(t => t.name);
assert.equal(new Set(names).size, 16);
const openers = require('../singapore_stage2/openers.json').matches;
assert.equal(openers.length, 8);
for (const [i, game] of openers.entries()) {
  assert.deepEqual(game.seeds, [i+1, i+9]);
  assert.deepEqual(game.teams, [names[i], names[i+8]]);
}
assert.equal(Math.min(...openers.map(g => Date.parse(g.scheduledStart))), Date.parse(stage2.startsAt));
assert.deepEqual(names.slice(8).sort(), frozen.teams.filter((_, i) => records[i].startsWith('3-')).sort());
assert(Date.parse(stage2.sealedAt) < Date.parse(stage2.startsAt));
assert(Date.parse(results.endAt) <= Date.parse(stage2.sealedAt));
for (const key of ['card', 'baseCard']) {
  assert.deepEqual([0,1,2,3].map(i => stage2[key].filter(v => v === i).length), [2,6,2,6]);
}
assert.equal(stage2.probabilities.length, 16);
for (const row of stage2.probabilities) {
  assert(row.length === 4 && row.every(x => Number.isFinite(x) && x >= 0 && x <= 1));
  assert(Math.abs(row.reduce((a,b) => a+b, 0)-1) < 1e-6);
}
for (const key of ['bo1', 'bo3']) {
  const m = stage2.matrix[key];
  assert.equal(m.length, 16);
  m.forEach((row, i) => {
    assert.equal(row.length, 16);
    row.forEach((p, j) => assert(p > 0 && p < 1 && Math.abs(p+m[j][i]-1) < 1e-6));
  });
}
fs.mkdirSync(files, {recursive:true});
fs.writeFileSync(path.join(files, 'singapore-stage1-results-2026-11-27.json'),
  JSON.stringify({teams:stage1.teams, records, cardA:stage1.cardA, cardB:stage1.cardB,
    source:stage1.source, confirmedBy:stage1.confirmedBy, rounds, report}, null, 2)+'\n');
fs.copyFileSync(forecastPath, path.join(files, 'singapore-stage2-2026-11-27.json'));
fs.writeFileSync(path.join(output, 'singapore-live-data.js'),
  'globalThis.SingaporeLiveData='+JSON.stringify({stage1, stage2})+';\n');
console.log('Verified '+report.verifiedPairings+' Stage 1 matches; Stage 2 forecast SHA-256 '+sha(raw));
