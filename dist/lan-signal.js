/* Recent offline results, matched to this head-to-head's expected difficulty and format. */
(() => {
  'use strict';
  function key(roster) {
    return Array.isArray(roster) && roster.length === 5
      ? roster.map(name => name.normalize('NFKC').trim().toLowerCase()).sort().join('|') : null;
  }
  function estimate(row, probability, bestOf) {
    if (row.n < 2) return 0;
    let residual = 0, information = 2;
    for (const [format, prior, won, recency] of row.observations) {
      const distance = (prior - probability) / .18;
      const weight = recency * Math.exp(-.5 * distance * distance) * (format === bestOf ? 1 : .35);
      residual += weight * (won-prior);
      information += weight * prior * (1-prior);
    }
    return residual/information;
  }
  function adjust(event, i, j, p, bestOf) {
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('基础胜率应在 0–1 之间');
    if (p === 0 || p === 1 || (bestOf !== 1 && bestOf !== 3)) return p;
    const model = event?.lanSignal;
    if (!model?.asOf || !model.stageStart || model.asOf >= model.stageStart ||
        model.stageStart !== event.date?.slice(0,10) || !Number.isFinite(model.weight) || !model.weight) return p;
    const left = event.teams?.[i], right = event.teams?.[j];
    const a = model.teams[left?.name], b = model.teams[right?.name];
    if (!a || !b || !key(a.roster) || !key(b.roster) ||
        key(left.roster) !== key(a.roster) || key(right.roster) !== key(b.roster)) return p;
    const diff = estimate(a, p, bestOf) - estimate(b, 1-p, bestOf);
    const delta = Math.max(-.45, Math.min(.45, model.weight * diff));
    return delta === 0 ? p : 1/(1+((1-p)/p)*Math.exp(-delta));
  }
  globalThis.PickLanSignal = {adjust};
})();
