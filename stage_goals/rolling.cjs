'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const {publicRecords} = require('./public-records.cjs');
const catalog = require('./tracked-majors.json');
const legacy = require('../final_card/report.json');
const paired = require('../major_form/all_stages.json');
const stages = [1, 2, 3];
const targets = {
  1: {windowSize:5, requiredPasses:3},
  2: {windowSize:5, requiredPasses:3},
  3: {windowSize:3, requiredPasses:2}
};
const prospectiveStart = '2026-11-24';
const key = (editionStart, stage) => editionStart + '/' + stage;
const isHits = x => Number.isInteger(x) && x >= 0 && x <= 10;

function completedMatches(editions, baselines, asOf = new Date().toISOString().slice(0,10)) {
  const rows = [];
  for (const e of Object.values(editions)) {
    for (const stage of stages) {
      const games = e.matches.filter(g => g.stage === stage);
      if (!games.length) continue;
      assert.equal(new Set(games.map(g => g.id)).size, games.length, 'Duplicate matches: ' + e.id);
      assert(games.every(g => (g.y === 0 || g.y === 1) && e.start <= g.day && g.day <= e.end && g.day <= asOf),
        'Score missing or match outside the known dates: ' + e.id);
      if (games.length < 33) {
        assert(e.end >= asOf, 'Incomplete stage in a finished Major: '+e.id+'/'+stage);
        continue;
      }
      assert.equal(games.length, 33);
      const start = games.map(g => g.day).sort()[0];
      const item = {label:e.label, editionStart:e.start, stage, start, provenance:'unscored', hits:null};
      if (e.start < prospectiveStart) {
        const source = baselines.find(s => s.edition === e.id && s.stage === stage);
        assert.equal(source?.date, start, 'Missing historical default for ' + e.id + '/' + stage);
        const card = source.results.current.card;
        assert.deepEqual([0,1,2,3].map(k => card.filter(c => c === k).length), [2,6,2,6]);
        const hits = card.filter((v,i) => v < 3 && source.actual[i] === v).length;
        assert.equal(hits, source.results.current.hits[0]);
        Object.assign(item, {provenance:'replay', hits});
      }
      rows.push(item);
    }
  }
  return rows;
}

function rolling(official, sealed) {
  const played = new Map(), registered = new Set(), pending = [];
  for (const r of official) {
    const id = key(r.editionStart,r.stage);
    assert(!played.has(id) && stages.includes(r.stage));
    assert(r.provenance === 'unscored' ? r.hits === null : r.provenance === 'replay' && isHits(r.hits));
    played.set(id,r);
  }
  for (const {major, entries} of sealed) {
    for (const e of entries) {
      assert.equal(e.edition,major.edition); assert.equal(e.editionStart,major.start);
      assert(stages.includes(e.stage) && e.stageStart >= major.start);
      const id = key(major.start,e.stage);
      assert(!registered.has(id), 'Duplicate forecast for the same edition and stage');
      registered.add(id);
      assert.equal(e.cards.filter(c => c.id === 'recommended').length,1);
      const card = e.cards.find(c => c.id === 'recommended');
      const prior = played.get(id);
      if (prior) assert.equal(prior.start,e.stageStart);
      if (!e.source) {
        assert.equal(card.hits,null);
        if (!prior) pending.push({label:major.label, stage:e.stage, start:e.stageStart});
        continue;
      }
      const url = new URL(e.source.url);
      assert(url.protocol === 'https:' && major.resultsHosts.some(h => url.hostname === h || url.hostname.endsWith('.'+h)));
      assert(isHits(card.hits)); assert.match(card.sha256,/^[0-9a-f]{64}$/);
      played.set(id,{label:major.label, editionStart:major.start, start:e.stageStart, stage:e.stage,
        provenance:'sealed', hits:card.hits, sourceUrl:e.source.url, webFile:card.webFile, sha256:card.sha256});
    }
  }
  return stages.map(stage => {
    const {windowSize,requiredPasses} = targets[stage];
    const rows = [...played.values()].filter(r => r.stage === stage).sort((a,b) => b.start.localeCompare(a.start)).slice(0,windowSize);
    const scored = rows.filter(r => isHits(r.hits));
    const passes = scored.filter(r => r.hits >= 5).length;
    return {stage, windowSize, requiredPasses, rows, scored:scored.length, passes, hits:scored.reduce((s,r) => s+r.hits,0),
      attained:scored.length === windowSize && passes >= requiredPasses,
      pending:pending.filter(r => r.stage === stage).sort((a,b) => a.start.localeCompare(b.start))};
  });
}

function build(dir) {
  assert.equal(new Set(catalog.map(m => m.edition)).size,catalog.length);
  assert.equal(new Set(catalog.map(m => m.start)).size,catalog.length);
  const sealed = catalog.map(major => ({major, entries:publicRecords(major.edition,dir)}));
  return {records:sealed.flatMap(s => s.entries),
    windows:rolling(completedMatches(paired.editions, legacy.stages),sealed)};
}
module.exports = {build, rolling, completedMatches};
if (require.main === module) console.log(JSON.stringify(build(path.join(__dirname,'../forecast_archive/prospective'))));
