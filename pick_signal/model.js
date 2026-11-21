(function(root) {
  'use strict';
  function adjust(event, i, j, p, bestOf) {
    const model = event.pickSignal;
    if (bestOf !== 3 || !model || !model.coefficient || i === j || p <= 0 || p >= 1) return p;
    const a = model.teams[event.teams[i].name];
    const b = model.teams[event.teams[j].name];
    if (!a?.comparableMaps || !b?.comparableMaps) return p;
    const shift = model.coefficient * (a.value - b.value);
    if (!shift) return p;
    return 1 / (1 + ((1 - p) / p) * Math.exp(-shift));
  }
  root.PickSignal = {adjust};
})(globalThis);
