'use strict';
const assert = require('node:assert/strict');
const {getField, matrices, truth, errors, cardScore} = require('./evaluate.cjs');
const {seeds} = require('../strategy_v4_eval/settings.cjs');
const {samples} = require('../ml_allocation/draw.cjs');
const {audit} = require('./format_split/pooled.cjs');
const trainingPaths = 2000, auditPaths = 4000;
const pilotSeeds = seeds.slice(0, 3);

const popcount = new Uint8Array(65536);
for(let i=1; i<popcount.length; i++) popcount[i] = popcount[i >>> 1] + (i & 1);

function passFraction(card, outcomes) {
  const masks = [0,0,0];
  card.forEach((category,i) => { if(category < 3) masks[category] |= 1 << i; });
  let passed = 0;
  for(let i=0; i<outcomes.length; i+=3) {
    const hits = masks.reduce((sum,m,j) => sum + popcount[m & outcomes[i+j]], 0);
    if(hits >= 5) passed++;
  }
  return passed / (outcomes.length/3);
}

function screen(field, arms, actual=null, matches=[]) {
  const cache = new Map(), methods = {};
  for(const [name, odds] of Object.entries(arms)) {
    const key = JSON.stringify([odds.allBo3 ? null : odds.bo1, odds.bo3, !!odds.allBo3, odds.state]);
    if(!cache.has(key)) {
      const runs = pilotSeeds.map(seed => {
        const train = samples(field, odds, trainingPaths, seed, 'major');
        const card = CS.cardsFromSamples(train, true).card;
        const paths = CS.sampleTerminalMasks(odds, auditPaths, audit(seed));
        return {seed, card, observed:cardScore(card,actual), auditPass:passFraction(card,paths)};
      });
      cache.set(key, runs);
    }
    const error = bo => errors(matches.filter(m=>m.bo===bo).map(m=>odds['bo'+bo][m.w][m.l]));
    methods[name] = {runs:cache.get(key), bo1:error(1), bo3:error(3)};
  }
  return {id:field.id, trainingPaths, auditPaths, seeds:pilotSeeds, distinctMatrices:cache.size, methods};
}

function historical(id) {
  const field = getField(id), arms = matrices(field,['elo','ml']);
  arms.hybrid = {...arms.ml, bo1:arms.elo.bo1};
  const observed = truth(id,field.teams.map(t=>t.name));
  return screen(field, arms, observed?.actual, observed?.matches);
}

function cli(args) {
  const ids = args.length ? args : ['austin-2025-3','budapest-2025-3','cologne-2026-3'];
  assert(ids.every(id=>!id.startsWith('-')), 'Use event IDs, --full or --check');
  for(const id of ids) {
    const result = historical(id);
    console.log(JSON.stringify(result));
  }
}
module.exports = {screen,historical,cli};
