// Generate the card before reading this stage's results.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {budget, productionSeed, matrixHash, cardScore, rounded} = require('../integrated_eval/runtime.cjs');
function checkBaseline(fixture, directory) {
  const {makeForecast, readOutcomes} = fixture;
  const {event, flags, matrix} = makeForecast();
  const sim = PickLab.simulateMatrices(matrix, flags, budget, productionSeed);
  const {rounds, actual, records} = readOutcomes();
  const wins = Array(16).fill(0), losses = Array(16).fill(0);
  const games = rounds.flatMap((rd, r) => rd.map(([a,b]) => {
    const bo = CS.bestOf(wins[a], losses[a]);
    const p = matrix['bo'+bo][a][b];
    wins[a]++;
    losses[b]++;
    return {round:r+1, bestOf:bo, winner:event.teams[a].name, loser:event.teams[b].name, winnerProbability:p};
  }));
  const mean = x => x.reduce((a,b) => a+b, 0)/x.length;
  function errors(bo) {
    const probs = games.filter(g => g.bestOf === bo).map(g => g.winnerProbability);
    return {n: probs.length, brier:rounded(mean(probs.map(p => (1-p)**2))),
      logLoss:rounded(mean(probs.map(p => -Math.log(p))))};
  }
  const report = {
    id:event.id, strengthAsOf:event.asOf, stageStart:event.date, matrixSha256:matrixHash(matrix),
    seed:productionSeed, searchPaths:sim.searchN, evaluationPaths:sim.evalN,
    score:cardScore(sim.card, actual), bo1:errors(1), bo3:errors(3),
    teams:event.teams.map((t,i) => ({seed:t.seed, team:t.name, card:sim.card[i], record:records[i]})),
    games
  };
  const dest = path.join(directory,'baseline.json');
  if (process.argv.includes('--write')) fs.writeFileSync(dest, JSON.stringify(report,null,2)+'\n');
  else assert.deepEqual(JSON.parse(fs.readFileSync(dest,'utf8')),report);
  console.log(JSON.stringify({score:report.score, bo1:report.bo1, bo3:report.bo3}));
}
module.exports = {checkBaseline};
if (require.main === module) checkBaseline(require('./fixture.cjs'), __dirname);
