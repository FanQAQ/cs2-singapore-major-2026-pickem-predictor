(() => {
  'use strict';
  const names={baseline:'本站推荐',elo:'180 天 Elo',ml:'地图 ML',blend:'Elo＋ML 各半',ablation:'ML 去选手',teamOnly:'ML 仅队伍'};
  const fields={stage1:'Major · Stage 1',stage2:'Major · Stage 2',stage3:'Major · Stage 3',cluj:'PGL 克卢日 2026 · 留出'};
  const main=['baseline','elo','ml','blend'];
  const choice={field:'stage1',model:'ml',forecast:'ml'};
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const fixed=n=>Number.isFinite(n)?n.toFixed(4):'—';
  const pct=n=>(100*n).toFixed(1)+'%';
  function table(head,rows) {
    const wrap=el('div'),t=el('table');wrap.className='table-wrap';t.className='result-table';
    const h=t.createTHead().insertRow();for(const name of head){const c=el('th',name);c.scope='col';h.append(c);}
    const b=t.createTBody();
    for(const row of rows){const r=b.insertRow();row.forEach((v,i)=>{const c=el(i?'td':'th',v);if(!i)c.scope='row';r.append(c);});}
    wrap.append(t);return wrap;
  }
  function select(id,label,choices,value,onChange) {
    const wrap=el('div'),name=el('label',label),s=el('select');wrap.className='context-picker';name.htmlFor=s.id=id;
    for(const [k,v] of Object.entries(choices))s.add(new Option(v,k));
    s.value=value;s.onchange=()=>onChange(s.value);wrap.append(name,s);return wrap;
  }
  function fold(title,...content){
    const d=el('details');d.className='pick-detail';
    const body=el('div');body.className='detail-body';body.append(...content);d.append(el('summary',title),body);return d;
  }
  function source(label,url){
    const link=el('a',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link;
  }
  function history(study) {
    const key=choice.field,g=study.groups[key],n=g.events;
    const label=id=>id==='baseline' && key==='cluj'?'赛前 VRS':names[id];
    const points=ids=>table(['单场模型','过关','总命中','0–3','BO1 Brier','BO3 Brier'],ids.map(k=>{
      const m=g.methods[k];return [label(k),m.passes+'/'+n,m.hits+'/'+(10*n),m.slots[2]+'/'+(2*n),fixed(m.errors.bo1.brier),fixed(m.errors.bo3.brier)];
    }));
    const method=g.methods[choice.model], p=method.paired;
    const root=el('div');
    const sample=key==='cluj'?'克卢日采用全 BO3。本站对照使用当时可查的 VRS 积分。':
      key==='stage3'?'该阶段实际举办了三届。用地图 ML 后，科隆从 2 格升至 5 格，奥斯汀从 5 格降至 4 格。':'固定推荐填法比较胜率。';
    root.append(el('p',sample+' 每届十格中五格算过关，Brier 越低表示单场胜率误差越小。'),points(main),
      fold('去掉选手或地图数据会怎样？',points(['ml','ablation','teamOnly'])),el('h3','固定胜率，换成整卡暴搜'),
      table(['单场模型','推荐填法','暴搜重排','暴搜过关'],main.map(k=>{const m=g.methods[k];return [label(k),m.hits+'/'+(10*n),m.search.hits+'/'+(10*n),m.search.passes+'/'+n];})),
      el('p','同一套胜率走相同的瑞士轮模拟路径。在 12,000 条路径上遍历 10,090,080 张卡，前三张再用独立路径选出一张。'),
      select('f1-history-model','查看逐届明细',Object.fromEntries(main.map(k=>[k,label(k)])),choice.model,
        v=>{choice.model=v;root.replaceWith(history(study));document.getElementById('f1-history-model').focus({preventScroll:true});}),
      table(['赛事','选对晋级队','晋级填错栏','推荐填法','暴搜'],method.byEvent.map(r=>[r.label,r.fixed.qualified+'/8',r.fixed.wrongTier,r.fixed.hits+'/10',r.search.hits+'/10'])),
      el('p','「晋级填错栏」指猜中晋级，但把 3–0 与普通晋级填反。'+label(choice.model)+'用推荐填法与'+label('baseline')+'相比，30 组种子的过关届数增加 '+p.better+' 组、持平 '+p.same+' 组、减少 '+p.worse+' 组。'));
    if(method.search.seeds.length)root.append(el('p','三组独立种子上的完整暴搜，总命中依次为 '+method.search.seeds.map(t=>t.hits+'/'+(n*10)).join('、')+'。'));
    root.id='f1-history';return root;
  }
  function tickets(s){
    const m=s.cards[choice.forecast],root=el('div');root.id='f1-forecast';
    root.append(table(['位置','推荐填法','暴搜重排'],['3–0','普通晋级','0–3'].map((n,i)=>
      [n,...['standard','search'].map(k=>s.teams.filter((_,j)=>m[k][j]===i).join('、'))])));
    const score=s.status.scores?.[choice.forecast];
    root.append(el('p',score?'正式赛果：推荐填法 '+score.standard.hits+'/10，暴搜 '+score.search.hits+'/10。':
      '待完赛评分。60,000 条独立模拟路径中，两张卡的模型过关率分别为 '+pct(m.standardConfirm/s.confirmPaths)+'、'+pct(m.searchConfirm/s.confirmPaths)+'。'));
    const category=['3–0','普通晋级','0–3','未入卡'];
    root.append(fold('穷举前三张分别换了谁？',table(['搜索排名','与复选卡的区别','独立模拟过关率'],
      m.topThree.map((c,i)=>[i+1,i+1===m.searchRank?'复选采用':
        c.card.flatMap((v,j)=>v===m.search[j]?[]:[s.teams[j]+' → '+category[v]]).join('、'),pct(c.confirmPasses/s.confirmPaths)]))));
    root.append(fold('把两张卡放进其他模型，还能过关吗？',table(['模拟胜率来源','已封存推荐','本组推荐填法','本组暴搜'],
      main.map(k=>[names[k],pct(s.cross[k].baseline.standard.passes/s.confirmPaths),pct(s.cross[k][choice.forecast].standard.passes/s.confirmPaths),
        pct(s.cross[k][choice.forecast].search.passes/s.confirmPaths)])),
      el('p','同一行使用完全相同的 60,000 个瑞士轮结果比较三张卡。列间差异来自填的人选。')));
    return root;
  }
  function authorCards(data) {
    const options={};
    for(const c of data.cards)options[c.id]=c.label;
    const result=el('div');
    function show(id){
      const card=data.cards.find(c=>c.id===id);
      result.replaceChildren(
        table(['原帖位置','F1bre 的队伍'],['3–0','普通晋级','0–3'].map((label,i)=>[label,card.groups[i].join('、')])),
        el('p','与首页已封存的预测有 '+card.commonSlots+'/10 格相同。'+
          (card.score?'正式赛果命中 '+card.score.hits+'/10。':'新加坡尚待完赛评分。')),
        table(['用哪套胜率模拟','作者这张卡过关','首页预测过关'],main.map(k=>[names[k],pct(card.pass[k]),pct(data.homePass[k])])));
      if(card.reportedRate)result.prepend(el('p','作者原图标出的过关率为 '+card.reportedRate+'。'));
    }
    if(!data.cards.length)return el('p','F1bre 在原帖公布了候选卡。当前可核对的完整卡面见原帖。');
    show(data.cards[0].id);
    const chooser=select('f1-author-pick','原帖卡面',options,data.cards[0].id,show);
    return fold('对照 F1bre 本人公布的新加坡卡面',chooser,result,
      el('p','每一行的两张卡走相同的 60,000 条路径。F1bre 与本站各自使用的训练资料和模拟样本不同。'));
  }
  function probabilityGaps(data) {
    const box=el('div'), options={};
    for(const [key,title] of [['elo','Elo'],['ml','ML']])for(const [metric,name] of [['qualified','总晋级'],['zero','0–3']])
      options[key+'-'+metric]='作者 '+title+' · '+name;
    const percent=n=>n.toFixed(1)+'%';
    function show(key){
      const [id,metric]=key.split('-'),top=data.top[id][metric],prefix=id==='elo'?'Elo':'ML';
      box.replaceChildren(el('p','与本站推荐相差最大的是 '+top.map(t=>t.name+'（'+Math.abs(t.deltaPp).toFixed(1)+' 个百分点）').join('、')+'。'),
        table(['参赛队','原帖 '+prefix,'本站推荐','本站重建 '+prefix],data.rows.map(t=>
          [t.name,percent(t.authors[id][metric]),percent(t.local.baseline[metric]),percent(t.local[id][metric])])));
      if(data.scores)box.append(el('p','按实际赛果给 16 队的这一项概率计分。原帖 Brier 为 '+
        fixed(data.scores[id][metric])+'，本站推荐为 '+fixed(data.scores.baseline[metric])+'。'));
    }
    show('ml-qualified');
    return fold('哪些队伍的晋级或 0–3 概率分歧最大？',
      select('f1-author-metric','对比概率',options,'ml-qualified',show),box,
      el('p','总晋级包含 3–0。原帖逐队数值来自第 2 和第 5 张图。本站数字取自开赛前封存胜率生成的 60,000 条独立路径。'));
  }
  function colognePosts(stages){
    const body=el('div');
    body.append(el('p','三篇文章都在相应阶段开赛前发布，且在完赛后有过编辑。以下按目前能核实的公开卡面计分。科隆 Stage 3 的 Elo 图给出了单项概率排序示例。'));
    for(const s of stages){
      body.append(el('h3','科隆 Stage '+s.stage+' · 本站回放 '+s.site+'/10'),
        table(['作者公开卡面','3–0','普通晋级','0–3','十格命中'],s.cards.map(c=>[c.label,...c.slots,c.hits+'/10'])),
        source('查看 F1bre 的科隆 Stage '+s.stage+' 原帖',s.source));
    }
    return fold('作者在科隆三个阶段各中了几格？',body);
  }
  function formatComparison(study){
    const names={stage1:'Stage 1',stage2:'Stage 2',stage3:'Stage 3',holdout:'奥斯汀欧洲 MRQ'};
    const rows=Object.entries(study.groups).map(([id,g])=>{
      const cell=t=>t?t.passes+'/'+g.events+' 届 · '+t.hits+' 格':'—';
      return [names[id],cell(g.site),cell(g.baseline),cell(g.hybrid),g.hybrid.zero+'/'+(2*g.events)];
    });
    const m=study.corrected,d=study.groups.stage3.direction;
    const panel=fold('BO1 用 Elo、BO3 用地图 ML',
      el('p','固定填法，只改变 BO1 胜率。奥斯汀欧洲资格赛的 20 场 BO1，Brier 从 '+fixed(m.baseline.brier)+' 到 '+fixed(m.hybrid.brier)+'，对数损失从 '+fixed(m.baseline.logLoss)+' 到 '+fixed(m.hybrid.logLoss)+'。'),
      table(['赛事','本站推荐','地图 ML','按赛制组合','组合的 0–3 命中'],rows),
      el('p','30 组种子里，组合相对地图 ML 的 Stage 3 过关届数增加 '+d.more+' 组，持平 '+d.same+' 组，减少 '+d.less+' 组。发布种子在奥斯汀、布达佩斯、科隆分别中 '+study.stage3.map(r=>r.hybrid).join('、')+' 格。'),
      el('p','fnatic 在开赛前三天宣布 b0RUP 替代 KRIMZ。两版名单均通过单场对照；表中使用俱乐部公告的五人。资格赛的两个附加赛单列。'),
      source('fnatic 赛前换人公告',study.standIn));
    panel.id='f1-format-study';panel.open=location.hash==='#verify/f1bre/formats';
    return panel;
  }
  function mount(section,study){
    if(!section||!study)return;
    const s=study.singapore,root=el('div');root.className='panel-body';root.id='f1bre-model-compare';
    const head=el('div');head.className='panel-head';head.append(el('h2','F1bre 的 Elo 和地图 ML 能多中几格？'));
    const h=el('div');h.append(history(study));
    const r1=table(['首轮对阵（左队胜率）','本站','Elo','ML','各半'],s.first.map(p=>[p.a+' / '+p.b,...main.map(k=>pct(p.probs[k]))]));
    const download=el('a','下载本轮封存的研究卡与胜率');download.className='download-link';download.download='';download.href='forecasts/singapore-stage1-f1bre-models.json';
    const row=el('div');row.append(tickets(s));
    const links=el('p');links.className='context-sources';
    links.append(source('F1bre 的新加坡原帖','https://www.xiaoheihe.cn/app/bbs/link/197229714'),' · ',
      source('作者的 Elo 实现','https://github.com/holygodly/CS2-Major-ELO-PickEm-Predictor'),' · ',
      source('作者的 ML 实现','https://github.com/holygodly/CS2-Major-ML-PickEm-Predictor'));
    const stage1=study.groups.stage1.methods;
    root.append(el('p','新加坡首阶段沿用本站推荐。五届 Stage 1 固定填法实测，本站过了 '+stage1.baseline.passes+' 届，Elo 过了 '+stage1.elo.passes+
        ' 届，地图 ML 过了 '+stage1.ml.passes+' 届。'),
      el('p','本次按作者公开方法，用可核实的赛前资料重建两套胜率。作者帖中的 20.66% 是他对新加坡的模拟估计。'),
      select('f1-field','查看历史检验',fields,choice.field,v=>{choice.field=v;h.replaceChildren(history(study));}),h,
      fold('新加坡 Stage 1 的赛前选人和首轮分歧',select('f1-forecast-model','赛前模型',Object.fromEntries(main.map(k=>[k,names[k]])),choice.forecast,
        v=>{choice.forecast=v;row.replaceChildren(tickets(s));}),row,el('h3','首轮分歧，从大到小'),r1,download),
      formatComparison(study.formatStudy),budgetComparison(study.formatStudy.budgets),authorCards(s.authorCards),probabilityGaps(s.marginals),colognePosts(study.cologne),links);
    section.replaceChildren(head,root);
  }
  function budgetComparison(study){
    const labels={'austin-2025-3':'奥斯汀 Stage 3','budapest-2025-3':'布达佩斯 Stage 3','cologne-2026-3':'科隆 Stage 3',
      'shanghai-europe-rmr-a-2024':'上海欧洲 RMR A · 留出','cluj-2026':'克卢日 2026 · 全 BO3'};
    const rows=study.rows.map(r=>[labels[r.id],r.small+' → '+r.large,r.smallPass+' → '+r.largePass,r.zero+'/2']);
    const foldout=fold('Stage 3 增加模拟次数后，哪些队换了位置？',
      el('p','每组用同一套 BO1 Elo、BO3 地图 ML 胜率。选卡从 1.2 万次增加到 36 万次，各用等量的独立赛程核分。前两列依次显示小预算和大预算结果。'),
      table(['阶段','主种子命中 / 10','过关种子 / 30','大预算 0–3 命中'],rows),
      el('p','三届 Major 大预算主卡共中 '+study.hits+'/30 格。布达佩斯把 FURIA 填进 3–0 的次数从 18 增至 28；奥斯汀 30 组都中 4 格。'),
      el('p','相比小预算，过关届数在 '+study.paired[0]+' 组增加、'+study.paired[1]+' 组持平、'+study.paired[2]+' 组减少。相比线上默认卡，分别为 '+study.vsSite.join('、')+' 组。'),
      el('p','上海留出赛五轮的 33 场用于整卡计分，两场名次附加赛单列。20 场 BO1 的 Brier 从地图 ML 的 '+fixed(study.bo1.baseline.brier)+' 升至 Elo 的 '+fixed(study.bo1.hybrid.brier)+'。新加坡全 BO3 的第三阶段将在参赛名单确认后同时封存大预算研究卡。'));
    foldout.id='f1-budget-study';foldout.open=location.hash==='#verify/f1bre/budget';
    return foldout;
  }
  function sidebar(fold,stage,study){
    const group=study?.groups['stage'+stage];
    fold.hidden=!group;
    if(!group || fold.dataset.stage===String(stage))return;
    fold.dataset.stage=stage;
    const more=el('a','查看实战与原帖卡面');more.href='#verify/f1bre';
    more.onclick=()=>{
      choice.field='stage'+stage;
      const field=document.getElementById('f1-field');
      if(field){field.value=choice.field;field.dispatchEvent(new Event('change'));}
      if(location.hash==='#verify/f1bre')document.getElementById('context-f1bre')?.scrollIntoView({block:'start'});
    };
    const body=fold.querySelector('div');
    const split=study.formatStudy.groups['stage'+stage].hybrid;
    const formatLink=el('a','查看按赛制组合的留出检验');formatLink.href='#verify/f1bre/formats';
    body.replaceChildren(el('p','Stage '+stage+' · 固定推荐填法的独立对照'),
      table(['单场胜率','过关','总命中'],[...main.map(k=>[names[k],group.methods[k].passes+'/'+group.events,group.methods[k].hits+'/'+(10*group.events)]),
        ['BO1 Elo、BO3 ML',split.passes+'/'+group.events,split.hits+'/'+(10*group.events)]]),more,' · ',formatLink);
    if(stage===2||stage===3){
      if(stage===3){
        const b=study.formatStudy.budgets,a=el('a','查看五个场地的大预算对照');a.href='#verify/f1bre/budget';
        body.append(el('p','36 万次研究卡过 '+b.passes+'/3 届，中 '+b.hits+'/30 格。30 组中有 '+b.achieved+' 组过至少两届。'),a);
      }
      const next=el('a','同一批晋级队怎样填 3–0？');next.href='#verify/allocation';
      next.onclick=()=>{allocationSelection='stage'+stage;const s=document.getElementById('allocation-event');if(s){s.value=allocationSelection;s.dispatchEvent(new Event('change'));}};
      body.append(el('br'),next);
    }
    const form=el('a','连续发挥会影响这一阶段吗？');form.href='#verify/form';
    form.onclick=()=>{formStage='S'+stage;formEvent='';const s=document.getElementById('form-stage');if(s){s.value=formStage;s.dispatchEvent(new Event('change'));}};
    body.append(el('br'),form);
    const veto=el('a','查对手禁选和 BO3 胜率');veto.href='#verify/veto';
    veto.onclick=()=>{vetoGroup='S'+stage;vetoField='';const s=document.getElementById('veto-stage');if(s){s.value=vetoGroup;s.dispatchEvent(new Event('change'));}};
    body.append(el('br'),veto);
    const bo5=el('a','哪些 0–3 候选有漏算的比赛？');bo5.href='#verify/bo5/stage'+stage;
    body.append(el('br'),bo5);
    if(stage===3){
      const elite=el('a','打前八的战绩能改善 BO3 胜率吗？');elite.href='#verify/elite';body.append(el('br'),elite);
    }
  }
  let allocationSelection='stage3',allocationModel='ml',allocationDraw='draw';
  const fillLabels={standard:'推荐填法',within:'仅调整 3–0',grouped:'整卡按入场分组'};
  function mountAllocation(anchor,study){
    if(!anchor||!study)return;
    const panel=el('section');panel.className='panel wide audit-section';panel.id='context-allocation';
    const heading=el('div');heading.className='panel-head';heading.append(el('h2','猜中晋级后，3–0 填对了吗？'));
    const body=el('div');body.className='panel-body';
    const choices=Object.fromEntries(Object.entries(study.groups).map(([k,v])=>[k,v.label]));
    const eventChoice=select('allocation-event','赛事或阶段',choices,allocationSelection,v=>{allocationSelection=v;draw();});
    const controls=el('div'),result=el('div');result.id='allocation-results';
    function draw(){
      const g=study.groups[allocationSelection],isElisa=!!g.views.draw,external=isElisa||allocationSelection.startsWith('e');
      const v=g.views[isElisa?allocationDraw:'primary'][allocationModel],p=v.policies;
      const ms=select('allocation-model','单场胜率',{ml:'地图 ML',baseline:external?'赛前 VRS':'本站推荐'},allocationModel,k=>{allocationModel=k;draw();document.getElementById('allocation-model').focus({preventScroll:true});});
      controls.replaceChildren(ms);
      if(isElisa)controls.append(select('allocation-draw','同战绩配对假设',{draw:'均匀抽签',ranked:'按赛前实力高低配对'},allocationDraw,k=>{allocationDraw=k;draw();document.getElementById('allocation-draw').focus({preventScroll:true});}));
      result.replaceChildren(table(['填法',v.ns===1?'结果':'过关届数','总命中','选对晋级','晋级错栏'],Object.entries(fillLabels).map(([k,name])=>{
        const a=p[k],passed=v.ns===1?(a.passes?'过关':'未过关'):a.passes+'/'+v.ns;
        return [name,passed,a.hits+'/'+(10*v.ns),a.qualified+'/'+(8*v.ns),a.wrongTier];
      })),el('p','换 30 组模拟种子后，「仅调整 3–0」相对推荐填法的过关届数增加 '+p.within.changes.passes[0]+' 组、持平 '+
        p.within.changes.passes[1]+' 组、减少 '+p.within.changes.passes[2]+' 组。'));
      if(isElisa)result.append(el('p','Elisa 有八队直邀和八队从前一阶段晋级。首轮签位可追溯，后续同战绩队的具体抽签规则未能核实。可切换两种配对假设。'));
      if(allocationSelection==='elisa-fall' && allocationModel==='ml')result.append(el('p','DASH 和 Meteor 当时缺少可继承的三人队史，每队仅一名选手有基础表现数据。涉及两队的 29 个潜在配对使用去掉 VRS 项的地图模型。'));
      if(v.ns===1){
        const tiers=['3–0','普通晋级','0–3','未入卡','原队退赛'];
        const changed=v.teams.flatMap((name,i)=>v.cards.standard[i]===v.cards.within[i]&&v.cards.standard[i]===v.cards.grouped[i]?[]:
          [[name,tiers[v.cards.standard[i]],tiers[v.cards.within[i]],tiers[v.cards.grouped[i]],v.actual[i]===3?'1–3 / 2–3':tiers[v.actual[i]]]]);
        result.append(fold('逐队查看哪些位置变了',changed.length?table(['队伍','推荐','仅调 3–0','整卡分组','实际'],changed):el('p','三种填法的十个位置完全相同。')));
      }else result.append(table(['实战','推荐','仅调 3–0','整卡分组'],v.byEvent.map(e=>[e.label,...e.hits])));
      if(p.standard.seatHits!==undefined)result.append(el('p','按原队计分时，退赛的 Sangal 所占竞猜格得零。如果允许继承替补 Endpoint 的战绩，三张卡依次中 '+
        Object.keys(fillLabels).map(k=>p[k].seatHits).join('、')+' 格。'));
      const detail=el('div');
      detail.append(table(['填法','3–0','普通晋级','0–3','多中／持平／少中的种子数'],Object.entries(fillLabels).map(([k,name])=>
        [name,...p[k].slots,p[k].changes.hits.join(' / ')])),el('p','三种填法共用同一套胜率。这些实打 BO3 共 '+v.bo3.n+' 场，Brier 为 '+fixed(v.bo3.brier)+'。'));
      if(v.bo3.core)detail.append(el('p','只计双方均能确认至少三名原首发的比赛，共 '+v.bo3.core.n+' 场，Brier 为 '+fixed(v.bo3.core.brier)+'。'));
      result.append(fold('查看各栏命中和胜率误差',detail));
      if(v.donors)result.append(fold('少用哪一届历史会改变过关结果？',
        table(['只调整 3–0','过关届数','总命中'],v.donors.map(r=>[r.label,r.passes+'/3',r.hits+'/30'])),
        el('p','每次移除一届完整来源。目标开赛时仍未结束的赛事原本就不参与训练。')));
    }
    draw();
    const major=study.groups.stage3.views.primary.ml.policies,esl=study.groups.esl.views.primary.ml.policies;
    body.append(el('p','固定地图 ML 胜率，三届 Major Stage 3 仅调整全胜位，过关由 '+major.standard.passes+' 届增至 '+major.within.passes+
      ' 届。三届 ESL 则由 '+esl.standard.passes+' 届降至 '+esl.within.passes+' 届。首页继续使用原推荐。'),
      el('p','「仅调整 3–0」保留推荐的八支晋级队和两支 0–3，利用往届同入场方式队伍的成绩，重新选出两个全胜位。整卡分组还可以更换人选。'),
      eventChoice,controls,result);
    panel.append(heading,body);anchor.after(panel);
  }
  let formStage='S3',formEvent='budapest-2025-3',formModel='ml';
  const stages={S1:'Major · Stage 1',S2:'Major · Stage 2',S3:'Major · Stage 3',Cluj:'PGL 克卢日 2026',EPL:'ESL 第二阶段',Bucharest:'PGL 布加勒斯特 2025 春季'};
  const cities={copenhagen:'哥本哈根',shanghai:'上海',austin:'奥斯汀',budapest:'布达佩斯',cologne:'科隆'};
  function formLabel(f){
    const city=cities[f.id.split('-')[0]];
    return city?city+' '+f.start.slice(0,4):f.group==='EPL'?f.id.split('-')[0].toUpperCase():stages[f.group];
  }
  function mountForm(anchor,data){
    if(!anchor||!data)return;
    const panel=el('section'),head=el('div'),body=el('div'),result=el('div'),eventControl=el('div'),controls=el('div');
    panel.className='panel wide audit-section';panel.id='context-form';head.className='panel-head';body.className='panel-body';
    controls.className='form-selectors';result.className='form-results';
    head.append(el('h2','同一支队会连续超常发挥吗？'));
    const available=Object.fromEntries(Object.keys(stages).filter(k=>data.groups[k]).map(k=>[k,stages[k]]));
    function update(){
      const options=data.fields.filter(f=>f.group===formStage);
      const f=options.find(f=>f.id===formEvent)??options[0];formEvent=f.id;
      eventControl.replaceChildren(select('form-event','查看哪一届',Object.fromEntries(options.map(f=>[f.id,formLabel(f)])),
        f.id,id=>{formEvent=id;draw();}));draw();
    }
    function draw(){
      const f=data.fields.find(f=>f.id===formEvent),m=f.models[formModel],g=data.groups[formStage][formModel];
      const groupScore=key=>g[key][0]+'/'+g.n+' 届';
      const exact={0:'3–0',1:'普通晋级',2:'0–3',3:'未入卡'},order=f.teams.map((_,i)=>i).sort((a,b)=>f.actual[a]-f.actual[b]||a-b);
      const featured=order.filter(i=>f.actual[i]===0).map(i=>[f.teams[i],pct(m.control.perfect[i]),pct(m.trained.perfect[i]),exact[m.trained.card[i]]]);
      const groupRows=['control','trained'].map((key,i)=>[i?'加入连续发挥':'原模型',groupScore(key),g[key][1]+'/'+(10*g.n),m[key].hits+'/10']);
      const score=table(['模拟方式','过关','总命中',formLabel(f)],groupRows);score.classList.add('form-scores');
      result.replaceChildren(score,el('p','在 '+data.seeds+' 组种子中，本组过关届数增加 '+g.direction.better+' 组、持平 '+g.direction.same+' 组、减少 '+g.direction.worse+' 组。'),
        el('h3','实际打出 3–0 的两队'),table(['队伍','原全胜率','调整后','调整后填法'],featured),
        el('p','全胜率取 '+data.seeds+' 组独立复验路径的平均。依据赛前 '+f.events+' 项赛事中 '+f.pairs.toLocaleString('zh-CN')+' 对相邻 BO3，'+
          (f.scale===0?'本届估出的幅度为零，两种模拟给出的全胜率相同。':'本届估出的状态幅度为 '+f.scale.toFixed(3)+'（对数胜算）。')));
      result.append(fold('查看全部 16 队的 3–0 和 0–3 概率',table(['队伍','原 3–0','调整后','原 0–3','调整后'],order.map(i=>[
        f.teams[i],pct(m.control.perfect[i]),pct(m.trained.perfect[i]),pct(m.control.zero[i]),pct(m.trained.zero[i])]))));
      const round=m.rounds.allBo3;
      result.append(fold('打完一轮再更新，下一轮能猜得更准吗？',el('p','同一轮的预测只用此前整轮已结束的实打结果。Brier 越低，预测概率越接近实际胜负。'),
        table(['这届的实打 BO3','更新前','逐轮更新后'],[[round.baseline.n+' 场',fixed(round.baseline.brier),fixed(round.trained.brier)] ]),
        el('p','交卡时这些赛果尚未发生。上表中的整卡得分只使用赛前信息。')));
    }
    const overall=data.groups.S3.baseline;
    body.append(el('p','用赛前 BO3 估计一支队能否连续打好几场，首页推荐在三届 Stage 3 共中 '+overall.trained[1]+' 格，比原先多 '+(overall.trained[1]-overall.control[1])+' 格，仍只过一届。新加坡 Stage 1 只有 '+data.singapore.events+' 项合格赛事，低于预设的 10 项，沿用原推荐。'));
    controls.append(select('form-stage','赛事与阶段',available,formStage,v=>{formStage=v;formEvent='';update();}),
      select('form-model','单场胜率',{baseline:'本站推荐／外部 VRS',ml:'地图 ML'},formModel,v=>{formModel=v;draw();}),eventControl);
    body.append(controls,result);
    update();panel.append(head,body);anchor.after(panel);
  }
  let vetoGroup='S3',vetoField='cologne-2026-3';
  function mountVeto(anchor,data){
    if(!anchor||!data)return;
    if(location.hash==='#verify/veto/singapore'){vetoGroup='Singapore';vetoField='singapore';}
    const panel=el('section'),head=el('div'),body=el('div'),filters=el('div'),events=el('div'),result=el('div');
    panel.id='context-veto';panel.className='panel wide audit-section';head.className='panel-head';body.className='panel-body';filters.className='veto-filters';
    head.append(el('h2','禁选猜得准，BO3 和竞猜卡会更准吗？'));
    const labels={S1:'Major · Stage 1',S2:'Major · Stage 2',S3:'Major · Stage 3',Astana:'阿斯塔纳 2025 · 首次留出',
      EPL:'EPL S23 · 迁移',Bucharest:'布加勒斯特 2025 · 迁移',Cluj:'克卢日 2026 · 迁移',Singapore:'新加坡 2026 · 赛前'};
    const variants={reference:'本站推荐',original:'地图 ML · 按常打地图',candidate:'地图 ML · 按双方禁选'};
    const places=['3–0','普通晋级','0–3','未入卡'];
    function title(f){return cities[f.id.split('-')[0]]?cities[f.id.split('-')[0]]+' '+f.start.slice(0,4):labels[f.group].split(' · ')[0];}
    const short=p=>p?(p.join(' / ')):'—';
    function redraw(){
      const eligible=data.fields.filter(f=>f.group===vetoGroup).sort((a,b)=>a.start.localeCompare(b.start));
      const f=eligible.find(f=>f.id===vetoField)??eligible[0];vetoField=f.id;
      events.replaceChildren(select('veto-event','赛事',Object.fromEntries(eligible.map(f=>[f.id,title(f)])),f.id,v=>{vetoField=v;redraw();document.getElementById('veto-event').focus({preventScroll:true});}));
      result.replaceChildren();
      const g=data.groups[f.group];
      if(g){
        result.append(table(['方法','本组过关','本组命中',title(f)],Object.entries(variants).map(([k,v])=>
          [k==='reference'&&!/^S[123]$/.test(f.group)?'赛前 VRS':v,g.methods[k].passes+'/'+g.n,g.methods[k].hits+'/'+(g.n*10),f.methods[k].hits+'/10'])),
          el('p','改用双方禁选后，'+data.seeds+' 组种子中有 '+g.passDirection.better+' 组多过关、'+g.passDirection.same+' 组持平、'+g.passDirection.worse+' 组少过关。'));
      }else{
        const sealed=data.forecast;
        if(sealed){const link=el('a','下载赛前封存');link.href=sealed.webFile;link.download='';
          const stamp=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(sealed.frozenAt));
          result.append(el('p',sealed.status==='scored'?'新加坡 Stage 1 原地图 ML 中 '+sealed.scores.original.hits+'/10，禁选 ML 中 '+sealed.scores.candidate.hits+'/10。':
            '新加坡 Stage 1 已封存（北京时间 '+stamp+'）。实际过关和命中等阶段结束后评分。'),link);}
      }
      if(f.set){
        const s=f.set;
        result.append(el('h3','选图与胜率'),el('p','这届 '+s.eligible+'/'+s.expected+' 场实打 BO3 有完整选图，其中 '+s.unused+' 张决胜图因 2–0 没有开打。'),
          table(['指标（越低越好）','按常打地图','按双方禁选'],[
            ['三图集合对数损失',...s.loss.map(fixed)],['胜负 Brier',...s.errors.slice(0,2).map(x=>fixed(x.brier))]]),
          fold('如果在禁选完成后才预测',el('p','将已知的三张图代入赛前的逐图胜率，这 '+s.eligible+' 场胜负 Brier 为 '+fixed(s.errors[2].brier)+'，对数损失为 '+fixed(s.errors[2].logLoss)+'。这项赛后诊断只能用于定位误差。')));
      }
      const matchup=el('div'),detail=el('div');
      const choices=Object.fromEntries(f.pairs.map((p,i)=>[i,(p.round?'R'+p.round+' · ':'')+p.a+' vs '+p.b]));
      const initial=!g?Math.max(0,f.pairs.findIndex(p=>[p.a,p.b].includes('100 Thieves'))):0;
      function match(i){
        const p=f.pairs[i];
        const rows=[['按常打地图',short(p.modes[0].maps),pct(p.modes[0].mass),pct(p.base)],
          ['按双方禁选',short(p.modes[1].maps),pct(p.modes[1].mass),pct(p.candidate)]];
        detail.replaceChildren(table(['赛前方法','最可能的三张图¹','这组图的概率',p.a+' 胜率'],rows),
          el('p','¹ 三张图按集合比较。赛前同图池 BO3 样本为 '+p.a+' '+p.nA+' 场、'+p.b+' '+p.nB+' 场。'));
        if(p.planned){
          const used=p.playedMaps.includes(p.planned[2]);
          const list=el('ol');list.setAttribute('aria-label','实际选图顺序');list.className='veto-maps';
          p.planned.forEach((map,index)=>{const li=el('li');li.append(el('span',['首选','次选',used?'已打决胜图':'2–0，决胜图未打'][index]),el('strong',map));list.append(li);});
          detail.append(list,el('p',p.winner+' 赢得系列赛。赛前给这个实际组合的概率从 '+pct(p.masses[0])+' 变为 '+pct(p.masses[1])+'。'));
          if(p.source)detail.append(source('核对这场比赛',p.source));
        }
      }
      matchup.append(select('veto-match','对阵',choices,String(initial),v=>match(Number(v))),detail);match(initial);
      const actual=f.actual??(!g?data.forecast?.actual:null);
      const stages=f.teams.map((name,i)=>[name,places[f.methods.reference.card[i]],places[f.methods.original.card[i]],places[f.methods.candidate.card[i]],
        actual?(actual[i]===3?'1–3／2–3':places[actual[i]]):'待赛']);
      result.append(el('h3',g?'查一场实战':'查一个潜在对手'),matchup,
        fold('逐队对照十格怎么填',table(['队伍','推荐／VRS','原地图 ML','禁选 ML','实绩'],stages)),
        el('p','16 队共 120 种潜在对阵，'+f.both+' 对双方有样本，'+f.one+' 对仅一方有，'+f.neither+' 对沿用原 ML 抽图。'));
    }
    filters.append(select('veto-stage','阶段／留出',labels,vetoGroup,v=>{vetoGroup=v;vetoField='';redraw();}),events);
    body.append(el('p','固定七张地图各自的胜率和十格填法，只改变赛前如何预测三张入选地图。BO1 使用同一份胜率。'),filters,result);
    redraw();panel.append(head,body);anchor.after(panel);
  }
  globalThis.F1breStudy={mount,sidebar,mountAllocation,mountForm,mountVeto,widgets:{el,table,select,fold,source,pct,fixed}};
})();
