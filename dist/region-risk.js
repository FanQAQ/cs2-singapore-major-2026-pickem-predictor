/* Pre-event LAN evidence. Positive adjustments mean that the first side is favored. */
(() => {
  'use strict';
  const regions=new Set(['americas','asia','europe']);
  const normalize=roster=>Array.isArray(roster) ? roster.map(n=>String(n).normalize('NFKC').trim().toLowerCase()).sort().join('|') : '';
  function current(event, i) {
    const field=event?.regionRisk, team=event?.teams?.[i];
    if (!team || !field?.asOf || !event.asOf || field.asOf>event.asOf) return null;
    const row=field.teams?.[team.name];
    if (!row || row.roster?.length!==5 || team.roster?.length!==5 || normalize(row.roster)!==normalize(team.roster)) return null;
    return row;
  }
  const sigmoid=x=>1/(1+Math.exp(-x));
  function apply(event,i,j,p) {
    if (!Number.isFinite(p)||p<0||p>1) throw new RangeError('区域模型基础胜率超出范围');
    const left=current(event,i),right=current(event,j),field=event?.regionRisk;
    const out={probability:p,base:p,active:false,reason:'unknown-region',uncertainty:null,range:null,left,right,pairN:0,logitDelta:0};
    if (!left||!right||!regions.has(left.region)||!regions.has(right.region)) return out;
    if (left.region===right.region) return {...out,reason:'same-region'};
    const key=[left.region,right.region].sort().join('-');
    const pair=field.regionPairs?.[key];
    out.pairN=pair?.n||0;
    if (!pair || pair.n<10) return {...out,reason:'insufficient'};
    if (!field.validation?.passed) return {...out,reason:'validation'};
    const delta=Math.max(-.7,Math.min(.7,(left.region<right.region ? 1:-1)*pair.logit+left.shift-right.shift));
    const z=Math.log(p/(1-p));
    const se=Math.hypot(pair.se,left.uncertainty.scale,right.uncertainty.scale);
    return {...out,active:true,reason:'active',probability:sigmoid(z+delta),logitDelta:delta,uncertainty:se,
      range:[sigmoid(z+delta-se),sigmoid(z+delta+se)]};
  }
  function stateFor(event) {
    const state=event?.regionRisk?.sharedState;
    if (!state?.passed || !Number.isFinite(state.scale) || state.scale<=0 ||
        event.teams?.length!==16 || !event.teams.every((_,i)=>current(event,i))) return null;
    return {scales:event.teams.map(()=>state.scale)};
  }
  globalThis.PickRegion={apply,stateFor};
})();
