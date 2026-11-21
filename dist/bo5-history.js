(() => {
  'use strict';
  const {el,table,select,fold,source,pct,fixed}=F1breStudy.widgets;
  const groups={Astana:'阿斯塔纳 2025 · 发现案例',Masters:'布加勒斯特大师赛 2025 · 首次留出',
    S1:'Major · Stage 1',S2:'Major · Stage 2',S3:'Major · Stage 3',Singapore:'新加坡 2026 · 赛前',
    EPL:'ESL 第二阶段',Cluj:'克卢日 2026',Bucharest:'布加勒斯特 2025 春季'};
  const cities={copenhagen:'哥本哈根',shanghai:'上海',austin:'奥斯汀',budapest:'布达佩斯',cologne:'科隆'};
  const entryName={direct:'直邀','3-0':'上阶段 3–0','3-1':'上阶段 3–1','3-2':'上阶段 3–2'};
  const places=['3–0','普通晋级','0–3','未入卡'];
  const choice={group:'Astana',event:null,team:null};
  let drawRoute;
  function route(hash){
    const value=hash.split('/')[2];
    const group={stage1:'S1',stage2:'S2',stage3:'S3',singapore:'Singapore'}[value];
    if(hash.startsWith('#verify/bo5/') && group && group!==choice.group){
      Object.assign(choice,{group,event:null,team:null});
      if(drawRoute)drawRoute();
    }
  }
  function eventLabel(f){
    const city=cities[f.id.split('-')[0]];
    return city?city+' '+f.start.slice(0,4):f.group==='EPL'?f.id.split('-')[0].toUpperCase():groups[f.group].split(' · ')[0];
  }
  const pairText=(a,b)=>a===b?a:a+' → '+b;
  function mount(anchor,data){
    if(!anchor||!data)return;
    drawRoute=null;route(location.hash);
    const panel=el('section'),head=el('div'),body=el('div'),filters=el('div'),result=el('div');
    panel.id='context-bo5';panel.className='panel wide audit-section';head.className='panel-head';body.className='panel-body';filters.className='bo5-filters';
    head.append(el('h2','补回 BO5 地图，谁的 0–3 风险变了？'));
    const options={...groups,Singapore:data.forecast?.status==='scored'?'新加坡 2026 · 已结算':groups.Singapore};
    const groupSelect=select('bo5-group','赛事与阶段',options,choice.group,k=>{Object.assign(choice,{group:k,event:null,team:null});draw();});
    const eventSelect=el('div');filters.append(groupSelect,eventSelect);
    body.append(el('p','用比赛当时的五人阵容，把遗漏的五局三胜制（BO5）实打地图补入队史和选手数据。两套地图 ML 使用相同训练目标和抽图概率。'),filters,result);
    function draw(){
      if(!panel.isConnected)return;
      groupSelect.querySelector('select').value=choice.group;
      const events=data.fields.filter(f=>f.group===choice.group).sort((a,b)=>a.start.localeCompare(b.start));
      const f=events.find(v=>v.id===choice.event)??events[0];choice.event=f.id;
      eventSelect.hidden=events.length===1;
      if(events.length>1)eventSelect.replaceChildren(select('bo5-event','查看哪一届',Object.fromEntries(events.map(v=>[v.id,eventLabel(v)])),f.id,id=>{
        choice.event=id;choice.team=null;draw();document.getElementById('bo5-event').focus({preventScroll:true});
      }));
      else eventSelect.replaceChildren();
      const g=data.groups[f.group],future=f.group==='Singapore';
      const defaultTeam=f.id==='astana-2025'?f.teams.find(t=>t.name==='Ninjas in Pyjamas'):f.teams.find(t=>t.cards[0][0]===2 && t.actual!==null && t.actual<2);
      const team=f.teams.find(t=>t.name===choice.team)??defaultTeam??f.teams.find(t=>t.cards[0][0]===2)??f.teams[0];
      choice.team=team.name;
      const teamSelect=select('bo5-team','查看队伍',Object.fromEntries(f.teams.map(t=>[t.name,t.name])),team.name,name=>{
        choice.team=name;draw();document.getElementById('bo5-team').focus({preventScroll:true});
      });
      const cards=team.cards,extra=team.extra;
      const index=f.teams.indexOf(team),actual=team.actual??(future?data.forecast?.actual?.[index]:null);
      const real=team.record?team.record.join('–')+(actual<2?' 晋级':' 淘汰'):(actual==null?'待赛':actual===3?'1–3／2–3':places[actual]);
      const stats=el('dl');stats.className='bo5-stats';
      for(const [label,value] of [['可继承的地图',team.base+' → '+(team.base+extra)],
        ['0–3 概率',pairText(...team.p.map(pct))],['ML 标准卡的位置',pairText(...cards.map(c=>places[c[0]]))],['实际战绩',real]]){
        const item=el('div');item.append(el('dt',label),el('dd',value));stats.append(item);
      }
      result.replaceChildren(teamSelect,stats);
      result.append(el('p',(team.entry?entryName[team.entry]+'。':'')+'原模型给 '+team.name+' 的晋级率为 '+pct(team.q[0])+'，补档后为 '+pct(team.q[1])+'。'));
      if(extra){
        const list=el('ul');list.className='bo5-sources';
        for(const r of team.history){
          const g=data.series[r.id],item=el('li'),link=source(r.day+' · '+r.opponent,g.url);
          item.append(link,el('span',g.event+' · 地图 '+r.w+' 胜 '+r.l+' 负 · '+r.core+'/5 首发重合'));
          const maps=g.maps.map(([map,x,y])=>map+' '+(r.side===0?x+'–'+y:y+'–'+x));
          item.append(el('span',maps.join(' · ')));
          list.append(item);
        }
        result.append(fold('查看补入的 '+extra+' 张地图（'+team.win+' 胜 '+team.loss+' 负）',el('p','队史取 '+f.cutoff+' 之前能确认的最近一年。各图比分均将 '+team.name+' 列在前面。'),list));
      }else result.append(el('p','在这一年的合格 BO5 中，未找到与本队共享三名首发的地图。其他队和个别选手的补档也会影响胜率。'));
      if(g){
        const head=['历史与填法','本组过关','总命中','0–3 命中'];
        if(g.n>1)head.push(eventLabel(f));
        result.append(el('h3','整张卡有没有多过关？'),table(head,[
          ['原地图 ML',g.arms[0].cards[0],f.cards[0][0]],['补入 BO5',g.arms[1].cards[0],f.cards[1][0]],
          ['原 ML · 纯概率填卡',g.arms[0].cards[1],f.cards[0][1]],['补图 · 纯概率填卡',g.arms[1].cards[1],f.cards[1][1]]
        ].map(([label,c,n])=>[label,c.passes+'/'+g.n,c.hits+'/'+(g.n*10),c.slots[2]+'/'+(g.n*2),...(g.n>1?[n+'/10']:[])])),
          el('p','固定推荐填法，补图后在 '+data.seeds+' 组种子中过关届数增加 '+g.dir.better+' 组、持平 '+g.dir.same+' 组、减少 '+g.dir.worse+' 组。'));
        const rates=table(['胜率误差（越低越好）','原 ML','补图 ML'],[['BO1 Brier',...g.arms.map(a=>fixed(a.bo1.brier))],
          ['BO1 对数损失',...g.arms.map(a=>fixed(a.bo1.logLoss))],['BO3 Brier',...g.arms.map(a=>fixed(a.bo3.brier))],
          ['BO3 对数损失',...g.arms.map(a=>fixed(a.bo3.logLoss))],['0–3 概率 Brier',...g.arms.map(a=>fixed(a.zero))]]);
        result.append(fold('查看单场胜率与 0–3 概率误差',rates,el('p','该组共 '+g.arms[0].bo1.n+' 场实打 BO1、'+g.arms[0].bo3.n+' 场实打 BO3。0–3 概率用所有 '+(g.n*16)+' 个队次评分。')));
      }else if(data.forecast?.webFile){
        const snap=data.forecast,link=el('a','下载赛前研究卡与 120 对胜率');link.href=snap.webFile;link.download='';
        const stamp=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(snap.frozenAt));
        result.append(el('p','新加坡 Stage 1 的补图预测已于北京时间 '+stamp+' 单独封存。'),link);
        result.append(el('p','表中赛前概率来自主种子 '+data.seed+' 的 '+data.audit.toLocaleString('zh-CN')+' 条独立复验路径。'));
        if(snap.status==='scored'){
          const labels={original:'原 ML 推荐填法',candidate:'补图推荐填法',originalPure:'原 ML 纯概率填法',candidatePure:'补图纯概率填法'};
          result.append(table(['赛前封存','实际命中','是否过关'],Object.entries(labels).map(([k,label])=>{
            const score=snap.scores[k];return [label,score.hits+'/10',score.hits>=5?'过关':'未过关'];
          })));
        }
      }
      const ordered=[...f.teams].sort((a,b)=>b.p[1]-a.p[1]);
      result.append(fold('查看 16 队的风险和两种填法',table(['队伍','原 0–3','补图 0–3','补图推荐填法','补图纯概率填法'],ordered.map(t=>
        [t.name,pct(t.p[0]),pct(t.p[1]),places[t.cards[1][0]],places[t.cards[1][1]]]))));
      if(g){
        const m=g.arms[0],n=g.arms[1];
        result.append(fold('只换最后两个 0–3 位，会怎样？',
          el('p','保留同一份八队晋级名单和两个全胜位。在其他八队里，推荐填法取种子最靠后的两队，另一种填法取模拟中最常全败的两队。'),
          table(['单场模型','按种子过关','按概率选两队过关','0–3 命中（种子 → 概率）'],
            [m,n].map((a,i)=>[i?'补图 ML':'原地图 ML',a.cards[0].passes+'/'+g.n,a.cards[2].passes+'/'+g.n,
              a.cards[0].slots[2]+' → '+a.cards[2].slots[2]+'（共 '+2*g.n+' 格）'])),
          el('p','在本组 '+2*g.n+' 个标准 0–3 格里，原 ML 有 '+m.cards[0].falseZeroQualified+' 格填了最终晋级的队，补图后有 '+n.cards[0].falseZeroQualified+' 格。')));
      }
      const c=data.cohorts[f.group];
      if(c)result.append(fold('上阶段 3–2 晋级的队伍，后来有几支 0–3？',
        table(['入场方式','队次','实际 0–3','原 ML 预期','补图后预期'],Object.entries(c.rows).map(([k,v])=>
          [entryName[k],v.n,v.actualZero,v.arms.original.expectedZero.toFixed(1),v.arms.candidate.expectedZero.toFixed(1)])),
        el('p','预期队数是赛前全败概率之和。每届八支晋级队都按上阶段赛果及三人核心核对。')));
    }
    panel.append(head,body);anchor.after(panel);drawRoute=draw;draw();
  }
  globalThis.Bo5History={mount,route};
})();
