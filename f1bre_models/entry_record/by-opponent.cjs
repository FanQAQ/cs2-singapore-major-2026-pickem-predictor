'use strict';
const {events,prepare}=require('./lock.cjs');
const {truth}=require('../evaluate.cjs');
const {errors}=require('../score.cjs');
const {freeze}=require('../format_split/astana/lock.cjs');
const report={};
for(const e of events){
  const {f,teams,baseline,candidate}=prepare(e);
  const {matches}=truth(e.id,teams.map(t=>t.team));
  const groups={};
  for(const {bo,w,l} of matches){
    const count=Number(teams[w].bonus>0)+Number(teams[l].bonus>0);
    const id='BO'+bo+'-'+['invited','mixed','advanced'][count];
    const g=groups[id]??={baseline:[],candidate:[],qualifiedOutcomes:[]};
    g.baseline.push(baseline['bo'+bo][w][l]);
    g.candidate.push(candidate['bo'+bo][w][l]);
    if(count===1){
      const advanced=teams[w].bonus?w:l,other=advanced===w?l:w;
      g.qualifiedOutcomes.push({advanced:teams[advanced].team,other:teams[other].team,won:advanced===w,
        p:baseline['bo'+bo][advanced][other],adjustedP:candidate['bo'+bo][advanced][other]});
    }
  }
  report[e.id]=Object.fromEntries(Object.entries(groups).map(([id,g])=>[id,{baseline:errors(g.baseline),candidate:errors(g.candidate),
    ...(g.qualifiedOutcomes.length?{games:g.qualifiedOutcomes}:{})}]));
}
freeze('by-opponent.json',report,__dirname);
for(const [id,r] of Object.entries(report).filter(([id])=>id.endsWith('-3'))){
  const g=r['BO3-mixed'];
  console.log(id,g.games.filter(m=>m.won).length+'/'+g.games.length,g.games.reduce((s,m)=>s+m.p,0).toFixed(2),
    g.baseline.brier,g.candidate.brier,g.baseline.logLoss,g.candidate.logLoss);
}
