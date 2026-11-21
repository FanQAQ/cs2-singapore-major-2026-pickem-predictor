/* Stage-specific gradient boosting with mirrored inputs and probabilities. */
(() => {
  'use strict';

  function raw(trees, model, values) {
    let score = 0;
    for (const tree of trees) {
      let node = tree;
      while (Array.isArray(node))
        node = values[node[0]] <= node[1] ? node[2] : node[3];
      score += model.rate * node;
    }
    return 1 / (1 + Math.exp(-score));
  }

  function pooled(model, mask, features) {
    const trees = model?.masks[mask];
    if (!trees) throw Error('此届缺少对应特征的提升树');
    // scikit-learn casts inputs to float32 when traversing its fitted trees.
    const x = features.map(Math.fround);
    return (raw(trees,model,x) + 1 - raw(trees,model,x.map(v => -v))) / 2;
  }

  function probability(event, flags, points, i, j) {
    if (i === j) return 0.5;
    const a = event.teams[i], b = event.teams[j];
    const mask = Number(!!flags.form) + 2*Number(!!flags.strong) + 4*Number(!!flags.weak);
    const p = pooled(event.boostModel, mask, [
      (points[i]-points[j])/100, a.form-b.form, a.strong-b.strong, a.weak-b.weak
    ]);
    if (!flags.rolling || !event.rollingModel) return p;
    // Only the lineup residual is added: the boost already models VRS and form.
    const model = event.rollingModel;
    const shift = model.masks[mask][4] *
      (PickRolling.lineupValue(model,a)-PickRolling.lineupValue(model,b));
    return 1/(1+Math.exp(-(Math.log(p/(1-p)) + shift)));
  }

  globalThis.PickBoost = {probability, pooled};
})();
