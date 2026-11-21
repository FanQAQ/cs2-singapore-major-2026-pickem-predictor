/* A bounded Stage 1 search audit. Reuse production paths and scoring, including its tiebreak. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {v4, budget, productionSeed} = require('../strategy_v4_eval/settings.cjs');

const extraStarts = 24;
const testSeedXor = 0xc5398da1; // CS.run derives its evaluation stream this way.
const startSeed = 0x73bb145d; // Fixed before evaluating; shared across all five events.
const snapshot = path.join(__dirname, 'report.json');

function makeStarts(count) {
  let state = startSeed;
  const starts = [];
  for (let k=0; k<count; k++) {
    const card = [0,0,1,1,1,1,1,1,2,2,3,3,3,3,3,3];
    for (let i=card.length-1; i>0; i--) {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      const j = Math.floor((state / 2**32) * (i+1));
      [card[i],card[j]] = [card[j],card[i]];
    }
    starts.push(card);
  }
  return starts;
}

function expandSearch(trainingScore, initial, starts) {
  const cache = new Map();
  const value = card => {
    const key = card.join('');
    if (!cache.has(key)) {
      const {n,pass,expected} = trainingScore(card);
      const passCount = Math.round(pass*n), hits = Math.round(expected*n);
      cache.set(key, passCount*(n*10+1) + hits);
    }
    return cache.get(key);
  };
  let best = initial.slice();
  let highest = value(best);
  for (const start of starts) {
    let card = start.slice();
    let score = value(card);
    for (;;) {
      let candidate = null, next = score;
      for (let i=0; i<card.length-1; i++) {
        for (let j=i+1; j<card.length; j++) {
          if (card[i]===card[j]) continue;
          const neighbor = card.slice();
          [neighbor[i],neighbor[j]] = [neighbor[j],neighbor[i]];
          const rank = value(neighbor);
          if (rank>next) {next = rank; candidate = neighbor;}
        }
      }
      if (!candidate) break;
      score=next;
      card=candidate;
    }
    if (score > highest) {highest=score; best=card;}
  }
  return {card:best,visited:cache.size};
}

const round = n => Number(n.toFixed(7));
function evaluate(event) {
  const matrices = PickLab.seriesMatrices(event,v4);
  const baseline = CS.run(matrices,budget,productionSeed);
  // XOR is an involution, so scoring from this second run sees exactly the
  // first run's TRAIN stream. It can never see the original TEST stream.
  const trainingScore = CS.run(matrices,budget,(productionSeed ^ testSeedXor)>>>0).score;
  const {card,visited} = expandSearch(trainingScore,baseline.card,makeStarts(extraStarts));
  const priorTraining=trainingScore(baseline.card);
  const extendedTraining=trainingScore(card);
  assert.ok(extendedTraining.pass>=priorTraining.pass);
  // Only after freezing both cards, access the original evaluation stream and observed result.
  const joint=baseline.compareCards(baseline.card,card);
  const actual=CS.replay(event.rounds);
  assert.ok(actual.ok && actual.matched===33);
  const out = (choice,train,test) => ({
    card:choice.join(''),trainPass:round(train.pass),testPass:round(test.pass),
    actualHits:CS.actualScore(choice,actual.actual),
  });
  const original = out(baseline.card,priorTraining,joint.original);
  const expanded = out(card,extendedTraining,joint.swapped);
  assert.equal(original.actualHits, event.historyPresets.v4.model);
  return {event:event.id,uniqueExtraSearchCards:visited,original,expanded,
    holdoutOnlyOriginal:joint.originalOnly,holdoutOnlyExpanded:joint.swappedOnly};
}

function aggregate(rows, which) {
  const n=rows.length;
  const sum=key=>rows.reduce((s,r)=>s+r[which][key],0);
  return {meanTrainPass:round(sum('trainPass')/n),meanTestPass:round(sum('testPass')/n),
    actualHits:sum('actualHits'),actualPasses:rows.filter(r=>r[which].actualHits>=5).length};
}

const events=PickLab.events.filter(e=>e.hasResults).sort((a,b)=>a.date.localeCompare(b.date));
assert.equal(events.length,5);
const rows=events.map(event=>{
  const start=performance.now();
  const row=evaluate(event);
  console.log(event.id,row.original.actualHits,row.expanded.actualHits,row.uniqueExtraSearchCards,
              ((performance.now()-start)/1000).toFixed(1)+'s');
  return row;
});
const report={budget,productionSeed,extraStarts,startSeed,rows,
  original:aggregate(rows,'original'),expanded:aggregate(rows,'expanded')};
const content=JSON.stringify(report,null,2)+'\n';
if (process.argv.includes('--check')) assert.equal(fs.readFileSync(snapshot,'utf8'),content);
else fs.writeFileSync(snapshot,content);
console.log(JSON.stringify({original:report.original,expanded:report.expanded}));
