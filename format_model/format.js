/* A positive team tilt means a stronger BO3 result relative to its BO1.
 * The input probability is the pooled series model, not a per-map win chance. */
(() => {
  'use strict';
  function probability(event, teamAIndex, teamBIndex, baseProbability, bestOf) {
    if (bestOf !== 1 && bestOf !== 3) throw new RangeError('bestOf must be 1 or 3');
    const data = event.formatModel;
    if (!data) return baseProbability;
    if (baseProbability <= 0 || baseProbability >= 1) return baseProbability;
    const formatKey = bestOf === 3 ? 'bo3' : 'bo1';
    const teamA = data.teams[event.teams[teamAIndex].name];
    const teamB = data.teams[event.teams[teamBIndex].name];
    const relativeFormat = Number(bestOf === 3) - data.shareBO3;
    const teamOffset = relativeFormat * ((teamA?.tilt ?? 0) - (teamB?.tilt ?? 0));
    const logOdds = Math.log(baseProbability / (1 - baseProbability));
    return 1 / (1 + Math.exp(-(data.scale[formatKey] * logOdds + teamOffset)));
  }
  globalThis.PickFormat = {probability};
})();
