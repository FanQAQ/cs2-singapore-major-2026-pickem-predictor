(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatRate = value => Number.isFinite(value) ? (100 * value).toFixed(1) + '%' : '—';
  const formatNumber = (value, digits=2) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const api = globalThis.PickLab;
  const styleModel = globalThis.PickStyle;
  const state = {
    event: null, family:'v4', feature: {}, locks: [], tab: 'picks', result: null, card: null, cardMode:'model',
    request: 0, swapTeam: null, regionalIdx: 0, majorTeam: 0, opponentTeam: 0,
    opponentRound: 2, leftTeam: 0, rightTeam: 8, scenario: null, editStyle: false,
    perfectPick: null, ordinaryPick: null, tailTeam:null, rosterTeam:'Eternal Fire'
  };
  const names = ['3–0','3–1 / 3–2','0–3','未入卡'];
  const familyLabels = {v4:'推荐模型',boost:'决策树',elo:'阵容 Elo',ml:'地图 ML',hybrid:'Elo ＋ ML',fourWay:'四模型等权'};
  const isResearch=()=>globalThis.PickResearchModels?.has(state.family)===true;
  const savedMethods = new Map();
  const slotTitles = ['全胜','普通晋级','全败'];
  let showSlotRates = false;
  const pickDisclosures = new Set(location.hash==='#verify/f1bre'?['f1bre-study']:[]);
  if(location.hash==='#picks/forecasts') pickDisclosures.add('sealed-tickets');
  if(location.hash==='#picks/rosters') pickDisclosures.add('rosters');
  const featureList = [
    {key:'vrs',label:'VRS 实力',help:'按锁盘前 VRS 积分差估计基础胜率。'},
    {key:'stageTraining',label:'跨阶段胜率校准',help:'用更早整届 Major 各阶段的真实赛果，按 BO1 和 BO3 分别校准当前模型的胜率。'},
    {key:'roundMargin',label:'对手校正回合净胜',sample:'nRound',help:'用各地图双方回合比分衡量表现，校正对手实力，并按比赛日期和阵容重合人数加权。'},
    {key:'form',label:'近期状态',sample:'n',help:'近期赛果相对于赛前实力预期的表现。'},
    {key:'strong',label:'对强队表现',sample:'ns',help:'作为弱势方时，打出超预期赛果的程度。'},
    {key:'weak',label:'对弱队稳定性',sample:'nw',help:'作为热门方时，兑现预期胜率的程度。'},
    {key:'format',label:'BO1／BO3 差异',help:'按本场赛制估算胜率，并考虑战队在对应赛制下的历史数据。'},
    {key:'mapVeto',label:'模拟禁选图',help:'用赛前真实禁选推测地图，再按两队在各张图上的表现估计 BO1 和 BO3 胜率。'},
    {key:'pickSignal',label:'BO3 自选图兑现率',help:'在同一张地图上比较阵容自选和非自选时的表现，扣除对手强度影响。仅用于 BO3。'},
    {key:'lanSignal',label:'近期线下赛表现',help:'关注同一阵容过去 120 天的线下赛。历史对手强弱与本场越相近、赛制越接近，参考权重越高。'},
    {key:'shrinkBO',label:'按赛前样本收缩赛制差异',help:'用本届开赛前的验证样本估计赛制修正的权重。'},
    {key:'closeForm',label:'更新到临赛战绩',help:'按赛前可核实的比赛更新基础快照之后的近况与地图样本。'},
    {key:'regionRisk',label:'跨赛区表现',help:'用过去的国际线下赛校准跨区对阵，并显示与当前五人阵容相符的样本量。'},
    {key:'regionVrs',label:'赛区整体实力（VRS）',help:'比较对阵双方所在赛区前十队的积分中位数。赛前跨区线下赛验证通过时，才在战队自身实力之上调整胜率。'},
    {key:'fresh',label:'临赛 VRS',help:'按各届赛前可核实的 Valve 积分榜或 HLTV 估算更新实力。每届的榜单日期和来源可在侧栏查看。'},
    {key:'seedPrior',label:'赛事种子校正',help:'队伍自身的 VRS 积分与按本届种子顺序分配的积分各占一半。'},
    {key:'majorForm',label:'阵容在 Major 的超预期表现',help:'比较同一核心阵容过去 Major 的实际胜场与赛前预期胜场。更早赛事的验证支持时，才用这项差异调整胜率。'},
    {key:'experience',label:'选手 Major 经验',help:'按本届首发五人统计此前 Major 出场和冠军经历。模型系数只根据更早的整届赛事估计。'},
    {key:'rolling',label:'滚动阵容实力',help:'使用赛前历史中的近期赛果与阵容延续估计额外实力差。'},
    {key:'h2h',label:'历史交手',help:'参考赛前直接交手记录，样本少时降低调整幅度。'},
    {key:'style',label:'打法克制',help:'在「对局与打法」查看阵容、道具和对位证据。队伍分类与默认幅度来自赛前数据，可手动调整对比。'}
  ];
  const simulations = 24000;
  const el = (tag, cls, text) => {const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  function fail(message) {
    byId('error-box').textContent = message;
    byId('error-box').hidden = false;
    byId('compute-state').textContent = '未完成';
    byId('workspace').setAttribute('aria-busy','false');
    byId('workspace').inert=false;
  }
  if (!api || !globalThis.PickMethods || !Array.isArray(api.events) || !api.events.length) {
    fail('赛事数据尚未载入，请使用完整的离线文件打开。'); return;
  }
  const singapore = api.events.find(e=>e.id==='singapore' && e.teams?.length===16);
  if (!singapore) {fail('缺少新加坡 Stage 1 的完整参赛数据。');return;}
  const stages=new Map([[1,singapore]]);
  for(const n of [2,3]){
    const event=api.allEvents.find(e=>e.stage===n && e.teams?.length===16 && e.teams.every(t=>t.roster?.length===5) &&
      (e.id==='singapore-2026-'+n || (e.predictionEdition==='singapore-2026' && e.stage===n)));
    if(event) stages.set(n,event);
  }
  function currentStage(){return state.event===singapore?1:state.event.stage;}
  function renderStagePicker(){
    const nav=byId('forecast-stages');
    if(nav.children.length===0) for(const n of [1,2,3]){
      const b=el('button','',''); b.type='button';b.dataset.stage=n;
      b.append(el('strong','','Stage '+n),el('span','',stages.has(n)?'阶段预测':'待 Stage '+(n-1)+' 晋级队确定'));
      b.disabled=!stages.has(n);
      if(!b.disabled)b.addEventListener('click',()=>{if(state.event!==stages.get(n))start(stages.get(n));});
      nav.append(b);
    }
    for(const b of nav.children)b.setAttribute('aria-pressed',String(Number(b.dataset.stage)===currentStage()));
  }
  const views=new Set(['picks','bracket','duel','verify']);
  function addressedStage() {
    if(location.hash==='#picks/round-form') return 3;
    const match=/^#picks\/stage([123])$/.exec(location.hash);
    return match ? Number(match[1]) : null;
  }
  function addressedHistoryTarget() {
    const fold=byId('round-form-study');
    if(location.hash==='#picks/round-form' && !fold.hidden) {
      fold.open=true;
      return fold;
    }
    return byId('history-title');
  }
  function addressedView() {
    const name=(location.hash||'').slice(1);
    if(name==='picks/forecasts' || name==='picks/rosters') return 'picks';
    if(addressedStage()) return 'picks';
    if(globalThis.PickEventContext?.section(name)) return 'verify';
    return views.has(name)?name:null;
  }
  const openingView=addressedView();
  if(openingView) state.tab=openingView;
  let revealWorkspace=Boolean(openingView);
  function selected() { return state.locks.some(row => Array.isArray(row) && row.some(Number.isInteger)); }
  function flags() { return {...state.feature, family:state.family, ...(state.event.stage===3 && canUseGroupedCard() && historyState.stage3Allocation && {stage3Allocation:true}), scenario:state.scenario, locks:state.locks}; }

  const historyApi = globalThis.PickHistory;
  const historyState = {key:null, request:0, rows:new Map(), error:'', stage:addressedStage() || 1, stage3Allocation:true, scheduled:false};
  const historyData = new Map((api.allEvents || api.events).map(event=>[event.id,event]));
  const cardLabels = {model:'过关率优先',robust:'比较两种填法',seedConditional:'按晋级后的全胜率与末位种子填卡',expected:'期望命中优先',seed:'按赛事种子',manual:'按手动卡种子位置'};
  function currentFillMode() {
    if (state.cardMode !== 'model') return state.cardMode;
    if (state.feature.seedConditionalCard) return 'seedConditional';
    return state.feature.robustCard ? 'robust' : 'model';
  }
  function canUseGroupedCard() {
    return state.family==='v4' && !state.feature.robustCard && currentFillMode()==='seedConditional';
  }
  function directHistoryScore(card, record) {
    if (!card || card.length!==16 || record.actual?.length!==16) return null;
    return globalThis.CS.actualScore(card,record.actual);
  }
  function historySources(details,event) {
    if (!event) return;
    const links=new Map();
    for(const source of event.stageSources || []) {
      if(source.url) links.set(source.url,source.title || '阶段资料来源');
    }
    const r=event.recentRating;
    if (r && (state.feature.fresh || (r.rankScope==='regional' && r.sameAsBase))) {
      for(const source of (r.sources?.length?r.sources:[r.source])) {
        const url=typeof source==='string'?source:source?.url;
        if(!url) continue;
        const region=/standings_(americas|asia|europe)[_.]/.exec(url)?.[1];
        links.set(url,(region?regionNames[region]+'地区榜':'临赛积分榜')+'原文');
      }
    }
    if (state.feature.style && hasStyleEdges()) {
      for(const team of event.teams) {
        const profile=event.profileEvidence?.[team.name];
        if(profile?.url) links.set(profile.url,team.name+' 打法来源');
      }
    }
    if (state.feature.experience) {
      const model=event.experience?.model;
      for (const source of (model?.sources || [model?.source])) {
        const url=typeof source==='string'?source:source?.url;
        if (url) links.set(url,source.title || '经验系数训练数据');
      }
    }
    if (state.feature.closeForm) for (const s of event.closeSnapshot?.sources||[]) {
      if (s?.url) links.set(s.url,s.title||'临赛比赛记录');
    }
    if (state.feature.regionVrs) for (const source of event.vrsRegionStats?.sources||[]) {
      if(source.url) links.set(source.url,source.title||'赛前 VRS 榜单');
    }
    if (state.feature.majorForm) for (const source of event.majorForm?.sources||[]) {
      if(source?.url) links.set(source.url,source.title||'历届 Major 赛前资料');
    }
    const group=el('p','history-sources','');
    for(const [value,label] of links) {
      try {
        const url=new URL(value);
        if (!['http:','https:'].includes(url.protocol)) continue;
        const a=el('a','',label);a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';group.append(a);
      } catch { /* Incomplete source links remain plain explanatory text. */ }
    }
    if(group.children.length) details.append(group);
  }
  function hasStyleEdges() {
    return styleModel?.pairs.some(pair=>Number(state.scenario?.edges?.[pair.key]||0)!==0);
  }
  function renderTrainingComparison() {
    if(isResearch()){byId('history-training-study').hidden=true;return;}
    const family=state.family==='v4'?'recommended':'tree';
    const holdout=singapore.stageTrainingStudy?.groups?.holdout?.[family];
    const fold=byId('history-training-study');
    fold.hidden=!holdout;
    if(!holdout || fold.dataset.family===family) return;
    fold.dataset.family=family;
    const comparison=byId('history-training-comparison');
    const size=singapore.stageTraining?.nByStage || {};
    comparison.replaceChildren(el('p','',familyLabels[state.family]+'在科隆整届留出检验中的表现。每种校准只用科隆之前已结束的 Major 拟合。'));
    const table=el('table','','');
    const head=table.createTHead().insertRow();
    for(const label of ['设置','过关','命中']) head.append(el('th','',label));
    const body=table.createTBody();
    for(const [key,label] of [['base','原胜率'],['stage1Only','首阶段校准'],['multiStage','跨阶段校准']]) {
      const results=holdout[key];
      if(!results) continue;
      const row=body.insertRow();
      row.append(el('th','',label),el('td','',results.passes+'/'+results.stages),el('td','',results.hits+'/'+(10*results.stages)));
    }
    comparison.append(table);
    const base=holdout.base?.series, calibrated=holdout.multiStage?.series;
    if(base && calibrated) {
      const formats=['bo1','bo3'].filter(bo=>Number.isFinite(base[bo]?.brier) && Number.isFinite(calibrated[bo]?.brier));
      if(formats.length) comparison.append(el('p','','单场概率误差（Brier，越低越好）：'+formats.map(bo=>bo.toUpperCase()+' '+base[bo].brier.toFixed(3)+' → '+calibrated[bo].brier.toFixed(3)).join('，')+'。'));
    }
    if([1,2,3].every(stage=>Number.isInteger(size[stage]))) {
      comparison.append(el('p','','新加坡赛前可用于校准的对局：Stage 1 有 '+size[1]+' 场，Stage 2 有 '+size[2]+' 场，Stage 3 有 '+size[3]+' 场。'));
    }
    const gate=singapore.stageTrainingStudy.defaultGate?.[family];
    const issue=gate?.missed?.find(item=>['passes','hits','meanPasses','meanHits'].includes(item.metric)) || gate?.missed?.[0];
    if(issue) {
      const sample={stage1:'五届首阶段',holdout:'科隆留出检验',all:'全部阶段'}[issue.group];
      const reference=issue.old==='stage1Only'?'仅用首阶段校准':'原模型';
      const metric={passes:'固定种子的过关次数较少',hits:'固定种子的总命中较少',meanPasses:'换种子后的平均过关次数较少',
        meanHits:'换种子后的平均总命中较少',brier:'Brier 误差较高',logLoss:'对数损失较高',noStrictProbabilityGain:'两项单场概率误差均未下降'}[issue.metric];
      if(sample && metric) comparison.append(el('p','','在'+sample+'中，与'+reference+'相比，跨阶段校准的'+metric+'。'));
    }
    comparison.append(el('p','',defaultFlags().stageTraining?'当前模型的推荐配置已开启跨阶段校准。':'当前推荐配置沿用原胜率。可在模型设置中开启「跨阶段胜率校准」对照。'));
  }
  function renderStageTransfer() {
    const fold=byId('stage-transfer-study'), root=byId('stage-transfer-data');
    const stage=historyState.stage, study=singapore.reverseStageStudy;
    const group=study?.groups?.['stage'+stage];
    fold.hidden=!group || state.family!=='v4';
    if(fold.hidden || root.dataset.stage===String(stage)) return;
    root.dataset.stage=String(stage);
    const donor=stage===1 ? 'Stage 2、3' : 'Stage 3';
    const editions=study.stages.filter(s=>s.stage===stage).sort((a,b)=>b.start.localeCompare(a.start));
    root.replaceChildren(el('p','','推荐模型固定对照。以至少三名相同首发继承队伍经验，比较 '+donor+' 对 Stage '+stage+' 的帮助。'));
    const table=el('table','','');
    const header=table.createTHead().insertRow();
    for(const title of ['训练资料','过关','命中']) header.append(el('th','',title));
    const body=table.createTBody();
    for(const [key,title] of [['published','当前推荐'],['targetOnly','往届同阶段'],['earlierDonors','加往届 '+donor]]) {
      const row=body.insertRow(), result=group[key];
      row.append(el('th','',title),el('td','',result.passes+'/'+editions.length),el('td','',result.hits+'/'+(10*editions.length)));
    }
    root.append(table);
    if(stage===1 && study.firstStageSources) {
      const source=study.firstStageSources, extra=el('details','transfer-breakdown','');
      extra.append(el('summary','','Stage 2 和 Stage 3 各自带来了什么？'));
      const second=source.separate.addStage2, third=source.separate.addStage3;
      extra.append(el('p','','在往届 Stage 1 基础上，只加 Stage 2 得 '+second.hits+'/50 格，过 '+second.passes+'/5 届；只加 Stage 3 得 '+third.hits+'/50 格，过 '+third.passes+'/5 届。上海赛前仅有哥本哈根 Stage 2 可供追加。'));
      const slot=['3–0','普通晋级','0–3','留空'];
      extra.append(el('p','','上海换格：'+source.shanghai.map(t=>t.team+' 从'+slot[t.from]+'改为'+slot[t.to]+'，实际为'+slot[t.actual]).join('；')+'。'));
      extra.append(el('p','','有往届 Stage 3 可用的首阶段共 '+source.eligible+' 届。已有 Stage 2 时再加入 Stage 3，'+source.paired.same+'/'+source.seeds+' 组随机种子的过关届数持平。'));
      root.append(extra);
      const check=el('details','transfer-breakdown','');
      check.append(el('summary','','外部检验 · ESL Pro League 第 23 季首阶段'));
      check.append(el('p','','按赛前 Valve 积分与 ESL 动态配对重放 33 场全 BO3。三种方案使用相同的三十组模拟种子；此赛事单独计分。'));
      const holdoutTable=el('table','','');
      const head=holdoutTable.createTHead().insertRow();
      for(const title of ['输入','命中','BO3 Brier']) head.append(el('th','',title));
      const tbody=holdoutTable.createTBody();
      for(const [key,label] of [['vrs','仅赛前积分'],['targetOnly','加往届 Stage 1'],['earlierDonors','再加 Stage 2、3']]) {
        const result=source.external[key];
        tbody.insertRow().append(el('th','',label),el('td','',result.hits+'/10'),el('td','',result.brier.toFixed(4)));
      }
      check.append(holdoutTable,el('p','','更低的 Brier 表示单场概率误差更小。本赛事没有 BO1，Major 的 BO1 表现需另行验证。'));
      root.append(check);
    }
    const post=el('div','same-edition-review','');
    post.append(el('strong','','同届赛后复盘'),el('p','','再加入同届后来打完的 '+donor+'。只有进入后续阶段且保有阵容核心的队伍能提供这项资料。此处得分仅用于复盘。'));
    const select=document.createElement('select');
    const label=el('label','','查看赛事 ');
    select.setAttribute('aria-label','选择同届复盘赛事');
    for(const s of editions) select.add(new Option((historyData.get(s.id)?.editionLabel || historyData.get(s.id)?.label || s.id).replace(/\s*Major\s*/i,' ').trim(),s.id));
    label.append(select);post.append(label);
    const note=el('p','','');post.append(note);
    function show() {
      const s=editions.find(s=>s.id===select.value);
      note.textContent=s.postDonorIds.length
        ? ('赛前可用资料命中 '+s.scores.earlierDonors+'/10；加入同届赛后资料后为 '+s.scores.hindsight+'/10。后续阶段覆盖 '+s.postDonorTeams+'/16 队，赛果截至 '+s.postThrough+'。')
        : '本届没有 Stage 3，无法做本项同届追加对照。';
    }
    select.addEventListener('change',show);show();root.append(post);
  }
  function prepareRoundForm(study) {
    const select=byId('round-form-field');
    if(select.options.length) return;
    const fields=[['major','三届 Major 合计'],['austin-2025-3','奥斯汀 2025'],['budapest-2025-3','布达佩斯 2025'],
      ['cologne-2026-3','科隆 2026'],['epl22-stage2','EPL S22 新留出'],['epl23-stage2','EPL S23 对照']];
    for(const [id,label] of fields) select.add(new Option(label,id));
    function showResults() {
      const field=study[select.value], out=byId('round-form-result'), count=field.events;
      out.replaceChildren();
      const table=el('table','','');
      table.createCaption().textContent='固定推荐填法，比较四组胜率';
      const header=table.createTHead().insertRow(), body=table.createTBody();
      for(const label of ['上一阶段信息','命中','过关','Brier']) header.append(el('th','',label));
      for(const [id,label] of [['base','原胜率'],['series','系列赛胜负'],['mapScore','加地图比分'],['roundShare','加回合分差']]) {
        const s=field.methods[id], name=el('th','',label);
        name.scope='row';
        body.insertRow().append(name,el('td','',s.hits+'/'+count*10),el('td','',s.passes+'/'+count),el('td','',s.brier.toFixed(4)));
      }
      out.append(table,el('p','','Brier 越低，胜率误差越小。本组按 '+field.bo3+' 场实际 BO3 计分。'+
        (field.bo1?'另有 '+field.bo1+' 场 BO1，四组采用相同的原胜率。':'')+
        (select.value.startsWith('epl')?'EPL 的原胜率按赛前 Valve 积分估计，配对按 ESL 实时种子进行。':'')));
      const slots=field.methods.roundShare.slots;
      out.append(el('p','','加入回合分差的预测中，3–0 命中 '+slots[0]+'/'+(2*count)+' 格，普通晋级 '+
        slots[1]+'/'+(6*count)+' 格，0–3 命中 '+slots[2]+'/'+(2*count)+' 格。'));
      if(select.value==='epl22-stage2') out.append(el('p','','首轮 FaZe 对 G2 因阵容资格判负。瑞士轮按全部 33 场官方胜负重放，概率误差只计实际交手。'));
      const paired=field.roundVsMap;
      out.append(el('p','','在 '+study.major.seeds+' 组共同随机种子中，加入回合分差后比只看地图比分多过关 '+paired.better+
        ' 组、持平 '+paired.tied+' 组、少过关 '+paired.worse+' 组。'));
      const allocation=field.allocation;
      if(allocation) {
        const cross=el('table','','');cross.createCaption().textContent='同一组胜率，换填法能多中几格？';
        const titles=cross.createTHead().insertRow(), rows=cross.createTBody();
        for(const title of ['胜率输入','推荐填法','分组填法']) titles.append(el('th','',title));
        for(const [id,label] of [['base','原胜率'],['roundShare','加回合分差']]) {
          const s=allocation[id];
          rows.insertRow().append(el('th','',label),el('td','',s.standard+'/'+count*10),el('td','',s.grouped+'/'+count*10));
        }
        out.append(cross);
      }
    }
    select.addEventListener('change',showResults);
    showResults();
  }
  function renderHistory() {
    const meta=historyApi?.events||[];
    const mode=state.cardMode, direct=mode==='manual'||mode==='seed';
    const selectionLabel=isResearch()?'各届赛前胜率':defaultFeatures(false)?'各届赛前推荐配置':state.feature.stageTraining && defaultFeatures(false,true)?'赛前配置＋自选校准':'当前自选特征';
    const strategyName=familyLabels[state.family]+' · '+selectionLabel;
    const activeGrouped=historyState.stage===3 && historyState.stage3Allocation && canUseGroupedCard();
    byId('history-strategy').textContent=direct?cardLabels[mode]:strategyName+' · '+(activeGrouped?'Stage 3 分组填卡':cardLabels[currentFillMode()]);
    const scores=new Map();
    const mappedCard=mode==='manual'?state.card:mode==='seed'?seedCard():null;
    for (const record of meta) {
      const score=direct?directHistoryScore(mappedCard,record):historyState.rows.get(record.id)?.scores?.[mode];
      if(Number.isInteger(score)) scores.set(record.id,score);
    }
    for(const button of document.querySelectorAll('[data-history-stage]')) {
      const stage=Number(button.dataset.historyStage);
      const target=singapore.officialWindows.find(w=>w.stage===stage);
      const group=meta.filter(r=>r.stage===stage)
        .sort((a,b)=>historyData.get(b.id).date.localeCompare(historyData.get(a.id).date)).slice(0,target.windowSize);
      const values=group.map(r=>scores.get(r.id)).filter(Number.isInteger);
      const ready=group.length && values.length===group.length;
      const passes=ready?values.filter(n=>n>=5).length+' / '+values.length:'—';
      const hits=ready?values.reduce((sum,n)=>sum+n,0)+' / '+(values.length*10):'—';
      button.querySelector('.stage-passes').textContent=passes;
      button.querySelector('.stage-hits').textContent=hits;
      button.setAttribute('aria-pressed',String(stage===historyState.stage));
      button.setAttribute('aria-label','Stage '+stage+(ready?'，过关 '+passes+' 届，总命中 '+hits+' 格':'，正在核对赛果')+'，查看逐届成绩');
      if(stage===historyState.stage) {
        const reached=values.filter(n=>n>=5).length;
        byId('history-goal-status').textContent=ready
          ? '最近 '+group.length+' 届按当前设置回放，'+reached+' 届过关。'+(group.length<target.windowSize?
              '本阶段需要 '+target.windowSize+' 届已评分记录。':reached>=target.requiredPasses?
              '已达到 '+target.requiredPasses+' 届过关的目标。':'距 '+target.requiredPasses+' 届过关还差 '+(target.requiredPasses-reached)+' 届。')
          :'正在计算本阶段的过关成绩。';
      }
    }
    byId('stage3-settings').hidden=historyState.stage!==3;
    const grouped=byId('stage3-allocation');
    grouped.disabled=!canUseGroupedCard();
    grouped.checked=canUseGroupedCard() && historyState.stage3Allocation;
    byId('stage3-availability').textContent=canUseGroupedCard()
      ? '推荐模型在 Stage 3 默认按直邀队和上阶段晋级队分别分配十格。取消勾选可查看原填法。'
      : '使用推荐模型及「按晋级后的全胜率与末位种子填卡」可比较此方案。';
    const evidence=byId('stage3-evidence'), trial=singapore.stage3Trial;
    if(trial && historyState.stage===3 && !evidence.childElementCount) {
      evidence.append(el('p','','固定推荐模型的对局胜率，比较原填法和分组填法。'+trial.locations.map(r=>
        (historyData.get(r.id).editionLabel.split(' ')[0])+' '+r.original+' → '+r.candidate+' 格').join('，')+'。'));
      evidence.append(el('p','','30 组随机种子中，过关届数增加 '+trial.more+' 组、持平 '+trial.same+' 组、减少 '+trial.fewer+' 组。只用各届之前的成绩选填法，三届实际过关 '+trial.forwardPasses+' 次。'));
      evidence.append(el('p','','普通晋级格从 '+trial.originalCategories[1]+'/18 增至 '+trial.candidateCategories[1]+'/18。布加勒斯特大师赛的全 BO3 迁移检查为 '+trial.bucharest[0]+' → '+trial.bucharest[1]+' 格，该赛事单独评分。'));
      evidence.append(el('p','','五场同为八直邀、八晋级的外部赛事中，按积分估胜率两种填法都过 2/5，分组后总命中从 22 格降到 17 格；改用地图 ML 时从过两场降到一场。这些外部赛事采用了不同的胜率模型。'));
      evidence.append(el('p','','科隆对训练样本敏感。在另外 30 组种子中，保留完整历史时过关 '+trial.cologneOmission[0]+' 次，去掉上海训练资料后过关 '+trial.cologneOmission[1]+' 次。'));
    }
    byId('history-stage-title').textContent='Stage '+historyState.stage+' 逐届成绩';
    const ledger=byId('rolling-goal'), windowData=singapore.officialWindows?.find(s=>s.stage===historyState.stage);
    ledger.hidden=!windowData;
    if(windowData && ledger.dataset.stage!==String(windowData.stage)) {
      ledger.dataset.stage=String(windowData.stage);
      const content=byId('rolling-goal-records'), rows=windowData.rows;
      content.replaceChildren();
      const table=el('table','','');
      table.createCaption().textContent='Stage '+windowData.stage+' · '+windowData.passes+' 届过关，'+windowData.scored+' 张已评分';
      const h=table.createTHead().insertRow();
      for(const label of ['赛事','依据','命中']) h.append(el('th','',label));
      const body=table.createTBody();
      for(const r of rows) {
        const kind=el('td','','');
        if(r.provenance==='sealed') {
          const source=el('a','','赛前原卡');source.href=r.webFile;source.download='';kind.append(source);
        } else kind.textContent=r.provenance==='replay'?'历史回放':'待核分';
        body.insertRow().append(el('th','',r.label),kind,el('td','',r.hits===null?'—':r.hits+'/10'));
      }
      content.append(table);
      content.append(el('p','','Stage '+windowData.stage+' 取最近 '+windowData.windowSize+' 届已完赛记录，目标为过 '+windowData.requiredPasses+' 届。早期届次使用历史回放，新赛事使用赛前封存的预测。'));
      if(windowData.pending.length) content.append(el('p','','已封存、待完赛评分：'+windowData.pending.map(r=>r.label).join('、')+'。'));
    }
    F1breStudy.sidebar(byId('f1-sidebar'),historyState.stage,singapore.f1ModelCompare);
    const mapFold=byId('stage3-map-study'), mapResult=byId('stage3-map-results'), maps=singapore.stage3MapStudy;
    const roundFold=byId('round-form-study'), rounds=singapore.roundForm;
    roundFold.hidden=historyState.stage!==3 || state.family!=='v4' || !rounds;
    if(!roundFold.hidden) prepareRoundForm(rounds);
    mapFold.hidden=historyState.stage!==3 || state.family!=='v4' || !maps;
    if(!mapFold.hidden && !mapResult.childElementCount) {
      const methods=[['base','原胜率'],['veto','赛前禁选'],['appearance','出场频率']];
      mapResult.append(el('p','','表内统一用默认推荐模型与填法，只比较地图信息。下方逐届成绩按你当前的模型设置显示。补档前三届共 '+
        maps.major.base.bo3+' 场 BO3，BO1 沿用原胜率。'));
      const table=el('table','',''), header=table.createTHead().insertRow();
      for(const title of ['胜率模型','过关','命中','Brier']) header.append(el('th','',title));
      const body=table.createTBody();
      for(const [id,label] of methods) {
        const row=maps.major[id];
        body.insertRow().append(el('th','',label),el('td','',row.passes+'/3'),el('td','',row.hits+'/30'),el('td','',row.brier.toFixed(4)));
      }
      mapResult.append(table,el('p','','外部检验 EPL S23 第二阶段共 '+maps.external.base.bo3+' 场 BO3。'+methods.map(([id,label])=>
        label+'命中 '+maps.external[id].hits+'/10（Brier '+maps.external[id].brier.toFixed(4)+'）').join('，')+'。'));
      const cologne=maps.cologne;
      if(cologne) {
        const detail=el('details','transfer-breakdown','');
        detail.append(el('summary','','科隆补齐上一阶段的禁选后，预测有改善吗？'));
        const {bo1,bo3}=cologne.evidence;
        const {old25,added,agreementOnly}=cologne.trials;
        detail.append(el('p','','第二阶段有完整七步记录的比赛为 BO1 '+bo1.verified+'/'+bo1.total+' 场、BO3 '+bo3.verified+'/'+bo3.total+
          ' 场。其中 '+cologne.eligible+' 场 BO3 的首发与第三阶段队伍至少重合三人。禁选资料覆盖从 '+old25.teams+'/16 队增至 '+added.teams+'/16 队。'));
        detail.append(el('p','','只更新禁选资料后，科隆第三阶段固定预测由 '+old25.hits+'/10 变为 '+added.hits+'/10，'+
          cologne.range.games+' 场 BO3 的 Brier 由 '+old25.brier.toFixed(4)+' 变为 '+added.brier.toFixed(4)+'（越低越好）。'+
          cologne.seeds+' 组共同随机种子中，原方案过关 '+old25.passes+' 次，补档后过关 '+added.passes+' 次。'));
        detail.append(el('p','','固定赛前逐图实力，逐一计算 '+cologne.range.triplesPerPair+' 种合法三图组合。实际有 '+cologne.range.upsets+
          ' 场由基础胜率（未计禁选）低于 50% 的队伍获胜，其中 '+cologne.range.alwaysUnderdog+' 场即便打最有利的三图，胜者赛前仍低于 50%。'));
        detail.append(el('p','','两个来源有 '+cologne.agreeing+'/'+bo3.verified+' 场 BO3 的七步完全一致。只用这些场次补档，固定卡中 '+
          agreementOnly.hits+'/10，'+cologne.seeds+' 组种子中过关 '+agreementOnly.passes+' 次。其余场次按当日记录与 Valve 禁选顺序核对。'));
        mapResult.append(detail);
      }
    }
    const list=byId('history-list');
    const openNotes=new Set(Array.from(list.querySelectorAll('details[open]'),d=>d.dataset.id));
    const focused=document.activeElement;
    const focusedId=list.contains(focused)?focused.closest('details')?.dataset.id:null;
    const entries=document.createDocumentFragment();
    for (const record of meta.filter(r=>r.stage===historyState.stage)) {
      const event=historyData.get(record.id);
      const row=historyState.rows.get(record.id);
      const score=scores.get(record.id);
      const isScore=Number.isInteger(score);
      const entry=el('li','','');
      const line=el('div','history-line','');
      line.append(el('span','history-name',record.label.replace(/\s*Major\s*/i,' ').trim()));
      const val=el('strong','history-score '+(isScore?(score>=5?'pass':'miss'):'pending'),isScore?String(score):'—');
      val.append(el('small','',' /10'));
      if(isScore) val.setAttribute('aria-label',score+' 格命中，'+(score>=5?'达标':'未达标'));
      line.append(val);entry.append(line);
      const notes=[];
      if(event?.asOf) notes.push('基础实力资料截至 '+event.asOf+'。');
      const role=event?.stageTraining?.role;
      if(role==='initial') notes.push('跨阶段校准从下一届开始训练，这届提供首批样本。');
      if(role==='forward') notes.push('跨阶段校准在本届开赛前以更早整届训练。本届赛果参与后续赛事的训练。');
      if(role==='holdout') notes.push('本次跨阶段校准将科隆整届留出检验，科隆三个阶段均未用于拟合本届参数。');
      if(direct) {
        const frozen=event?.historyNotes?.always;
        if(frozen) notes.push(...[].concat(frozen));
      } else notes.push(...(row?.notes || []));
      if(notes.length) {
        const details=el('details','','');
        details.dataset.id=record.id;details.open=openNotes.has(record.id);
        details.append(el('summary','','本阶段数据说明'));
        for (const note of notes) details.append(el('p','',note));
        historySources(details,event);
        entry.append(details);
      }
      entries.append(entry);
    }
    list.replaceChildren(entries);
    if(focusedId) {
      const details=Array.from(list.querySelectorAll('details')).find(d=>d.dataset.id===focusedId);
      const target=focused.tagName==='A' ? Array.from(details?.querySelectorAll('a') || []).find(a=>a.href===focused.href) : details?.querySelector('summary');
      target?.focus({preventScroll:true});
    }
    let feedback;
    if (!meta.length) feedback='历史赛事数据尚未载入。';
    else if (!direct && historyState.error) feedback=historyState.error;
    else if(scores.size<meta.length) feedback='正在核对赛果 · '+scores.size+' / '+meta.length+' 个阶段';
    else {
      const values=[...scores.values()];
      feedback='合计过关 '+values.filter(n=>n>=5).length+' / '+meta.length+' 次 · 命中 '+values.reduce((sum,n)=>sum+n,0)+' / '+(10*meta.length)+' 格';
    }
    if(byId('history-feedback').textContent!==feedback) byId('history-feedback').textContent=feedback;
    const notes=byId('history-notes');notes.replaceChildren();
    if(historyState.stage===3) notes.append(el('p','','2024 年哥本哈根、上海各有两轮瑞士赛。Stage 3 收录奥斯汀、布达佩斯和科隆。'));
    if(mode==='manual') notes.append(el('p','','逐届按相同种子位置填写。例如，新加坡的 3 号种子填入 3–0，往届也取该届的 3 号种子。'));
    if(mode==='seed') notes.append(el('p','','各届 1–2 号种子填全胜，3–8 号填普通晋级，15–16 号填全败。'));
    if(!direct && state.feature.style && !hasStyleEdges()) {
      const line=el('p','','手动打法情景的克制幅度均为 0，新加坡与往届的胜率均未调整。');
      const edit=el('button','text-button','设置克制幅度');edit.type='button';
      edit.addEventListener('click',openStyleEditor);
      line.append(document.createTextNode(' '),edit);notes.append(line);
    }
    if(selected()) notes.append(el('p','','新加坡已指定的胜者只影响本届推演。历届成绩按首轮开始前的条件计算。'));
    renderTrainingComparison();
    renderStageTransfer();
  }
  function syncHistory() {
    if(!historyApi || ['seed','manual'].includes(state.cardMode)) {
      if(historyState.key!==null) {
        historyState.key=null;
        historyState.request++;
        historyApi?.cancel();
      }
      renderHistory();return;
    }
    const strategy={...state.feature,family:state.family};
    if (canUseGroupedCard() && historyState.stage3Allocation) strategy.stage3Allocation=true;
    if (state.cardMode==='expected') {
      strategy.robustCard=false;
      strategy.seedConditionalCard=false;
    }
    if(!isResearch() && (defaultFeatures(false) || (state.feature.stageTraining && defaultFeatures(false,true)))) {
      strategy.methodDefault=state.family==='v4'?'recommended':'tree';
    }
    if(strategy.style) strategy.scenario=state.scenario;
    const key=JSON.stringify(strategy);
    if(historyState.key===key) {renderHistory();return;}
    historyState.key=key;
    const request=++historyState.request;
    historyState.rows.clear();historyState.error='';
    renderHistory();
    const onRow=row=>{
      if(request!==historyState.request) return;
      historyState.rows.set(row.id,row);
      if(!historyState.scheduled) {
        historyState.scheduled=true;
        requestAnimationFrame(()=>{historyState.scheduled=false;renderHistory();});
      }
    };
    historyApi.compare(strategy,{onRow}).then(rows=>{
      if(request!==historyState.request) return;
      for (const row of rows) historyState.rows.set(row.id,row);
      renderHistory();
    }).catch(error=>{
      if(request!==historyState.request || error?.name==='AbortError') return;
      historyState.error='本次历史回测未完成。'+(error?.message||'请重新选择策略。');
      historyState.key=null;
      renderHistory();
    });
  }
  document.querySelector('.history-stages').addEventListener('click',event=>{
    const button=event.target.closest('[data-history-stage]');
    if(!button) return;
    historyState.stage=Number(button.dataset.historyStage);
    if(state.tab==='picks') {
      try {globalThis.history.replaceState(null,'','#picks/stage'+historyState.stage);}
      catch {location.hash='#picks/stage'+historyState.stage;}
    }
    renderHistory();
  });
  byId('stage3-allocation').addEventListener('change',event=>{
    historyState.stage3Allocation=event.target.checked;
    renderMethodStatus();
    if(state.event.stage===3) recompute();
    else syncHistory();
  });
  function teamMarkup(i) {
    const team = state.event.teams[i];
    const path = state.event.logos?.[team.name];
    const icon = path ? '<img class="team-logo" src="'+escape(path)+'" alt="" decoding="async">' : '';
    return '<span class="team-ident">'+icon+'<span class="team-text">'+escape(team.name)+'</span></span>';
  }
  function teamOptions(index,exclude=-1) {
    return state.event.teams.map((t,i)=>'<option value="'+i+'"'+(index===i?' selected':'')+
      (exclude===i?' disabled':'')+'>'+escape(t.name)+'</option>').join('');
  }
  function resetScenario() {
    if(state.event.styleStudy && globalThis.PickStyleReport?.defaults)return PickStyleReport.defaults(state.event);
    const scenario=styleModel ? styleModel.empty() : {assignments:{},edges:{}};
    for (const [name,item] of evidenceRows()) scenario.assignments[name]=item.profile;
    return scenario;
  }
  function styleRosterKey(team) {
    return team.roster.map(p=>p.normalize('NFKC').trim().toLowerCase()).sort().join('|');
  }
  function restoreScenario() {
    const initial = resetScenario();
    if (!styleModel) return initial;
    try {
      const saved = localStorage.getItem('pickem-style-lineup-'+state.event.id);
      const data = JSON.parse(saved ?? localStorage.getItem('pickem-style-v2-'+state.event.id));
      if (!data || typeof data !== 'object') return initial;
      for (const team of state.event.teams) {
        const name = team.name;
        const key = saved ? styleRosterKey(team) : state.event.legacyStyleTeams?.[name];
        const profile = key && data.assignments?.[key];
        const oldUnknown=data.version!==3 && profile==='unknown' && state.event.styleStudy?.scouts?.[name]?.scenarioEligible!==true;
        if (!oldUnknown && styleModel.profiles.some(p => p.id === profile)) initial.assignments[name]=profile;
      }
      for (const pair of styleModel.pairs) {
        const n = data.edges?.[pair.key];
        if (Number.isInteger(n) && Math.abs(n)<=15) initial.edges[pair.key]=n;
      }
    } catch { /* Storage is optional for offline use. */ }
    return initial;
  }
  function saveScenario() {
    try {
      const defaults=resetScenario();
      const assignments=Object.fromEntries(state.event.teams.filter(t=>state.scenario.assignments[t.name]!==defaults.assignments[t.name])
        .map(t=>[styleRosterKey(t),state.scenario.assignments[t.name]]));
      const edges=Object.fromEntries(Object.entries(state.scenario.edges).filter(([k,v])=>v!==(defaults.edges[k]||0)));
      localStorage.setItem('pickem-style-lineup-'+state.event.id,JSON.stringify({version:3,edges,assignments}));
    }
    catch { /* Users can still edit a scenario in memory. */ }
  }
  function activeEvidence(event=state.event) {
    return state.family==='v4' && state.feature.closeForm && event.closeSnapshot
      ? PickClose.view(event) : event;
  }
  function featureTeams(family=state.family) {
    const modelTeams=activeEvidence().v4Model?.teams;
    if(family==='v4' && modelTeams) return Object.values(modelTeams);
    return state.event.teams;
  }
  function availability(feature,family=state.family) {
    if(feature.key==='vrs' || feature.key==='seedPrior' || feature.key==='robustCard') return true;
    if(feature.key==='stageTraining') return Boolean(state.event.stageTraining?.editions?.length);
    if(feature.key==='closeForm') return family==='v4' && !!state.event.closeSnapshot;
    if(feature.key==='regionRisk') return family==='v4' && !!state.event.regionRisk;
    if(feature.key==='majorForm') return family==='v4' && !!state.event.majorForm;
    if(feature.key==='regionVrs') return family==='v4' && !!state.event.regionVrsModel;
    if(feature.key==='pickSignal') return !!state.event.pickSignal;
    if(feature.key==='lanSignal') return !!state.event.lanSignal;
    if(feature.key==='fresh') return !!state.event.recentRating?.asOf && !!state.event.recentRating.teams && state.event.recentRating.available!==false;
    if(feature.key==='experience') return !!state.event.experience?.model?.trainingMatches;
    if(feature.key==='rolling') return family!=='v4' && !!state.event.rollingModel;
    if(feature.key==='mapVeto') return family==='v4' && !!state.event.mapStrength && !!state.event.mapVeto;
    if(feature.key==='roundMargin') return family==='v4' && !!state.event.v4Model;
    if(feature.key==='format') return !!state.event.formatModel;
    if(feature.key==='shrinkBO') return !!state.event.formatModel && Number.isFinite(state.event.formatWeight?.weight);
    if(feature.key==='h2h') return !!styleModel && !!state.event.matchups;
    if(feature.key==='style') return !!styleModel;
    if(family==='v4' && feature.sample) return !!state.event.v4Model && featureTeams(family).some(t=>Number(t[feature.sample])>0);
    return state.event.featureAvailability?.[feature.key] ?? state.event.teams.some(t=> Number(t[feature.sample])>0);
  }
  function coverage(feature) {
    if(feature.key==='stageTraining' && state.event.stageTraining?.nByStage) {
      return Object.values(state.event.stageTraining.nByStage).reduce((sum,n)=>sum+n,0)+' 场早期 Major 对局';
    }
    if(feature.key==='pickSignal' && Number.isInteger(state.event.pickSignal?.comparableTeams)) return state.event.pickSignal.comparableTeams+'/16 队有同图选图对照';
    if(feature.key==='lanSignal' && Number.isInteger(state.event.lanSignal?.covered)) return state.event.lanSignal.covered+'/16 队有至少两场线下记录';
    if(!feature.sample) return '';
    const count=featureTeams().filter(t=>Number(t[feature.sample])>0).length;
    return count + '/16 队有样本';
  }
  function renderFrame() {
    document.querySelector('.history-sidebar').hidden=state.tab==='bracket';
    const e = state.event;
    renderStagePicker();
    document.querySelector('.stage-tag').textContent='STAGE '+currentStage();
    document.querySelector('footer span:last-child').textContent='CS2 · Stage '+currentStage();
    byId('event-title').textContent=e.label;
    document.title="Fango's Lab · "+e.label;
    const opening=singapore.stageSchedule?.stages.find(row=>row.stage===currentStage())?.firstMatchScheduledUtc;
    const isUpcoming=Date.now()<Date.parse(opening);
    if(opening){
      const opener=document.querySelector('.event-opener'), time=opener.querySelector('time');
      const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(opening));
      const value=Object.fromEntries(parts.map(p=>[p.type,p.value]));
      time.dateTime=opening;
      time.replaceChildren(value.month+'.'+value.day+' ',el('b','',value.hour+':'+value.minute));
      opener.setAttribute('aria-label','Stage '+currentStage()+' 首场北京时间 '+time.textContent+'，查看 PGL 官方赛程');
    }
    byId('mode-label').textContent=selected()?'条件推演':e.hasResults?'历史回测':isUpcoming?'尚未开赛 · 赛前推演':'赛前预测存档';
    byId('metadata').replaceChildren();
    ['16 支战队 · 8 席晋级','赛程 '+e.date].forEach(v=>byId('metadata').append(el('span','',v)));
    const active=activeEvidence(e), close=state.feature.closeForm && e.closeSnapshot;
    const dates=['基础 VRS 与战绩 '+e.asOf,'首发名单 '+e.rosterAsOf];
    if(state.feature.pickSignal && e.pickSignal?.asOf) dates.push('自选图资料截至 '+e.pickSignal.asOf);
    if(state.feature.lanSignal && e.lanSignal?.asOf) dates.push('近期线下赛资料截至 '+e.lanSignal.asOf);
    if(state.feature.regionVrs && e.vrsRegionStats) dates.push('赛区榜单 '+e.vrsRegionStats.asOf);
    if(close) dates.push('临赛资料截至 '+close.asOf+'，新增 '+close.addedSeries+' 场');
    if(state.feature.fresh && e.recentRating?.asOf) dates.push((e.recentRating.basis || '临赛 VRS')+' '+e.recentRating.asOf);
    if(!close && state.family==='v4' && state.feature.roundMargin && active.v4Model?.lastRoundMatch) dates.push('最近可用于回合净胜的完整系列赛 '+active.v4Model.lastRoundMatch);
    byId('data-dates').textContent=dates.join(' · ');
    const features=byId('features'); features.replaceChildren();
    const research=isResearch();
    features.closest('fieldset').hidden=research;
    byId('data-dates').hidden=research;
    if(!research)featureList.forEach(f=>{
      if(['rolling','fresh','shrinkBO','roundMargin','mapVeto','closeForm','regionRisk','regionVrs','majorForm'].includes(f.key) && !availability(f)) return;
      const available=availability(f), label=el('label','toggle','');
      const input=document.createElement('input'); input.type='checkbox'; input.id='feature-'+f.key; input.checked=f.key==='vrs'||(available && !!state.feature[f.key]);input.disabled=f.key==='vrs'||!available||(['shrinkBO','mapVeto'].includes(f.key) && !state.feature.format);
      const calibratedHelp={form:'根据各场之前的 VRS 和赛果校准胜率，再估计近期表现。',strong:'根据已校准的赛前胜率衡量遇强表现，按本场对手实力差调整影响。',weak:'根据已校准的赛前胜率衡量遇弱表现，按本场对手实力差调整影响。'};
      label.title=[state.family==='v4' && calibratedHelp[f.key] || f.help,coverage(f)].filter(Boolean).join(' ');
      label.append(input,document.createTextNode(f.label));
      if(f.key==='vrs')label.append(el('small','','固定'));
      else if(f.key==='shrinkBO' && state.feature.format && state.feature.shrinkBO) label.append(el('small','',formatRate(e.formatWeight.weight)));
      else if(f.key==='mapVeto' && !state.feature.format) label.append(el('small','','需开启赛制差异'));
      else if(!available) label.append(el('small','',f.key==='experience'?'无更早训练届':'无样本'));
      else if(coverage(f)) label.append(el('small','',coverage(f).split(' ')[0]));
      input.addEventListener('change',()=>{
        state.feature[f.key]=input.checked;
        if(f.key==='format' && !input.checked) {state.feature.shrinkBO=false;state.feature.mapVeto=false;}
        changeAndFocus('feature-'+f.key);
      });
      features.append(label);
    });
    if(state.feature.mapVeto) features.append(el('p','feature-coverage','在「对局与打法」选两支战队，可查看禁选记录场数、各图出现概率与胜率修正。'));
    if(!close && state.family==='v4' && state.feature.roundMargin) {
      const missing=e.teams.filter(t=>!(active.v4Model?.teams?.[t.name]?.nRound>0)).map(t=>t.name);
      const note='回合净胜样本要求两份来源的阵容和完整系列赛比分一致。近 90 天符合条件的战队 '+(e.teams.length-missing.length)+' / '+e.teams.length+' 支。';
      features.append(el('p','feature-coverage',note+(missing.length?'涉及 '+missing.join('、')+' 的对局沿用其余已选特征。分地图实力另按逐图战绩统计。':'')));
    }
    for(const button of document.querySelectorAll('[data-family]')) {
      button.disabled=globalThis.PickResearchModels?.has(button.dataset.family) && e!==singapore;
      button.setAttribute('aria-pressed',String(button.dataset.family===state.family));
    }
    renderMethodStatus();
    for(const tab of document.querySelectorAll('.workspace-tabs button[data-view]')) tab.setAttribute('aria-pressed',String(tab.dataset.view===state.tab));
  }
  const classicPresetLabel='积分＋赛制';
  const recentStudyLabel='回合净胜＋强弱对手';
  function defaultFlags(family=state.family) {
    if(globalThis.PickResearchModels?.has(family))return {seedConditionalCard:true,robustCard:false};
    const flags=PickMethods.defaults(family,state.event);
    const keys=featureList.filter(f=>f.key!=='vrs').map(f=>f.key).concat('robustCard');
    return {...Object.fromEntries(keys.map(key=>[key,Boolean(flags[key])])),seedConditionalCard:family==='v4'};
  }
  function defaultFeatures(includeCardObjective=true,excludeTraining=false) {
    const defaults=defaultFlags();
    return Object.keys(defaults).every(key=>(['robustCard','seedConditionalCard'].includes(key) && !includeCardObjective) ||
      (key==='stageTraining' && excludeTraining) || Boolean(state.feature[key])===defaults[key]);
  }
  function renderMethodStatus() {
    const pristine=state.cardMode==='model' && defaultFeatures() && (state.family!=='v4' || historyState.stage3Allocation);
    byId('method-state').textContent=pristine?'推荐配置':'已自定义';
    byId('restore-model').disabled=pristine;
    byId('method-description').textContent=modelBasis();
  }
  function modelBasis(){
    const e=state.event;
    if(isResearch())return PickResearchModels.describe(e,state.family);
    const flags=state.feature, evidence=activeEvidence(e);
    const count=state.family==='v4'?evidence.v4Model?.n:e.boostModel?.n;
    const used=k=>flags[k] && availability(featureList.find(f=>f.key===k));
    const ingredients=[used('regionVrs')?'队伍与赛区的 Valve 积分':'队伍的 Valve 积分'];
    if(used('form')) ingredients.push('近期赛果');
    if(used('strong') && used('weak')) ingredients.push('对阵强队和弱队的表现');
    else if(used('strong') || used('weak')) ingredients.push(used('strong')?'对阵强队的表现':'对阵弱队的表现');
    if(used('roundMargin')) ingredients.push('扣除对手强弱后的地图回合净胜');
    const extra=featureList.filter(f=>!['vrs','form','strong','weak','regionVrs','roundMargin','format','shrinkBO'].includes(f.key) && used(f.key));
    ingredients.push(...extra.map(f=>f.label));
    const method=state.family==='boost'?'决策树用多棵浅层树组合':'推荐模型综合';
    const format=flags.format?(flags.shrinkBO?'，并按历史样本量校准 BO1、BO3 胜率':'，分别估计 BO1、BO3 胜率'):'，估计双方的对局胜率';
    return method+ingredients.join('、')+format+'。'+(count?'训练使用开赛前的 '+count+' 场系列赛。':'')+
      '队伍战绩要求至少三名本届首发出场，随后按本阶段的规则模拟五轮瑞士轮。'+
      (canUseGroupedCard() && historyState.stage3Allocation?'Stage 3 按直邀与上阶段晋级分组填卡。':'');

  }
  function switchMethod(family) {
    if(family===state.family) return;
    savedMethods.set(state.family,{feature:{...state.feature},cardMode:state.cardMode,
      manualCard:state.cardMode==='manual' && state.card?Array.from(state.card):null});
    state.family=family;
    const saved=savedMethods.get(family);
    state.feature=saved?{...saved.feature}:defaultFlags(family);
    state.cardMode=saved?.cardMode||'model';
    state.card=saved?.manualCard?Array.from(saved.manualCard):null;
    state.perfectPick=null;state.ordinaryPick=null;
    recompute();
  }
  function start(event=singapore) {
    savedMethods.clear();
    state.event=event;
    if(isResearch() && event!==singapore)state.family='v4';
    state.feature=defaultFlags();
    state.scenario=restoreScenario();
    state.locks=[];state.result=null;state.card=null;state.cardMode='model';state.regionalIdx=0;
    if(event.majorForm) {
      const teams=event.majorForm.teams;
      state.majorTeam=event.teams.map((t,i)=>({i,row:teams[t.name]}))
        .sort((a,b)=>(b.row?.editions||0)-(a.row?.editions||0) || (b.row?.series||0)-(a.row?.series||0))[0].i;
    }
    state.opponentRound=2;state.opponentTeam=0;state.leftTeam=0;state.rightTeam=8;state.editStyle=false;
    byId('workspace').replaceChildren();
    recompute();
  }
  async function recompute() {
    const id=++state.request;
    renderFrame();
    syncHistory();
    byId('error-box').hidden=true;
    byId('compute-state').textContent='正在计算竞猜卡…';
    byId('fill-mode').disabled=true;
    byId('workspace').setAttribute('aria-busy','true');
    byId('workspace').inert=true;
    await new Promise(resolve=>setTimeout(resolve,20));
    if(id!==state.request) return;
    try {
      const result=await api.run(state.event.id,flags(),simulations);
      if(id!==state.request)return;
      if(!result || result.probabilities?.length!==16 || result.card?.length!==16) throw new Error('概率或预测不完整。');
      state.result=result;
      if (state.cardMode==='model') state.card=Array.from(result.card);
      else if (state.cardMode==='seed') state.card=seedCard();
      else if (state.cardMode==='expected') state.card=Array.from(result.expectedCard);
      byId('compute-state').textContent='';
      byId('workspace').setAttribute('aria-busy','false');
      byId('workspace').inert=false;
      render();
    }catch(e){if(id===state.request){state.result=null;byId('workspace').replaceChildren();fail('本次推演未完成。'+(e?.message || '请重新选择策略。'));}}
  }
  function areDefault() {
    return state.cardMode==='model';
  }
  function score() {
    if (areDefault()) return {passRate:state.result.passRate,expected:state.result.expected,histogram:state.result.histogram};
    return state.result.score(state.card);
  }
  function summary(card) {
    const hits=[0,0,0];
    for(let i=0;i<16;i++){const cat=card[i];if(cat<3 && cat===state.result.observed[i])hits[cat]++;}
    return {hits,total:hits.reduce((a,b)=>a+b,0)};
  }
  function seedCard() {return Array.from({length:16},(_,i)=>i<2?0:i<8?1:i>=14?2:3);}
  function sampleNotes() {
    if(!selected())return '';
    const count=state.locks.reduce((sum,row)=>sum+(row?.filter(Number.isInteger).length||0),0);
    const policy=state.cardMode==='model' && state.result?.cardPolicy==='lockedPassCard'?' 本届已按这些赛果重新搜索过关率优先卡。':'';
    return '<div class="warning">已指定 '+count+' 场胜者，后续对阵和概率以这些结果为条件。'+policy+' <button type="button" class="text-button" data-action="clear-locks">清除赛果条件</button></div>';
  }
  function prob(value,cat) {
    const width=Number.isFinite(value)?Math.min(100,Math.max(0,value*100)):0;
    return '<span class="prob"><span class="perc">'+formatRate(value)+'</span><span class="track t'+cat+'"><i style="width:'+width+'%"></i></span></span>';
  }
  function probabilityPanel() {
    const e=state.event;
    return '<section class="panel prob-panel"><div class="panel-head"><div><h2>战队战绩概率</h2><p>按阶段初始种子排序</p></div><span class="inline-badge">16 TEAMS</span></div><div class="table-wrap"><table class="prob-table"><thead><tr><th>种子</th><th>战队</th><th>3–0</th><th>3–1 / 3–2</th><th>0–3</th><th class="pick-col">我的选择</th></tr></thead><tbody>'+e.teams.map((t,i)=>{
      const p=state.result.probabilities[i],cat=state.card[i];
      return '<tr><td><span class="seed">'+String(i+1).padStart(2,'0')+'</span></td><td><button type="button" class="team-name team-link" data-team-detail="'+i+'" title="查看战队的赛前数据">'+teamMarkup(i)+'</button></td>'+[0,1,2].map(k=>'<td>'+prob(p[k],k)+'</td>').join('')+'<td class="pick-col">'+(cat<3?'<span class="small-tag cat'+cat+'">'+names[cat]+'</span>':'<span class="seed">—</span>')+'</td></tr>';
    }).join('')+'</tbody></table></div><p class="panel-note">其余概率对应 1–3 或 2–3 淘汰。</p></section>';
  }
  function metricsBox(values) {
    return '<div class="metrics"><div><span class="metric-label">模拟过关率（≥5 格）</span><strong class="metric-value">'+formatRate(values.passRate)+'</strong></div><div><span class="metric-label">期望命中</span><strong class="metric-value">'+formatNumber(values.expected,1)+'<span>/10</span></strong></div></div>';
  }
  function hitDistribution(values) {
    const counts=values.histogram;
    if(!counts || counts.length !== 11)return '';
    const total=counts.reduce((a,b)=>a+b,0),max=Math.max(...counts);
    if(!max||!total)return '';
    const bars=Array.from(counts,(count,i)=>{
      const label=i+' 格命中，'+formatRate(count/total);
      return '<div class="hist-col '+(i>=5?'hit':'miss')+'" title="'+label+'"><i style="height:'+Math.max(1,count/max*28)+'px"></i><span>'+i+'</span></div>';
    }).join('');
    return '<div class="distribution"><div class="dist-head"><span>命中格数分布</span><small>5 格起达标</small></div><div class="histogram" role="img" aria-label="0 至 10 格的模拟命中分布">'+bars+'</div></div>';
  }
  function pickDisclosure(id, label, body) {
    return '<details class="pick-detail" data-pick-detail="'+id+'"'+(pickDisclosures.has(id)?' open':'')+'><summary>'+label+'</summary><div class="detail-body">'+body+'</div></details>';
  }
  function cardPanel() {
    const titles={model:'Stage '+currentStage()+' 预测',seed:'按种子预测',expected:'按期望命中预测',manual:'我的手动预测'};
    const slots=slotTitles.map((label,category)=>{
      const teams=slotTeams(category);
      const chips=teams.map(i=>{
        const rate=formatRate(state.result.probabilities[i][category]);
        const team=escape(state.event.teams[i].name);
        return '<button type="button" class="ticket-team" data-swap="'+i+'"><span class="sr-only">替换</span>'+teamMarkup(i)+
          '<span class="slot-rate" title="'+team+' 打出 '+names[category]+' 的模拟概率"><span class="sr-only">本格命中概率</span>'+rate+'</span></button>';
      }).join('');
      return '<section class="ticket-slot ticket-slot-'+category+'"><h3><strong>'+names[category]+'</strong><span>'+label+'</span></h3><div class="ticket-teams">'+chips+'</div></section>';
    }).join('');
    const messages=PickConstraints.messages(state.card,state.result.path,state.event.teams);
    const conflicts=messages.length?'<ul class="ticket-conflicts" aria-label="当前卡的赛果冲突">'+messages.map(m=>'<li>'+escape(m)+'</li>').join('')+'</ul>':'';
    const reset=areDefault()?'':'<button type="button" class="text-button" data-action="reset-card">恢复预测</button>';
    return '<section class="panel ticket" aria-labelledby="pick-title" data-show-rates="'+showSlotRates+'">'+
      '<div class="ticket-head"><div><h2 id="pick-title">'+titles[state.cardMode]+'</h2><p>十格中命中五格即可过关</p></div>'+
      '<button type="button" class="rate-toggle" data-action="slot-rates" aria-pressed="'+showSlotRates+'">单格概率</button></div>'+
      '<p class="rate-guide">百分比表示这支队伍恰好打出本栏战绩的模拟概率。</p>'+
      '<div class="ticket-slots">'+slots+'</div>'+conflicts+'<div id="near-alternative" class="near-alternative" hidden></div>'+
      '<div class="ticket-foot"><span>点队名换队</span><div>'+reset+
      '<button type="button" class="text-button" data-action="card-stats">过关率与依据</button>'+
      '<button type="button" class="text-button" data-action="show-history">策略历史表现</button></div></div></section>';
  }
  function cardStats() {
    const values=score(), baseline=state.result.score(seedCard());
    const reference=state.cardMode==='seed'
      ? ['预测',state.result.passRate,state.result.expected]
      : ['种子卡',baseline.passRate,baseline.expected];
    const explanation=state.cardMode==='model' && state.result.cardPolicy==='seedConditionalCard'
      ?'<p class="helper">先按模拟过关率选出八支晋级队。在这八队中，晋级时最常打出全胜的两队填 3–0，另外六队填普通晋级。其余八队中，官方种子排在最后的两队填 0–3。</p>':'';
    return explanation+metricsBox(values)+'<div class="card-reference"><strong>'+reference[0]+' · 同批模拟</strong><span>过关 '+formatRate(reference[1])+'</span><span>期望 '+formatNumber(reference[2],1)+' 格</span></div>'+hitDistribution(values);
  }
  function tailRiskPanel() {
    const rows=state.result.tailRisk;
    if(!Array.isArray(rows) || rows.length!==state.event.teams.length) return '';
    const order=CS.tailRanking(rows).order;
    const team=i=>state.event.teams[i].name;
    const [second,third]=order.slice(1,3);
    const gap=(rows[second].p03-rows[third].p03)*100;
    const difference=gap===0?'两队在本批模拟中并列，按初始种子排序。':'全败概率相差 '+formatNumber(gap,2)+' 个百分点。';
    const table=order.map((i,k)=>[String(k+1),team(i),String(i+1),formatRate(rows[i].p02),
      formatRate(rows[i].pLossGiven02),formatRate(rows[i].p03)]);
    const selected=state.tailTeam??second, detail=rows[selected];
    const options=order.map(i=>'<option value="'+i+'"'+(i===selected?' selected':'')+'>'+escape(team(i))+'</option>').join('');
    const opponents=detail.opponents.map(o=>[team(o.team),String(o.reached02),formatRate(o.pOpponentGiven02),
      formatRate(o.pLossGivenOpponent)]);
    const opponentTable=opponents.length?auditTable(['0–2 对手','交手路径数','遇到概率','再负概率'],opponents):
      '<p class="helper">这支队在当前模拟中没有进入 0–2 组。</p>';
    return pickDisclosure('tail-risk','哪些队最可能 0–3？','<section class="panel"><div class="panel-body tail-study">'+
      '<p>前两轮均输掉 BO1 才会进入 0–2 组，再输一场 BO3 才会全败。表中「再负」只计算已到达 0–2 的模拟路径。</p>'+
      '<p class="second-slot"><strong>全败风险比较</strong> 按全败概率排序，'+escape(team(second))+' 位列第二，'+escape(team(third))+' 位列第三。'+difference+(state.cardMode==='model' && state.result.cardPolicy==='seedConditionalCard'?' 当前预测在八支晋级候选以外，按官方末位种子填全败格。':'')+'</p>'+
      auditTable(['风险排名','战队','赛事种子','进入 0–2','再负 BO3','最终 0–3'],table)+
      '<div class="tail-opponents"><label for="tail-team">查看 0–2 组的可能对手</label><select id="tail-team">'+options+'</select></div>'+
      '<p class="helper">'+escape(team(selected))+' 在 '+detail.paths.toLocaleString('zh-CN')+' 条路径中，有 '+detail.reached02.toLocaleString('zh-CN')+' 条打到 0–2，其中 '+detail.lost03.toLocaleString('zh-CN')+' 条最终全败。</p>'+
      opponentTable+'</div></section>');
  }
  function pairedCardPanel() {
    const r=state.result.robust;
    if(!r || state.cardMode!=='model') return '';
    const explanation=r.reason==='identical'?'两种填法选出了相同的十格。':r.selected==='pass'
      ?'过关率优先卡在配对模拟中有明确优势，当前采用这张卡。'
      :'当前采用最高期望命中卡。另一张卡的模拟过关优势未达到切换条件。';
    let detail='';
    if(r.n && Array.isArray(r.ci)) {
      detail='<p class="helper">两张卡用相同的 '+r.n.toLocaleString('zh-CN')+' 条独立路径比较；上方整卡过关率另用一批路径评估。</p>'+
        auditTable(['填法','配对样本过关率','仅此卡过关'],[
          ['最高期望命中',formatRate(r.expectedGatePass),r.expectedOnly+' 次'],
          ['过关率优先',formatRate(r.passGatePass),r.passOnly+' 次']
        ])+'<p class="helper">过关率优先卡相对期望卡的优势为 '+deltaLabel(r.delta*100)+'，95% 模拟区间为 '+formatNumber(100*r.ci[0])+' 至 '+formatNumber(100*r.ci[1])+' 个百分点。区间只反映这批模拟路径的波动。</p>';
    }
    return '<section class="paired-choice"><h3>这份预测是怎样生成的？</h3><p>'+explanation+'</p>'+detail+'</section>';
  }
  async function renderAlternative() {
    const box=byId('near-alternative');
    if(!box || state.cardMode!=='model') return;
    const result=state.result, card=state.card, request=state.request;
    try {
      const other=await PickAlternatives.find(result,card,{locks:state.locks,seed:33719,frozen:state.event.cardAlternatives});
      if(!other || !box.isConnected || request!==state.request || result!==state.result ||
          card!==state.card || state.cardMode!=='model') return;
      const a=other.perfectTeam, b=other.ordinaryTeam;
      const names=state.event.teams;
      const link=el('button','text-button','比较这次换位');
      link.type='button';link.dataset.action='compare-alternative';
      link.dataset.perfect=String(a);link.dataset.ordinary=String(b);
      box.append(el('strong','','另一种接近的填法'),el('span','',names[b].name+' 填 3–0，'+names[a].name+
        ' 填普通晋级。其余八格相同，独立模拟过关率从 '+formatRate(other.originalPass)+' 变为 '+formatRate(other.swappedPass)+'。'),link);
      box.hidden=false;
    } catch { /* The completed ticket remains usable when the optional comparison is unavailable. */ }
  }
  function schedulePanel(schedule) {
    if(!schedule) return '';
    const local=utc=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(utc));
    const rows=schedule.stages.map(s=>['Stage '+s.stage,local(s.firstMatchScheduledUtc),s.valvePickemLockUtc?local(s.valvePickemLockUtc):'待核实']);
    const invites=schedule.stages.filter(s=>s.directInvites?.length).map(s=>{
      const teams=s.directInvites.map(t=>[t.team,t.announcedStartingFive.join('、')]);
      return '<details><summary>Stage '+s.stage+' 已公布的 '+teams.length+' 队首发</summary>'+auditTable(['直邀队','PGL 公布的五人'],teams)+'</details>';
    }).join('');
    return pickDisclosure('singapore-schedule','新加坡三个阶段的赛程与交卡时间',
      '<p>截至 '+escape(schedule.asOfDate)+'，Valve 已开放 Stage 1 竞猜。下表均为北京时间。提交时请查看游戏内该阶段倒计时。</p>'+
      auditTable(['阶段','PGL 首场排期','已核实锁盘时间'],rows)+invites+
      '<p><a href="'+escape(schedule.sources.hub.url)+'" target="_blank" rel="noopener noreferrer">Valve 竞猜公告 ↗</a> · '+
      '<a href="'+escape(schedule.sources.schedule.url)+'" target="_blank" rel="noopener noreferrer">PGL 赛程 ↗</a> · '+
      '<a href="'+escape(schedule.sources.rosters.url)+'" target="_blank" rel="noopener noreferrer">报备首发 ↗</a></p>');
  }
  function mlTicket(record) {
    if(!record)return '';
    const policies=['standard','within','grouped'], names=['原填法','只调 3–0','整卡分组'];
    const rows=['3–0','普通晋级','0–3'].map((slot,c)=>[slot,...policies.map(k=>record.teams.filter((_,i)=>record.cards[k][i]===c).join('、'))]);
    if(record.score)rows.push(['实际命中',...policies.map(k=>record.score.cards[k].hits+'/10')]);
    if(record.highBudget){
      names.push('36 万次选卡');
      for(let c=0;c<3;c++)rows[c].push(record.teams.filter((_,i)=>record.highBudget.card[i]===c).join('、'));
      if(record.score)rows[3].push(record.score.highBudget.hits+'/10');
    }
    const selected=policies.indexOf(record.selectedPolicy);
    const status=record.score?'正式赛果已核对':'待完赛评分';
    return '<details class="pick-detail" data-ml-ticket><summary>地图 ML 分栏研究卡</summary><div class="detail-body">'+
      auditTable(['位置',...names],rows)+'<p>'+escape(record.frozenAt.slice(0,10))+' 封存 · '+status+
      (selected<0?'':' · 赛前指定的主要填法为'+names[selected])+' · <a href="'+escape(record.webFile)+'" download>下载研究卡原件</a></p></div></details>';
  }
  function sealedTickets(records,mlRecords=[]) {
    if(!records?.length) return '';
    const labels={recommended:'预测',earlierStageChallenger:'往届阶段经验候选',stage3Candidate:'分组填卡候选',standardComparison:'原填法对照'};
    const stages=records.map(entry=>{
      const headings=entry.cards.map(c=>labels[c.id]);
      const rows=['3–0','普通晋级','0–3'].map((slot,i)=>[slot,...entry.cards.map(c=>c.groups[i].join('、'))]);
      if(entry.source) rows.push(['实际命中',...entry.cards.map(c=>c.hits+'/10')]);
      const files=entry.cards.map(c=>'<a href="'+escape(c.webFile)+'" download>'+escape(labels[c.id])+' JSON</a>').join(' · ');
      const status=entry.source?'<a href="'+escape(entry.source.url)+'" target="_blank" rel="noopener noreferrer">核对正式赛果 ↗</a>':'待完赛评分';
      const research=mlRecords.find(r=>r.edition===entry.edition && r.stage===entry.stage);
      const veto=entry.edition==='singapore-2026' && entry.stage===1 && state.event.vetoML?.forecast;
      const vetoLink=veto?'<p><a href="#verify/veto/singapore">查看新加坡禁选 ML 研究卡与 120 种潜在对阵</a></p>':'';
      const bo5Link=veto && state.event.bo5History?.forecast?.webFile?'<p><a href="#verify/bo5/singapore">对照新加坡补图前后的 0–3 研究卡</a></p>':'';
      const rosterLink=entry.edition==='singapore-2026' && entry.stage===1 && state.event.eliteOpponents?'<p><a href="#verify/elite/singapore">核对新加坡 16 队同阵容的比赛</a></p>':'';
      return '<section><h3>Stage '+entry.stage+'</h3>'+auditTable(['槽位',...headings],rows)+'<p>封存于 '+escape(entry.cards[0].frozenAt.slice(0,10))+' · '+status+' · '+files+'</p>'+mlTicket(research)+vetoLink+bo5Link+rosterLink+'</section>';
    }).join('');
    return pickDisclosure('sealed-tickets','本届已封存的竞猜卡','<div id="sealed-stage-records">'+stages+'</div>');
  }
  function rosterPanel(audit) {
    if(!audit)return '';
    const teamNames=Object.keys(audit.teams);
    const name=audit.teams[state.rosterTeam]?state.rosterTeam:teamNames[0],t=audit.teams[name];
    if(!t)return '';
    const options=teamNames.map(n=>'<option'+(n===name?' selected':'')+'>'+escape(n)+'</option>').join('');
    const rates=t.probabilities.map(p=>(p*100).toFixed(1)+'%');
    const bands='<dl class="lineup-rates" aria-label="赛前封卡的战绩概率">'+['3–0','普通晋级','0–3'].map((label,i)=>
      '<div'+(t.slot===i?' class="chosen"':'')+'><dt>'+label+(t.slot===i?' <small>封卡</small>':'')+'</dt><dd>'+rates[i]+'</dd></div>').join('')+'</dl>';
    const history=t.history.map(([w,l],i)=>[(i+3)+' 人相同',String(w+l),w+' 胜 '+l+' 负']);
    const total=t.history.reduce((s,[w,l])=>s+w+l,0);
    const ref=(label,url)=>'<a href="'+escape(url)+'" target="_blank" rel="noopener noreferrer">'+label+'</a>';
    const comparisons=t.older?'<p>上海 RMR 老阵容与本届重合 0 人。2025 年转入 Aurora 的五人中，只有 jottAAA 回到了本届首发。</p><p>'+
      t.older.map(g=>ref(escape(g.label),g.source)).join(' · ')+'</p>':'';
    const outside={perfect:'3–0',advance:'普通晋级',zero:'0–3',outside:'未入十格'};
    const external=t.f1bre?'<p>F1bre 原帖排名第一的卡把 '+escape(name)+' 填在 Elo 的「'+outside[t.f1bre.elo]+'」，地图 ML 为「'+outside[t.f1bre.ml]+'」。 '+ref('查看作者原帖',audit.externalSource)+'</p>':'';
    let swapStudy='';
    if(t.f1bre && audit.efSwaps){
      const m=audit.efSwaps.changes;
      const points=v=>(v>0?'+':'')+(v*100).toFixed(2);
      const rows=Object.keys(m.baseline).map(n=>[n,...['baseline','elo','ml'].map(a=>points(m[a][n]))]);
      swapStudy='<details><summary>EF 换到普通晋级，整卡过关率会怎样？</summary><p>把下表队伍提到 3–0，其余八格保持原封卡。表内是过五格概率的变化，单位为百分点。每套胜率下七张卡都走相同的 '+(audit.efSwaps.paths/10000)+' 万条路径。Elo 和地图 ML 使用本站重建的胜率。</p>'+
        auditTable(['换上 3–0','推荐模型','180 天 Elo','地图 ML'],rows)+'</details>';
    }
    const body='<div class="lineup-evidence"><label class="lineup-picker" for="roster-team">查看队伍<select id="roster-team">'+options+'</select></label>'+
      '<p class="lineup-five"><strong>'+escape(name)+'</strong> '+t.roster.map(escape).join(' · ')+'</p>'+bands+
      (t.slot===3?'<p>赛前预测未选这支队。</p>':'')+
      auditTable(['历史首发与本届重合','采用场数','系列赛胜负'],history)+
      '<p>推荐模型截至 '+audit.asOf+' 的 90 天内共采用 '+total+' 场，其中 '+t.roundSeries+' 场核实了完整回合比分。同期 Valve 榜第 '+t.rank+' 名，'+t.points+' 分，榜单五人与参赛名单重合 '+t.rankOverlap+' 人。</p>'+
      comparisons+external+swapStudy+'<p>'+ref('PGL 报名名单',audit.field)+' · '+ref('Valve 积分',audit.standings)+' · '+
      ref('赛前原卡',audit.forecast)+' · <a href="#verify/elite/singapore">同阵容 BO3 统计</a> · <a href="#verify/elite/lineups">换人权重回测</a></p></div>';
    return pickDisclosure('rosters','首发名单与采用的历史战绩',body);
  }
  function picksView() {
    const evidence=rosterPanel(state.event.rosterEvidence)+
      pickDisclosure('card-stats','模拟过关率与选队依据',cardStats()+pairedCardPanel())+
      tailRiskPanel()+pickDisclosure('probabilities','各队战绩概率',probabilityPanel())+
      pickDisclosure('swap','比较两队换位',swapPanel());
    const eventNotes=(state.event.stageComparison?pickDisclosure('stage-context','与往届赛事对照',PickEventContext.home(state.event)):'')+
      schedulePanel(state.event.stageSchedule)+sealedTickets(state.event.prospectiveStages,state.event.stage3MlForecasts);
    return '<div class="picks-home">'+cardPanel()+historicalPanel()+
      pickDisclosure('forecast-evidence','预测依据与队伍比较',evidence)+
      (eventNotes?pickDisclosure('event-records','赛程与赛前封存',eventNotes):'')+'</div>';
  }
  function slotTeams(category) {
    return state.card.map((slot,i)=>slot===category?i:-1).filter(i=>i>=0);
  }
  function closestSwap(perfect,ordinary) {
    let best=Infinity;
    for(const a of perfect) for(const b of ordinary) {
      const distance=Math.abs(PickSwap.compare(state.result,state.card,a,b).delta);
      if(distance<best) {
        best=distance;state.perfectPick=a;state.ordinaryPick=b;
      }
    }
  }
  function swapPanel() {
    const perfect=slotTeams(0), ordinary=slotTeams(1);
    const hasA=perfect.includes(state.perfectPick), hasB=ordinary.includes(state.ordinaryPick);
    if(!hasA || !hasB) closestSwap(hasA?[state.perfectPick]:perfect,hasB?[state.ordinaryPick]:ordinary);
    const a=state.perfectPick,b=state.ordinaryPick;
    const comparison=PickSwap.compare(state.result,state.card,a,b);
    const options=(indices,index)=>indices.map(i=>'<option value="'+i+'"'+(i===index?' selected':'')+'>'+escape(state.event.teams[i].name)+'</option>').join('');
    const selector='<div class="swap-inputs"><label>当前 3–0<select id="swap-perfect">'+options(perfect,a)+'</select></label>'+
      '<label>当前普通晋级<select id="swap-ordinary">'+options(ordinary,b)+'</select></label>'+
      '<button class="text-button" type="button" data-action="closest-swap">找过关率最接近的一对</button></div>';
    const shortRate=p=>(p*100).toFixed(2)+'%';
    const points=p=>Math.abs(p)<.00005?'0.00':(p>0?'+':'−')+Math.abs(p*100).toFixed(2);
    const table=auditTable(['填法','3–0','普通晋级','过关率','期望命中'],[
      ['当前卡',state.event.teams[a].name,state.event.teams[b].name,shortRate(comparison.original.passRate),formatNumber(comparison.original.expected)],
      ['换位卡',state.event.teams[b].name,state.event.teams[a].name,shortRate(comparison.swapped.passRate),formatNumber(comparison.swapped.expected)]
    ]);
    const outcomes=[['仅当前卡过关',comparison.originalOnly],['仅换位卡过关',comparison.swappedOnly],['两张都过关',comparison.both],['两张都未过关',comparison.neither]]
      .map(([name,p])=>'<div><dt>'+name+'</dt><dd>'+shortRate(p)+'</dd></div>').join('');
    const difference='<p class="swap-difference">换位后过关率变化 <strong>'+points(comparison.delta)+' 个百分点</strong>'+
      (comparison.nearTie?' <span>两种填法接近（相差不超过 2 个百分点）</span>':'')+'</p>';
    return '<section class="panel swap-panel" aria-labelledby="swap-title"><div class="panel-head"><div><h2 id="swap-title" tabindex="-1">3–0 与普通晋级换位对照</h2><p>固定其余八格，用同一组 '+comparison.n.toLocaleString('zh-CN')+' 条模拟路径核对两张卡能否中五格。</p></div></div>'+
      '<div class="panel-body">'+selector+'<div class="swap-results"><div>'+table+difference+'</div><dl class="swap-outcomes">'+outcomes+'</dl></div>'+
      '<p class="swap-example">如果 '+escape(state.event.teams[a].name)+' 普通晋级、'+escape(state.event.teams[b].name)+' 全胜，当前卡这两格都错，换位卡两格都中。</p>'+
      '<div class="swap-foot"><details><summary>模拟抽样误差</summary><p>过关率差值的近似 95% 区间为 '+points(comparison.ci95[0])+' 至 '+points(comparison.ci95[1])+' 个百分点，按同一条路径上两张卡的结果计算。模型本身的误差另计。</p></details>'+
      '<button class="outline-button" type="button" data-action="apply-swap">将此换位应用到我的卡</button></div></div></section>';
  }
  function historicalPanel() {
    if(!state.result.observed || selected())return '';
    const sc=summary(state.card),base=summary(seedCard());
    return '<section class="panel verification-result"><div class="panel-head"><h2>实际竞猜结果</h2><span class="'+(sc.total>=5?'status-ok':'status-no')+'">'+(sc.total>=5?'达标':'未达标')+'</span></div><div class="panel-body"><div class="outcomes"><strong class="metric-value">'+sc.total+'<span>/10</span></strong><span class="subtext">种子基线 '+base.total+' / 10</span></div><div class="validation">全胜 '+sc.hits[0]+'/2　普通晋级 '+sc.hits[1]+'/6　全败 '+sc.hits[2]+'/2</div></div></section>';
  }
  function roundName(number) {
    return ['第一轮','第二轮','第三轮','第四轮','第五轮'][number-1];
  }
  function opponentPanel() {
    const probabilities=state.result.opponents?.[state.opponentRound-1]?.[state.opponentTeam];
    if (!probabilities) return '';
    const rows=Array.from(probabilities,(p,i)=>({p,i})).filter(item=>item.p>0).sort((a,b)=>b.p-a.p);
    const total=rows.reduce((sum,item)=>sum+item.p,0);
    const rounds=Array.from({length:5},(_,index)=>'<option value="'+(index+1)+'"'+(index+1===state.opponentRound?' selected':'')+'>'+roundName(index+1)+'</option>').join('');
    const list=rows.map(({i,p})=>'<li><span>'+teamMarkup(i)+'</span><span class="opp-bar" aria-hidden="true"><i style="width:'+Math.min(100,100*p)+'%"></i></span><strong>'+formatRate(p)+'</strong></li>').join('');
    return '<section class="panel opponents"><div class="panel-head"><div><h2>可能遇到的对手</h2><p>按每条模拟路径的实际配对统计</p></div></div>'+
      '<div class="panel-body"><div class="form-row"><label>战队<select id="opp-team">'+teamOptions(state.opponentTeam)+'</select></label><label>轮次<select id="opp-round">'+rounds+'</select></label></div>'+
      '<div class="reach"><span>出战'+roundName(state.opponentRound)+'的概率</span><b>'+formatRate(total)+'</b></div>'+
      (list?'<ul class="opponent-list">'+list+'</ul>':'<p class="subtext">在当前模拟中，这支队伍均已提前晋级或淘汰。</p>')+
      '<p class="helper">各对手的相遇概率相加，等于这支队伍出战该轮的概率。</p></div></section>';
  }
  function bracketView() {
    const path=state.result.path;
    if (!path?.rounds?.length) return '<section class="panel"><div class="panel-head"><h2>瑞士轮对阵尚未载入</h2></div></section>';
    const board=SwissBoard.render({path,teamMarkup,teamNames:state.event.teams.map(t=>t.name)});
    return '<div class="swiss-layout">'+board+opponentPanel()+'</div>';
  }
  function deltaLabel(value) {
    return Number.isFinite(value)?(value>0?'+':'')+value.toFixed(1)+' 个百分点':'—';
  }
  function mapMatchup(match, left, right) {
    if(!state.feature.mapVeto || !match.mapBO1 || !match.mapBO3) return '';
    const one=match.mapBO1, three=match.mapBO3;
    const gate={
      'both':'两队均有同赛制、同图池的禁选记录。',
      'one':'仅一队有同赛制、同图池的禁选记录。另一队的禁选采用中性概率。',
      'no-veto':'缺少同赛制、同图池且阵容可核实的禁选记录，沿用近期表现模型的胜率。',
      'no-strength':'两队缺少可比较的分地图战绩，沿用近期表现模型的胜率。',
      'invalid-pool':'禁选与分图资料的赛事地图池或截止日期未能对应，沿用近期表现模型的胜率。',
      'same-team':'请选择两支不同的战队。'
    };
    const formatNote=(label,d)=>{
      const [a,b]=d.vetoN||[0,0];
      return '<p><strong>'+label+'</strong>　'+escape(gate[d.status]||'')+
        ' 已核实的禁选样本为 '+escape(left)+' '+a+' 场、'+escape(right)+' '+b+' 场。</p>';
    };
    const mapByName=row=>new Map((row.maps||[]).map(m=>[m.name,m]));
    const singles=mapByName(one), triples=mapByName(three);
    const mapNames=[...new Set([...singles.keys(),...triples.keys()])];
    const rows=mapNames.map(name=>{
      const s=singles.get(name),t=triples.get(name);
      return [name,formatRate(s?.selection),formatRate(s?.mapWin),formatRate(t?.selection),formatRate(t?.mapWin)];
    });
    const table=rows.length?auditTable(['地图','BO1 留图率',left+'单图胜率（BO1）','BO3 入选率',left+'单图胜率（BO3）'],rows)+
      '<p class="helper">单图胜率指在该赛制下打这张图时，左队获胜的模型概率。BO1 只留一张图。BO3 按计划入选的三张图统计，包含可能无需开打的决胜图，各图入选率合计 300%。</p>':'';
    const [na,nb]=one.strengthN||[0,0];
    const strengths='<p class="helper">当前图池内的赛前战绩为 '+escape(left)+' '+na+' 张、'+escape(right)+' '+nb+' 张，双方都有战绩的地图共 '+one.sharedMaps+' 种。</p>';
    const compared=[['BO1',one],['BO3',three]].map(([label,d])=>[label,formatRate(d.base),formatRate(d.probability),deltaLabel((d.probability-d.base)*100)]);
    return '<section class="map-matchup"><h3>禁选图对这场比赛的影响</h3><p class="helper">下表比较 '+escape(left)+' 在地图修正前后的胜率。上方显示最终胜率，计入已启用的其他修正。</p>'+
      auditTable(['赛制','修正前','修正后','变化'],compared)+'<div class="map-samples">'+formatNote('BO1',one)+formatNote('BO3',three)+'</div>'+strengths+table+'</section>';
  }
  function evidenceLevel(level) {
    return {high:'高',medium:'中',low:'低'}[level]||'待核实';
  }
  function regionMatchup(match, left, right) {
    if(!state.feature.regionRisk || !match.regionBO1 || !match.regionBO3) return '';
    const r=match.regionBO1;
    const reasons={active:'已采用赛前验证通过的跨区修正。','same-region':'同赛区交手，沿用原胜率。',
      'unknown-region':'参赛队的赛区归属待核实，沿用原胜率。',insufficient:'赛前可核实的跨区样本不足，沿用原胜率。',
      validation:'跨区修正在赛前验证中未达到使用条件，本场沿用原胜率。'};
    const teamRows=[[left,r.left],[right,r.right]].map(([name,t])=>[name,regionNames[t?.region]||'待核实',
      t?.intraN??'—',t?.crossN??'—',evidenceLevel(t?.uncertainty?.level)]);
    const sensitivity=r.active && Array.isArray(r.range)
      ?'地区与阵容修正系数上下移动一个估计标准差时，左队 BO1 胜率为 '+formatRate(r.range[0])+' 至 '+formatRate(r.range[1])+'。这个范围只描述该项修正的估计误差。':'';
    const pair=r.pairN?' 两赛区有 '+r.pairN+' 场可核实的直接对阵。':'';
    return '<section class="map-matchup"><h3>跨赛区表现对这场比赛的影响</h3><p class="helper">'+
      escape(reasons[r.reason] || (r.active?reasons.active:reasons.insufficient))+pair+'</p>'+
      auditTable(['赛制','修正前','修正后','左队变化'],[['BO1',r],['BO3',match.regionBO3]].map(([label,x])=>[
        label,formatRate(x.base),formatRate(x.probability),deltaLabel((x.probability-x.base)*100)]))+
      auditTable(['战队','赛区','区内线下赛','跨区线下赛','跨区估计不确定性'],teamRows)+
      '<p class="helper">样本来自赛前 180 天的非 Major 线下比赛，至少三名选手与本届首发重合。跨区场数少的队伍，在国际赛场上的表现更难判断。'+sensitivity+'</p></section>';
  }
  function rankMatchup(match,left,right) {
    const one=match.regionVrsBO1, three=match.regionVrsBO3;
    if(!state.feature.regionVrs || !one || !three) return '';
    const reasons={
      'active':'赛前国际线下赛检验支持这项调整。',
      'same-region':'两支队来自同一赛区，此项调整为零。',
      'no-global':'本届只有地区榜，缺少同期全球榜，此项调整为零。',
      'unknown-region':'至少一队的本届阵容与赛区归属未能核实，此项调整为零。',
      'insufficient':'缺少可核实的赛区前十积分或跨区比赛，此项调整为零。',
      'validation':'加入赛区积分后，赛前跨区线下赛的验证成绩未达到启用条件，此项调整为零。'
    };
    const sideRows=[[left,one.left],[right,one.right]].map(([name,team])=>[name,regionNames[team?.region]||'待核实',
      Number.isFinite(team?.depth)?team.depth.toLocaleString('zh-CN')+' 分':'—']);
    const results=[['BO1',one],['BO3',three]].map(([label,row])=>[label,formatRate(row.base),formatRate(row.probability),
      deltaLabel(100*(row.probability-row.base))]);
    const baseline=one.variant==='withLan'?'起点已包括上一项跨赛区线下赛修正。':'起点采用当前模型在赛区整体实力修正之前的胜率。';
    return '<section class="map-matchup"><h3>赛区整体实力怎样影响这场比赛</h3><p class="helper">'+escape(reasons[one.reason]||'此项调整为零。')+
      ' '+baseline+'</p>'+auditTable(['战队','所在赛区','除本队外，赛区前十积分中位数'],sideRows)+
      auditTable(['赛制',left+' 修正前',left+' 修正后','变化'],results)+'</section>';
  }
  function signalMatchup(match,left) {
    const {lanSignal:lan,pickSignal:pick}=state.feature;
    if((!lan && !pick) || !match.signalsBO1 || !match.signalsBO3) return '';
    const columns=['赛制','原胜率'];
    if(lan) columns.push('加入近期线下赛');
    if(pick) columns.push('加入 BO3 自选图');
    const rows=[[1,match.signalsBO1],[3,match.signalsBO3]].map(([bo,d])=>{
      const row=['BO'+bo,formatRate(d.before)];
      if(lan) row.push(formatRate(d.afterLan));
      if(pick) row.push(bo===3?formatRate(d.afterPick):'仅用于 BO3');
      return row;
    });
    return '<section class="map-matchup"><h3>'+escape(left)+' 的胜率如何随所选特征变化</h3>'+
      auditTable(columns,rows)+'</section>';
  }
  function majorMatchup(match,left,right) {
    const one=match.majorFormBO1, three=match.majorFormBO3;
    if(!state.feature.majorForm || !one || !three) return '';
    const reasons={active:'更早整届赛事的验证支持采用阵容的 Major 表现。',
      validation:'此前赛事还未验证出稳定收益，本场保留原胜率。',
      insufficient:'双方都缺少可重复的 Major 表现证据，本场保留原胜率。',
      lineup:'当前首发名单未通过核验，本场保留原胜率。',
      cutoff:'大赛记录与预测的截止日期不符，本场保留原胜率。'};
    const rows=[[left,one.left],[right,one.right]].map(([name,t])=>[name,t?.editions??'—',t?.series??'—',
      t?.series?t.wins:'—',t?.series?formatNumber(t.expectedWins,1):'—',t?.repeat?'有':'待观察']);
    const series=[['BO1',one],['BO3',three]];
    const showTrial=series.some(([,d])=>d.reason==='validation' && Number.isFinite(d.candidateProbability) &&
      Math.abs(d.candidateProbability-d.base)>1e-10);
    const headings=['赛制',left+' 修正前','此项处理后','实际调整'];
    if(showTrial) headings.push('研究假设下的胜率');
    const rates=series.map(([label,d])=>{
      const values=[label,formatRate(d.base),formatRate(d.probability),deltaLabel((d.probability-d.base)*100)];
      if(showTrial) values.push(formatRate(d.candidateProbability));
      return values;
    });
    const hypothetical=showTrial?'<p class="helper">最后一列展示直接采用历史估计时左队会有多少胜率。本届验证未支持这项调整，预测未使用该列。</p>':'';
    return '<section class="map-matchup"><h3>过往 Major 表现对这场比赛的影响</h3><p class="helper">'+
      escape(reasons[one.reason]||'样本不足时沿用原胜率。')+'</p>'+
      auditTable(['战队','此前届数','系列赛','实际胜场','预期胜场','重复表现'],rows)+
      auditTable(headings,rates)+hypothetical+'</section>';
  }
  function matchupPanel() {
    if (!api.duel) return '';
    const event=state.event;
    const i=state.leftTeam,j=state.rightTeam;
    const match=api.duel(event.id,flags(),i,j);
    const side=(index,right)=>'<label><span>'+teamMarkup(index)+'</span><select id="duel-'+(right?'right':'left')+'" aria-label="'+(right?'右侧':'左侧')+'战队">'+teamOptions(index,right?i:j)+'</select></label>';
    const outcomes=[[1,match.bo1],[3,match.bo3]].map(([bo,p])=>{
      const width=(Math.max(0,Math.min(1,p))*100).toFixed(2);
      return '<div class="duel-format"><h3>BO'+bo+'</h3><div class="duel-values"><strong>'+formatRate(p)+'</strong><strong>'+formatRate(1-p)+'</strong></div><div class="duel-bar"><i style="width:'+width+'%"></i></div></div>';
    }).join('');
    if(isResearch())return '<section class="panel"><div class="panel-head"><h2>两队交手胜率</h2></div><div class="panel-body"><div class="duel-teams">'+side(i,false)+'<span class="versus">VS</span>'+side(j,true)+'</div>'+outcomes+'<p>'+escape(modelBasis())+'</p></div></section>';
    const actual=Number.isInteger(match.h2hN)&&match.h2hN>0?match.h2hWins+' 胜 '+(match.h2hN-match.h2hWins)+' 负':'暂无符合条件的直接交手';
    const effect=state.feature.style?'<div><span>打法假设对左队胜率的影响</span><b>BO1 '+deltaLabel(match.detailsBO1?.stylePP)+' · BO3 '+deltaLabel(match.detailsBO3?.stylePP)+'</b></div>':'';
    const h2h=state.feature.h2h && event.matchups?.weight===0?'<p class="helper">本届赛前留出样本中，加入交手记录没有降低预测误差，模型将交手权重设为零。</p>':'';
    const weight=event.formatWeight?.weight;
    let adjustment='';
    if(state.feature.format && state.feature.shrinkBO && Number.isFinite(weight)){
      const message=weight===0?'本届基础赛制修正权重为零。':'模型按此比例保留 BO1 与 BO3 对基础预测的修正。';
      adjustment='<p class="helper">截至 '+escape(event.formatWeight.asOf||event.asOf)+' 的赛前验证权重为 '+formatRate(weight)+'。'+message+'</p>';
    }
    const experienceEffect=state.feature.experience?'<div><span>Major 经验对左队 BO1 胜率的影响</span><b>'+deltaLabel(match.experiencePP)+'</b></div>':'';
    const detail='<div class="head-to-head"><div><span>左队历史交手</span><b>'+actual+'</b></div><div><span>左队 BO3 相对 BO1</span><b>'+deltaLabel((match.bo3-match.bo1)*100)+'</b></div>'+effect+experienceEffect+'</div>'+adjustment+h2h;
    const further=regionMatchup(match,event.teams[i].name,event.teams[j].name)+rankMatchup(match,event.teams[i].name,event.teams[j].name)+mapMatchup(match,event.teams[i].name,event.teams[j].name)+majorMatchup(match,event.teams[i].name,event.teams[j].name)+signalMatchup(match,event.teams[i].name);
    return '<section class="panel"><div class="panel-head"><div><h2>两队交手胜率</h2><p>选择战队，比较 BO1、BO3 胜率与双方打法。</p></div></div><div class="panel-body"><div class="duel-teams">'+side(i,false)+'<span class="versus">VS</span>'+side(j,true)+'</div>'+outcomes+detail+(further?'<details><summary>展开各项特征的胜率依据</summary>'+further+'</details>':'')+'</div></section>';
  }
  function formatProof(index) {
    const e=state.event,t=e.teams[index];
    const team=e.formatModel?.teams?.[t.name];
    return '<tr><td>'+teamMarkup(index)+'</td>'+['bo1','bo3'].map(k=>{
      const s=team?.[k];return '<td>'+(!s?.n?'—':s.w+' 胜 / '+s.n+' 场')+'</td>';
    }).join('')+'</tr>';
  }
  function formatPanel() {
    const e=state.event;
    const partial=[state.leftTeam,state.rightTeam].filter(i=>{
      const samples=e.formatModel?.teams?.[e.teams[i].name];
      return !samples?.bo1?.n || !samples?.bo3?.n;
    });
    const partialText=partial.length?'<p class="helper">'+partial.map(i=>escape(e.teams[i].name)).join('、')+' 缺少一种赛制样本，该队沿用整体赛制差异。</p>':'';
    return '<section class="panel"><div class="panel-head"><div><h2>赛制样本</h2><p>两队在已收录的赛前比赛中的战绩</p></div></div><div class="panel-body"><div class="table-wrap"><table class="result-table"><thead><tr><th>战队</th><th>BO1</th><th>BO3</th></tr></thead><tbody>'+[state.leftTeam,state.rightTeam].map(formatProof).join('')+'</tbody></table></div><p class="helper">样本截止 '+escape(e.formatModel?.asOf||e.asOf)+'。实际胜率受对手强弱和比赛数量影响，样本越少，模型越依赖共同估计。</p>'+partialText+'</div></section>';
  }
  function profileName(id) {
    return globalThis.PickStyleReport?.labels[id] || '未分类';
  }
  function evidenceRows() {
    if(state.event.styleStudy && globalThis.PickStyleReport?.evidenceRows)return PickStyleReport.evidenceRows(state.event);
    const evidence=state.event.profileEvidence || {};
    return Object.entries(evidence).filter(([name,item])=>state.event.teams.some(t=>t.name===name)&&
      item && item.scenarioEligible!==false && styleModel?.profiles.some(p=>p.id===item.profile&&p.id!=='unknown'));
  }
  function styleSettings() {
    if (!styleModel) return '';
    const assigned=state.event.teams.filter(t=>state.scenario.assignments[t.name] && state.scenario.assignments[t.name]!=='unknown').length;
    const nonzero=styleModel.pairs.filter(p=>state.scenario.edges[p.key]).length;
    const assignments=state.event.teams.map((team,i)=>{
      const id=state.scenario.assignments[team.name] || 'unknown';
      const opts=styleModel.profiles.map(p=>'<option value="'+escape(p.id)+'"'+(id===p.id?' selected':'')+'>'+escape(profileName(p.id))+'</option>').join('');
      return '<label>'+teamMarkup(i)+'<select id="style-team-'+i+'" data-profile="'+i+'" aria-label="'+escape(team.name)+' 的打法">'+opts+'</select></label>';
    }).join('');
    const evidence=evidenceRows();
    const evidenceLinks=evidence.map(([name,item])=>{
      let link='';
      try {
        const url=new URL(item.url);
        if (['https:','http:'].includes(url.protocol)) link=' <a target="_blank" rel="noopener noreferrer" href="'+escape(url.href)+'">'+escape(item.title||'查看来源')+' ↗</a>';
      } catch { /* Only source URLs with a valid scheme are linked. */ }
      return '<li><b>'+escape(name)+' · '+escape(profileName(item.profile))+'</b><span>'+escape(item.date)+' · '+escape(item.evidence)+'</span>'+link+'</li>';
    }).join('');
    const sourceBlock=evidence.length && !state.event.styleStudy?'<details class="evidence-notes"><summary>查看打法标签来源（'+evidence.length+'）</summary><ul>'+evidenceLinks+'</ul></details>':'';
    const applyButton=evidence.length?'<button class="outline-button" type="button" data-action="apply-profiles">使用数据默认分类</button>':'';
    const edges=styleModel.pairs.map((pair,index)=>{
      const value=state.scenario.edges[pair.key]||0;
      return '<div class="edge-control"><label for="edge-'+index+'">'+escape(profileName(pair.a))+' 对 '+escape(profileName(pair.b))+'</label><output for="edge-'+index+'" id="edge-value-'+index+'">'+(value>0?'+':'')+value+'</output><input type="range" id="edge-'+index+'" data-edge="'+index+'" min="-15" max="15" step="1" value="'+value+'"></div>';
    }).join('');
    const example='优先采用近期整队资料，其余按同核心的进攻录像或近 90 天记分板归类。展开对位检验可查估计幅度、样本量和留出成绩。';
    if(isResearch())return '<section class="panel"><div class="panel-body">此模型使用封存的对局胜率。可在推荐模型或决策树中调整打法假设。</div></section>';
    const status=(state.feature.style?'已开启':'已关闭')+' · '+assigned+' 队已标注 · '+nonzero+' 项克制';
    return '<section class="panel style-panel"><div class="panel-head"><div><h2>打法克制情景</h2><p>'+status+'</p></div><button type="button" class="outline-button" data-action="toggle-style">'+(state.feature.style?'关闭情景':'启用情景')+'</button></div><div class="panel-body"><p class="subtext">'+example+'</p>'+
      '<details id="style-editor"'+(state.editStyle?' open':'')+'><summary>编辑战队打法与克制幅度</summary><div class="style-columns"><div><h3>战队打法</h3><div class="assignment-grid">'+assignments+'</div>'+applyButton+sourceBlock+'</div><div><h3>克制幅度</h3><p class="subtext">单位为百分点，以原本五五开的对局为参考。正值利于前一种打法，负值利于后一种。</p><div class="edge-list">'+edges+'</div><button type="button" class="text-button" data-action="clear-style">恢复数据给出的打法和幅度</button></div></div></details></div></section>';
  }
  function duelView() {
    const e=state.event;
    const report=e.styleStudy?globalThis.PickStyleReport.render(e,state.leftTeam,state.rightTeam,teamMarkup):'';
    return '<div class="duel-layout">'+matchupPanel()+report+styleSettings()+(isResearch()?'':formatPanel())+'</div>';
  }
  function sourceLabel(url) {
    if (url.hostname.includes('github')) {
      return url.pathname.includes('rulebook') ? 'Valve · Major 瑞士轮规则' : 'Valve · 赛前 VRS 积分与阵容';
    }
    const labels = {'blast.tv':'BLAST · 比赛赛果', 'fragcharts.com':'FragCharts · 阶段种子与对阵',
      'en.wikipedia.org':'Wikipedia · 历史赛事记录', 'liquipedia.net':'Liquipedia · 第一阶段',
      'www.pglesports.com':'PGL · 新加坡 Major 官方赛事页'};
    return labels[url.hostname] || url.hostname;
  }
  function sources() {
    return (state.event.sources||[]).map(s=>{
      const url= typeof s==='string'?s:s.url; const title= typeof s==='string'?'':s.title;
      try {const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return '';return '<li><a href="'+escape(u.href)+'" target="_blank" rel="noopener noreferrer">'+escape(title||sourceLabel(u))+'</a></li>';}catch{return '';}
    }).join('');
  }
  const regionNames = {europe:'欧洲',americas:'美洲',asia:'亚洲',multi:'多赛区'};
  function lineupPanel(e,t) {
    const c=t.coreAudit || {}, counts=c.retained || {};
    const kept=[5,4,3].map(n=>n+'/5 重合 '+(counts[n]??0)+' 场').join('　');
    const change=e.rosterChanges?.[t.name];
    const changeNote=change?'<p class="helper">'+escape(change.date)+' · '+escape(change.note)+' <a href="'+escape(change.sources[0])+'" target="_blank" rel="noopener noreferrer">阵容来源</a></p>':'';
    const head='<h3>本届首发与历史样本</h3><p>'+t.roster.map(escape).join(' · ')+'</p>'+changeNote;
    const gate='<p class="helper">以本届五人为参照，每场直接核对。双方出场阵容及其赛前积分阵容也须通过三人门槛。整队转会可跨队名归属，缺少对手五人名单的场次跳过。</p>';
    const audit='<p>有效历史　'+escape(kept)+'</p><p class="helper">另有 '+escape(c.unverified??0)+' 场未能核齐双边记录或赛前积分。月榜积分阵容重合 '+escape(t.vrsCoreOverlap)+'/5 · '+escape((t.vrsRoster||[]).join(' · '))+'</p>';
    const exp=e.experience, team=exp?.teams?.[t.name];
    if(!team) return head+audit+gate;
    const display=n=>Number.isInteger(n)?n:'待核实';
    const rows=team.players.map(p=>[p.name,display(p.appearances),display(p.titles)]);
    const notes=[];
    if(Number.isInteger(team.zero)) notes.push((exp.full?'首次出战 ':'收录赛事内零出场 ')+team.zero+' 人','出战 1–2 届 '+team.few+' 人','有冠军经历 '+team.champions+' 人');
    const span=exp.full?'此前 '+exp.editions+' 届 Major 出场数':'已完整收录的 '+exp.editions+' 届出场数';
    return head+audit+gate+'<h3>首发五人的 Major 经验</h3><p>'+escape(notes.join(' · '))+'</p>'+
      auditTable(['选手',span,exp.titlesFull?'已夺冠届数':'已核实冠军届数'],rows)+
      '<p class="helper">统计开赛前已结束的赛事，同一届打多个阶段计一次。教练和未登场替补不计入。'+
      (exp.full?'':'出场记录有缺口，零场只代表收录范围内未出场。')+'</p>';
  }
  function playerLanPanel(e,t) {
    const data=e.lineupLan, side=data?.teams?.[t.name];
    if(!side?.players?.length) return '';
    const entries=Object.values(data.teams).flatMap(team=>team.players);
    const covered=entries.filter(player=>player.n>0).length;
    const rows=side.players.map(p=>[p.name,p.n,p.crossN,p.outsideCoreN,p.ratedN,
      Number.isFinite(p.teamResidual)?deltaLabel(p.teamResidual*100):'—']);
    return '<details class="team-map-samples"><summary>五名选手的国际线下赛经历</summary>'+
      '<p class="helper">截至 '+escape(data.asOf)+' 的 '+data.windowDays+' 天，收录已完赛、至少两区有核实记录的非 Major 线下赛事。'+
      (data.first && data.last?'本届档案中最早、最近比赛分别是 '+escape(data.first)+'、'+escape(data.last)+'。':'')+
      '全阶段 '+covered+' / '+entries.length+' 个首发席位有可核实的个人出场记录。当前五人全部同场 '+side.fullFiveN+
      ' 场，至少三人同场 '+side.coreN+' 场，其中跨区 '+side.crossCoreN+' 场。按实际登场选手匹配，俱乐部更名或转会后仍可追踪。</p>'+
      auditTable(['选手','出场','跨区','原核心以外','有积分对照','所在队超预期胜率'],rows)+
      '<p class="helper">「原核心以外」指选手所在一方与本届首发仅重合一至两人。末列用所在队的实际胜负与赛前积分预期作比较，按场数收缩，单位为百分点。场次为 0 表示本档案缺少符合条件的比赛。</p></details>';
  }
  function teamMapSamples(e,t) {
    const sample=e.mapStrength?.teams?.[t.name];
    if(!sample) return '';
    const counts=e.mapStrength.pool.map(name=>{
      const info=sample.maps?.[name];
      return [name,info?.n||0,info?.wins||0];
    });
    const dates=sample.first && sample.last?'，赛前样本日期 '+escape(sample.first)+' 至 '+escape(sample.last):'';
    return '<details class="team-map-samples"><summary>分地图实力样本 · '+escape(t.name)+' '+sample.n+' 张图</summary>'+
      '<p class="helper">逐图核实地图、胜负和当场阵容，至少三名队员与本届首发重合'+dates+'。</p>'+
      auditTable(['地图','样本张数','胜图数'],counts)+'</details>';
  }
  function regionalPanel(e) {
    if(!e.teams.some(t=>t.regional))return '';
    const t=e.teams[state.regionalIdx];
    const rows=[['区内对局','intra'],['跨区对局','cross']].map(([label,key])=>{
      const item=t.regional?.[key] || {};
      const residual=Number.isFinite(item.residual)?(item.residual>=0?'+':'')+(100*item.residual).toFixed(1)+' pp':'—';
      return '<tr><td>'+label+'</td><td>'+(item.n??0)+'</td><td>'+formatRate(item.observed)+'</td><td>'+formatRate(item.expected)+'</td><td>'+residual+'</td></tr>';
    }).join('');
    const newer=e.recentRating?.teams?.[t.name];
    const recent=newer?'<p class="rank-refresh">'+escape(e.recentRating.basis||'临赛 VRS')+' · '+escape(e.recentRating.asOf)+' · '+(e.recentRating.rankScope==='regional'?'赛区':'全球')+' #'+escape(newer.rank)+' · '+escape(newer.points)+' 分'+
      (Number.isInteger(newer.overlap)?' · 与本届首发重合 '+newer.overlap+'/5 人':'')+'</p>':'';
    const teams=e.teams.map((team,i)=>'<option value="'+i+'" '+(state.regionalIdx===i?'selected':'')+'>'+escape(team.name)+'</option>').join('');
    const calibrated=state.family==='v4';
    const evidence=activeEvidence(e);
    const vector=calibrated ? evidence.v4Model?.teams?.[t.name] : t;
    const fields=[['近期状态','form','n'],['对强队','strong','ns'],['对弱队','weak','nw']];
    if(calibrated) fields.push(['回合净胜','round','nRound']);
    const marks=fields.map(([label,field,samples])=>{
      const value=vector?.[field], count=vector?.[samples]||0;
      const unit=field==='round'?'':' pp';
      const delta=count && Number.isFinite(value)?(value>=0?'+':'')+(value*100).toFixed(1)+unit:'—';
      return '<div><small>'+label+'</small><strong>'+delta+'</strong><span>'+count+' 场</span></div>';
    }).join('');
    let explanation='状态项表示收缩后的实际胜率与赛前预期之差，以百分点（pp）计。';
    if(calibrated) {
      explanation+='强、弱对手按该场校准后的赛前胜率划分。回合净胜显示扣除对手强度和小样本收缩后的净胜回合占比 × 100。';
      if(!vector?.nRound) explanation+='该队缺少可核实的回合样本，回合净胜修正为零。';
    }
    const c=e.closeSnapshot, extra=c?.byTeam?.[t.name], r=e.regionRisk?.teams?.[t.name];
    const recentMatches=c?'<h3>月榜之后的比赛</h3><p>统计区间 '+escape(c.baseAsOf)+' 之后至 '+escape(c.asOf)+'。'+
      escape(t.name)+' 有 '+(extra?.series||0)+' 场新增记录，其中 BO1 为 '+(extra?.bo1||0)+' 场、BO3 为 '+(extra?.bo3||0)+' 场。'+
      (extra?.series?'其中 '+(extra.scoredSeries||0)+' 场核实了双方赛前积分，可用于更新近期实力。':'')+
      (extra?.latestMatch?' 最近一场为 '+escape(extra.latestMatch)+'。':'')+'</p>':'';
    const region=r?'<h3>跨区实力证据</h3><p>本届首发在赛前 180 天的非 Major 线下比赛中，区内 '+r.intraN+' 场，跨区 '+r.crossN+
      ' 场，跨区估计的不确定性为'+evidenceLevel(r.uncertainty?.level)+'。</p>':'';
    return '<section class="panel wide" id="team-evidence"><div class="panel-head"><div><h2>战队赛前数据</h2><p>过去 90 天 · 按赛前双方赛区归类</p></div><select id="region-team" aria-label="选择查看区域表现的战队">'+teams+'</select></div><div class="panel-body"><div class="team-meta">'+escape((t.regions||[t.region]).map(x=>regionNames[x]||x).filter(Boolean).join(' / ')||'赛区未知')+' · '+escape(e.asOf)+' 月榜 · 全球 VRS '+(t.rank?'#'+escape(t.rank)+' · ':'')+(Number.isFinite(t.points)?escape(t.points)+' 分':'未匹配 · 推演采用本阶段中位数')+'</div>'+recent+lineupPanel(e,t)+playerLanPanel(e,t)+recentMatches+region+'<h3>当前策略使用的近期战绩</h3><div class="team-marks">'+marks+'</div><p class="helper">'+escape(explanation)+'</p>'+teamMapSamples(evidence,t)+'<div class="table-wrap"><table class="result-table"><thead><tr><th>对阵类型</th><th>场数</th><th>实际胜率</th><th>赛前预期</th><th>差值</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="helper">区内与跨区胜率采用赛前积分模型的赛前预期，差值以百分点（pp）计。赛区不明确的比赛 '+escape(t.regional?.unknown??0)+' 场。此表使用基础快照，跨区修正另外检验国际线下赛表现。</p></div></section>';
  }
  function auditTable(headers, rows) {
    const header=headers.map(h=>'<th scope="col">'+escape(h)+'</th>').join('');
    const body=rows.map(row=>'<tr>'+row.map((v,i)=>i===0?'<th scope="row">'+escape(v)+'</th>':'<td>'+escape(v)+'</td>').join('')+'</tr>').join('');
    return '<div class="table-wrap"><table class="result-table"><thead><tr>'+header+'</tr></thead><tbody>'+body+'</tbody></table></div>';
  }
  function strategyAuditPanel(e) {
    const history=api.events.filter(h=>h.hasResults && Number.isInteger(h.historyPresets?.default?.model) && Number.isInteger(h.historyPresets?.v4?.model))
      .sort((a,b)=>b.date.localeCompare(a.date));
    if(!history.length) return '';
    const scores=history.map(h=>[h.historyPresets.default.model,h.historyPresets.v4.model]);
    const cardRows=history.map((h,i)=>[h.label.replace(/\s*Major\s*/i,' '),...scores[i].map(n=>n+' / 10')]);
    cardRows.push(['合计命中',...[0,1].map(i=>scores.reduce((sum,s)=>sum+s[i],0)+' / '+(history.length*10))]);
    cardRows.push(['达到五格',...[0,1].map(i=>scores.filter(s=>s[i]>=5).length+' / '+history.length+' 届')]);
    const audits=(e.auditSummary?.matchRows||[]).filter(row=>row.label?.includes('五届 Stage 1'));
    const comparisons=audits.length?'<h3>单场预测</h3>'+auditTable(['策略','胜方命中','Brier 分数 ↓'],audits.map(row=>[
      row.label.startsWith('原版')?classicPresetLabel:recentStudyLabel,row.correct+' / '+row.n,formatNumber(row.brier,5)
    ]))+'<p class="helper">Brier 分数衡量预测概率与实际胜负的偏差，越低越好。</p>':'';
    const test=e.v4Holdout;
    const holdout=test?'<h3>其他阶段检验</h3><p class="helper">另取 '+escape(test.stageCount)+' 个后续阶段，共 '+escape(test.n)+' 场。使用奥斯汀、布达佩斯和科隆各自 Stage 1 前冻结的实力数据推演 Stage 2 和 3。</p>'+
      auditTable(['策略','胜方命中','Brier 分数 ↓','达标阶段'],[
        [classicPresetLabel,test.baseCorrect+' / '+test.n,formatNumber(test.baseBrier,5),test.basePassed+' / '+test.stageCount],
        [recentStudyLabel,test.v4Correct+' / '+test.n,formatNumber(test.v4Brier,5),test.v4Passed+' / '+test.stageCount]
      ]):'';
    return '<section class="panel wide audit-section"><div class="panel-head"><div><h2>积分与近期表现的历史对照</h2><p>这项历史实验固定使用「过关率优先」填卡，对照只用积分与加入近期表现的结果。侧栏跟随所选模型更新。</p></div></div>'+
      '<div class="panel-body"><h3>Stage 1 竞猜命中</h3>'+auditTable(['赛事',classicPresetLabel,recentStudyLabel],cardRows)+comparisons+holdout+'</div></section>';
  }
  function mapAuditPanel(e) {
    const report=e.mapAudit;
    if(!report?.total || !report.stages?.length) return '';
    const total=report.total, count=report.stages.length;
    const names=new Map(api.events.map(h=>[h.id,h.label.replace(/\s*Major\s*/i,' ')]));
    const stageRows=report.stages.map(r=>[
      names.get(r.id)||r.label,r.coverage.actual.bo1.used+' / '+r.coverage.actual.bo1.n,
      r.coverage.actual.bo3.used+' / '+r.coverage.actual.bo3.n,
      r.base.card.hits+' / 10',r.candidate.card.hits+' / 10'
    ]);
    const met=(label,a,b)=>[label,a,b];
    const scoreRows=[
      met('全败（0–3）命中',total.base.card.bucketHits[2]+' / '+(2*count),total.candidate.card.bucketHits[2]+' / '+(2*count)),
      met('十格卡合计命中',total.base.card.hits+' / '+(10*count),total.candidate.card.hits+' / '+(10*count)),
      met('达到五格的届数',total.base.card.passes+' / '+count,total.candidate.card.passes+' / '+count)
    ];
    for(const key of ['bo1','bo3']) {
      scoreRows.push(met(key.toUpperCase()+' 胜率误差（Brier）',formatNumber(total.base[key].brier,5),formatNumber(total.candidate[key].brier,5)));
    }
    const stability=e.mapStability;
    const seedNote=stability && ['improved','unchanged','worse','n'].every(k=>Number.isInteger(stability[k])) ?
      '<p class="helper">在同样五届赛事上换用 '+stability.n+' 组模拟随机数。加入禁选图后，过关届数增加的有 '+stability.improved+' 组，持平 '+stability.unchanged+' 组，减少 '+stability.worse+' 组。</p>':'';
    const changed=['bo1','bo3'].map(key=>total.coverage[key].changed).reduce((a,b)=>a+b,0);
    const matches=total.coverage.bo1.n+total.coverage.bo3.n;
    const coverageText=['bo1','bo3'].map(key=>{
      const f=total.coverage[key], reasons=f.reasons||{};
      return key.toUpperCase()+' 双方均有记录 '+(reasons.both||0)+' 场，仅一队有记录 '+(reasons.one||0)+' 场，沿用基础胜率 '+(f.n-f.used)+' 场';
    }).join('。');
    return '<section class="panel wide audit-section"><div class="panel-head"><div><h2>模拟禁选图的历史检验</h2><p>以同一套近期表现模型、模拟次数和填卡目标，比较加入赛前禁选记录前后的结果。</p></div></div><div class="panel-body">'+
      auditTable(['五届合计','近期表现','近期表现＋禁选图'],scoreRows)+seedNote+
      '<h3>每届有多少对局用到了禁选图</h3>'+auditTable(['赛事','BO1 有依据','BO3 有依据','原卡命中','加禁选图后'],stageRows)+
      '<p class="helper">有依据的对局需有可核实的禁选历史及双方可比的分地图战绩。'+coverageText+'。'+matches+' 场中共有 '+changed+' 场的预测概率发生变化。Brier 越低，单场胜率预测误差越小。</p></div></section>';
  }
  const rankRegions=['europe','americas','asia'];
  function regionStat(value) {
    return Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
  }
  function rankStrengthStudy(e) {
    const stats=e.vrsRegionStats;
    if(!stats) return '';
    const rows=rankRegions.map(key=>{
      const r=stats.regions[key];
      return [regionNames[key],regionStat(r.teams),regionStat(r.medianPoints),regionStat(r.top10MedianPoints),regionStat(r.top30World),regionStat(r.top50World)];
    });
    const notes=stats.officialGlobal?'本期全球榜共 '+regionStat(stats.globalTeams)+' 支。':'本期只有地区榜，全球前 30 和前 50 的席位无法核实。';
    const ranked=api.events.filter(event=>event.hasResults && event.vrsRegionStats).sort((a,b)=>b.date.localeCompare(a.date));
    const prevRows=ranked.map(h=>[h.label,h.vrsRegionStats.asOf,...rankRegions.map(r=>regionStat(h.vrsRegionStats.regions[r].top30World))]);
    const previous=ranked.length?'<details class="team-map-samples"><summary>往届开赛前，各区占全球前 30 多少席</summary>'+
      auditTable(['赛事','榜单日期',...rankRegions.map(r=>regionNames[r])],prevRows)+
      '<p class="helper">哥本哈根只有地区榜。若 Valve 将同一阵容同时列入两个地区榜，其全球席位由两个赛区平分。</p></details>':'';
    const links=(stats.sources||[]).filter(row=>row?.url?.startsWith('https://')).map(row=>
      '<a href="'+escape(row.url)+'" target="_blank" rel="noopener noreferrer">'+escape(row.title||'Valve 榜单原文')+'</a>');
    let gate='';
    const variants=e.regionVrsModel?.variants;
    if(variants?.solo && variants?.withLan) {
      const models=[['单独加入赛区 VRS',variants.solo],['已使用跨区线下赛修正',variants.withLan]];
      const observed=variants.solo.validation?.byRegion;
      const heldout=observed?'<h3>赛前跨区线下赛中，各赛区表现如何</h3>'+
        auditTable(['赛区','实际胜场 / 场数','原预期胜场','加入赛区 VRS 后'],rankRegions.map(k=>{
          const row=observed[k];
          return [regionNames[k],row.wins+' / '+row.n,formatNumber(row.baseExpectedWins,1),formatNumber(row.adjustedExpectedWins,1)];
        }))+'<p class="helper">预期胜场为该赛区逐场赛前胜率之和。每场在交手双方各区分别计一次。不同对手和样本量会影响比较。</p>':'';
      gate='<details class="team-map-samples"><summary>本届采用赛区修正的依据</summary>'+
        auditTable(['应用场景','赛前验证场数','涉及赛事','原胜率误差','修正后误差','采用修正'],models.map(([label,model])=>{
          const v=model.validation;
          return [label,regionStat(v?.n),regionStat(v?.events),formatNumber(v?.baseBrier,5),formatNumber(v?.adjustedBrier,5),v?.passed?'是':'否'];
        }))+'<p class="helper">模型先考虑两队自身积分和赛制，再检验赛区前十的积分差能否改善跨区线下赛预测。误差采用 Brier 分数，越低越好。只有已按线下赛表现修正的对局才使用第二行的检验。</p>'+heldout+'</details>';
    }
    return '<section class="panel wide audit-section"><div class="panel-head"><div><h2>亚洲、美洲和欧洲的 VRS 实力</h2><p>Valve 赛前榜单 · '+
      escape(stats.asOf)+'</p></div></div><div class="panel-body">'+
      auditTable(['赛区','上榜队数','全区积分中位数','前十积分中位数','全球前 30 席位','全球前 50 席位'],rows)+
      '<p class="helper">'+notes+' 各区上榜队数不同。模型用前十队的积分中位数比较各区头部实力，预测具体对局时先剔除参赛队自身。'+
      (stats.sharedTop30?' 本期全球前 30 中有阵容同时登记在多个赛区，席位按赛区均分。':'')+'</p>'+
      (links.length?'<p class="history-sources">'+links.join(' · ')+'</p>':'')+
      previous+gate+rankAccuracy(e.regionVrsAudit)+'</div></section>';
  }
  function rankAccuracy(report) {
    if(!report?.totals) return '';
    const names=[['原近期表现','base','baseVrs'],['含跨区线下赛修正','region','regionVrs'],['临赛综合','combined','combinedVrs']];
    const rows=names.map(([label,before,after])=>{
      const a=report.totals[before],b=report.totals[after];
      return [label,formatNumber(a.all.brier,5)+' → '+formatNumber(b.all.brier,5),
        a.card.hits+' → '+b.card.hits,a.card.passes+' → '+b.card.passes,a.card.bucketHits[2]+' → '+b.card.bucketHits[2]];
    });
    const sensitivity=report.totals.baseVrs.stability;
    const repeats=sensitivity?' 在相同五届赛果上更换 '+report.sensitivitySeeds.length+' 组随机数，近期表现模型加入赛区实力后，有 '+
      sensitivity.improved+' 组多过关、'+sensitivity.unchanged+' 组持平、'+sensitivity.worse+' 组少过关。':'';
    const impact=report.singapore?.baseVrs?.pairEffects?.bo1;
    const newMatch=impact?'<p class="helper">新加坡 '+impact.potential+' 种潜在对阵中，单独加入赛区 VRS 后，有 '+
      impact.changed+' 种对阵的 BO1 胜率改变，最大变化 '+formatNumber(impact.maxAbsPP,1)+' 个百分点。'+
      (report.singapore.combinedVrs?.identicalProbabilities?'在本届临赛综合策略中，再开启此项的额外修正为零。':'')+'</p>':'';
    const groups=report.regionalPairs?.baseVrs;
    let samples='';
    if(groups) {
      const pairNames=[['asia-europe','亚洲对欧洲','亚洲'],['americas-europe','美洲对欧洲','美洲'],['americas-asia','美洲对亚洲','美洲']];
      const observed=pairNames.map(([key,label,first])=>{
        const before=report.regionalPairs.base[key],after=groups[key];
        return [label,regionStat(after.n),first,formatRate(before.predictedRate),formatRate(after.predictedRate),formatRate(after.observedRate)];
      });
      samples='<details class="team-map-samples"><summary>亚洲、美洲对阵其他赛区的实际胜率</summary>'+
        auditTable(['对阵','场数','胜率对应赛区','原预测','加入赛区实力','实际胜率'],observed)+
        '<p class="helper">按两队实际赛制比较原近期表现模型与加入赛区实力后的平均预测。各赛区遇到的对手和场数不同。</p></details>';
    }
    return newMatch+'<h3>赛区实力修正在五届首阶段的成绩</h3>'+auditTable(['原策略','单场概率误差 ↓','总命中 / 50','达标届数 / 5','全败命中 / 10'],rows)+
      '<p class="helper">箭头两侧分别为关闭与开启赛区 VRS；每行的其他模型设置、瑞士轮规则和模拟随机数一致。'+repeats+'</p>'+samples;
  }
  function majorStudy(e) {
    const form=e.majorForm;
    if(!form) return '';
    const t=e.teams[state.majorTeam], row=form.teams[t.name], gate=form.validation;
    const repeated=Object.entries(form.teams).filter(([,side])=>side.repeat);
    const n=repeated.length;
    const group=sign=>repeated.filter(([,side])=>side.logit*sign>0).map(([name])=>escape(name)).join('、')||'暂无';
    const patterns=n?'<p class="helper">按阵容重合人数、赛事日期和该届样本量加权，重复高于预期的有 '+group(1)+'，重复低于预期的有 '+group(-1)+'。</p>':'';
    const toggle=state.family==='v4'?'<button class="outline-button" id="toggle-major-form" type="button" data-action="toggle-major-form" aria-pressed="'+
      !!state.feature.majorForm+'">'+(state.feature.majorForm?'关闭':'启用')+' Major 表现修正</button>':'';
    const evidence=(row?.byEdition||[]).map(h=>{
      const c=h.overlapCounts||{};
      const labels=Array.isArray(h.teams) && h.teams.length?' · '+h.teams.join(' / '):'';
      return [h.label+labels,h.series,h.wins,formatNumber(h.expectedWins,1),[3,4,5].map(k=>c[k]||0).join(' / ')];
    });
    const teamSummary=row?.series?escape(t.name)+' 的现有核心在 '+row.editions+' 届可核验的 Major 打了 '+row.series+
      ' 场，实际赢了 '+row.wins+' 场，按各场赛前胜率合计预期赢 '+formatNumber(row.expectedWins,1)+' 场。':
      escape(t.name)+' 此前没有可核验、与本届首发至少重合三人的 Major 系列赛。';
    const pair=e.majorContrast?.teams?.[t.name];
    let contrast='';
    if(e.majorContrast) {
      if(pair?.matchedSeries && Number.isFinite(pair.pairedResidualPP)) {
        contrast='<details class="team-map-samples"><summary>和这套阵容平时的线下赛相比</summary><p>比较 '+
          pair.editions+' 届 Major 中可配到对照的 '+pair.matchedSeries+' 场，以及 '+pair.controlsN+' 场不同的对照比赛。</p>'+
          auditTable(['比较项','实际胜率超过赛前预期的幅度'],[['Major',deltaLabel(pair.majorResidualPP)],
            ['普通国际线下赛',deltaLabel(pair.controlResidualPP)],['两者差值',deltaLabel(pair.pairedResidualPP)]])+
          '<p class="helper">每场 Major 匹配此前 '+e.majorContrast.windowDays+' 天内已结束的 2–3 场普通国际线下赛。须保留相同三人核心、赛制相同，按积分估算的赛前胜率相差不超过 '+formatNumber(e.majorContrast.matchTolerance*100,0)+' 个百分点。各场 Major 权重相同，对照比赛可重复使用。这里按覆盖的各阶段（含淘汰赛）比较，用同一套赛前积分算预期。上方阵容特征只采纳有完整模型赛前胜率的瑞士轮。差值仅供查看。</p></details>';
      } else contrast='<p class="helper">此前普通国际线下赛的可核验记录不足，每场 Major 需要至少两场相似比赛来进行比较。</p>';
      const coverage=e.majorContrast.summary;
      if(coverage) contrast+='<p class="helper">本届 '+coverage.teamsTotal+' 队中有 '+coverage.teamsMatched+' 队能找到普通线下赛对照，其中 '+coverage.teamsRepeated+' 队覆盖至少两届 Major。</p>';
    }
    const records=evidence.length?auditTable(['往届赛事','场数','实际胜场','赛前预期胜场','阵容重合 3 / 4 / 5 人的场数'],evidence):'';
    const eligible=row?.repeat?'分届加权后，有 '+row.agreeingEditions+' 届'+(row.logit>0?'高于':'低于')+'预期，与该阵容的整体方向一致。':'该核心尚未积累可重复的同方向表现。';
    const summary=gate.passed?'此前按整届验证通过，可对有证据的阵容采用修正。':'赛前验证尚未达到启用条件，本届开启此项也保留原胜率。';
    const history=gate.n?'在更早的 '+gate.editions+' 届、'+gate.n+' 场可验证对局中，概率误差（Brier）从 '+
      formatNumber(gate.baseBrier,5)+' 变为 '+formatNumber(gate.candidateBrier,5)+'。':'此前没有可用于整届验证的对局。';
    const links=(form.sources||[]).filter(v=>v?.url && /^https?:\/\//i.test(v.url)).map(v=>
      '<a href="'+escape(v.url)+'" target="_blank" rel="noopener noreferrer">'+escape(v.title||'档案来源')+'</a>');
    return '<section class="panel wide audit-section" id="major-evidence"><div class="panel-head"><div><h2>哪些阵容在 Major 能打出超预期表现？</h2>'+
      '<p>截至 '+escape(form.asOf)+' · '+form.priorEditions+' 届已结束的 Major</p></div>'+toggle+'</div><div class="panel-body">'+
      '<label class="major-team-select">查看战队 <select id="major-team">'+teamOptions(state.majorTeam)+'</select></label><p>'+teamSummary+' '+eligible+'</p>'+records+
      '<p class="helper">按实际上场的选手追踪阵容，转会前的同一核心也可计入。档案收录 2024 年两届首阶段，以及奥斯汀、布达佩斯、科隆的三个瑞士轮阶段。同届多阶段合并，预期胜率计入对手与赛制。至少两届反复高于或低于预期，才会估算阵容效应，样本少时缩小修正幅度。选手的参赛与夺冠次数可在「战队赛前数据」中查看。</p>'+
      '<p>本届 '+n+' / '+e.teams.length+' 支战队有重复表现。'+summary+'</p>'+patterns+'<p class="helper">'+history+'</p>'+
      contrast+majorAudit(e.majorFormAudit)+eliminationStudy(e.featureStudy)+(links.length?'<details class="team-map-samples"><summary>历届比赛与阵容来源</summary><p class="history-sources">'+links.join(' · ')+'</p></details>':'')+
      '</div></section>';
  }
  function eliminationStudy(study) {
    if(!study?.base || !study?.salvage) return '';
    const rows=[[study.base,'实验基线（近期表现＋赛区实力）'],[study.salvage,'加入输局抢图表现']].map(([m,label])=>[
      label,formatNumber(m.bo3.brier,5),m.eliminationBO3.correct+' / '+m.eliminationBO3.n,
      m.card.bucketHits[2]+' / '+m.eliminationBO3.n
    ]);
    return '<details class="team-map-samples"><summary>淘汰战还能学习什么？</summary>'+
      '<p>这项试验检查一支队伍在输掉 BO3 时是否仍能赢下一张图，按赛前对手强度校正。下表比较五届首阶段的 '+
      study.base.bo3.n+' 场 BO3，这项特征仅供研究。</p>'+
      auditTable(['设置','BO3 概率误差（Brier）↓','0–2 淘汰战胜方命中','通行证 0–3 命中'],rows)+
      '<p class="helper">另一个待检验的特征是双方装备相近时，少一人后的回合翻盘率和多一人后的回合胜率。</p></details>';
  }
  function majorAudit(report) {
    if(!report?.totals?.candidate) return '';
    const count=report.stageCount, totals=report.totals;
    const strategies=[['base','近期表现＋赛区实力'],['candidate','加入 Major 表现'],['shadow','直接采用历史估计（对照）']];
    const rows=strategies.filter(([key])=>totals[key]).map(([key,label])=>{
      const m=totals[key];
      return [label,formatNumber(m.all.brier,5),m.card.hits+' / '+(10*count),
        m.card.passes+' / '+count,m.card.bucketHits[2]+' / '+(2*count)];
    });
    const compared=totals.candidate.stability;
    const repeats=compared?'<p class="helper">用相同的历史赛果更换模拟随机数。加入此项后，多过关 '+compared.improved+' 组，持平 '+
      compared.unchanged+' 组，少过关 '+compared.worse+' 组。</p>':'';
    const later=report.later;
    const laterNote=later?.totals?.candidate?'<p class="helper">另外按同一届首阶段前的强度，重放奥斯汀、布达佩斯、科隆的 '+later.stageCount+
      ' 个后续阶段。原模型与开启此项分别有 '+later.totals.base.card.passes+'、'+later.totals.candidate.card.passes+' 个阶段命中至少五格。</p>':'';
    return '<details class="team-map-samples"><summary>对照五届 Stage 1 的实际赛果</summary>'+
      auditTable(['设置','单场概率误差 ↓','整卡命中','达标届数','0–3 命中'],rows)+
      '<p class="helper">每届按开赛前能查到的阵容和历史重算。中间一行先用更早赛事检验这项修正，最后一行在有核心阵容证据时直接试算，用来检验这个假设。误差采用 Brier 分数，越低越好。</p>'+repeats+laterNote+'</details>';
  }
  function integratedStudy(e) {
    const report=e.integratedAudit, c=e.closeSnapshot, region=e.regionRisk;
    if(!c) return '';
    const sources=(c.sources||[]).filter(s=>s?.url && /^https?:\/\//i.test(s.url)).map(s=>
      '<a target="_blank" rel="noopener noreferrer" href="'+escape(s.url)+'">'+escape(s.title||'比赛记录')+'</a>');
    const coverage='<h3>新加坡临赛资料</h3><p>基础快照日期为 '+escape(c.baseAsOf)+'，临赛资料截至 '+escape(c.asOf)+
      '。核实 '+c.addedSeries+' 场新增比赛，涉及 '+c.teamsCovered+' 支参赛队，其中 '+c.scoredSeries+' 场有双方当时的实力积分，可用于更新近况。'+
      (c.latestMatch?' 最近一场比赛日期为 '+escape(c.latestMatch)+'。':'')+'</p><p class="helper">历史各届截至开赛前最后一个完整 UTC 日。新加坡使用制作时已结束的最后一个 UTC 日。首发、基础积分和地区线下赛档案分别按各自日期核验。</p>'+
      (sources.length?'<p class="history-sources">'+sources.join(' · ')+'</p>':'');
    let tables='';
    if(report?.totals && report.stages?.length) {
      const count=report.stageCount||report.stages.length, total=report.totals;
      const choices=[['base','原近期表现'],['close','只更新临赛战绩'],['region','只加跨区修正'],['card','只比较填法'],['combined','临赛综合策略']];
      const lines=choices.filter(([key])=>total[key]).map(([key,label])=>{
        const r=total[key];
        return [label,r.card.hits+'/'+10*count,r.card.passes+'/'+count,
          r.card.bucketHits[2]+'/'+2*count,formatNumber(r.all.brier,5),formatNumber(r.stability?.meanPasses,2)];
      });
      const stable=total.combined?.stability;
      const sensitivity=stable?' 相对原策略，综合策略过关届数增加 '+stable.improved+' 组，持平 '+stable.unchanged+' 组，减少 '+stable.worse+' 组。':'';
      const stages=report.stages.map(h=>[h.label,h.baseAsOf,h.closeAsOf,h.addedSeries,
        h.models.base.card.hits+' / 10',h.models.combined.card.hits+' / 10']);
      const tails=choices.filter(([key])=>['base','combined'].includes(key) && total[key]?.tail).map(([key,label])=>{
        const t=total[key].tail, n=2*count;
        return [label,t.top2+' / '+n,t.top4+' / '+n,t.top6+' / '+n,t.seedBottom2+' / '+n];
      });
      tables='<h3>各项改动对历史成绩的影响</h3>'+auditTable(['策略','总命中','达标届数','全败命中','概率误差 ↓','平均过关届数'],lines)+
        '<p class="helper">总命中按网页固定随机数计算。概率误差采用 Brier 分数，越低越好。平均过关届数是在相同的五届赛果上更换模拟随机数后计算。'+sensitivity+'</p>'+
        '<details class="team-map-samples"><summary>逐届查看临赛资料与命中格数</summary>'+
        auditTable(['赛事','基础快照','临赛截止','新增场数','原卡','综合卡'],stages)+'</details>'+
        (tails.length?'<details class="team-map-samples"><summary>真实 0–3 战队排在风险榜第几</summary>'+
          auditTable(['策略','进前 2','进前 4','进前 6','为末两号种子'],tails)+
          '<p class="helper">每届实际全败两支。末两号种子一栏用于对照赛事初始排序。</p></details>':'');
    }
    const later=report?.cardTransfer;
    if(later?.totals?.base && later.totals.card) {
      const base=later.totals.base.card, chosen=later.totals.card.card;
      tables+='<p class="helper">在另 '+later.stageCount+' 个后续阶段保持相同的赛前实力，仅比较填卡方式。原填法达标 '+
        base.passes+' 届、命中 '+base.hits+' 格，独立比较两种填法后达标 '+chosen.passes+' 届、命中 '+chosen.hits+' 格。</p>';
    }
    const v=region?.validation;
    const validation=v?'<h3>跨赛区胜率修正</h3><p>地区实力资料截至 '+escape(region.asOf)+'，按赛事时间留出的 '+(v.events??0)+' 项赛事中有 '+(v.n??0)+' 场跨区验证比赛。'+
      (v.passed?'修正通过赛前检验。':'按预设检验条件保留原胜率。')+
      (Number.isFinite(v.baseBrier) && Number.isFinite(v.adjustedBrier)?' Brier 从 '+formatNumber(v.baseBrier,5)+' 变为 '+formatNumber(v.adjustedBrier,5)+'。':'')+'</p>':'';
    const shared=region?.sharedState;
    const stateText=shared && typeof shared.passed==='boolean'?'<p class="helper">持续整届的队伍状态假设'+
      (shared.passed?'通过赛前检验。开启跨区表现后，每条模拟路径为各队抽取一次状态，并在其余轮次沿用。':'尚未通过赛前检验，瑞士轮沿用固定对阵胜率。')+'</p>':'';
    return '<section class="panel wide audit-section"><div class="panel-head"><div><h2>临赛综合策略的检验</h2></div></div><div class="panel-body">'+coverage+tables+validation+stateText+'</div></section>';
  }
  let calibrationField='s21';
  const calibrationFields={s21:'ESL Pro League S21 · 独立留出',s22:'ESL Pro League S22 · 发现问题',s23:'ESL Pro League S23 · 迁移对照',
    stage1:'Major · Stage 1',stage2:'Major · Stage 2',stage3:'Major · Stage 3'};

  function calibrationResults(study,field) {
    const group=study[field], count=group.events, rows=[];
    const base=group.methods.recommended?'recommended':'vrs';
    for(const [id,label] of [['recommended','推荐模型'],['vrs','VRS 积分']]) {
      for(const [suffix,extra] of [['',''],['Cal',' · 校准后']]) {
        const m=group.methods[id+suffix];
        if(m) rows.push([label+extra,m.passes+'/'+count,m.hits+'/'+(10*count),formatNumber(m.brier,4),formatNumber(m.logLoss,4)]);
      }
    }
    const paired=group.methods[base+'Cal'].paired;
    const info='在 30 组相同随机种子下，'+(base==='vrs'?'VRS':'推荐模型')+'校准后过关届数增加 '+paired.better+' 组、持平 '+paired.tied+' 组、减少 '+paired.worse+' 组。';
    let bins='';
    for(const [id,label] of [['recommended','推荐模型'],['vrs','VRS 积分']]) {
      const groups=group.bins[id];
      if(!groups) continue;
      const ties=groups.find(r=>r.label==='50/50');
      bins+=pickDisclosure('cal-bins-'+id,label+'的冷门分布',
        '<p>按校准前热门方胜率分档。预期次数是每场弱队胜率的总和。'+(ties?.n?'另有 '+ties.n+' 场五五开，只计入误差。':'')+'</p>'+
        auditTable(['热门胜率','场数','原预期冷门','校准后预期','实际冷门'],groups.filter(r=>r.label!=='50/50').map(r=>[r.label,r.n,r.expected.toFixed(1),r.after.toFixed(1),r.actual])));
    }
    const [lo,hi]=group.trainingRange;
    const training='各阶段开赛前，VRS 校准用了 '+(lo===hi?lo.toLocaleString('zh-CN'):lo.toLocaleString('zh-CN')+' 至 '+hi.toLocaleString('zh-CN'))+' 场 BO3。';
    return '<p>'+training+'表内单场误差按 '+group.n+' 场实打 BO3 计算。Brier 和对数损失越低，胜率越准。整卡命中 5 格即过关。</p>'+
      auditTable(['BO3 胜率','过关','命中','Brier','对数损失'],rows)+'<p>'+info+'</p>'+bins;
  }

  function calibrationPanel() {
    const study=singapore.tailCalibration;
    if(!study) return '';
    const options=Object.entries(calibrationFields).map(([id,label])=>'<option value="'+id+'"'+(id===calibrationField?' selected':'')+'>'+label+'</option>').join('');
    const outcome=singapore.tailScore;
    const singaporeResults=outcome?.status==='scored'
      ? auditTable(['赛前实验卡','实际命中','BO1 Brier','BO3 Brier'],Object.values(outcome.cards).map(c=>[c.name,c.hits+'/10',
          formatNumber(c.formats.bo1.brier,4),formatNumber(c.formats.bo3.brier,4)]))
      : '<p>新加坡 Stage 1 的四套赛前预测已封存。推荐模型和 VRS 各自校准前后的十格选人相同，完赛后可核对单场胜率的变化。</p>';
    return '<section class="panel wide audit-section" id="context-calibration"><div class="panel-head"><h2>BO3 冷门被低估了吗？</h2></div><div class="panel-body">'+
      '<p>用开赛前的比赛分别校准 VRS 和推荐模型，再用同一填卡方法检验。推荐模型在三个 Major 阶段的过关数都没有增加，首页沿用原设置。</p>'+
      '<p>ESL S22 用于发现问题，S21 单独留作历史检验。三届 ESL 均按当季配对规则重放，只对照 VRS。</p>'+
      '<div class="context-picker"><label for="calibration-field">查看样本</label><select id="calibration-field">'+options+'</select></div>'+
      '<div id="calibration-out" aria-live="polite">'+calibrationResults(study,calibrationField)+'</div>'+
      pickDisclosure('singapore-calibration','新加坡 Stage 1 的赛前校准实验',singaporeResults+
        '<p><a class="download-link" href="'+escape(singapore.tailForecastFile)+'" download>下载四张研究卡和 120 组对阵胜率</a></p>')+'</div></section>';
  }

  function verifyView() {
    const e=state.event;
    const downloads=[];
    const allocationStudy='<section class="panel wide audit-section"><div class="panel-head"><h2>调整填法后，命中有变化吗？</h2></div><div class="panel-body">'+
      pickDisclosure('allocation-study','五届首阶段从 23 格到 27 格，均有三届过关',
        '<p>两种填法使用同一套单场胜率。新填法保留原先预测的八支晋级队，按晋级条件下的全胜率分配两个 3–0 格，在剩余八队中选赛事种子最靠后的两队填 0–3。</p>'+
        auditTable(['赛前重建','原填法','新填法'],[['哥本哈根','5/10','5/10'],['上海','3/10','4/10'],['奥斯汀','5/10','8/10'],['布达佩斯','6/10','6/10'],['科隆','4/10','4/10']])+
        '<p>全败格从 2/10 到 5/10。更换 30 组模拟种子，总命中 29 组增加、1 组持平；达标届数 8 组增加、19 组持平、3 组减少。</p>'+
        '<p>锁定填法后再验上海第二阶段，固定种子从 7/10 到 6/10，30 组两法全部过关。这五届首阶段已多次用于开发，新加坡赛前封存卡将在完赛后单独评分。</p>')+'</div></section>';
    const f1=e.f1breStudy;
    const f1bre=f1?pickDisclosure('f1bre-study','F1bre 的阵容修正与千万张整卡穷举',
      '<p>DENDELE 沿用 Sharks 的五名首发。本站已纳入这套阵容的 '+f1.recent+' 场近期比赛，并核对了科隆的 '+f1.cologne+' 场 Major 记录。首场对 PARIVISION，本站估计 DENDELE 的胜率为 '+(100*f1.dendeleFirst).toFixed(1)+'%。</p>'+
      '<p>借鉴 F1bre 的整卡搜索，在本站胜率下，用 '+f1.searchPaths.toLocaleString('zh-CN')+' 条瑞士轮路径穷举全部 '+f1.visited.toLocaleString('zh-CN')+' 张卡。搜索第一与本站原有局部搜索得到同一张卡。独立重排前三张之后，再用 '+f1.auditPaths.toLocaleString('zh-CN')+' 条新路径评估。</p>'+
      auditTable(['参评卡','独立模拟过关率'],[['已封存预测',f1.released],['穷举第一',f1.best],['前三张独立重排',f1.reranked]].map(([k,n])=>[k,(100*n/f1.auditPaths).toFixed(2)+'%']))+
      '<p>五届 Stage 1 真实赛果回放：预测过 '+f1.historical.released.passes+'/5 届，命中 '+f1.historical.released.hits+'/50 格。穷举重排后过 '+f1.historical.allRechecked.passes+'/5 届，命中 '+f1.historical.allRechecked.hits+'/50 格。</p>'+
      '<p>作者帖中的 ML 模拟过关率为 20.66%，使用作者的单场模型。公开仓库提供算法和示例数据，未随附此次完整的新加坡输入。实际命中在完赛后核算。</p>'+
      '<p><a href="https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor" target="_blank" rel="noopener noreferrer">F1bre 的 ELO 项目 ↗</a> · <a href="https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor" target="_blank" rel="noopener noreferrer">ML 项目 ↗</a></p>'):'';
    const externalStudy=e.id==='singapore' ? '<section class="panel wide audit-section"><div class="panel-head"><h2>新加坡 Stage 1 · 外部预测对照</h2></div><div class="panel-body">'+
      pickDisclosure('external-pley','Pley 和本站对哪些队看法不同？',
        '<p>两边都选 Ninjas in Pyjamas 全胜。另一个 3–0 席位，本站封存预测给了 Eternal Fire，Pley 给了 PARIVISION。双方都把另一支队放在普通晋级。</p>'+
        '<p>分歧最大的是 Imperial。本站选它普通晋级，Pley 选它 0–3。双方都选 Chinggis Warriors 全败，本站的另一个 0–3 是 Lynn Vision。</p>'+
        '<p>两份预测均已在开赛前封存，完赛后按相同十格规则计分。<a href="https://pley.gg/cs2/major-pickem-stage-1/" target="_blank" rel="noopener noreferrer">Pley 原文 ↗</a> · <a class="download-link" href="forecasts/pley-singapore-stage1-2026-11-22.json" download>下载 Pley 十格预测</a></p>')+
      pickDisclosure('external-player-model','哪两支队被外部选手模型选作 3–0？',
        '<p>这套外部模型用选手近期地图表现估算实力，再模拟整届比赛。它和本站核对的是同一批 80 名首发，但它选 FaZe、100 Thieves 全胜，本站封存预测选 NiP、Eternal Fire。</p>'+
        '<p>旧版模型在科隆赛前提交的预测实际中 5/10。新加坡采用了新的比赛引擎，已在开赛前封存十格、16 队战绩概率及八场首轮胜率。<a href="https://github.com/Leclowndu93150/pickem-prediction-model/blob/0aea354ae205ed8585917999b8e350dd97cbddbe/predictions/pgl-major-singapore-2026-stage-1.json" target="_blank" rel="noopener noreferrer">查看原预测 ↗</a> · <a class="download-link" href="forecasts/git-model-2026-11-22.json" download>下载两届对照</a></p>')+
      pickDisclosure('external-r1','查看赛前分歧最大的两场 BO1',
        '<p>11 月 21 日封存时，两套模型在首轮八场都看好同一方。对 9z 击败 Lynn Vision 的概率，本站推荐模型给出 54.1%，DAKEbits 给出 78%。对 Liquid 击败 GOSH，双方分别给出 57.7% 和 74%。</p>'+
        '<p>本站初版卡和 CSGOTradeUp 有六格同栏。新填法有七格同栏，双方的 0–3 都是 Chinggis Warriors 和 Lynn Vision。完赛后可分别核对两版卡与外部卡。</p>'+
        '<p><a class="download-link" href="forecasts/singapore-stage1-external-2026-11-21.json" download>下载外部预测与来源</a></p>')+
      f1bre+'</div></section>' : '';
    if(e.id==='singapore') downloads.push('<a class="download-link" href="forecasts/singapore-stage1-seed-conditional-2026-11-21.json" download>下载当前预测的赛前封存</a>');
    if(e.id==='singapore') downloads.push('<a class="download-link" href="forecasts/singapore-stage1-earlier-stages-2026-11-21.json" download>下载往届阶段经验对照卡的赛前封存</a>');
    if(e.methodsForecast?.path) downloads.push('<a class="download-link" href="'+escape(e.methodsForecast.path)+'" download>下载原填法与决策树的赛前封存</a>');
    if(e.majorFormForecast?.path) downloads.push('<a class="download-link" href="'+escape(e.majorFormForecast.path)+'" download>下载加入 Major 表现的赛前预测</a>');
    if(e.regionVrsForecast?.path) downloads.push('<a class="download-link" href="'+escape(e.regionVrsForecast.path)+'" download>下载赛区实力策略的赛前预测</a>');
    if(e.integratedForecast?.path) downloads.push('<a class="download-link" href="'+escape(e.integratedForecast.path)+'" download>下载临赛综合策略的赛前预测</a>');
    if(e.mapForecast?.path) downloads.push('<a class="download-link" href="'+escape(e.mapForecast.path)+'" download>下载模拟禁选图策略的赛前预测</a>');
    if(e.v4Forecast?.path) downloads.push('<a class="download-link" href="'+escape(e.v4Forecast.path)+'" download>下载回合净胜＋强弱对手赛前预测</a>');
    if(e.strategyForecast?.path) downloads.push('<a class="download-link" href="'+escape(e.strategyForecast.path)+'" download>下载赛前积分模型与决策树模型的赛前预测</a>');
    if(e.frozenForecast?.path) downloads.push('<a class="download-link" href="'+escape(e.frozenForecast.path)+'" download>下载 11 月 21 日赛前预测（阵容修订前）</a>');
    const projectDownload=location.protocol==='file:'?'':('<a class="download-link" href="https://github.com/FanQAQ/cs2-singapore-major-2026-pickem-predictor/archive/refs/heads/main.zip">下载项目与回测数据</a><a class="download-link" href="https://github.com/FanQAQ/cs2-singapore-major-2026-pickem-predictor/releases/latest/download/fangos-lab-offline.zip" download>下载离线网页版</a><small>解压离线网页版后，打开 index.html 即可使用。</small>');
    let training=e.trainingNote;
    if(state.family==='v4' && e.v4Model) training='近期表现模型使用本届之前的 '+e.v4Model.n+' 场系列赛拟合。允许按对手强弱调整近期状态，并结合地图净胜回合估计胜率。';
    if(state.family==='boost' && e.boostModel) training='决策树模型使用本届之前的 '+e.boostModel.n+' 场系列赛训练，按所选特征学习积分与近期战绩的不同组合。';
    const method=[e.methodNote,training,e.coverage].filter(Boolean).map(text=>'<p>'+escape(text)+'</p>').join('');
    const studies=(e.stageComparison?PickEventContext.report(e):'')+'<section class="panel wide audit-section" id="context-f1bre"></section>'+allocationStudy+externalStudy+calibrationPanel()+'<section id="method-validation" class="panel wide audit-section"></section>'+majorStudy(e)+rankStrengthStudy(e)+integratedStudy(e)+mapAuditPanel(e)+strategyAuditPanel(e)+regionalPanel(e);
    const evidence='<section class="panel method"><div class="panel-head"><h2>预测用了哪些数据？</h2></div><div class="panel-body">'+
      '<p>'+escape(modelBasis())+'</p>'+
      (isResearch()?'':'<p class="data-cutoff">'+escape(byId('data-dates').textContent)+'</p>')+'</div></section>';
    const conclusions='<section class="panel"><div class="panel-head"><h2>默认推荐的历史回测说明了什么？</h2></div><div class="panel-body">'+
      '<p>首阶段沿用相同的对局胜率，只调整 3–0 和 0–3 的选队方法，五届总命中从 <strong>23/50 提高到 27/50</strong>，两种填法都是 <strong>3/5 届过关</strong>。</p>'+
      '<p>推荐配置在第二阶段过了 4/5 届（25/50 格），第三阶段默认使用分组填卡，过了 2/3 届（13/30 格）。新增的过关来自科隆，新加坡将按赛前封存预测单独评分。</p>'+
      '<p>右侧按当前设置重新计分。新加坡的赛前预测待完赛后单独评分。</p></div></section>';
    return '<div class="verify-overview">'+evidence+conclusions+
      (projectDownload?'<div class="verify-download">'+projectDownload+'</div>':'')+
      pickDisclosure('verify-sources','数据来源与赛前预测下载','<ul class="sources">'+sources()+'</ul>'+downloads.map(link=>'<p>'+link+'</p>').join(''))+
      '<details id="research-archive" class="pick-detail" data-pick-detail="research-archive"'+
      (pickDisclosures.has('research-archive') || location.hash.startsWith('#verify/')?' open':'')+'><summary>查看逐项实验与回测明细</summary><div class="detail-body verify-grid">'+studies+
      '<section class="panel method"><div class="panel-head"><h2>回测口径</h2></div><div class="panel-body">'+method+'</div></section></div></details></div>';
  }
  function render(){
    if(!state.result||!state.card)return;
    syncHistory();
    renderMethodStatus();
    byId('fill-mode').disabled=false;
    byId('fill-mode').value=currentFillMode();
    for(const detail of byId('workspace').querySelectorAll('details[data-pick-detail]')) {
      if(detail.open) pickDisclosures.add(detail.dataset.pickDetail);
      else pickDisclosures.delete(detail.dataset.pickDetail);
    }
    const view=state.tab==='picks'?picksView():state.tab==='bracket'?bracketView():state.tab==='duel'?duelView():verifyView();
    const activeStyle=state.feature.style && Object.values(state.scenario.edges).some(v=>v!==0);
    const styleNote=activeStyle && state.tab!=='duel'?'<div class="scenario-note">已启用手动打法克制情景。 <button type="button" class="text-button" data-action="open-duel">查看假设</button></div>':'';
    byId('workspace').dataset.view=state.tab;
    byId('workspace').innerHTML=sampleNotes()+styleNote+view;
    if(state.tab==='verify') {
      if(isResearch())byId('method-validation').hidden=true;
      else PickMethodValidation.render(byId('method-validation'),state.event,state.family);
      F1breStudy.mount(byId('context-f1bre'),singapore.f1ModelCompare);
      F1breStudy.mountAllocation(byId('context-f1bre'),singapore.mlAllocation);
      F1breStudy.mountForm(byId('context-allocation'),singapore.stageForm);
      F1breStudy.mountVeto(byId('context-form'),singapore.vetoML);
      Bo5History.mount(byId('context-veto'),singapore.bo5History);
      EliteOpponents.mount(byId('context-bo5'),singapore.eliteOpponents);
      globalThis.PickEventContext?.mount(byId('workspace'),state.event);
    }
    if(state.tab==='picks') renderAlternative();
    if(state.tab==='bracket') SwissBoard.mount(byId('workspace'));
    if(revealWorkspace) {
      revealWorkspace=false;
      const heading=location.hash==='#picks/forecasts'?byId('sealed-stage-records'):location.hash==='#picks/rosters'?document.querySelector('[data-pick-detail="rosters"]'):addressedStage() ? addressedHistoryTarget() :
        byId(globalThis.PickEventContext?.section(location.hash.slice(1))||'') || byId('workspace').querySelector?.('h2');
      if(heading) {openParents(heading);heading.scrollIntoView({block:'start'});}
    }
    const editor=byId('style-editor');
    if (editor) editor.ontoggle=()=>{if (editor.isConnected) state.editStyle=editor.open;};
  }
  function openDialog(idx) {
    state.swapTeam=idx;
    byId('dialog-title').textContent='替换 '+state.event.teams[idx].name;
    const grid=byId('dialog-teams'); grid.replaceChildren();
    state.event.teams.forEach((t,i)=>{
      const btn=el('button','dialog-team','');btn.type='button';btn.disabled=i===idx;btn.dataset.candidate=String(i);
      btn.innerHTML=teamMarkup(i);btn.append(el('span','small-tag cat'+state.card[i],names[state.card[i]]));
      grid.append(btn);
    });
    byId('team-dialog').showModal();
  }
  function closeDialog(){byId('team-dialog').close();state.swapTeam=null;}
  function applyCardMode(mode) {
    if (!state.result) return;
    const cards={model:state.result.card,expected:state.result.expectedCard,seed:seedCard()};
    if(!cards[mode]) return;
    state.cardMode=mode;
    state.card=Array.from(cards[mode]);
    render();
  }
  byId('fill-mode').addEventListener('change',ev=>{
    const mode=ev.target.value, robust=mode==='robust', conditional=mode==='seedConditional';
    if (mode==='expected' || mode==='seed') {
      applyCardMode(mode);
      return;
    }
    const cardMode=robust || conditional?'model':mode;
    if(robust!==Boolean(state.feature.robustCard) || conditional!==Boolean(state.feature.seedConditionalCard)) {
      state.feature.robustCard=robust;
      state.feature.seedConditionalCard=conditional;
      state.cardMode=cardMode;
      recompute();
    } else applyCardMode(cardMode);
  });
  function manualChange(i) {
    const idx=state.swapTeam;if(idx===null || i===idx)return;
    if(state.card[i]!==state.card[idx]){
      [state.card[i],state.card[idx]]=[state.card[idx],state.card[i]];
      state.cardMode='manual';
    }
    closeDialog();render();
  }
  function openParents(target) {
    for(let parent=target?.parentElement?.closest('details');parent;parent=parent.parentElement?.closest('details')) {
      parent.open=true;
    }
  }
  function showView(name,{write=true,reveal=true}={}) {
    if(!views.has(name)) return;
    if(write && location.hash!=='#'+name) {
      try {globalThis.history.pushState(null,'','#'+name);}
      catch {location.hash='#'+name;}
    }
    state.tab=name;revealWorkspace=reveal;
    renderFrame();render();
  }
  function followAddress() {
    const name=addressedView()||'picks';
    if(name==='verify' && location.hash.startsWith('#verify/') && byId('research-archive')) byId('research-archive').open=true;
    Bo5History.route(location.hash);
    if(location.hash==='#verify/f1bre/formats' && byId('f1-format-study'))byId('f1-format-study').open=true;
    if(location.hash==='#verify/f1bre/budget' && byId('f1-budget-study'))byId('f1-budget-study').open=true;
    if(location.hash==='#verify/elite/singapore' && byId('elite-singapore'))byId('elite-singapore').open=true;
    if(location.hash==='#verify/elite/lineups' && byId('lineup-study'))byId('lineup-study').open=true;
    if(location.hash==='#picks/forecasts' || location.hash==='#picks/rosters') {
      const id=location.hash==='#picks/rosters'?'rosters':'sealed-tickets';
      pickDisclosures.add(id);
      const fold=document.querySelector('[data-pick-detail="'+id+'"]');
      if(fold){openParents(fold);fold.open=true;fold.scrollIntoView({block:'start'});}
    }
    if(location.hash==='#verify/f1bre') {
      pickDisclosures.add('f1bre-study');
      const fold=document.querySelector('[data-pick-detail="f1bre-study"]');
      if(fold) fold.open=true;
    }
    if(addressedStage()) {
      historyState.stage=addressedStage();
      renderHistory();
      addressedHistoryTarget().scrollIntoView({block:'start'});
    }
    if(name!==state.tab) showView(name,{write:false});
    else if(name==='verify') byId(globalThis.PickEventContext?.section(location.hash.slice(1))||'')?.scrollIntoView({block:'start'});
  }
  globalThis.addEventListener?.('hashchange',followAddress);
  globalThis.addEventListener?.('popstate',followAddress);
  document.querySelectorAll('.workspace-tabs button[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  function openStyleEditor() {
    state.editStyle=true;showView('duel',{reveal:false});
    byId('style-editor')?.scrollIntoView({block:'center'});
  }
  function changeAndFocus(id) {
    recompute().then(()=>byId(id)?.focus({preventScroll:true}));
  }
  byId('workspace').addEventListener('input',ev=>{
    if (ev.target.dataset.edge!==undefined) {
      const n=Number(ev.target.value);
      byId('edge-value-'+ev.target.dataset.edge).textContent=(n>0?'+':'')+n;
    }
  });
  byId('workspace').addEventListener('change',ev=>{
    const control=ev.target;
    const value=control.value;
    const id=control.id;
    if(id==='calibration-field') {
      calibrationField=value;
      byId('calibration-out').innerHTML=calibrationResults(singapore.tailCalibration,value);
      return;
    }
    if (control.dataset.profile!==undefined || control.dataset.edge!==undefined) {
      if (control.dataset.profile!==undefined) {
        state.scenario.assignments[state.event.teams[Number(control.dataset.profile)].name]=value;
      } else {
        const pair=styleModel.pairs[Number(control.dataset.edge)];
        state.scenario.edges[pair.key]=Number(value);
      }
      saveScenario();
      state.editStyle=true;
      if (state.feature.style) changeAndFocus(id);
      else {render();byId(id)?.focus({preventScroll:true});}
      return;
    }
    if (id==='roster-team') state.rosterTeam=value;
    else if (id==='swap-perfect') state.perfectPick=Number(value);
    else if (id==='swap-ordinary') state.ordinaryPick=Number(value);
    else if (id==='major-team') state.majorTeam=Number(value);
    else if (id==='region-team') state.regionalIdx=Number(value);
    else if (id==='tail-team') state.tailTeam=Number(value);
    else if (id==='opp-team') state.opponentTeam=Number(value);
    else if (id==='opp-round') state.opponentRound=Number(value);
    else if (id==='duel-left') state.leftTeam=Number(value);
    else if (id==='duel-right') state.rightTeam=Number(value);
    else return;
    render();byId(id)?.focus({preventScroll:true});
  });
  byId('workspace').addEventListener('click',ev=>{
    const b=ev.target.closest('button');if(!b)return;
    const data=b.dataset;
    if ('teamDetail' in data) {
      state.regionalIdx=Number(data.teamDetail);showView('verify',{reveal:false});openParents(byId('team-evidence'));byId('team-evidence')?.scrollIntoView({block:'center'});
    } else if ('swap' in data) {
      openDialog(Number(data.swap));
    } else if (data.action==='slot-rates') {
      showSlotRates=!showSlotRates;
      b.closest('.ticket').dataset.showRates=String(showSlotRates);
      b.setAttribute('aria-pressed',String(showSlotRates));
    } else if (data.action==='card-stats') {
      const detail=byId('workspace').querySelector('[data-pick-detail="card-stats"]');
      openParents(detail);detail.open=true;
      detail.querySelector('summary').focus();
      detail.scrollIntoView({block:'center'});
    } else if (data.action==='show-history') {
      byId('history-title').focus();
      byId('history-title').scrollIntoView({block:'start'});
    } else if (data.action==='toggle-major-form' && state.family==='v4' && state.event.majorForm) {
      state.feature.majorForm=!state.feature.majorForm;
      changeAndFocus('toggle-major-form');
    } else if (data.action==='compare-alternative') {
      state.perfectPick=Number(data.perfect);state.ordinaryPick=Number(data.ordinary);
      render();
      const detail=byId('workspace').querySelector('details[data-pick-detail="swap"]');
      openParents(detail);detail.open=true;
      byId('swap-title').focus();
    } else if (data.action==='closest-swap') {
      closestSwap(slotTeams(0),slotTeams(1));render();byId('swap-perfect')?.focus({preventScroll:true});
    } else if (data.action==='apply-swap' && byId('workspace').getAttribute('aria-busy')==='false') {
      const {perfectPick:a,ordinaryPick:b}=state;
      state.card=Array.from(PickSwap.compare(state.result,state.card,a,b).card);
      state.cardMode='manual';state.perfectPick=b;state.ordinaryPick=a;
      render();byId('swap-title')?.focus({preventScroll:true});
    } else if ('lock' in data) {
      const round=Number(data.lockRound),match=Number(data.match),idx=Number(data.lock);
      const visible=state.result.path.rounds.find(r=>r.number===round)?.matches[match];
      const fixture=globalThis.CS.scenario(state.locks).rounds.find(r=>r.number===round)?.matches[match];
      if(!fixture || !visible || fixture.a!==visible.a || fixture.b!==visible.b || (fixture.a!==idx && fixture.b!==idx)) return;
      state.locks=api.setWinner(state.locks,round,match,fixture.winner===idx?null:idx);
      state.opponentTeam=idx;state.opponentRound=Math.min(5,round+1);
      recompute();
    } else if (data.action==='clear-locks') {
      state.locks=[];state.opponentRound=2;recompute();
    } else if (data.action==='expected-card' && state.result.expectedCard) {
      applyCardMode('expected');
    } else if (data.action==='seed-card') {
      applyCardMode('seed');
    } else if (data.action==='reset-card') {
      applyCardMode('model');
    } else if (data.action==='open-duel') {
      openStyleEditor();
    } else if (data.action==='toggle-style') {
      state.feature.style=!state.feature.style;
      if(state.feature.style) state.editStyle=true;
      recompute();
    } else if (data.action==='apply-profiles') {
      state.scenario.assignments={...resetScenario().assignments};
      state.editStyle=true;saveScenario();recompute();
    } else if (data.action==='clear-style') {
      state.scenario=resetScenario();state.editStyle=true;saveScenario();recompute();
    }
  });
  byId('dialog-teams').addEventListener('click',ev=>{const b=ev.target.closest('[data-candidate]');if(b)manualChange(Number(b.dataset.candidate));});
  byId('close-dialog').addEventListener('click',closeDialog);
  byId('team-dialog').addEventListener('click',ev=>{if(ev.target===byId('team-dialog'))closeDialog();});
  document.querySelectorAll('[data-family]').forEach(button=>button.addEventListener('click',()=>{
    switchMethod(button.dataset.family);
  }));
  byId('restore-model').addEventListener('click',()=>{
    if(state.family==='v4') historyState.stage3Allocation=true;
    state.feature=defaultFlags();
    state.cardMode='model';
    state.perfectPick=null;state.ordinaryPick=null;
    recompute().then(()=>byId('strategy-title').focus({preventScroll:true}));
  });
  start();
})();
