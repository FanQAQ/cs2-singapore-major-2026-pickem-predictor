/* Browser and worker adapter for the locally reproduced pre-event Elo and map models. */
(() => {
  'use strict';
  const data = /*__RESEARCH_FIELDS__*/null;
  const models = ['elo','ml','hybrid','fourWay'];
  const has = family => models.includes(family);
  const matricesByFamily = new Map();
  function describe(event, family) {
    const f=data.fields[event.id];
    if (!f || !has(family)) return '';
    const elo='Elo 以 Valve 积分和可核实的选手 Rating 初始化，再按同一核心的胜负、赛制与地图分差回放此前 180 天的比赛（收录 '+f.series+' 场）。';
    const ml='地图 ML 根据赛前一年内的地图胜负、回合表现、对手强度和选手个人数据训练 XGBoost；使用 '+f.train+' 张地图训练、'+f.cal+' 张较晚的地图校准。';
    const blend='组合模型在每组 BO1、BO3 对阵中，各取 Elo 与地图 ML 胜率的一半。Elo 回放此前 180 天的 '+f.series+' 场比赛；地图 ML 使用 Valve 积分、地图和选手表现，训练 '+f.train+' 张地图、另用 '+f.cal+' 张校准。';
    const fourWay='推荐模型、决策树、阵容 Elo 和地图 XGBoost 分别估算 BO1 与 BO3，四套胜率各占 25%。数据包括 Valve 积分、系列赛胜负、地图回合与选手表现。';
    return ({elo,ml,hybrid:blend,fourWay})[family]+'资料只取 '+f.cutoff+' 之前可获得的记录，队伍战绩至少保留三名同一首发。';
  }
  function matrices(event,family) {
    const current=data.current;
    if (event.id!==current.id || event.teams.some((t,i)=>t.name!==current.teams[i]) || event.teams.length!==16)
      throw Error('此阶段尚无与参赛阵容一致的封存胜率。');
    if (!has(family)) throw Error('未知研究模型。');
    if (family==='fourWay') return current.fourWayMatrix;
    if (matricesByFamily.has(family)) return matricesByFamily.get(family);
    const result={allBo3:!!event.allBo3};
    for(const [format,k] of [['bo1',0],['bo3',1]]) {
      const rows=Array.from({length:16},()=>Array(16).fill(.5));
      let pair=0;
      for(let i=0;i<16;i++)for(let j=i+1;j<16;j++,pair++) {
        const values=current.pairs[pair], e=values[k], m=values[k+2];
        const reverseMl=Number((1-m).toFixed(10));
        rows[i][j]=family==='elo'?e:family==='ml'?m:(e+m)/2;
        rows[j][i]=family==='elo'?1-e:family==='ml'?reverseMl:((1-e)+reverseMl)/2;
      }
      result[format]=rows;
    }
    matricesByFamily.set(family,result);
    return result;
  }
  function scores(event,settings) {
    const values=data.fields[event.id]?.scores?.[settings.family];
    if(!values) throw Error('当前模型缺少此阶段的赛前回测记录。');
    const key=settings.robustCard ? 'robust' : settings.seedConditionalCard ? 'conditional' : 'pass';
    return {model:values[key],expected:values.expected,seed:values.seed};
  }
  globalThis.PickResearchModels={has,describe,matrices,scores};
})();
