/* Weight the existing BO1/BO3 prediction by the maps a pair is likely to veto. */
(() => {
  'use strict';
  const pairCache = new WeakMap();
  const allMaps = 127;
  const mapBit = Array.from({length:7}, (_, k) => 1 << k);
  const steps = {
    1: [[0,'ban'],[0,'ban'],[1,'ban'],[1,'ban'],[1,'ban'],[0,'ban']],
    3: [[0,'ban'],[1,'ban'],[0,'pick'],[1,'pick'],[1,'ban'],[0,'ban']],
  };
  const clamp = (x,limit) => Math.min(limit,Math.max(-limit,x));
  const sigmoid = x => 1/(1+Math.exp(-x));

  // Smooth each observed action / eligible-map opportunity towards the team's
  // pooled rate for that action. Unobserved teams act uniformly on remaining maps.
  function policy(row,pool,action) {
    const counts = pool.map(m => row?.[action]?.[m] || 0);
    const opportunities = pool.map(m => row?.[action+'Opportunities']?.[m] || 0);
    const total = counts.reduce((a,b)=>a+b,0);
    const opportunitiesTotal = opportunities.reduce((a,b)=>a+b,0);
    const prior = opportunitiesTotal && total ? total/opportunitiesTotal : 1/7;
    const weights = counts.map((c,k)=>(c+4*prior)/(opportunities[k]+4));
    const sums = new Float64Array(128);
    for (let mask=1; mask<=allMaps; mask++) {
      const bit = mask & -mask;
      sums[mask] = sums[mask-bit] + weights[31-Math.clz32(bit)];
    }
    return {weights,sums};
  }

  function vetoOutcomes(rows,pool,bo) {
    const policies = rows.map(row=>({ban:policy(row,pool,'ban'),pick:policy(row,pool,'pick')}));
    const masses = new Float64Array(128);
    function visit(step,remaining,picked,mass,first) {
      if (step===6) {
        masses[remaining|picked] += mass;
        return;
      }
      const [role,action] = steps[bo][step];
      const choice = policies[role ^ first][action];
      for (let options=remaining; options; options &= options-1) {
        const bit = options & -options;
        const k = 31-Math.clz32(bit);
        const nextPicked = action==='pick' ? picked|bit : picked;
        visit(step+1,remaining^bit,nextPicked,mass*choice.weights[k]/choice.sums[remaining],first);
      }
    }
    // A/B order is an unannounced choice by the higher seed before the stage.
    visit(0,allMaps,0,0.5,0);
    visit(0,allMaps,0,0.5,1);
    const outcomes = [];
    for (let mask=1; mask<=allMaps; mask++) {
      if (!masses[mask]) continue;
      const maps = [];
      for(let k=0;k<7;k++) if(mask & mapBit[k]) maps.push(k);
      outcomes.push({maps,mass:masses[mask]});
    }
    return outcomes;
  }

  function pairShape(event,i,j,bo) {
    const strength = event.mapStrength, veto = event.mapVeto;
    const pool = strength?.pool || [];
    const names = [event.teams[i].name,event.teams[j].name];
    const strengths = names.map(name=>strength?.teams?.[name]);
    const vetos = names.map(name=>veto?.teams?.[name]?.['bo'+bo]);
    const vetoN = vetos.map(x=>x?.n || 0);
    const strengthN = strengths.map(x=>x?.n || 0);
    const shape = {status:'invalid-pool',pool,vetoN,strengthN,sharedMaps:0};
    if (pool.length!==7 || new Set(pool).size!==7 || veto?.pool?.length!==7 ||
        new Set(veto.pool).size!==7 || pool.some(m=>!veto.pool.includes(m)) ||
        strength.asOf!==event.asOf || veto.asOf!==event.asOf) return shape;
    if (i===j) return {...shape,status:'same-team'};
    const offsets = pool.map(m=>{
      const [a,b] = strengths.map(team=>team?.maps?.[m]);
      if (!a?.n || !b?.n || !Number.isFinite(a.logitOffset) || !Number.isFinite(b.logitOffset)) return 0;
      shape.sharedMaps++;
      return clamp(a.logitOffset-b.logitOffset,0.7);
    });
    if (!vetoN.some(Boolean)) return {...shape,status:'no-veto'};
    if (!shape.sharedMaps) return {...shape,status:'no-strength'};
    const outcomes = vetoOutcomes(vetos,pool,bo);
    const selection = new Float64Array(7);
    for (const {maps,mass} of outcomes) for (const k of maps) selection[k]+=mass;
    return {...shape,status:vetoN.every(Boolean)?'both':'one',offsets,outcomes,selection};
  }

  function shapeFor(event,i,j,bo) {
    if (!pairCache.has(event)) pairCache.set(event,new Map());
    const cache = pairCache.get(event);
    const key = i+'-'+j+'-'+bo;
    if (!cache.has(key)) cache.set(key,pairShape(event,i,j,bo));
    return cache.get(key);
  }

  // Conditional on a planned triple, the series winner takes at least two maps.
  function aggregate(outcomes,win,uniform) {
    let sum=0;
    for (const {maps,mass} of outcomes) {
      const p=win[maps[0]], q=win[maps[1]], r=win[maps[2]];
      const series=maps.length===1 ? p : p*q + ((1-p)*q + p*(1-q))*r;
      sum+=series*(uniform ? 1/outcomes.length : mass);
    }
    return sum;
  }

  function anchoredMapWins(base,offsets,outcomes) {
    if (base===0 || base===1) return offsets.map(()=>base);
    let low=-44, high=44;
    for(let iter=0;iter<46;iter++) {
      const mid=(low+high)/2;
      const win=offsets.map(delta=>sigmoid(mid+delta));
      if(aggregate(outcomes,win,true)<base) low=mid;
      else high=mid;
    }
    return offsets.map(delta=>sigmoid((low+high)/2+delta));
  }

  function apply(event,i,j,bestOf,base) {
    if (![1,3].includes(bestOf)) throw new RangeError('地图模型支持 BO1 和 BO3');
    if (!Number.isFinite(base) || base<0 || base>1) throw new RangeError('基础胜率超出范围');
    const reverse=i>j;
    const shape=shapeFor(event,Math.min(i,j),Math.max(i,j),bestOf);
    const orient=values=>reverse ? [values[1],values[0]] : values.slice();
    const result={base,probability:base,status:shape.status,vetoN:orient(shape.vetoN),
      strengthN:orient(shape.strengthN),sharedMaps:shape.sharedMaps,maps:[]};
    if (!shape.outcomes) return result;
    const baseAB=reverse ? 1-base : base;
    const win=anchoredMapWins(baseAB,shape.offsets,shape.outcomes);
    const probability=aggregate(shape.outcomes,win,false);
    if (Math.abs(probability-baseAB)>1e-11) result.probability=Math.max(0,Math.min(1,reverse ? 1-probability : probability));
    result.maps=shape.pool.map((name,k)=>({name,selection:shape.selection[k],mapWin:reverse ? 1-win[k] : win[k]}));
    return result;
  }
  globalThis.PickMap={apply};
})();
