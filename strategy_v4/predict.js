/* Paired logistic prediction from the two stage rosters' frozen observations. */
(() => {
  'use strict';
  const preset = Object.freeze({family:'v4', form:true, strong:true, weak:true,
    roundMargin:true, format:true, shrinkBO:true});

  function probability(event, flags, points, i, j) {
    const model = event.v4Model;
    const mask = Number(!!flags.form) + 2*Number(!!flags.strong) +
      4*Number(!!flags.weak) + 8*Number(!!flags.roundMargin);
    const beta = model?.masks[mask]?.beta;
    if (!beta) throw Error('缺少该届所选特征的赛前胜率模型');
    const a = model.teams[event.teams[i].name], b = model.teams[event.teams[j].name];
    if (!a || !b) throw Error('缺少该届首发阵容的特征记录');
    const gap = (points[i] - points[j]) / 100;
    const favorite = 1 / (1 + Math.exp(-model.calibrationSlope * gap));
    const underdog = 1 - favorite;
    const margin = a.nRound > 0 && b.nRound > 0 ? a.round - b.round : 0;
    const score = beta[0] * gap + beta[1] * (a.form - b.form)
      + beta[2] * (underdog * a.strong - favorite * b.strong)
      + beta[3] * (favorite * a.weak - underdog * b.weak)
      + beta[4] * margin;
    return 1 / (1 + Math.exp(-score));
  }
  globalThis.PickV4 = {preset, probability};
})();
