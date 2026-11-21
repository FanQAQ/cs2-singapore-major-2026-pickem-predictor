/* Stage-specific, directional matchup effects. All public methods index teams by seed. */
(function (root) {
  'use strict';

  const profiles = [
    { id: 'unknown', label: '未分类' },
    { id: 'duel', label: '主动接战' },
    { id: 'system', label: '体系执行' },
    { id: 'tempo', label: '临场读局' },
    { id: 'earlyContact', label: '较早交火' },
    { id: 'trade', label: '快速补枪' },
    { id: 'awp', label: '主狙击杀占比高' },
    { id: 'mixed', label: '录像指标均衡' },
    { id: 'assistHigh', label: '助攻占比较高' },
    { id: 'carry', label: '击杀较集中' },
    { id: 'spread', label: '击杀较分散' },
    { id: 'boxMiddle', label: '击杀集中度居中' }
  ];
  const pairs = [
    { a: 'duel', b: 'system', key: 'duel:system' },
    { a: 'duel', b: 'tempo', key: 'duel:tempo' },
    { a: 'system', b: 'tempo', key: 'system:tempo' },
    { a: 'earlyContact', b: 'trade', key: 'earlyContact:trade' },
    { a: 'earlyContact', b: 'awp', key: 'earlyContact:awp' },
    { a: 'trade', b: 'awp', key: 'trade:awp' }
  ];
  const empty = () => ({ assignments: {}, edges: {} });
  const logit = p => Math.log(p / (1 - p));
  const logistic = x => 1 / (1 + Math.exp(-x));

  function styleOffset(scenario, nameA, nameB) {
    const a = scenario?.assignments?.[nameA];
    const b = scenario?.assignments?.[nameB];
    if (!a || !b || a === b) return 0;
    for (const pair of pairs) {
      if (!((pair.a === a && pair.b === b) || (pair.a === b && pair.b === a))) continue;
      const value = Number(scenario.edges?.[pair.key]);
      if (!Number.isFinite(value)) return 0;
      const pp = Math.max(-15, Math.min(15, value));
      return (pair.a === a ? 1 : -1) * logit(0.5 + pp / 100);
    }
    return 0;
  }

  function shifted(p, delta) {
    if (!delta || p === 0 || p === 1) return p;
    return logistic(logit(p) + delta);
  }

  function explain(p, event, i, j, flags = {}) {
    const data = event.matchups;
    const forward = i < j;
    const key = forward ? i + ':' + j : j + ':' + i;
    const record = data?.pairs?.[key];
    const h2hN = record?.n ?? 0;
    const h2hWins = h2hN ? (forward ? record.wins : h2hN - record.wins) : 0;
    const h2hExpected = h2hN ? (forward ? record.expected : 1 - record.expected) : null;
    const residual = h2hN ? (h2hWins - h2hN * h2hExpected) / (h2hN + data.prior) : 0;
    const afterH2H = shifted(p, flags.h2h ? residual * (data?.weight || 0) : 0);
    const offset = flags.style ? styleOffset(flags.scenario, event.teams[i].name, event.teams[j].name) : 0;
    const probability = shifted(afterH2H, offset);
    return { probability, h2hN, h2hWins, h2hExpected, afterH2H, styleOffset: offset,
      stylePP: (probability - afterH2H) * 100 };
  }

  function apply(p, event, i, j, flags) {
    return explain(p, event, i, j, flags).probability;
  }

  root.PickStyle = { profiles, pairs, empty, apply, explain };
})(globalThis);
