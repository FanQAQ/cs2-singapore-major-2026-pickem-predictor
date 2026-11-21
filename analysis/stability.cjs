/* Assess sampling noise in the original 6,000-trial optimizer at fixed matchup odds.
   Compare 6,000 and 24,000 trials using the same seeds and a shared holdout.
   Run from the repository with: node analysis/stability.cjs
   The held-out model draws represent simulated tournaments, not observed Majors. */
"use strict";
const assert = require("node:assert/strict");
for (const file of ["engine","format","style-model","data","adapter"]) {
  require("../dist/"+file+".js");
}

const runs = 30;
const budgets = [6000,24000];
const evaluationTrials = 120000; // Engine scores externally supplied cards on the second half.
const productionSeed = 33719;
const flags = {form:true, strong:true, weak:true, format:true};
const seedCard = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
const seeds = Array.from({length:runs}, (_,i) => (productionSeed + i * 0x9E3779B1) >>> 0);
const evaluationSeed = 0x654321BA;
const mean = numbers => numbers.reduce((sum,n) => sum+n, 0)/numbers.length;
const round = n => Number(n.toFixed(5));

function commonSlots(a,b) {
  return a.reduce((n,category,i) => n+Number(category<3 && category===b[i]),0);
}

function getHitParts(card, truth) {
  return [0,1,2].map(category => card.reduce((n,c,i) => n+Number(c===category && truth[i]===category),0));
}

function hist(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value]||0)+1;
  return counts;
}

function experiment(event) {
  const odds = PickLab.seriesMatrices(event,flags);
  const reference = CS.run(odds,evaluationTrials,evaluationSeed);
  assert.equal(reference.evalN,60000);
  const truth = event.hasResults ? CS.replay(event.rounds).actual : null;
  const scoreTruth = card => truth ? CS.actualScore(card,truth) : null;
  const seedScore = reference.score(seedCard);
  const experiments = budgets.map(n => ({
    trials:n,
    ...summarizeRuns(seeds.map(seed => CS.run(odds,n,seed).card), reference, truth)
  }));
  return {event:event.id, seedCard:{actual:scoreTruth(seedCard), modelPass:round(seedScore.pass),
    expectedHits:round(seedScore.expected)}, experiments};
}

function summarizeRuns(cards, reference, truth) {
  const scores = cards.map(card => reference.score(card));
  const scoreTruth = card => CS.actualScore(card,truth);
  const sharedSlots = [];
  for (let i=1; i<cards.length; i++) {
    for (let j=0; j<i; j++) sharedSlots.push(commonSlots(cards[i],cards[j]));
  }
  const observed = truth ? {
    playedCard:scoreTruth(cards[0]), byCategory:getHitParts(cards[0],truth),
    histogram:hist(cards.map(scoreTruth))
  } : null;
  const pass = scores.map(s => s.pass);
  return {
    distinctCards:new Set(cards.map(c=>c.join(""))).size,
    commonSlotsMean:round(mean(sharedSlots)), commonSlotsRange:[Math.min(...sharedSlots),Math.max(...sharedSlots)],
    observed,
    model: {
      productionSeedCardPass:round(pass[0]),
      repeatedCardPassRange:[round(Math.min(...pass)),round(Math.max(...pass))], repeatedCardPassMean:round(mean(pass)),
      productionSeedExpectedHits:round(scores[0].expected)
    }
  };
}

console.log(JSON.stringify({runs,productionSeed,totalTrialBudgets:budgets,validationN:evaluationTrials/2,
  rows:PickLab.events.map(experiment)},null,2));
