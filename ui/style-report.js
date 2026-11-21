/* Render the Singapore scouting snapshot without changing the sealed predictor. */
(() => {
  'use strict';
  const labels=Object.fromEntries((globalThis.PickStyle?.profiles||[]).map(p=>[p.id,p.label]));
  labels.unknown='资料不足';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>Number.isFinite(v)?(100*v).toFixed(1)+'%':'—';
  const link=(url,title)=>/^https:\/\//.test(url)?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(title)+' ↗</a>':'';
  const demoSource='https://huggingface.co/datasets/blanchon/opencs2_dataset_demo/tree/912a363098feec3f220e41d68634d2f71676c28b';
  function evidence(study,name){
    const scout=study.scouts[name], m=study.measurements[name], r=m.recent;
    if(scout.scenarioEligible)return {profile:scout.profile,source:'整队资料',date:scout.date,
      evidence:scout.title+'；与本届首发重合 '+scout.overlap+'/5。',url:scout.url};
    if(['earlyContact','trade','awp','mixed'].includes(m.classKey)){
      const detail=m.classKey==='mixed'?'三项进攻指标没有明显突出的单项':
        '同一参考组中，该项位于第 '+Math.round(100*m.percentiles[m.classKey])+' 百分位';
      return {profile:m.classKey,source:'进攻方录像',date:m.latestMatch,url:demoSource,
        evidence:m.maps+' 图、'+m.series+' 场系列赛，'+detail+'。'};
    }
    if(Number.isFinite(r?.leadSharePercentile) && Number.isFinite(r?.assistRatePercentile)){
      const assist=r.assistRatePercentile>=.7, lead=r.leadSharePercentile;
      return {profile:assist?'assistHigh':lead>=.7?'carry':lead<=.3?'spread':'boxMiddle',source:'近期记分板',date:r.lastMatch,url:r.source,
        evidence:r.maps+' 图、'+r.series+' 场系列赛。'+(assist?'每 100 次击杀有 '+(100*r.assistRate).toFixed(1)+' 次助攻，位于第 '+Math.round(100*r.assistRatePercentile)+' 百分位。':
          '逐图击杀最多的队员占全队 '+pct(r.leadShare)+'，位于第 '+Math.round(100*lead)+' 百分位。')};
    }
    return {profile:'unknown',source:'资料不足',evidence:'近期整队资料和三人核心的量化样本均不足。'};
  }
  function evidenceRows(event){
    if(!event.styleStudy)return Object.entries(event.profileEvidence||{}).filter(([,item])=>item?.scenarioEligible!==false && item?.profile && item.profile!=='unknown');
    return event.teams.map(t=>[t.name,evidence(event.styleStudy,t.name)]);
  }
  function admittedPP(pair){
    const t=pair.test;
    if(!pair.training.n || !t.n || !t.base || !t.main || !t.pair)return 0;
    const improves=['brier','logLoss'].every(metric=>t.pair[metric]<Math.min(t.main[metric],t.base[metric]));
    return improves?Math.max(-15,Math.min(15,Math.round(pair.evenMatchShiftPP))):0;
  }
  function pairReports(study){
    return [study.scoutsReport,study.demosReport].flatMap(report=>report.pairs);
  }
  function defaults(event){
    const assignments=Object.fromEntries(evidenceRows(event).map(([name,r])=>[name,r.profile]));
    const edges=event.styleStudy?Object.fromEntries(pairReports(event.styleStudy).map(p=>[p.first+':'+p.second,admittedPP(p)])):{};
    return {assignments,edges};
  }
  const signed=n=>(n>0?'+':'')+n.toFixed(2);
  function matchupEvidence(study,a,b){
    const left=evidence(study,a).profile,right=evidence(study,b).profile;
    if(left===right)return '数据默认修正 0 个百分点。两队分在同一类。';
    const report=pairReports(study).find(p=>(left===p.first && right===p.second)||(left===p.second && right===p.first));
    if(!report)return '数据默认修正 0 个百分点。这两类打法缺少按同一口径验证的交锋。';
    const sign=report.first===left?1:-1;
    return '对 '+esc(a)+' 的数据默认修正为 '+signed(sign*admittedPP(report))+
      ' 个百分点。训练 '+report.training.n+' 场，留出 '+report.test.n+' 场。'+(report.training.n?
        '同等实力时的拟合值为 '+signed(sign*report.evenMatchShiftPP)+' 个百分点。':'');
  }
  const tacticalSources=[
    ['https://www.hltv.org/news/38480/how-to-watch-counter-strike','HLTV 回合解读'],
    ['https://dignitas.gg/articles/how-to-counter-the-most-annoying-playstyles-in-cs2','Dignitas 战术指南']
  ];
  const cues={
    duel:{system:'如果能在对手同步闪光和补枪到位前制造单挑，先手步枪有机会打开缺口。',
      tempo:'争关键区域的第一枪可以压缩对手收集信息的时间。连续重复同一处前压，则容易被架住。',
      duel:'看谁为第一名接敌队员留出了补枪角度。先拿人头后能安全撤回，也会改变下一次交锋。'},
    system:{duel:'先用闪光和烟雾隔开第二个枪位，再让两人同步接敌，可削弱对手争取单挑的收益。',
      tempo:'同步进点可以压缩读局后的回防时间。若对手保留反清道具，执行时间就更重要。',
      system:'比较两队第一波道具之后的第二套方案，以及能否留人应对回防。'},
    tempo:{duel:'默认控图时留人架前压，侦察到第一名步枪手后再夹击，可把主动单挑变成换人。',
      system:'从早期道具和人数分布判断重心，等关键烟火散开后转点，可能避开成套防守。',
      tempo:'重点看谁先取得可靠信息，转点时是否仍有队员控制对方的前压路线。'}
  };
  function mapMeeting(veto,team,other) {
    const own=veto?.teams[team]?.bo3, opp=veto?.teams[other]?.bo3;
    if(!own?.n || !opp?.n) return '';
    const high=Math.max(...Object.values(own.pick));
    if(!high) return '';
    const maps=Object.keys(own.pick).filter(m=>own.pick[m]===high);
    const observed=maps.map(m=>esc(m)+'（对手禁用 '+opp.ban[m]+'/'+opp.n+' 场）').join('、');
    return '<p class="scout-meta">'+esc(team)+' 在 '+own.n+' 场 BO3 中最常自选 '+observed+'，'+(maps.length>1?'各':'共')+'选 '+high+' 次。</p>';
  }
  function duelRead(study,a,b,veto) {
    const sides=[[a,b],[b,a]];
    const reads=sides.map(([team,other])=>{
      const style=study.scouts[team].profile, opponent=study.scouts[other].profile;
      return '<div class="matchup-cue"><strong>'+esc(team)+'</strong><p>'+esc(cues[style]?.[opponent]||'当前材料不足以提出具体对位判断。')+'</p>'+mapMeeting(veto,team,other)+'</div>';
    }).join('');
    const limited=[a,b].filter(n=>!study.scouts[n].scenarioEligible);
    return '<section class="panel matchup-read"><div class="panel-head"><div><h2>这组对位看什么</h2><p>'+esc(labels[evidence(study,a).profile])+' × '+esc(labels[evidence(study,b).profile])+'</p></div></div><div class="panel-body"><p><strong>'+matchupEvidence(study,a,b)+'</strong></p>'+reads+
      '<p class="scout-meta">以上回合观察来自赛前战术资料。'+(limited.length?esc(limited.join('、'))+' 的战术描述仅作观察，该队的默认分类见下方数据档案。':'')+'</p><div class="scout-links">'+tacticalSources.map(([u,t])=>link(u,t)).join(' · ')+'</div></div></section>';
  }
  function citation(item) {
    return '<div class="scout-links">'+[link(item.url,item.kind==='interview'?'原始采访':'原始比赛或报道'),
      item.rosterUrl!==item.url?link(item.rosterUrl,'当时阵容'):'',link(item.secondaryUrl,'补充场次')].filter(Boolean).join(' · ')+'</div>';
  }
  function metrics(items) {
    return '<dl class="scout-stats">'+items.map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd></div>').join('')+'</dl>';
  }
  function flashSection(flash) {
    if(!flash?.rounds || !Number.isFinite(flash.thrown)) return '';
    return '<p>有投掷记录的 '+esc(flash.series)+' 场系列赛共 '+esc(flash.rounds)+' 回合，全队投出 '+esc(flash.thrown)+' 枚闪光，平均每回合 <strong>'+(flash.thrown/flash.rounds).toFixed(2)+' 枚</strong>。</p><div class="scout-links">'+
      flash.examples.map(x=>link(x.url,'投掷记录 '+x.day)).join(' · ')+'</div>';
  }
  function teamPanel(name,mark,study) {
    const item=study.scouts[name], m=study.measurements[name], r=m.recent, samples=study.examples[name];
    const sum=key=>samples.reduce((s,x)=>s+x[key],0);
    const rounds=sum('rounds'), kills=sum('kills');
    const flashLinks=samples.map(x=>link(x.url,x.day.slice(5)+' '+x.map+' 对 '+x.opponent)).join(' · ');
    const demoStats=m.maps?metrics([['交火较早的进攻回合',pct(m.metrics.earlyContact)],['5 秒补枪 / 进攻方击杀',pct(m.metrics.trade)],
      ['AWP / 进攻方击杀',pct(m.metrics.awp)],['步枪爆头 / 步枪击杀',pct(m.metrics.rifleHS)],
      ['手雷或燃烧击杀 / 进攻方击杀',pct(m.metrics.utilityFinish)]]):'';
    const d=evidence(study,name);
    return '<article class="scout-team"><h3>'+mark+'</h3><p><strong>默认分类 · '+esc(labels[d.profile])+'</strong></p><p class="scout-meta">'+esc(d.evidence)+' '+link(d.url,d.source+' '+(d.date||''))+'</p><h4>'+esc(item.title)+'</h4><p>'+esc(item.summary)+'</p><p class="scout-meta">'+esc(item.date)+' · '+esc(item.scope)+' · 阵容重合 '+item.overlap+'/5</p>'+citation(item)+
      '<h4>近期火力分布</h4><p>'+esc(r.label)+'。样本截至 '+esc(r.lastMatch)+'，共 '+r.maps+' 图。</p>'+
      metrics([['逐图击杀最多的队员占比',pct(r.leadShare)],['每 100 次击杀的助攻',(r.assistRate*100).toFixed(1)]])+
      '<div class="scout-links">'+link(r.source,'地图记分板数据')+'</div>'+
      '<h4>道具与首杀样本</h4>'+flashSection(m.flash)+'<p class="scout-meta">以下闪助与首杀取自 '+samples.length+' 张系列赛首图，共 '+rounds+' 回合</p>'+
      metrics([['闪光助攻',sum('flashAssists')+' 次'],['己方首杀 / 首死',sum('openingKills')+' / '+sum('openingDeaths')],['爆头击杀占比',pct(kills?sum('headshots')/kills:null)]])+
      '<p class="scout-meta">闪光助攻只计队友在致盲期间完成的击杀。地图与对手会影响小样本。</p><div class="scout-links">'+flashLinks+'</div>'+
      '<details><summary>早期比赛录像指标 · '+m.maps+' 图</summary>'+
      (m.maps?'<p>'+esc(m.firstMatch)+' 至 '+esc(m.latestMatch)+'，共 '+m.roundsT+' 个有首杀的进攻回合。按三人阵容核心继承。分类为'+esc(labels[m.classKey])+'。</p>'+demoStats+
       '<p class="scout-meta">较早交火按本图首杀时间中位数划分，进攻方可能是先阵亡的一方。手雷或燃烧击杀只计最后一击。</p>':'<p>录像库没有收录符合三人核心的地图。</p>')+
      '<div class="scout-links">'+link('https://huggingface.co/datasets/blanchon/opencs2_dataset_demo/tree/912a363098feec3f220e41d68634d2f71676c28b','OpenCS2 录像数据')+'</div></details></article>';
  }
  function directory(e,mark) {
    return '<details class="squad-directory"><summary>全部 '+e.teams.length+' 队的默认分类与依据</summary><div class="table-wrap"><table class="result-table"><thead><tr><th>战队</th><th>默认打法</th><th>数据依据</th></tr></thead><tbody>'+e.teams.map((t,i)=>{
      const d=evidence(e.styleStudy,t.name);
      return '<tr><td>'+mark(i)+'</td><td>'+esc(labels[d.profile])+'</td><td>'+esc(d.evidence)+' '+link(d.url,d.source+' '+(d.date||''))+'</td></tr>';
    }).join('')+'</tbody></table></div></details>';
  }
  function studyTable(title,report) {
    const test=report.test;
    return '<h4>'+esc(title)+'</h4><p>训练 '+report.training.n+' 场，留出 '+test.n+' 场。幅度按原本五五开的对局计算，正值有利于左边一类。</p>'+
      '<div class="table-wrap"><table class="result-table"><thead><tr><th>对位</th><th>训练拟合（百分点）</th><th>留出实胜 / 场数</th><th>VRS 预期胜场</th><th>默认幅度</th></tr></thead><tbody>'+
      report.pairs.map(p=>'<tr><td>'+esc(labels[p.first])+' × '+esc(labels[p.second])+'</td><td>'+(p.training.n?signed(p.evenMatchShiftPP):'缺少交手')+'</td><td>'+p.test.wins+' / '+p.test.n+'</td><td>'+p.test.expectedWins.toFixed(1)+'</td><td>'+admittedPP(p)+' 个百分点</td></tr>').join('')+
      '</tbody></table></div>'+(test.base?'<p class="scout-meta">Brier 误差越低越好。仅实力 '+test.base.brier.toFixed(4)+'，加类别强弱 '+test.main.brier.toFixed(4)+'，加对位 '+test.pair.brier.toFixed(4)+'。对数损失依次为 '+[test.base,test.main,test.pair].map(v=>v.logLoss.toFixed(4)).join('、')+'。</p>':'')+
      '<p class="scout-meta">'+['bo1','bo3'].map(k=>{const f=report.testByFormat[k];return k.toUpperCase()+' '+f.n+' 场'+(f.n?'，Brier 从 '+f.base.brier.toFixed(4)+' 到 '+f.pair.brier.toFixed(4):'');}).join('。')+'。另有 '+report.testByFormat.unknown.n+' 场未能核实赛制。</p>';
  }
  function render(e,i,j,mark) {
    const study=e.styleStudy, a=e.teams[i].name, b=e.teams[j].name;
    return duelRead(study,a,b,e.closeSnapshot?.mapVeto||e.mapVeto)+'<section class="panel scouting-panel"><div class="panel-head"><div><h2>赛前打法档案</h2><p>资料截至 '+esc(study.asOf)+' · 新加坡首阶段赛前快照</p></div></div><div class="panel-body">'+directory(e,mark)+'<div class="scout-columns">'+teamPanel(a,mark(i),study)+teamPanel(b,mark(j),study)+'</div>'+
      '<details class="pair-study"><summary>历史交锋支持固定克制吗？</summary><p>我们只给对阵双方使用当时已公开、至少三名首发相同的标签。2026-09-01 起的比赛专用于验证。项目比较了只看 VRS、加上类别整体强弱、以及分别估计各对位优势三种做法。</p>'+
      studyTable('按球队的赛前打法资料',study.scoutsReport)+studyTable('按录像中的进攻指标',study.demosReport)+
      '<p>每项默认幅度由训练期拟合。只有该对位在留出期的 Brier 和对数损失同时低于实力基线和类别强弱基线，才采用四舍五入后的幅度。本期六项均为 0；不同资料口径之间缺少对照，也取 0。</p></details></div></section>';
  }
  globalThis.PickStyleReport={render,labels,defaults,evidenceRows};
})();
