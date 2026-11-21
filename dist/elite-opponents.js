(() => {
  'use strict';
  const {el,table,select,fold,pct,fixed,source}=F1breStudy.widgets;
  const titles={'cluj-2025':'克卢日 2025 · 外部检验','austin-2025-3':'奥斯汀 · Stage 3','budapest-2025-3':'布达佩斯 · Stage 3','cologne-2026-3':'科隆 · Stage 3'};
  const choice={id:'cluj-2025',team:null,opponent:null};
  function pairStudy(fields,rmr){
    const rows=fields.map(f=>[titles[f.id]??'FISSURE Playground 2',f.n,
      f.oldBrier.toFixed(4)+' → '+f.newBrier.toFixed(4),f.oldHits+' → '+f.newHits,
      f.passes.better+' / '+f.passes.same+' / '+f.passes.worse]);
    const panel=fold('旧首发的比赛应该打多少折？',
      el('p','比较同一套地图 ML。原模型允许三人核心继承。新方法按保留的两人搭档给旧图加权，保留三人、四人、五人时分别计 30%、60%、100%。单场 Brier 越低越好。'),
      table(['赛事','BO3 场数','Brier 原 → 新','十格命中 原 → 新','30 组种子过关 增 / 平 / 减'],rows),
      el('p','FISSURE 是事先留出的赛事。33 场里有 21 场提高了实际赢家的胜率，但两张卡都只中四格。三届 Major Stage 3 中，科隆的主种子少中一格普通晋级。'),
      source('FISSURE 赛制与赛事记录','https://fissure.pro/events/fpg2-cs'));
    panel.id='lineup-study';
    panel.open=location.hash==='#verify/elite/lineups';
    const metrics=[['BO1 · 交卡时',rmr.draw],['BO1 · 已知实打地图',rmr.actualMap],['BO3 · 交卡时',rmr.bo3]];
    const scores=table(['对照','场数','Brier 原 → 新','对数损失 原 → 新'],metrics.map(([label,m])=>
      [label,m.n,...['brier','logLoss'].map(k=>fixed(m.baseline[k])+' → '+fixed(m.candidate[k]))]));
    const matchTable=table(['轮次与对阵','地图','实际赢家','原胜率','降权后'],rmr.matches.map(g=>
      ['R'+g.round+' '+g.teams.join(' / '),g.map,g.winner,pct(g.baseline),pct(g.candidate)]));
    matchTable.querySelectorAll('tbody th').forEach((th,i)=>th.replaceChildren(source(th.textContent,rmr.matches[i].source)));
    const holdout=fold('上海欧洲 RMR B · 20 场 BO1',
      el('p','交卡时按可能遇到的地图加权。知道实打地图的那一行用于赛后复盘。误差越低越好。'),
      scores,el('p',rmr.passed?'两项 BO1 误差均下降，进入整卡对照。':'两项 BO1 误差均上升。20 场中只有 '+rmr.matches.filter(g=>g.candidate>g.baseline).length+' 场提高了实际赢家的胜率，进一步降权未进入整卡试验。'),
      fold('逐场看实际赢家及赛前胜率',matchTable));
    holdout.id='rmr-bo1-study';
    panel.querySelector(':scope > .detail-body').append(holdout);
    return panel;
  }
  function singaporeCoverage(sg){
    const detail=el('div'),names=Object.fromEntries(sg.rows.map(([n])=>[n,n])),initial='Chinggis Warriors';
    function draw(name){
      const e=sg.extra[name],c=sg.rows.find(r=>r[0]===name);
      detail.replaceChildren(el('p',name+' 在原 BO3 表中有 '+c[3]+' 场完整五人比赛。Griffin 档案核实 '+e.griffin+' 场，扣除已有或存疑的记录后可新增 '+e.added+' 场，两档合计 '+e.combined+' 场。'));
      if(e.uncertain)detail.append(el('p','另有 '+e.uncertain+' 场存在跨源匹配疑点，单独保留。'));
      if(e.witness){const p=el('p','另有公开记分板确认该队五人曾共同出场。 ');p.append(source(e.witness.day+' 对 '+e.witness.opponent,e.witness.source));detail.append(p);}
      if(e.announcement){const p=el('p','9z 在 11 月 7 日宣布 history 替换 meyern，截至本次资料截止日，尚未查到这五人共同参赛的公开系列。 ');p.append(source('赛前换人公告',e.announcement));detail.append(p);}
      if(e.cases.length){
        const list=el('ul'),labels={new:'新增',overlap:'已收录',uncertain:'待核'};
        for(const g of e.cases){const li=el('li');li.append(source(g.day+' · '+name+' '+g.score.join('–')+' '+g.opponent,g.source),' · '+labels[g.kind]);list.append(li);}
        detail.append(fold('查看 Griffin 逐场记录',list));
      }
    }
    const picker=select('elite-sg-team','查看新加坡参赛队',names,initial,draw);
    draw(initial);
    const box=fold('新加坡 16 队有多少同阵容 BO3？',el('p','取 '+sg.cutoff+' 前的 180 天，按与新加坡首发重合的人数统计。补查的比赛用于核对资料覆盖；封存卡仍按原来的胜率评分。'),
      el('p','16 队合并去重，原表有 '+sg.totals.baseline+' 场同五人 BO3。Griffin 补到 '+sg.totals.new+' 场，共 '+sg.totals.combined+' 场。另有 '+sg.totals.uncertain+' 场比分待核。'),
      picker,detail,table(['原研究表','3 人相同','4 人相同','5 人相同'],sg.rows));
    box.id='elite-singapore';
    box.open=location.hash==='#verify/elite/singapore';
    return box;
  }
  function rosterAudit(audit,selectedStage){
    const cities={copenhagen:'哥本哈根',shanghai:'上海',austin:'奥斯汀',budapest:'布达佩斯',cologne:'科隆'};
    const options=Object.fromEntries(Object.keys(audit.stages).map(id=>{
      const parts=id.split('-');return [id,cities[parts[0]]+' · Stage '+(parts[2]||1)];
    }));
    let id=Object.hasOwn(options,selectedStage)?selectedStage:'cologne-2026-3';
    const controls=el('div'),picker=el('div'),details=el('div'),c=audit.counts;
    controls.className='bo5-filters';
    const renderTeam=t=>{
      details.replaceChildren(table(['名单','五名选手'],[['模型输入',t.predicted.join(' · ')],['首轮实打',t.actual.join(' · ')],
        [audit.stages[id].asOf+' 实力榜',t.vrs.join(' · ')]]),
        el('p','首轮对 '+t.opponent+' 的 '+t.maps.length+' 张实打图已逐图核对。积分榜名单与实际首发重合 '+t.overlap+'/5。'),source('查看首轮比赛',t.source));
    };
    function selectStage(){
      const ts=audit.stages[id].teams;
      const first=ts.find(t=>t.overlap<5)??ts[0];
      picker.replaceChildren(select('elite-roster-team','队伍',Object.fromEntries(ts.map(t=>[t.name,t.name])),first.name,v=>renderTeam(ts.find(t=>t.name===v))));
      renderTeam(first);
    }
    controls.append(select('elite-roster-stage','Major 阶段',options,id,v=>{id=v;selectStage();}),picker);selectStage();
    return fold('核对五届 Major 的实际首发',el('p','13 个阶段共 '+c.teamAppearances+' 队次，模型名单与首轮逐图实打五人一致的有 '+c.exactTeams+' 队次。若直接使用模型当时采用的积分榜五人，有 '+c.vrsFiveDiffers+' 队次会出现差异。'),controls,details);
  }
  function mount(anchor,study){
    if(!anchor||!study)return;
    const panel=el('section'),head=el('div'),body=el('div'),controls=el('div'),result=el('div');
    panel.id='context-elite';panel.className='panel wide audit-section';
    head.className='panel-head';head.append(el('h2','打前八的战绩，能改善 BO3 胜率吗？'));
    body.className='panel-body';controls.className='bo5-filters';
    const summary=study.fields['cluj-2025'];
    body.append(el('p',summary.passed?'首次外部检验通过了两项单场误差门槛，整卡成绩见下表。':'在首次外部检验中，这项调整未通过预设的单场误差门槛。首页推荐继续用原胜率。'),
      select('elite-field','赛事与阶段',titles,choice.id,id=>{Object.assign(choice,{id,team:null,opponent:null});draw();}),controls,result);
    function draw(){
      const f=study.fields[choice.id],names=f.names,options=Object.fromEntries(names.map(n=>[n,n]));
      choice.team=names.includes(choice.team)?choice.team:(choice.id==='cluj-2025'?'MOUZ':'FURIA');
      const a=names.indexOf(choice.team),opps=Object.fromEntries(names.filter(n=>n!==choice.team).map(n=>[n,n]));
      const defaultOpponent=choice.id==='cluj-2025'&&choice.team==='MOUZ'?'FaZe':names.find((n,i)=>i!==a && f.teams[i].rank && f.teams[i].rank<=8);
      choice.opponent=Object.hasOwn(opps,choice.opponent)?choice.opponent:(defaultOpponent??Object.keys(opps)[0]);
      const b=names.indexOf(choice.opponent),t=f.teams[a],pair=f.pairs.find(r=>r.a===Math.min(a,b)&&r.b===Math.max(a,b));
      controls.replaceChildren(
        select('elite-team','查看队伍',options,choice.team,v=>{choice.team=v;draw();document.getElementById('elite-team').focus({preventScroll:true});}),
        select('elite-opponent','对阵谁',opps,choice.opponent,v=>{choice.opponent=v;draw();document.getElementById('elite-opponent').focus({preventScroll:true});}));
      const stats=el('dl');stats.className='bo5-stats';
      const stat=(label,value)=>{const box=el('div');box.append(el('dt',label),el('dd',value));stats.append(box);};
      const prob=p=>pct(a===pair.a?p:1-p);
      stat('对当时的前八',t.elite.wins+' 胜 '+(t.elite.n-t.elite.wins)+' 负');
      stat('对其他队',t.other.wins+' 胜 '+(t.other.n-t.other.wins)+' 负');
      stat('原模型 BO3 胜率',prob(pair.bo3));stat('调整后 BO3 胜率',prob(pair.adjusted));
      const rank=t.rank?'排名第 '+t.rank+'。':'没有匹配到三人核心。';
      const peer=f.teams[b];
      const explanation=pair.eligible?(pair.triggered?'此对阵的胜率有调整。':'双方调整抵消或为零。'):
        !((t.rank && t.rank<=8)||(peer.rank && peer.rank<=8))?'双方在本阶段赛前都排在前八之外。':
        '面对前八的一方缺少足够的同核心交手。';
      result.replaceChildren(stats,el('p',choice.team+' 在 '+f.rankDay+' 全球榜'+rank+'表中胜率属于 '+choice.team+' 对 '+choice.opponent+'。'+explanation));
      if(!t.overlap.elite[2] && t.elite.n)result.append(el('p','这 '+t.elite.n+' 场对前八的比赛中，没有一场由本阶段相同的五人出场。'));
      const played=f.matches.find(g=>Math.min(g.a,g.b)===pair.a && Math.max(g.a,g.b)===pair.b);
      if(played){
        const maps=played.a===a?played.score:[...played.score].reverse();
        const game=el('p','实际第 '+played.round+' 轮是 BO'+played.bo+'，'+choice.team+' '+maps.join('–')+' '+choice.opponent+'。 ');
        game.append(source('查看比赛',played.source));result.append(game);
      }
      const rateRow=(label,s)=>[label,s.n,fixed(s.original.brier)+' → '+fixed(s.candidate.brier),fixed(s.original.logLoss)+' → '+fixed(s.candidate.logLoss)];
      result.append(el('h3','实际 BO3 的预测误差（原模型 → 调整后）'),table(['范围','场数','Brier','对数损失'],[
        rateRow('所有 BO3',f.metrics.bo3),rateRow('至少一边适用',f.metrics.eligible)]),
        el('p','两种误差均越低越好。'+(choice.id==='cluj-2025'?'该届含 '+f.metrics.bo3.n+' 场 BO3，赛果在本次回溯预测锁定后单独评分。':'本届是开发样本。BO1 沿用原胜率，表中仅计 BO3。')));
      if(f.card)result.append(table(['相同填法','原 ML','调整后'],f.card));
      if(f.seedDirection){const d=f.seedDirection;result.append(el('p','同一批种子中过关增加 '+d.better+' 组、持平 '+d.same+' 组、减少 '+d.worse+' 组。'));}
      const games=f.matches.filter(g=>g.a===a||g.b===a);
      const rows=games.map(g=>{
        const first=g.a===a;
        return [String(g.round),names[first?g.b:g.a],first?g.score.join('–'):[...g.score].reverse().join('–'),
          'BO'+g.bo,pct(first?g.original:1-g.original),pct(first?g.candidate:1-g.candidate)];
      });
      const links=el('p');games.forEach((g,i)=>{if(i)links.append(' · ');links.append(source('第 '+g.round+' 轮',g.source));});
      result.append(fold('查看 '+choice.team+' 的实际对阵',table(['轮次','对手','比分','赛制','原胜率','调整后'],rows),links),
        fold('这项调整怎样计算？',el('p','取开赛前 180 天、保留至少三名首发的实打 BO3。每场按比赛当时的全球排名划分对手，分别比较实际胜场与积分预期。两组各至少三场才计算，修正只应用于下一场遇到前八的队伍。'),
          table(['历史阵容重合人数','3/5','4/5','5/5'],[['对前八场数',...t.overlap.elite],['对其他队场数',...t.overlap.other]]),
          el('p',choice.team+' 对前八预期胜 '+t.elite.expected.toFixed(1)+' 场，对其他队预期胜 '+t.other.expected.toFixed(1)+' 场。'+(t.eligible?'两组收缩后的超预期胜率相差 '+(100*t.difference).toFixed(1)+' 个百分点。':'至少一组少于三场，此队的修正取零。')),
          source('查看本阶段的 Valve 排名',f.rankUrl)));
      if(choice.id==='cluj-2025')result.append(fold('核对 Imperial Valkyries 的首发',
        el('p','前一站临时代打的教练 bubble 在克卢日回到教练席。2 月 12 日的赛事指南列出 tory 首发。评分使用更正后的阵容，涉及 Imperial 的 15 个潜在对阵中有 13 个 BO3 胜率发生变化，最大差异为 11.95 个百分点。'),
        source('查看赛前参赛名单',study.guideUrl)));
      result.append(rosterAudit(study.audit,choice.id));
      result.append(pairStudy(study.lineupStudy,study.rmrStudy));
      result.append(singaporeCoverage(study.singapore));
    }
    panel.append(head,body);anchor.after(panel);draw();
  }
  globalThis.EliteOpponents={mount};
})();
