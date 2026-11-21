/* Pre-event comparisons use the archived recommended model and published lineups. */
(() => {
  'use strict';
  const sections={stages:'赛事对照',favorites:'热门出局风险',personnel:'教练与明星选手',f1bre:'Elo 与地图 ML',allocation:'3–0 分栏',form:'队伍连续发挥',veto:'BO3 地图禁选',bo5:'0–3 与漏算地图',elite:'对前八的 BO3',calibration:'BO3 冷门校准'};
  const choices={stage:'cologne',group:'model',team:'100 Thieves'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>Number.isFinite(v)?(v*100).toFixed(1)+'%':'—';
  const decimal=(v,n)=>Number.isFinite(v)?v.toFixed(n):'—';
  function section(route){
    if(route==='verify/f1bre/formats')return 'f1-format-study';
    if(route==='verify/f1bre/budget')return 'f1-budget-study';
    if(route==='verify/elite/singapore')return 'elite-singapore';
    if(route==='verify/elite/lineups')return 'lineup-study';
    if(route==='verify/veto/singapore')return 'context-veto';
    if(/^verify\/bo5\/(stage[123]|singapore)$/.test(route))return 'context-bo5';
    return Object.hasOwn(sections,route.slice(7)) && route.startsWith('verify/')?'context-'+route.slice(7):null;
  }
  const link=(url,label)=>/^https:\/\//.test(url??'')?'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>':'';
  function nav() {
    return '<nav class="context-nav" aria-label="赛前研究">'+Object.entries(sections)
      .map(([key,name])=>'<a href="#verify/'+key+'">'+name+'</a>').join('')+'</nav>';
  }
  function home(event) {
    const comparison=event.stageComparison;
    const nearest=comparison.stages[comparison.singapore.ranking[0].id].label.replace(' Major','');
    return '<div class="context-home"><p>五届对照中，新加坡的赛前条件最接近 <strong>'+esc(nearest)+'</strong>。可核对科隆失分的队伍、热门共同出局的概率，以及 100 Thieves 的选手与教练记录。</p>'+nav()+'</div>';
  }
  function table(headings,rows) {
    return '<div class="table-wrap"><table class="result-table"><thead><tr>'+headings.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+
      rows.map(row=>'<tr>'+row.map((v,i)=>i===0?'<th scope="row">'+esc(v)+'</th>':'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  function options(values,chosen) {
    return values.map(([value,label])=>'<option value="'+esc(value)+'"'+(value===chosen?' selected':'')+'>'+esc(label)+'</option>').join('');
  }
  function resultMetric(label,value,unit='') {
    return '<div><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong>'+ (unit?' <small>'+esc(unit)+'</small>':'')+'</div>';
  }
  function sources(links) {
    const usable=links.filter(Boolean);
    return usable.length?'<div class="context-sources">'+usable.join(' · ')+'</div>':'';
  }
  function stageDetails(study,id) {
    const s=study.stages[id], target=study.stages.singapore, result=s.result;
    const metrics=['topTail','bubble','opening'];
    const heads=['同届实力差（VRS）','新加坡',s.label.replace(' Major','')];
    const rows=metrics.map(k=>[study.metricLabels[k],pct(target.context[k]),pct(s.context[k])]);
    rows.push(['首阶段准入',target.entry,s.entry]);
    const regions=r=>[r.europe,r.americas,r.asia].join(' / ');
    rows.push(['欧洲 / 美洲 / 亚洲名额',regions(target.context.regions),regions(s.context.regions)]);
    const buckets=result.bucketHits;
    const model=result.upsets.model;
    const teams=result.teams.filter(t=>t.slot<3).sort((a,b)=>a.slot-b.slot||a.seed-b.seed)
      .map(t=>[t.name,['3–0','普通晋级','0–3'][t.slot],t.record,t.hit?'命中':'落空']);
    const transfer=s.transfer;
    const shared=transfer?'<p>两届地图池共用 '+transfer.maps.length+' 图。'+(transfer.oldOnly.length?'仅往届使用 '+esc(transfer.oldOnly.join('、'))+'。':'')+
      (transfer.newOnly.length?'仅新加坡使用 '+esc(transfer.newOnly.join('、'))+'。':'')+'新加坡有 '+transfer.coreTeams+' 支保留该届至少三人核心的队伍，其中 '+transfer.fullTeams+' 支五人一致。</p>':'';
    return '<div class="context-record"><h4>'+esc(s.label)+' 实际命中 '+result.hits+'/10</h4><p>3–0 命中 '+buckets[0]+'/2，普通晋级 '+buckets[1]+'/6，0–3 命中 '+buckets[2]+'/2。</p></div>'+
      table(heads,rows)+'<p class="helper">前三行依次比较前四对后四的平均胜率、第六对第十一的胜率、首轮八场热门的平均胜率。</p>'+shared+
      '<details class="context-fold"><summary>逐格核对 '+esc(s.label)+' 的竞猜与赛果</summary>'+table(['战队','推荐格','实际战绩','结果'],teams)+
      '<p>按封存的推荐模型重放，赛前胜率低于五成的队伍赢了 '+model.all.upsets+'/'+model.all.n+' 场，其中 BO1 为 '+model.bo1.upsets+'/'+model.bo1.n+'，BO3 为 '+model.bo3.upsets+'/'+model.bo3.n+'。胜者赛前胜率不超过 30% 的有 '+model.all.major+' 场。</p>'+
      '<p class="helper">本届单场 Brier 为 '+decimal(model.all.brier,4)+'，BO1 为 '+decimal(model.bo1.brier,4)+'，BO3 为 '+decimal(model.bo3.brier,4)+'。各赛制的样本量见上方场数。</p></details>'+
      sources([link(target.ratingSource,'新加坡 '+target.snapshot+' 积分'),link(s.ratingSource,s.label+' '+s.snapshot+' 积分')]);
  }
  function stagesPanel(study) {
    const all=study.stages, ranks=study.singapore.ranking, first=ranks[0], second=ranks[1];
    const similar=all[first.id].label.replace(' Major','');
    const sensitivity=study.singapore.sensitivity;
    const stable=sensitivity.filter(r=>r.order[0]===first.id).length;
    const v=study.validation.forward.multiple;
    const scores=ranks.map(r=>all[r.id].result.hits), others=ranks.filter(r=>r.id!=='cologne').map(r=>all[r.id].result.hits);
    const record=list=>list.filter(n=>n>=5).length+'/'+list.length+' 届过关，命中 '+list.reduce((a,b)=>a+b,0)+'/'+(list.length*10)+' 格';
    return '<section class="panel wide context-panel context-stages" id="context-stages" aria-labelledby="context-stage-title">'+
      '<div class="panel-head"><div><h2 id="context-stage-title">新加坡最像哪一届？</h2><p>赛前条件与五届 Major 首阶段对照 · '+esc(study.asOf)+'</p></div></div><div class="panel-body">'+
      nav()+'<div class="context-lead"><div><h3>'+esc(similar)+' 最接近</h3><p>两届的入围制度与赛区名额相同。新加坡首轮热门的平均胜率为 '+pct(all.singapore.context.opening)+'，科隆为 '+pct(all.cologne.context.opening)+'。</p></div>'+
      '<div class="context-pair-stats">'+resultMetric('相似距离',decimal(first.distance,3),'越低越近')+resultMetric('次近 · '+all[second.id].label.replace(' Major',''),decimal(second.distance,3))+'</div></div>'+
      '<h3>科隆要降权吗？</h3><p>这轮回测支持五届等权。逐届只看已完赛的往届，有至少两个可选参照的 '+v.n+' 届，等权估计十格命中数的平均绝对误差为 '+decimal(v.meanMAE,2)+' 格，按相似度加权为 '+decimal(v.weightedMAE,2)+' 格，只看最近似的一届为 '+decimal(v.nearestMAE,2)+' 格。</p>'+
      '<p>五届合计 '+record(scores)+'。若剔除科隆，剩下四届是 '+record(others)+'。这里的过关比例只统计所选历史赛果。</p>'+
      '<details class="context-fold"><summary>五届相似度与计算口径</summary>'+table(['往届首阶段','距离','实际命中'],ranks.map(r=>[all[r.id].label,decimal(r.distance,3),all[r.id].result.hits+'/10']))+
      '<p>按头尾实力差、晋级线实力差、首轮热门优势、赛区席位及入围制度五项等权计距。逐项去掉一个指标，或改变积分换算尺度，共 '+sensitivity.length+' 次，'+stable+' 次仍以'+esc(similar)+'最接近。距离只用于比较赛前条件。</p>'+sources(study.sources.slice(0,5).map(x=>link(x.url,x.label)))+'</details>'+
      '<div class="context-picker"><label for="context-stage">往届回放</label><select id="context-stage">'+options(ranks.map(r=>[r.id,all[r.id].label]),choices.stage)+'</select></div><div id="context-replay">'+stageDetails(study,choices.stage)+'</div></div></section>';
  }
  function riskDetails(event,group) {
    const data=event.favoriteRisk, current=data.stages.singapore[group], cologne=data.stages.cologne[group];
    const row=current.teams.map(t=>'<li><span>'+esc(t.name)+'</span><b>'+pct(t.qualify)+'</b></li>').join('');
    const rows=Object.entries(data.stages).filter(([k])=>k!=='singapore').map(([id,stage])=>{
      const g=stage[group];return [event.stageComparison.stages[id].label,pct(g.atLeastOne),pct(g.atLeastTwo),g.actualOut.length?g.actualOut.join('、'):'全部晋级'];
    });
    const card=data.stages.cologne.card;
    const heroic=data.stages.cologne.seeds.teams.find(t=>t.name==='HEROIC');
    return '<div class="context-risk-numbers">'+resultMetric('至少一支出局',pct(current.atLeastOne))+resultMetric('至少两支出局',pct(current.atLeastTwo))+'</div>'+
      '<h3>这四队的单队晋级率</h3><ul class="context-team-probs">'+row+'</ul><p class="helper">联合概率来自同一次瑞士轮推演。同组队伍可能相遇，每条路径分别统计出局数。按赛前推荐配置模拟 '+data.pathsPerStage.toLocaleString('zh-CN')+' 次，覆盖 '+data.seeds.length+' 组随机数。</p>'+
      '<details class="context-fold"><summary>这四个位置在往届的实际结果</summary>'+table(['赛事','至少一支出局','至少两支出局','实际出局'],rows)+'<p>科隆这一组'+
      (cologne.actualOut.length?'最终出局的是 '+esc(cologne.actualOut.join('、'))+'。':'最终全部晋级。')+
      (heroic?'赛事 3 号种子 HEROIC 的赛前晋级率为 '+pct(heroic.qualify)+'，最终 1–3 出局。':'')+'该届预测实际为 '+card.actual+'/10，模拟中 '+pct(card.atOrBelowObserved)+' 的整卡命中不超过这个分数。</p></details>';
  }
  function favoritesPanel(event) {
    if(!event.favoriteRisk) return '';
    return '<section class="panel wide context-panel" id="context-favorites"><div class="panel-head"><div><h2>四支热门，会一起出局几支？</h2><p>新加坡首阶段 · 赛前推荐配置</p></div></div><div class="panel-body"><div class="context-picker"><label for="context-group">热门口径</label><select id="context-group">'+options([['model','模型晋级率前四'],['seeds','赛事初始种子前四']],choices.group)+'</select></div><div id="context-risk">'+riskDetails(event,choices.group)+'</div></div></section>';
  }
  function teamEvidence(study,name) {
    const t=study.teams[name], recent=name===study.focus.team && study.focus.fresh?study.focus.fresh:t.recent;
    const award=t.majorMvps.map(m=>m.name+'（'+m.count+' 次）').join('、');
    let details='<h4>'+esc(name)+'</h4><p>注册教练 <strong>'+esc(t.coach)+'</strong>。当前五人的历届 Major MVP 记录为'+(award?' '+esc(award):'零')+'。</p>'+
      '<p class="helper">'+(Number.isFinite(t.tenureMonths) && Number.isFinite(t.coachedMaps)?'截至 '+esc(t.coachSnapshot)+'，HLTV 记录该教练在本队执教 '+t.tenureMonths+' 个月、'+t.coachedMaps+' 张地图。':'')+'登记首发为 '+t.roster.map(esc).join('、')+'。</p>'+sources([link(t.coachSource,'查看教练资料')]);
    if (recent?.maps) {
      details+='<h4>同一套五人的近期火力</h4><p>'+esc(recent.first)+' 至 '+esc(recent.last)+'，'+recent.maps+' 图、'+recent.series+' 个系列赛，共 '+recent.rounds+' 回合。'+
        (recent.leader?'击杀最多的是 '+esc(recent.leader)+'。':'样本偏少，暂不标出领衔队员。')+'</p>'+table(['首发','击杀','每回合击杀','队内击杀占比'],recent.players.map(p=>[p.name,p.kills,decimal(p.kpr,2),pct(p.share)]))+
        sources([link(recent.source||study.sources.boxscores,'逐图数据'),link(recent.latestMap,'最近一张地图')]);
    } else details+='<p>当前五人没有同时出场且可核实的近期记分板。</p>';
    return details;
  }
  function coachPanel(study) {
    if(!study?.windows?.length) return '';
    const w=study.windows;
    return '<div class="context-record"><h3>'+esc(study.team)+' 换帅前后</h3><p>在相同首发五人的比赛中，两段任期各有 '+w.map(p=>p.n).join('、')+' 场可核实样本。预期胜场按当场阵容与对手的赛前 VRS 求和。</p>'+
      table(['教练任期','比赛日期','胜 / 场','预期胜场'],w.map(p=>[p.coach,p.start.slice(5)+' 至 '+p.end.slice(5),p.wins+' / '+p.n,decimal(p.expected,3)]))+
      '<p class="helper">两段赛程与阵容磨合时间不同，无法单独估计换帅贡献。科隆阵容有 '+study.coreOverlap+'/5 留在新加坡首发。</p>'+
      sources(study.sources.map((url,i)=>link(url,['HEROIC 阵容公告','HEROIC 主教练公告','HLTV 换帅报道'][i]||'来源 '+(i+1))))+'</div>';
  }
  function cardEvidence(replay) {
    if(!replay) return '';
    const h=replay.firstStages, x=replay.extra;
    return '<h4>整卡重放</h4><p>保持原填卡规则，相同随机种子下比较加入 MVP 信号前后。五届首阶段固定种子总命中从 '+h.baseHits+' 格到 '+h.candidateHits+' 格（满分 50），过关数从 '+h.basePasses+'/5 到 '+h.candidatePasses+'/5。更换随机种子后，过关届数增加 '+h.passMore+' 组、持平 '+h.passSame+' 组、下降 '+h.passFewer+' 组。</p>'+
      '<p>额外比较上海第二阶段，固定种子由 '+x.base+'/10 降到 '+x.candidate+'/10。'+x.seeds+' 组种子中，过关由 '+x.basePassingSeeds+' 组减到 '+x.candidatePassingSeeds+' 组。这个阶段曾用于其他填卡研究。</p>';
  }
  function personnelPanel(study,coach) {
    if(!study) return '';
    const f=study.focus, frozen=f.frozen, summary=study.test?.holdout;
    const origin=Array.isArray(f.sources)?f.sources:[];
    const comparison=summary?[['全部',summary.all],['有差异的对局',summary.affected],...Object.entries(summary.byFormat||{})].filter(([,r])=>r&&r.n).map(([k,r])=>[k==='unknown'?'赛制待核':k,r.n,decimal(r.baseBrier,4),decimal(r.candidateBrier,4)]):[];
    return '<section class="panel wide context-panel" id="context-personnel"><div class="panel-head"><div><h2>教练与明星选手</h2><p>名单与记分板截至 '+esc(study.asOf)+'</p></div></div><div class="panel-body">'+
      '<h3>'+esc(f.team)+' 对 '+esc(f.opponent)+'</h3>'+f.notes.map(n=>'<p>'+esc(n)+'</p>').join('')+sources(origin.map(x=>link(x.url,x.title)))+
      '<div class="context-record"><h4>100 Thieves 的封存卡位 · '+esc(frozen.slot)+'</h4><p>首轮 BO1 胜率为 '+pct(frozen.bo1)+'。首阶段晋级率为 '+pct(frozen.advance)+'，其中 3–0 为 '+pct(frozen.sweep)+'，普通晋级为 '+pct(frozen.ordinary)+'。</p></div>'+
      '<div class="context-picker"><label for="context-team">查看参赛队</label><select id="context-team">'+options(Object.keys(study.teams).map(n=>[n,n]),choices.team)+'</select></div><div id="context-team-record">'+teamEvidence(study,choices.team)+'</div>'+
      '<p class="helper">教练栏显示报名信息。教练是否实际到场须在逐场记录中核实。</p>'+coachPanel(coach)+
      (comparison.length?'<details class="context-fold"><summary>明星荣誉和火力集中度能提高胜率预测吗？</summary><p>默认推荐继续使用已验证的胜率。Major MVP 经历在留出 BO1 上误差增加，击杀集中度也未通过留出检验。</p><h4>Major MVP 经历</h4><p>以 '+esc(study.test.split)+' 为时间分界，比较有得主的首发对无得主首发。Brier 越低越好。</p>'+table(['留出范围','场数','基础 Brier','加入后'],comparison)+
        cardEvidence(study.cardReplay)+'<h4>单人火力集中度</h4><p>按阵容中同一人的最高击杀份额比较双方。'+study.firepowerTest.holdout.all.n+' 场留出系列赛的 Brier 从 '+decimal(study.firepowerTest.holdout.all.baseBrier,4)+' 变为 '+decimal(study.firepowerTest.holdout.all.candidateBrier,4)+'。</p>'+sources([link(study.sources.demo,'录像样本')])+'</details>':'')+'</div></section>';
  }
  function report(event) {
    return stagesPanel(event.stageComparison)+favoritesPanel(event)+personnelPanel(event.personnelStudy,event.coachChange);
  }
  function mount(scope,event) {
    const bind=(id,output,key,render)=>{
      const control=scope.querySelector('#'+id);
      if(control) control.onchange=()=>{
        choices[key]=control.value;
        scope.querySelector('#'+output).innerHTML=render(control.value);
      };
    };
    bind('context-stage','context-replay','stage',id=>stageDetails(event.stageComparison,id));
    bind('context-group','context-risk','group',group=>riskDetails(event,group));
    bind('context-team','context-team-record','team',name=>teamEvidence(event.personnelStudy,name));
    for(const anchor of scope.querySelectorAll('.context-nav a')) anchor.onclick=()=>{
      if(anchor.hash===location.hash) document.getElementById(section(anchor.hash.slice(1)))?.scrollIntoView({block:'start'});
    };
  }
  globalThis.PickEventContext={home,report,section,mount};
})();
