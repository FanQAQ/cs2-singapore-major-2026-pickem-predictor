/* Build both series-win matrices once. Each simulated match then uses its own format. */
(() => {
  'use strict';
  const events = globalThis.PICK_DATA;
  const engine = globalThis.CS;
  const byId = new Map(events.map(event => [event.id, event]));

  function getEvent(id) {
    const event = byId.get(id);
    if (!event) throw Error('找不到这届赛事');
    return event;
  }

  function coefficients(event, flags) {
    const mask = Number(!!flags.form) + 2 * Number(!!flags.strong) + 4 * Number(!!flags.weak);
    return event.model.masks[mask].beta;
  }

  // Stage seed and global points can diverge when invitation dates differ.
  // Match the two scales using the actual 16-team field before blending them.
  function contextualPoints(event, flags) {
    const ratings = event.teams.map(team => {
      const fresh = event.recentRating?.teams?.[team.name];
      return flags.fresh && fresh?.overlap >= 3 && Number.isFinite(fresh.points)
        ? fresh.points : team.points;
    });
    const known = ratings.filter(Number.isFinite).sort((a,b)=>a-b);
    const mid = Math.floor(known.length/2);
    const neutral = known.length ? (known[mid]+known[Math.floor((known.length-1)/2)])/2 : 0;
    for (let i=0;i<ratings.length;i++) if(!Number.isFinite(ratings[i])) ratings[i]=neutral;
    if (!flags.seedPrior) return ratings;
    const sorted = [...ratings].sort((a,b) => b-a);
    return ratings.map((p,i) => (p+sorted[i])/2);
  }

  function pooledProbability(event, flags, beta, points, i, j) {
    if (flags.family === 'boost')
      return PickBoost.probability(event, flags, points, i, j);
    const a = event.teams[i], b = event.teams[j];
    const gap = (points[i] - points[j]) / 100;
    let logOdds;
    if (flags.rolling && event.rollingModel) {
      const p = PickRolling.probability(event, flags, i, j);
      const mask = Number(!!flags.form) + 2 * Number(!!flags.strong) + 4 * Number(!!flags.weak);
      const slope = event.rollingModel.masks[mask][0];
      logOdds = Math.log(p / (1-p)) + slope * (gap - (a.points-b.points)/100);
    } else {
      logOdds = beta[0] * gap + beta[1] * (a.form - b.form)
        + beta[2] * (a.strong - b.strong) + beta[3] * (a.weak - b.weak);
    }
    return 1 / (1 + Math.exp(-logOdds));
  }

  function experienceShift(event, i, j) {
    const exp = event.experience;
    const beta = exp?.model?.beta;
    const a = exp?.teams?.[event.teams[i].name]?.vector;
    const b = exp?.teams?.[event.teams[j].name]?.vector;
    if (!beta || !a || !b) return 0;
    return beta.reduce((sum,weight,k) => sum + weight*(a[k]-b[k]), 0);
  }

  function compare(event, flags, beta, points, i, j) {
    const base = pooledProbability(event, flags, beta, points, i, j);
    const format = bestOf => {
      if (flags.format === false) return base;
      const split = PickFormat.probability(event, i, j, base, bestOf);
      const weight = flags.shrinkBO && event.formatWeight ? event.formatWeight.weight : 1;
      return base + weight * (split-base);
    };
    const formatBO1 = format(1), formatBO3 = format(3);
    const shift = flags.experience ? experienceShift(event,i,j) : 0;
    const adjust = p => shift === 0 ? p : 1/(1+Math.exp(-(Math.log(p/(1-p))+shift)));
    const one = PickStyle.explain(adjust(formatBO1), event, i, j, flags);
    const three = PickStyle.explain(adjust(formatBO3), event, i, j, flags);
    return {...one, base, formatBO1, formatBO3, experiencePP:(adjust(formatBO1)-formatBO1)*100, bo1:one.probability, bo3:three.probability,
      stylePP:one.stylePP, detailsBO1:one, detailsBO3:three};
  }

  function duel(id, flags, i, j) {
    const event = getEvent(id);
    if (![i, j].every(index => Number.isInteger(index) && index >= 0 && index < event.teams.length))
      throw Error('请选择有效的队伍');
    return compare(event, flags, coefficients(event, flags), contextualPoints(event, flags), i, j);
  }

  function matrixFor(event, flags = {}) {
    const beta = coefficients(event, flags);
    const points = contextualPoints(event, flags);
    return event.teams.map((_, i) => event.teams.map((__, j) => pooledProbability(event, flags, beta, points, i, j)));
  }

  function seriesMatrices(event, flags) {
    const beta = coefficients(event, flags);
    const points = contextualPoints(event, flags);
    const blank = () => event.teams.map(() => new Array(event.teams.length).fill(0.5));
    const bo1 = blank(), bo3 = blank();
    for (let i = 0; i < event.teams.length; i++) {
      for (let j = i + 1; j < event.teams.length; j++) {
        const odds = compare(event, flags, beta, points, i, j);
        bo1[i][j] = odds.bo1; bo1[j][i] = 1 - odds.bo1;
        bo3[i][j] = odds.bo3; bo3[j][i] = 1 - odds.bo3;
      }
    }
    return {bo1, bo3};
  }

  const asScore = s => ({passRate:s.pass, expected:s.expected, histogram:s.histogram});

  function run(id, flags = {}, iterations = 24000) {
    const event = getEvent(id);
    const matchups = seriesMatrices(event, flags);
    const sim = engine.run(matchups, iterations, 33719, flags.locks || []);
    const replay = event.hasResults ? engine.replay(event.rounds) : null;
    return {
      probabilities:sim.probs, card:sim.card, expectedCard:sim.expectedCard, ...asScore(sim), simulateCount:sim.searchN + sim.evalN,
      searchCount:sim.searchN, evalCount:sim.evalN, score:card => asScore(sim.score(card)),
      observed:replay?.actual, replay:replay && {matches:replay.matched, total:replay.total, ok:replay.ok},
      matchups, path:sim.path, opponents:sim.opponents,
      round2:sim.path.rounds[1]?.matches.map(m => [m.a,m.b]) ?? null
    };
  }
  globalThis.PickLab = {events, run, duel, matrixFor, seriesMatrices, setWinner:engine.setWinner};
})();
