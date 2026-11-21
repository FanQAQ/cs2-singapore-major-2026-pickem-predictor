/* Regional VRS depth complements a team's own rating on eligible cross-region matches. */
(() => {
  'use strict';
  const normalize = roster => roster.map(p=>p.normalize('NFKC').trim().toLowerCase()).sort().join('|');
  function side(event, index, model) {
    const team = event.teams?.[index];
    const row = team && model?.teams?.[team.name];
    if (team?.roster?.length !== 5 || row?.roster?.length !== 5 ||
        normalize(team.roster) !== normalize(row.roster)) return null;
    return row;
  }

  function apply(event, i, j, p, lanActive=false) {
    if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError('基础胜率超出范围');
    const model = event.regionVrsModel;
    const variant = lanActive ? 'withLan' : 'solo';
    const left = side(event,i,model), right = side(event,j,model);
    const delta = Number.isFinite(left?.depth) && Number.isFinite(right?.depth) ? left.depth-right.depth : null;
    const base = {probability:p,base:p,active:false,reason:'unknown-region',left,right,variant,
      logitDelta:0,coefficient:0,depthDiff:delta};
    if (!model || !event.asOf || model.asOf > event.asOf || !left?.region || !right?.region) return base;
    if (left.region===right.region) return {...base,reason:'same-region'};
    if (!model.officialGlobal) return {...base,reason:'no-global'};
    const parameters = model.variants[variant];
    if (!Number.isFinite(delta) || !parameters) return {...base,reason:'insufficient'};
    if (!parameters.validation.passed) return {...base,reason:'validation'};
    const gap = Math.max(-model.maxGap,Math.min(model.maxGap,delta/model.unitPoints));
    const logitDelta = gap*parameters.coefficient;
    const probability = logitDelta===0 || p===0 || p===1 ? p : 1/(1+Math.exp(-Math.log(p/(1-p))-logitDelta));
    return {...base,probability,active:true,reason:'active',coefficient:parameters.coefficient,logitDelta};
  }
  globalThis.PickRegionVrs={apply};
})();
