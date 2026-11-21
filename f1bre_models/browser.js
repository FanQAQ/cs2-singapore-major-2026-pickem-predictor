/* Browser and worker adapter for the locally reproduced pre-event Elo and map models. */
(() => {
  'use strict';
  const data = /*__RESEARCH_FIELDS__*/null;
  const models = ['elo','ml'];
  const has = family => models.includes(family);
  const matricesByFamily = new Map();
  function describe(event, family) {
    const f=data.fields[event.id];
    if (!f || !has(family)) return '';
    const elo='Elo 以 Valve 积分和可核实的选手 Rating 初始化，再按同一核心的胜负、赛制与地图分差回放此前 180 天的比赛（收录 '+f.series+' 场）。';
    const ml='地图 ML 根据赛前一年内的地图胜负、回合表现、对手强度和选手个人数据训练 XGBoost；使用 '+f.train+' 张地图训练、'+f.cal+' 张较晚的地图校准。';
    return ({elo,ml})[family]+'资料只取 '+f.cutoff+' 之前可获得的记录，队伍战绩至少保留三名同一首发。';
  }
  function matrices(event,family) {
    const current=data.current;
    if (event.id!==current.id || event.teams.some((t,i)=>t.name!==current.teams[i]) || event.teams.length!==16)
      throw Error('此阶段尚无与参赛阵容一致的封存胜率。');
    if (!has(family)) throw Error('未知研究模型。');
    if (matricesByFamily.has(family)) return matricesByFamily.get(family);
    const result={allBo3:!!event.allBo3};
    for(const [format,k] of [['bo1',0],['bo3',1]]) {
      const rows=Array.from({length:16},()=>Array(16).fill(.5));
      let pair=0;
      for(let i=0;i<16;i++)for(let j=i+1;j<16;j++,pair++) {
        const values=current.pairs[pair], e=values[k], m=values[k+2];
        const reverseMl=Number((1-m).toFixed(10));
        rows[i][j]=family==='elo'?e:m;
        rows[j][i]=family==='elo'?1-e:reverseMl;
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
