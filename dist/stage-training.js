/* Rescale log odds around 50% with a family-specific, pre-Major temperature. */
(() => {
  'use strict';
  function apply(event, flags, probability, bestOf) {
    if (!flags.stageTraining || (flags.family !== 'v4' && flags.family !== 'boost')) return probability;
    const method = flags.family === 'boost' ? 'tree' : 'recommended';
    const key = flags.format === false ? 'pooled' : 'bo' + bestOf;
    const slope = event.stageTraining?.[method]?.[key] ?? 1;
    if (slope === 1 || probability === 0.5) return probability;
    return 1 / (1 + Math.exp(-slope * Math.log(probability / (1 - probability))));
  }
  globalThis.PickStageTraining = {apply};
})();
