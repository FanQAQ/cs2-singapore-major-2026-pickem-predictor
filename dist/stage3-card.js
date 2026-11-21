/* Select ten stage slots using the frozen field and search-path counts. */
(() => {
  'use strict';
  const ids = Array.from({length:16}, (_,i)=>i);
  const methods = ['current','pass','expected','tail','rating','advance','historical'];
  function ranks(points) {
    const sorted = points.filter(Number.isFinite).sort((a,b)=>a-b);
    const mid = Math.floor(sorted.length/2);
    const neutral = sorted.length ? (sorted[mid]+sorted[Math.floor((sorted.length-1)/2)])/2 : 0;
    const value = i=>Number.isFinite(points[i]) ? points[i] : neutral;
    return ids.slice().sort((a,b)=>value(b)-value(a)||a-b);
  }
  function slots(order) {
    const card=Array(16).fill(3);
    order.forEach((i,n)=>{ if(n<8) card[i]=n<2 ? 0 : 1; else if(n>=14) card[i]=2; });
    return card;
  }
  // Nine prior units for live simulated frequencies; ranks within each eight-team entry route.
  function groupRanks(points) {
    const ordered = ranks(points);
    const rank = Array(16);
    for (const direct of [true,false])
      ordered.filter(i=>(i<8)===direct).forEach((team,r)=>{rank[team]=r;});
    return rank;
  }
  function prior(points, history) {
    const rank = groupRanks(points);
    const prior = ids.map(()=>[0,0,0,0]);
    for(const past of history) {
      const oldRanks = groupRanks(past.points);
      for(const i of ids) for(const j of ids) {
        if ((i<8)!==(j<8)) continue;
        const weight = Math.max(0, 3-Math.abs(rank[i]-oldRanks[j]));
        prior[i][past.actual[j]] += weight;
      }
    }
    return prior;
  }
  // Dynamic programming over exactly 2/6/2 slots. A fourth state leaves a team unpicked.
  function optimal(counts) {
    let states=new Map([[0,{score:0,card:[]}]]);
    for(const row of counts) {
      const next=new Map();
      for(const [key,s] of states) {
        const used=[key%3,Math.floor(key/3)%7,Math.floor(key/21)];
        for(const c of [0,1,2,3]) {
          if (c<3 && used[c]>=[2,6,2][c]) continue;
          const k=key+[1,3,21,0][c], score=s.score+(c<3?row[c]:0);
          if (!next.has(k) || score>next.get(k).score) next.set(k,{score,card:[...s.card,c]});
        }
      }
      states=next;
    }
    return states.get(62).card;
  }
  function card(method,sim,points,pastPrior) {
    const counts=sim.searchCounts;
    if(method==='current') return sim.card;
    if(method==='pass') return sim.basePassCard;
    if(method==='expected') return sim.expectedCard;
    if(method==='rating') return slots(ranks(points));
    if(method==='advance') return slots(ids.slice().sort((a,b)=>
      (counts[b][0]+counts[b][1])-(counts[a][0]+counts[a][1])||a-b));
    if(method==='tail') {
      const output=sim.card.map(k=>k<2?k:3);
      const lost=ids.filter(i=>output[i]===3).sort((a,b)=>counts[b][2]-counts[a][2]||b-a).slice(0,2);
      lost.forEach(i=>{output[i]=2;});
      return output;
    }
    if(method==='historical') {
      if (!pastPrior) return sim.expectedCard;
      const estimate=counts.map((row,i)=>{
        const old=pastPrior[i], total=old.reduce((a,b)=>a+b,9);
        return row.map((n,c)=>(9*n/sim.searchN+old[c])/total);
      });
      return optimal(estimate);
    }
    throw Error('Unknown allocation method '+method);
  }
  function apply(sim, flags, event, profile=event.stage3AllocationProfile) {
    if (!flags.stage3Allocation || event.stage !== 3 || flags.family !== 'v4' ||
        !flags.seedConditionalCard || flags.robustCard || sim.path.lockedCount) return sim;
    if (!profile || profile.id !== event.id || !profile.earlier.length || profile.cutoff >= event.date.slice(0,10) ||
        profile.teams.length !== event.teams.length ||
        profile.teams.some((name,i)=>name!==event.teams[i].name)) throw Error('缺少本届赛前分组填卡的训练资料');
    const choice=card('historical',sim,event.teams.map(t=>t.points),profile.prior);
    return {...sim,...sim.score(choice),card:choice,passCard:choice,cardPolicy:'stage3Allocation'};
  }
  globalThis.PickFinalCard = {methods,card,prior,apply,optimal};
})();
