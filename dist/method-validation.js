(() => {
  'use strict';
  const variants = {
    base:'两项均关闭', lan:'仅近期线下赛', pick:'仅 BO3 自选图', both:'两项均开启'
  };
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function render(host, event, family) {
    if (!host) return;
    host.replaceChildren();
    const report = event?.featureRelease;
    if (!report) return;
    const method = family === 'boost' ? 'tree' : 'recommended';
    const label = method === 'tree' ? '决策树' : '推荐模型';
    const totals = report.totals[method], forward = report.forward[method], count = report.stageCount;
    const heading = element('div', undefined, 'panel-head');
    heading.append(element('h2','哪些新特征值得默认开启？'));
    const body = element('div', undefined, 'panel-body');
    const selected = report.selected[method];
    body.append(element('p',label+'对近期线下赛表现和 BO3 自选图兑现率的选择为「'+variants[selected]+'」。每届只根据更早的比赛决定默认设置，同时考察单场胜率、整卡得分和更换模拟随机数后的过关表现。'),
      element('p','本项特征实验固定使用原过关率优先填法。逐届回放共命中 '+forward.card.hits+'/50 格，'+forward.card.passes+'/5 届达到五格，0–3 命中 '+forward.card.bucketHits[2]+'/10。'));
    const details = element('details', undefined,'team-map-samples');
    details.append(element('summary','比较四种固定特征组合'));
    const wrap = element('div', undefined,'table-wrap'), table=element('table',undefined,'result-table');
    const head=table.createTHead().insertRow();
    for(const title of ['固定设置','胜方命中','BO3 概率误差 ↓','十格命中','过关届数','0–3 命中']) {
      const th=element('th',title); th.scope='col'; head.append(th);
    }
    const tbody=table.createTBody();
    for(const [key,title] of Object.entries(variants)) {
      const row=tbody.insertRow(), data=totals[key], name=element('th',title);
      name.scope='row'; row.append(name);
      for(const value of [data.all.correct+'/'+data.all.n,data.bo3.brier.toFixed(5),data.card.hits+'/'+(10*count),
        data.card.passes+'/'+count,data.card.bucketHits[2]+'/'+(2*count)]) row.append(element('td',value));
    }
    wrap.append(table); details.append(wrap);
    details.append(element('p','每行始终采用同一组合。以固定种子的十格卡对照真实赛果，另用 '+report.seeds.length+' 组随机数检验选卡波动。BO3 概率误差采用 Brier 分数，越低越好。','helper'));
    body.append(details); host.append(heading,body);
  }
  globalThis.PickMethodValidation = {render};
})();
