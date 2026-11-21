/* Score each completed Swiss stage against its own draw and frozen inputs. */
(() => {
  'use strict';
  const histories = (PickLab.allEvents || PickLab.events).filter(e => e.hasResults)
    .sort((a,b) => b.date.localeCompare(a.date));
  const byId = new Map(histories.map(event => [event.id,event]));
  const seedCard = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
  const events = histories.map(event => {
    const replay = CS.replay(event.rounds);
    if (!replay.ok || replay.total !== 33) throw Error(event.label + ' 的历史对阵无法复现');
    return {id:event.id, label:event.editionLabel || event.label, stage:event.stage || 1, actual:replay.actual};
  });
  const meta = new Map(events.map(e => [e.id,e]));
  const toggles = ['form','strong','weak','seedPrior','fresh','rolling','experience','h2h','style','stageTraining'];

  // Only decisions that can travel to other fields belong in the cache key.
  // Singapore's locked winners, manual card and local team labels never enter this object.
  function policy(settings = {}) {
    if (['recommended','tree'].includes(settings.methodDefault)) {
      return {methodDefault:settings.methodDefault, robustCard:!!settings.robustCard,seedConditionalCard:!!settings.seedConditionalCard,
        ...(settings.stageTraining === true ? {stageTraining:true} : {}),
        ...(settings.stage3Allocation === true && settings.methodDefault==='recommended' && settings.seedConditionalCard && !settings.robustCard ? {stage3Allocation:true} : {})};
    }
    const p = {family:['boost','v4'].includes(settings.family) ? settings.family : 'logit',
      format:settings.format !== false, shrinkBO:settings.format !== false && !!settings.shrinkBO};
    for (const key of toggles) p[key] = !!settings[key];
    if (p.family === 'v4') {
      if (settings.stage3Allocation && settings.seedConditionalCard && !settings.robustCard) p.stage3Allocation = true;
      p.roundMargin = !!settings.roundMargin;
      p.mapVeto = p.format && !!settings.mapVeto;
      p.closeForm = !!settings.closeForm;
      p.regionRisk = !!settings.regionRisk;
      p.regionVrs = !!settings.regionVrs;
      p.majorForm = !!settings.majorForm;
      p.rolling = false;
    }
    if (p.family === 'v4' || p.family === 'boost') {
      p.lanSignal = !!settings.lanSignal;
      p.pickSignal = !!settings.pickSignal;
    }
    p.robustCard = !!settings.robustCard;
    p.seedConditionalCard = !!settings.seedConditionalCard;
    if (p.style) {
      const edges = {};
      for (const {key} of PickStyle.pairs) {
        const value = Number(settings.scenario?.edges?.[key]);
        if (Number.isFinite(value) && value !== 0) edges[key] = Math.max(-15,Math.min(15,value));
      }
      if (Object.keys(edges).length) p.scenario = {edges};
      else p.style = false;
    }
    return p;
  }

  function localPolicy(event,selection) {
    const requested = selection.methodDefault
      ? policy({...PickMethods.defaults(selection.methodDefault,event),stage3Allocation:selection.stage3Allocation,
        ...(selection.stageTraining && {stageTraining:true}),
        robustCard:selection.robustCard,seedConditionalCard:selection.seedConditionalCard})
      : selection;
    const supported = event.stage > 1 ? PickStageInputs.localFlags(event,requested) : null;
    const p = supported?.flags || requested;
    const flags = {...p};
    const notes = new Set();
    function note(value) {
      for (const message of Array.isArray(value) ? value : [value]) {
        if (typeof message === 'string' && message) notes.add(message);
      }
    }
    note(supported?.notes);
    const groupedCard=p.stage3Allocation && event.stage===3 && p.family==='v4' && p.seedConditionalCard && !p.robustCard;
    if (groupedCard) {
      note('分组填卡参考更早 '+event.stage3AllocationProfile.earlier.length+' 个瑞士阶段，按直邀组和上阶段晋级组分别估计十格位置。');
    }
    if (p.stageTraining) {
      const fit = event.stageTraining;
      if (fit?.editions?.length) {
        const n = Object.values(fit.nByStage || {}).reduce((sum, size) => sum + size, 0);
        note('跨阶段胜率校准采用更早 '+fit.editions.length+' 届 Major 的 '+n+' 场瑞士轮对局。');
      } else note('本届之前没有已结束的 CS2 Major，跨阶段胜率校准沿用原模型的胜率。');
    }
    if (selection.methodDefault) {
      const signals = [p.lanSignal && '近期线下赛表现',p.pickSignal && 'BO3 自选图兑现率'].filter(Boolean);
      note(signals.length ? '本届赛前推荐采用'+signals.join('、')+'。' : '本届赛前推荐沿用基础配置。');
    }
    if (p.lanSignal && !event.lanSignal) throw Error(event.label+' 缺少赛前线下赛特征文件');
    if (p.pickSignal && !event.pickSignal) throw Error(event.label+' 缺少赛前自选图特征文件');
    if (p.pickSignal && Number.isInteger(event.pickSignal.comparableTeams)) {
      const data=event.pickSignal;
      note('截至 '+data.asOf+'，'+data.comparableTeams+'/16 队有同图自选与非自选记录。双方均有对照时才能修正 BO3。');
    }
    if (p.lanSignal && Number.isInteger(event.lanSignal.covered)) {
      const data=event.lanSignal;
      note('截至 '+data.asOf+'，'+data.covered+'/16 队至少有两场合格的近期线下赛。');
    }
    const declared = event.historyNotes || {};
    const reason = (key,message) => note(declared[key] || message);
    note(declared.always);
    for (const key of [...toggles,'format','shrinkBO']) {
      if (p[key]) note(declared[key]);
    }
    if (p.family === 'boost') {
      if (!event.boostModel) {
        flags.family = 'logit';
        reason('boost','无赛前提升树，使用本届逻辑回归。');
      } else note(declared.boost);
    }
    if (p.family === 'v4' && p.roundMargin) {
      const profiles = p.closeForm && event.closeSnapshot ? event.closeSnapshot.profiles : event.v4Model?.teams;
      const covered = event.teams.filter(team => profiles?.[team.name]?.nRound > 0).length;
      note('回合净胜有赛前样本的队伍为 '+covered+'/'+event.teams.length+'，双方都有样本时采用这项差值。');
    }
    if (p.closeForm && event.closeSnapshot) {
      const data = event.closeSnapshot;
      note('近期战绩截止 '+data.asOf+'，原积分及训练参数截止 '+event.asOf+'。期间新增 '+data.addedSeries+' 场可核实的系列赛。');
    }
    if (p.regionRisk && event.regionRisk) {
      note('跨区表现按本届赛前线下赛资料评估；样本量和验证结果见「数据与验证」。');
    }
    if (p.regionVrs && event.regionVrsModel) {
      const gates = event.regionVrsModel.variants;
      const tested = gates.solo.validation;
      note('赛区实力使用 '+event.vrsRegionStats.asOf+' 官方榜。'+(tested.passed?'单独使用时，跨区修正通过赛前检验。':'单独使用时，赛前证据不足，保留原胜率。'));
      if (p.regionRisk) note(gates.withLan.validation.passed?'对已做线下跨区修正的配对，排名因素通过增量检验。':'对已做线下跨区修正的配对，排名因素未通过增量检验。');
    }
    if (p.majorForm && event.majorForm) {
      const record = event.majorForm;
      const eligible = Object.values(record.teams).filter(t=>t.repeat).length;
      note('截至 '+record.asOf+'，'+eligible+'/16 队有跨届重复表现。'+(record.validation.passed?'本届允许使用经收缩的修正。':'本届赛前验证未通过，保留原胜率。'));
    }
    if (p.robustCard) note('两张候选卡按相同独立赛程比较，差异不明确时采用最高期望命中卡。');
    if (p.seedConditionalCard && !groupedCard && !p.robustCard) note('在八支晋级候选中，取晋级时最常全胜的两队填 3–0。在余下八支队中取官方末两号种子填 0–3。');
    if (p.mapVeto && !p.closeForm) {
      const counts = event.mapCoverage;
      if (counts) note('实际历史对阵中，地图模型可计算 BO1 '+counts.bo1.used+'/'+counts.bo1.n+' 场、BO3 '+counts.bo3.used+'/'+counts.bo3.n+' 场；其余对阵沿用近期表现模型的胜率。');
    }
    const rating = event.recentRating;
    if (!p.fresh && rating?.rankScope === 'regional') {
      note('基础实力采用 '+rating.monthlyAsOf+' Valve 地区榜积分，名次仅在各赛区内比较。');
    }
    if (p.fresh) {
      const covered = event.teams.filter(team => {
        const row = rating?.teams?.[team.name];
        return row?.overlap >= 3 && Number.isFinite(row.points);
      }).length;
      if (!covered) {
        flags.fresh = false;
        reason('fresh',rating?.asOf ? '找到 '+rating.asOf+' 的积分榜，参赛阵容均未通过核对，本届沿用基础积分。' : '尚无可核实的临赛积分榜，本届沿用基础积分。');
      } else {
        const scope = rating.rankScope === 'regional' ? '，名次仅在各赛区内比较' : '';
        note((rating.basis || '临赛 VRS')+' · '+rating.asOf+'。'+covered+'/'+event.teams.length+' 队的积分通过首发阵容核对'+scope+'。');
        if (rating.sameAsBase) note('赛前最新可核实的官方榜与基础榜为同一期，此开关沿用同一组积分。');
        if (covered < event.teams.length) note('其余 '+(event.teams.length-covered)+' 队沿用基础积分。');
      }
    }
    if (p.format && !event.formatModel) {
      flags.format = false;
      flags.shrinkBO = false;
      reason('format','缺少赛前赛制样本，两种赛制使用同一胜率。');
    } else if (p.shrinkBO && !Number.isFinite(event.formatWeight?.weight)) {
      // Without a pre-event validation window, do not apply the raw BO split at full weight.
      flags.format = false;
      flags.shrinkBO = false;
      reason('shrinkBO','赛前样本不足以验证赛制修正，沿用共同胜率。');
    }
    if (p.rolling && !event.rollingModel) {
      flags.rolling = false;
      reason('rolling','缺少滚动阵容模型，沿用基础胜率。');
    }
    if (p.experience) {
      const model = event.experience?.model;
      if (model?.note) note(model.note);
      if (!model?.trainingMatches) {
        flags.experience = false;
        if (!model?.note) reason('experience','赛前缺少可用于估计经验系数的比赛，胜率沿用基础预测。');
      }
    }
    if (p.h2h && !event.matchups?.weight) {
      flags.h2h = false;
      reason('h2h',event.matchups?.validation?.n
        ? '历史交手修正的赛前拟合权重为零；验证集含 '+event.matchups.validation.n+' 场比赛。'
        : '尚无可用于估计交手权重的赛前样本。');
    }
    if (p.style) {
      const entries = Object.entries(event.profileEvidence || {});
      const assignments = Object.fromEntries(entries.map(([name,evidence]) => [name,evidence.profile]));
      flags.scenario = {assignments,edges:p.scenario.edges};
      if (Object.keys(p.scenario.edges).length) {
        const labeled = event.teams.filter(team => ['duel','system','tempo'].includes(assignments[team.name]));
        const classes = new Set(labeled.map(team => assignments[team.name]));
        const applies = PickStyle.pairs.some(pair => p.scenario.edges[pair.key] && classes.has(pair.a) && classes.has(pair.b));
        note('赛前有依据的打法标签覆盖 '+labeled.length+'/'+event.teams.length+' 队。'+
          (applies ? '符合所选打法组合的对阵采用手动幅度。' : '没有对阵同时匹配所设的两类打法，胜率调整为 0。'));
      }
    }
    return {flags,notes:[...notes]};
  }

  const presets = new Map([
    [JSON.stringify(policy({format:true,shrinkBO:true})), 'default'],
    [JSON.stringify(policy({family:'boost',form:true,strong:true,weak:true,format:true,shrinkBO:true})), 'boost'],
    [JSON.stringify(policy(PickV4.preset)), 'v4'],
    [JSON.stringify(policy({...PickV4.preset,mapVeto:true})), 'map'],
    [JSON.stringify(policy({...PickV4.preset,regionVrs:true})), 'regionVrs'],
    [JSON.stringify(policy({...PickV4.preset,regionVrs:true,majorForm:true})), 'majorForm'],
    [JSON.stringify(policy({...PickV4.preset,closeForm:true,regionRisk:true,robustCard:true})), 'integrated']
  ]);
  function presetFor(settings,event) {
    if (settings.methodDefault) {
      if (settings.robustCard) return null;
      return settings.methodDefault+(settings.seedConditionalCard?'SeedConditional':'')+(settings.stageTraining?'StageTraining':'')+
        (settings.stage3Allocation && event.stage===3?'GroupCard':'');
    }
    return presets.get(JSON.stringify(settings));
  }
  function asRow(id,scores,notes) {
    const {label,actual} = meta.get(id);
    return {id,label,actual,scores,notes};
  }
  function scoreEvent(id,settings) {
    const event = byId.get(id);
    if (!event) throw Error('未收录的历史阶段');
    const strategy = policy(settings);
    const {flags,notes} = localPolicy(event,strategy);
    const saved = event.historyPresets?.[presetFor(strategy,event)];
    if (saved) return asRow(id,saved,notes);
    const run = PickLab.run(id,flags,24000);
    const score = card => CS.actualScore(card,meta.get(id).actual);
    return asRow(id,{model:score(run.card),expected:score(run.expectedCard),seed:score(seedCard)},notes);
  }

  const workerUrl = typeof document !== 'undefined' && document.currentScript?.src
    ? new URL('history-worker.js',document.currentScript.src).href : 'history-worker.js';
  const cache = new Map();
  let active = null, worker = null, sequence = 0, workerUnavailable = false;
  const tick = () => new Promise(resolve => setTimeout(resolve,0));

  function cancel() {
    if (!active) return;
    const previous = active;
    active = null;
    if (worker) { worker.terminate(); worker = null; }
    const error = new Error('回测策略已更改');
    error.name = 'AbortError';
    previous.reject(error);
  }
  function accept(job,row) {
    if (active !== job || job.rows.has(row.id)) return;
    job.rows.set(row.id,row);
    for (const update of job.callbacks) update(row);
  }
  function finish(job) {
    if (active !== job) return;
    const rows = events.map(event => job.rows.get(event.id));
    if (rows.some(row => !row)) throw Error('部分历史赛事尚未评分');
    cache.set(job.key,rows);
    if (cache.size > 32) cache.delete(cache.keys().next().value);
    active = null;
    job.resolve(rows);
  }
  function reject(job,error) {
    if (active !== job) return;
    active = null;
    job.reject(error);
  }
  async function fallback(job) {
    try {
      for (const event of events) {
        if (job.rows.has(event.id)) continue;
        await tick();
        if (active !== job) return;
        accept(job,scoreEvent(event.id,job.flags));
      }
      finish(job);
    } catch(error) { reject(job,error); }
  }
  function start(job) {
    if (typeof Worker === 'undefined' || workerUnavailable || globalThis.location?.protocol === 'file:') {
      fallback(job);
      return;
    }
    function useFallback() {
      if (active !== job || !worker) return;
      worker.terminate();
      worker = null;
      workerUnavailable = true;
      fallback(job);
    }
    try {
      if (!worker) worker = new Worker(workerUrl);
      worker.onmessage = ({data}) => {
        if (active !== job || data.request !== job.request) return;
        try {
          if (data.row) accept(job,data.row);
          else if (data.error) reject(job,new Error(data.error));
          else if (data.done) finish(job);
        } catch(error) { reject(job,error); }
      };
      worker.onerror = useFallback;
      worker.onmessageerror = useFallback;
      worker.postMessage({request:job.request,flags:job.flags,ids:events.map(e=>e.id).filter(id=>!job.rows.has(id))});
    } catch {
      if (worker) { worker.terminate(); worker = null; }
      workerUnavailable = true;
      fallback(job);
    }
  }

  function compare(settings,{onRow} = {}) {
    const flags = policy(settings), key = JSON.stringify(flags);
    if (active && active.key !== key) cancel();
    if (cache.has(key)) {
      const rows = cache.get(key);
      if (onRow) rows.forEach(onRow);
      return Promise.resolve(rows);
    }
    if (active) {
      if (onRow) {
        active.callbacks.add(onRow);
        active.rows.forEach(onRow);
      }
      return active.promise;
    }
    const job = {key,flags,request:++sequence,rows:new Map(),callbacks:new Set(onRow ? [onRow] : [])};
    job.promise = new Promise((resolve,rejectPromise) => {job.resolve = resolve; job.reject = rejectPromise;});
    active = job;
    for (const event of histories) {
      const preset = presetFor(flags,event);
      if (preset) {
        const scores = event.historyPresets?.[preset];
        if (scores) accept(job,asRow(event.id,scores,localPolicy(event,flags).notes));
      }
    }
    if (job.rows.size === events.length) finish(job);
    else start(job);
    return job.promise;
  }
  globalThis.PickHistory = {events,compare,scoreEvent,cancel};
})();
