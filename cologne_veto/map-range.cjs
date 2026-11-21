'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {info} = require('../stage3_maps/evaluate.cjs');
const id = 'cologne-2026-3';
const profile = require('../stage3_maps/profiles.json')[id];
const field = info(id);
const pool = profile.mapStrength.pool;
assert.deepEqual(field.teams, profile.teams);
assert.equal(field.start, profile.start);
assert(profile.asOf < field.start);
assert.equal(new Set(pool).size, 7);
const event = {...profile, teams: field.teams.map(name => ({name}))};
const triples = [];
for (let a = 0; a < 5; a++) {
  for (let b = a + 1; b < 6; b++) {
    for (let c = b + 1; c < 7; c++) triples.push([a, b, c]);
  }
}
const rounded = value => Number(value.toFixed(8));
function series([i, j, k], mapWins) {
  const [a, b, c] = [mapWins[i], mapWins[j], mapWins[k]];
  return a * b + ((1 - a) * b + a * (1 - b)) * c;
}
function forecast(i, j) {
  const base = field.matrix.bo3[i][j];
  assert(Math.abs(1 - base - field.matrix.bo3[j][i]) < 1e-10);
  const [a, b] = [field.teams[i], field.teams[j]];
  const offsets = pool.map(name => {
    const [x, y] = [a, b].map(t => profile.mapStrength.teams[t].maps[name]);
    return x.n && y.n ? Math.max(-0.7, Math.min(0.7, x.logitOffset - y.logitOffset)) : 0;
  });
  const wins = intercept => offsets.map(off => 1 / (1 + Math.exp(-intercept - off)));
  const average = probabilities => triples.reduce((sum, t) => sum + series(t, probabilities), 0) / triples.length;
  let lo = -44, hi = 44;
  for (let n = 0; n < 46; n++) {
    const mid = (lo + hi) / 2;
    if (average(wins(mid)) < base) lo = mid;
    else hi = mid;
  }
  const mapWins = wins((lo + hi) / 2);
  assert(Math.abs(average(mapWins) - base) < 1e-10);
  const existing = PickMap.apply(event, i, j, 3, base);
  for (const m of existing.maps) assert(Math.abs(m.mapWin - mapWins[pool.indexOf(m.name)]) < 1e-10);
  const ordered = triples.map(t => ({p: rounded(series(t, mapWins)), maps: t.map(k => pool[k])}))
    .sort((x, y) => x.p - y.p);
  const min = ordered[0], max = ordered.at(-1);
  assert(existing.probability >= min.p - 1e-8 && existing.probability <= max.p + 1e-8);
  return {a, b, base: rounded(base), min, max, crossCheckedMaps: existing.maps.length};
}
const pairs = [];
for (let i = 0; i < field.teams.length; i++) {
  for (let j = i + 1; j < field.teams.length; j++) pairs.push(forecast(i, j));
}
assert.equal(pairs.length, 120);
// Outcomes are consulted only after the full field has been evaluated.
const historical = require('../stage3_maps/report.json').stages.find(s => s.id === id);
const games = historical.matches.map(g => {
  assert.equal(g.bo, 3);
  const winner = field.teams[g.w], loser = field.teams[g.l];
  const firstWon = g.w < g.l;
  const row = pairs.find(r => r.a === (firstWon ? winner : loser) && r.b === (firstWon ? loser : winner));
  const asWinner = p => firstWon ? p : rounded(1 - p);
  assert(Math.abs(asWinner(row.base) - g.winProbability.base) < 1e-7);
  return {id: g.id, winner, loser, base: asWinner(row.base),
    min: asWinner(firstWon ? row.min.p : row.max.p), max: asWinner(firstWon ? row.max.p : row.min.p)};
});
assert.equal(new Set(games.map(g => g.id)).size, 33);
assert.equal(games.length, 33);
const upset = games.filter(g => g.base < 0.5);
const summary = {
  potentialPairs: pairs.length, triplesPerPair: triples.length,
  verifiedAgainstEngine: pairs.filter(r => r.crossCheckedMaps === 7).length,
  potentialEitherFavorite: pairs.filter(r => r.min.p < 0.5 && r.max.p > 0.5).length,
  games: games.length, playedEitherFavorite: games.filter(r => r.min < 0.5 && r.max > 0.5).length,
  upsets: upset.length, alwaysUnderdog: upset.filter(g => g.max < 0.5).length
};
const result = {id, asOf: profile.asOf, start: field.start, summary, games, pairs};
const file = path.join(__dirname, 'map-range.json');
if (process.argv.includes('--check')) assert.deepEqual(result, JSON.parse(fs.readFileSync(file, 'utf8')));
else fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(summary));
