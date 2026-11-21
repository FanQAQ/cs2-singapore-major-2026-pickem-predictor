/* Build both series-win matrices once. Each simulated match then uses its own format. */
(() => {
  'use strict';
  const events = globalThis.PICK_DATA;
  const engine = globalThis.CS;
  const laterEvents = globalThis.PICK_LATER && globalThis.PickStageInputs
    ? PickStageInputs.events(events, globalThis.PICK_LATER) : [];
  const allEvents = [...events, ...laterEvents];
  const byId = new Map(allEvents.map(event => [event.id, event]));
  for (const event of allEvents) {
    if (globalThis.PICK_STAGE_TRAINING) event.stageTraining = PICK_STAGE_TRAINING[event.id];
    if (globalThis.PICK_STAGE3_PROFILES?.[event.id]) event.stage3AllocationProfile = PICK_STAGE3_PROFILES[event.id];
    if (globalThis.PICK_STAGE_PRESETS?.[event.id])
      event.historyPresets = {...event.historyPresets, ...PICK_STAGE_PRESETS[event.id]};
  }

  function availableFlags(event, flags) {
    return event.stage > 1 && globalThis.PickStageInputs ? PickStageInputs.localFlags(event,flags).flags : flags;
  }

  function getEvent(id) {
    const event = byId.get(id);
    if (!event) throw Error('找不到这届赛事');
    return event;
  }

  function forecastEvent(event, flags) {
    return flags.family === 'v4' && flags.closeForm && event.closeSnapshot ? PickClose.view(event) : event;
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
    if (flags.family === 'v4')
      return PickV4.probability(event,flags,points,i,j);
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
    const useMapVeto = flags.family === 'v4' && flags.mapVeto && flags.format !== false;
    const useRegion = flags.family === 'v4' && flags.regionRisk && event.regionRisk;
    const regionBO1 = useRegion ? PickRegion.apply(event, i, j, formatBO1) : null;
    const regionBO3 = useRegion ? PickRegion.apply(event, i, j, formatBO3) : null;
    const regionalOne = regionBO1?.probability ?? formatBO1;
    const regionalThree = regionBO3?.probability ?? formatBO3;
    const useRegionVrs = flags.family === 'v4' && flags.regionVrs && event.regionVrsModel;
    const regionVrsBO1 = useRegionVrs ? PickRegionVrs.apply(event, i, j, regionalOne, !!regionBO1?.active) : null;
    const regionVrsBO3 = useRegionVrs ? PickRegionVrs.apply(event, i, j, regionalThree, !!regionBO3?.active) : null;
    const rankedOne = regionVrsBO1?.probability ?? regionalOne;
    const rankedThree = regionVrsBO3?.probability ?? regionalThree;
    const mapBO1 = useMapVeto ? PickMap.apply(event, i, j, 1, rankedOne) : null;
    const mapBO3 = useMapVeto ? PickMap.apply(event, i, j, 3, rankedThree) : null;
    const mapOne = mapBO1?.probability ?? rankedOne;
    const mapThree = mapBO3?.probability ?? rankedThree;
    const shift = flags.experience ? experienceShift(event,i,j) : 0;
    const adjust = p => shift === 0 ? p : 1/(1+Math.exp(-(Math.log(p/(1-p))+shift)));
    const experiencedOne = adjust(mapOne), experiencedThree = adjust(mapThree);
    const useMajorForm = flags.family === 'v4' && flags.majorForm && event.majorForm;
    const majorFormBO1 = useMajorForm ? PickMajorForm.apply(event, i, j, experiencedOne) : null;
    const majorFormBO3 = useMajorForm ? PickMajorForm.apply(event, i, j, experiencedThree) : null;
    const one = PickStyle.explain(majorFormBO1?.probability ?? experiencedOne, event, i, j, flags);
    const three = PickStyle.explain(majorFormBO3?.probability ?? experiencedThree, event, i, j, flags);
    const signals = (before, bestOf) => {
      const afterLan = flags.lanSignal && event.lanSignal
        ? PickLanSignal.adjust(event, i, j, before, bestOf) : before;
      const afterPick = flags.pickSignal && event.pickSignal
        ? PickSignal.adjust(event, i, j, afterLan, bestOf) : afterLan;
      return {before, afterLan, afterPick};
    };
    const signalsBO1 = signals(one.probability, 1), signalsBO3 = signals(three.probability, 3);
    const bo1 = flags.stageTraining ? PickStageTraining.apply(event, flags, signalsBO1.afterPick, 1) : signalsBO1.afterPick;
    const bo3 = flags.stageTraining ? PickStageTraining.apply(event, flags, signalsBO3.afterPick, 3) : signalsBO3.afterPick;
    return {...one, probability:bo1, base, formatBO1, formatBO3, regionBO1, regionBO3, regionVrsBO1, regionVrsBO3, mapBO1, mapBO3, majorFormBO1, majorFormBO3, experiencePP:(experiencedOne-mapOne)*100, signalsBO1, signalsBO3, bo1, bo3,
      stylePP:one.stylePP, detailsBO1:one, detailsBO3:three};
  }

  function duel(id, flags, i, j) {
    let event = getEvent(id);
    flags = availableFlags(event, flags);
    event = forecastEvent(event, flags);
    if (![i, j].every(index => Number.isInteger(index) && index >= 0 && index < event.teams.length))
      throw Error('请选择有效的队伍');
    if (globalThis.PickResearchModels?.has(flags.family)) {
      const odds=PickResearchModels.matrices(event,flags.family);
      return {bo1:odds.bo1[i][j],bo3:odds.bo3[i][j]};
    }
    return compare(event, flags, coefficients(event, flags), contextualPoints(event, flags), i, j);
  }

  function matrixFor(event, flags = {}) {
    if (globalThis.PickResearchModels?.has(flags.family))
      return PickResearchModels.matrices(event,flags.family).bo1;
    flags = availableFlags(event, flags);
    event = forecastEvent(event,flags);
    const beta = coefficients(event, flags);
    const points = contextualPoints(event, flags);
    return event.teams.map((_, i) => event.teams.map((__, j) => pooledProbability(event, flags, beta, points, i, j)));
  }

  function seriesMatrices(event, flags) {
    if (globalThis.PickResearchModels?.has(flags.family))
      return PickResearchModels.matrices(event,flags.family);
    flags = availableFlags(event, flags);
    event = forecastEvent(event,flags);
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
    const matrices = {bo1,bo3};
    if (event.allBo3) matrices.allBo3 = true;
    if (flags.family === 'v4' && flags.regionRisk && event.regionRisk) {
      const state = PickRegion.stateFor(event);
      if (state) matrices.state = state;
    }
    return matrices;
  }

  const asScore = s => ({passRate:s.pass, expected:s.expected, histogram:s.histogram});

  function simulateMatrices(matrix, flags = {}, iterations = 24000, seed = 33719) {
    const locks = flags.locks || [];
    const sim = engine.run(matrix, iterations, seed, locks, {seedConditionalCard:flags.seedConditionalCard});
    return flags.robustCard ? PickRobust.apply(sim, matrix, seed, locks) : sim;
  }

  function run(id, flags = {}, iterations = 24000, seed = 33719) {
    const event = getEvent(id);
    const matchups = seriesMatrices(event, flags);
    const standard = simulateMatrices(matchups, flags, iterations, seed);
    const sim = flags.stage3Allocation ? PickFinalCard.apply(standard,flags,event) : standard;
    const replay = event.hasResults ? engine.replay(event.rounds) : null;
    return {
      probabilities:sim.probs, card:sim.card, expectedCard:sim.expectedCard, ...asScore(sim), simulateCount:sim.searchN + sim.evalN,
      searchCount:sim.searchN, evalCount:sim.evalN, gateCount:sim.robust?.n || 0,
      totalPaths:sim.searchN + sim.evalN + (sim.robust?.n || 0), score:card => asScore(sim.score(card)), compareCards:sim.compareCards,
      observed:replay?.actual, replay:replay && {matches:replay.matched, total:replay.total, ok:replay.ok},
      matchups, path:sim.path, opponents:sim.opponents, tailRisk:sim.tailRisk, robust:sim.robust, passCard:sim.passCard,
      ...(sim.cardPolicy ? {cardPolicy:sim.cardPolicy,basePassCard:sim.basePassCard} : {}),
      round2:sim.path.rounds[1]?.matches.map(m => [m.a,m.b]) ?? null
    };
  }
  globalThis.PickLab = {events, laterEvents, allEvents, run, duel, matrixFor, seriesMatrices, simulateMatrices, setWinner:engine.setWinner};
})();
