/* Major form is estimated once, before an edition, for its announced starting fives. */
(() => {
  'use strict';
  const names = roster => roster.map(n=>n.normalize('NFKC').trim().toLowerCase()).sort().join('|');
  function team(event, i) {
    const side = event.teams?.[i], historical = event.majorForm?.teams?.[side?.name];
    if (side?.roster?.length!==5 || historical?.roster?.length!==5 ||
        names(side.roster)!==names(historical.roster)) return null;
    return historical;
  }
  function apply(event,i,j,p,options={}) {
    if (!Number.isFinite(p) || p<0 || p>1) throw new RangeError('基础胜率超出范围');
    const m = event.majorForm, left = team(event,i), right = team(event,j);
    const result = {base:p,probability:p,candidateProbability:p,active:false,
      reason:'lineup',logitDelta:0,candidateLogitDelta:0,left,right};
    if (!m || !event.asOf || m.asOf>event.asOf || (m.latest && m.latest>=m.asOf))
      return {...result,reason:'cutoff'};
    if (!left || !right) return result;
    if (!left.repeat && !right.repeat) return {...result,reason:'insufficient'};
    const delta=left.logit-right.logit;
    const candidate = !delta || p===0 || p===1 ? p : 1/(1+Math.exp(-(Math.log(p/(1-p))+delta)));
    const accepted = m.validation.passed || options.shadow===true;
    return {...result,candidateProbability:candidate,candidateLogitDelta:delta,
      probability:accepted?candidate:p,active:accepted,reason:accepted?'active':'validation',logitDelta:accepted?delta:0};
  }
  globalThis.PickMajorForm={apply};
})();
