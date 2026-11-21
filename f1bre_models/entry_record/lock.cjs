'use strict';
const assert=require('node:assert/strict');
const {getField,matrices}=require('../evaluate.cjs');
const {fieldFor,roster,adjust}=require('../../stage_transfer/evaluate.cjs');
const {samples}=require('../../ml_allocation/draw.cjs');
const {seeds}=require('../../strategy_v4_eval/settings.cjs');
const {freeze,digest}=require('../format_split/astana/lock.cjs');
const events=PickLab.allEvents.filter(e=>e.stage===2 || e.stage===3);
assert.equal(events.length,8);
function prepare(e){
  const previous=PickLab.allEvents.find(p=>(p.parent||p.id)===e.parent && (p.stage||1)===e.stage-1);
  assert(previous);
  const prior=fieldFor(previous),f=getField(e.id);
  assert(prior.end<f.start && prior.parent===e.parent);
  const teams=f.teams.map(t=>{
    const five=roster(t.roster);
    const matches=prior.records.flatMap(r=>[true,false].flatMap(isA=>{
      const shared=(isA?r.aFive:r.bFive).filter(v=>five.includes(v)).length;
      return shared>=3?[{id:r.id,side:isA?r.a:r.b,win:Number(!!r.y===isA),shared}]:[];
    }));
    const oldTeams=[...new Set(matches.map(g=>g.side))];
    assert(oldTeams.length<=1);
    const wins=matches.reduce((sum,g)=>sum+g.win,0),losses=matches.length-wins;
    const complete=matches.length>0 && matches.length===prior.records.filter(g=>g.a===oldTeams[0] || g.b===oldTeams[0]).length;
    const bonus=complete && wins===3?[70,38,18][losses]:0;
    assert(Number.isInteger(bonus));
    return {team:t.name,priorTeam:prior.teams[oldTeams[0]]?.name??null,wins,losses,complete,bonus,matches};
  });
  const {baseline}=matrices(f,['baseline']);
  const candidate=adjust(baseline,teams.map(t=>t.bonus*Math.LN10/400));
  return {prior,f,teams,baseline,candidate};
}
if(require.main===module){
  const full=process.argv.includes('--full'),n=full?12000:2000,out={};
  for(const e of events){
    const {prior,f,teams,baseline,candidate}=prepare(e);
    const rows=(full?seeds:seeds.slice(0,3)).map(seed=>{
      const card=m=>CS.cardsFromSamples(samples(f,m,n,seed,'major'),true).card;
      return {seed,baseline:card(baseline),candidate:card(candidate)};
    });
    out[e.id]={start:f.start,previous:prior.id,priorEnd:prior.end,teams,n,odds:digest([baseline,candidate]),rows};
  }
  freeze(full?'full-cards.json':'cards.json',out,__dirname);
}
module.exports={events,prepare};
