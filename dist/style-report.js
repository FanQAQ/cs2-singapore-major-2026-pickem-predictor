/* Render the Singapore scouting snapshot without changing the sealed predictor. */
(() => {
  'use strict';
  const labels={unknown:'资料不足',duel:'主动接战',system:'体系执行',tempo:'临场读局',
    earlyContact:'较早交火',trade:'快速补枪',awp:'主狙击杀占比高',mixed:'多项均衡'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>Number.isFinite(v)?(100*v).toFixed(1)+'%':'—';
  const link=(url,title)=>/^https:\/\//.test(url)?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">'+esc(title)+' ↗</a>':'';
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
    const limited=[a,b].filter(n=>!study.scouts[n].usableForHistory);
    return '<section class="panel matchup-read"><div class="panel-head"><div><h2>这组对位看什么</h2><p>'+esc(labels[study.scouts[a].profile])+' × '+esc(labels[study.scouts[b].profile])+'</p></div></div><div class="panel-body">'+reads+
      '<p class="scout-meta">以上是按赛前标签推演的回合条件。'+(limited.length?esc(limited.join('、'))+' 的标签来自个别选手或场次。':'')+'默认胜率修正为 0。</p><div class="scout-links">'+tacticalSources.map(([u,t])=>link(u,t)).join(' · ')+'</div></div></section>';
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
    return '<article class="scout-team"><h3>'+mark+'</h3><p class="scout-meta">'+esc(labels[item.profile])+' · '+esc(item.usableForHistory?'全队打法描述':'局部线索')+' · 阵容重合 '+item.overlap+'/5</p><h4>'+esc(item.title)+'</h4><p>'+esc(item.summary)+'</p><p class="scout-meta">'+esc(item.date)+' · '+esc(item.scope)+'</p>'+citation(item)+
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
    return '<details class="squad-directory"><summary>全部 16 队打法与来源</summary>'+e.teams.map((t,i)=>{
      const n=e.styleStudy.scouts[t.name];
      return '<div class="scout-directory-row"><div>'+mark(i)+' <span class="scout-meta">'+esc(labels[n.profile])+' · '+esc(n.usableForHistory?'整队':'局部')+'</span></div><div><strong>'+esc(n.title)+'</strong><p>'+esc(n.summary)+'</p><span class="scout-meta">'+esc(n.date)+' · '+n.overlap+'/5 同阵容</span>'+citation(n)+'</div></div>';
    }).join('')+'</details>';
  }
  function studyTable(title,report) {
    const test=report.test;
    return '<h4>'+esc(title)+'</h4><p>训练 '+report.training.n+' 场，留出 '+test.n+' 场。以下为留出期先列一方的战绩。</p>'+
      '<div class="table-wrap"><table class="result-table"><thead><tr><th>对位</th><th>实胜 / 场数</th><th>VRS 预期胜场</th></tr></thead><tbody>'+
      report.pairs.map(p=>'<tr><td>'+esc(labels[p.first])+' × '+esc(labels[p.second])+'</td><td>'+p.test.wins+' / '+p.test.n+'</td><td>'+p.test.expectedWins.toFixed(1)+'</td></tr>').join('')+
      '</tbody></table></div>'+(test.base?'<p class="scout-meta">Brier 误差越低越好。仅实力 '+test.base.brier.toFixed(4)+'，加类别强弱 '+test.main.brier.toFixed(4)+'，加对位 '+test.pair.brier.toFixed(4)+'。对数损失依次为 '+[test.base,test.main,test.pair].map(v=>v.logLoss.toFixed(4)).join('、')+'。</p>':'')+
      '<p class="scout-meta">'+['bo1','bo3'].map(k=>{const f=report.testByFormat[k];return k.toUpperCase()+' '+f.n+' 场'+(f.n?'，Brier 从 '+f.base.brier.toFixed(4)+' 到 '+f.pair.brier.toFixed(4):'');}).join('。')+'。另有 '+report.testByFormat.unknown.n+' 场未能核实赛制。</p>';
  }
  function render(e,i,j,mark) {
    const study=e.styleStudy, a=e.teams[i].name, b=e.teams[j].name;
    return duelRead(study,a,b,e.closeSnapshot?.mapVeto||e.mapVeto)+'<section class="panel scouting-panel"><div class="panel-head"><div><h2>赛前打法档案</h2><p>资料截至 '+esc(study.asOf)+' · 新加坡首阶段赛前快照</p></div></div><div class="panel-body">'+directory(e,mark)+'<div class="scout-columns">'+teamPanel(a,mark(i),study)+teamPanel(b,mark(j),study)+'</div>'+
      '<details class="pair-study"><summary>历史交锋支持固定克制吗？</summary><p>我们只给对阵双方使用当时已公开、至少三名首发相同的标签。2026-09-01 起的比赛专用于验证。项目比较了只看 VRS、加上类别整体强弱、以及分别估计各对位优势三种做法。</p>'+
      studyTable('按球队的赛前打法资料',study.scoutsReport)+studyTable('按录像中的进攻指标',study.demosReport)+
      '<p>录像分类的对位模型在留出期未优于类别整体强弱。采访分类可检验的交手更少。推荐卡保留原胜率，可在下方自行设置对位幅度。</p></details></div></section>';
  }
  globalThis.PickStyleReport={render,labels};
})();
