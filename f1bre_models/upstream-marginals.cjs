'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {load} = require('./singapore.cjs');
const {confirm} = require('./upstream-audit.cjs');
const file = name => path.join(__dirname, name);
const categories = ['perfect', 'qualified', 'zero', 'advance'];
const methods = ['elo', 'ml'];
const localModels = ['baseline', 'elo', 'ml'];
const totals = {perfect: 2, qualified: 8, zero: 2, advance: 6};
const percent = (count, paths) => 100 * count / paths;

function tabulate(stream, paths) {
  assert.equal(stream.length, 3 * paths);
  const rows = Array.from({length: 16}, () => ({perfect: 0, qualified: 0, zero: 0, advance: 0}));
  for (let i = 0; i < stream.length; i += 3) {
    const [swept, advanced, eliminated] = [stream[i], stream[i + 1], stream[i + 2]];
    assert.equal((swept & advanced) | (swept & eliminated) | (advanced & eliminated), 0);
    for (let team = 0; team < rows.length; team++) {
      const mask = 1 << team;
      rows[team].perfect += Number(Boolean(swept & mask));
      rows[team].advance += Number(Boolean(advanced & mask));
      rows[team].zero += Number(Boolean(eliminated & mask));
    }
  }
  for (const row of rows) row.qualified = row.perfect + row.advance;
  for (const key of categories) {
    assert.equal(rows.reduce((sum, row) => sum + row[key], 0), totals[key] * paths);
  }
  return rows;
}

function readAuthor(sourceRows, teams) {
  assert.equal(sourceRows.length, teams.length);
  const table = new Map();
  for (const row of sourceRows) {
    assert(teams.includes(row.name) && !table.has(row.name), row.name);
    const rates = {};
    for (const key of categories) {
      assert(/^\d+\.\d{4}$/u.test(row[key]), row.name + ' ' + key);
      rates[key] = Number(row[key]);
      assert(rates[key] >= 0 && rates[key] <= 100);
    }
    // All four percentages were rounded separately to four decimals.
    assert(Math.abs(rates.perfect + rates.advance - rates.qualified) < 0.00016);
    table.set(row.name, rates);
  }
  for (const key of categories) {
    const sum = [...table.values()].reduce((s, r) => s + r[key], 0);
    assert(Math.abs(sum - 100 * totals[key]) < 16 * 0.00005001);
  }
  return table;
}

function topTwo(rows, method, key, paths) {
  // Work in integer units so decimal source rounding cannot produce spurious tie breaks.
  const difference = r => Math.round(r.authors[method][key] * 10000) * paths -
    r.localCounts.baseline[key] * 1000000;
  return rows.slice().sort((a, b) => Math.abs(difference(b)) - Math.abs(difference(a)) || a.seed - b.seed)
    .slice(0, 2).map(row => ({
      seed: row.seed, name: row.name, sourcePercent: row.authors[method][key],
      baselinePercent: row.local.baseline[key], deltaPp: row.gaps[method][key]
    }));
}

function run() {
  require('../engine/engine.js');
  const f = load(), teams = f.teams.map(t => t.name);
  const input = fs.readFileSync(file('upstream-marginals.json'));
  const source = JSON.parse(input.toString('utf8').replace(/^\uFEFF/, ''));
  assert.equal(source.id, 'singapore');
  assert.equal(source.stage, 1);
  assert.equal(source.units, 'percent');
  assert.equal(source.decimals, 4);
  assert.equal(f.confirmPaths, 60000);
  const tables = Object.fromEntries(methods.map(key => [key, readAuthor(source.methods[key], teams)]));
  const exact = require('./exact.json').singapore;
  const trials = {}, streams = {};
  for (const id of localModels) {
    const {stream, sha256} = confirm(f, id, exact);
    streams[id] = sha256;
    trials[id] = tabulate(stream, f.confirmPaths);
  }
  const rows = f.teams.map(({name, seed}, i) => {
    const authors = Object.fromEntries(methods.map(id => [id, tables[id].get(name)]));
    const localCounts = Object.fromEntries(localModels.map(id => [id, trials[id][i]]));
    const local = Object.fromEntries(localModels.map(id => [id, Object.fromEntries(
      categories.map(key => [key, percent(localCounts[id][key], f.confirmPaths)])
    )]));
    const gaps = Object.fromEntries(methods.map(id => [id, Object.fromEntries(
      categories.map(key => [key, authors[id][key] - local.baseline[key]])
    )]));
    return {seed, name, authors, local, localCounts, gaps};
  });
  const top = Object.fromEntries(methods.map(id => [id, {
    qualified: topTwo(rows, id, 'qualified', f.confirmPaths),
    zero: topTwo(rows, id, 'zero', f.confirmPaths)
  }]));
  return {
    edition: f.edition, stage: f.stage, source: source.source, author: source.author,
    observedAt: source.observedAt, frozenAt: f.frozenAt,
    sourceSha256: crypto.createHash('sha256').update(input).digest('hex'),
    forecastSha256: require('./singapore-forecast.json').sha256, confirmationStreams: streams,
    units: 'percent', deltaUnits: 'percentage points (author minus local baseline)',
    sourceDecimals: source.decimals, pathsPerModel: f.confirmPaths, sourceFigures: source.sourceFigures,
    top, rows
  };
}

module.exports = {run, tabulate, topTwo};
if (require.main === module) {
  const result = run();
  const bytes = JSON.stringify(result, null, 2) + '\n';
  const dest = file('upstream-gaps.json');
  if (process.argv.includes('--check')) assert.equal(fs.readFileSync(dest, 'utf8'), bytes);
  else fs.writeFileSync(dest, bytes);
  console.log('Verified the 16 teams, both primary-source tables, three frozen 60k streams and all category totals.');
}
