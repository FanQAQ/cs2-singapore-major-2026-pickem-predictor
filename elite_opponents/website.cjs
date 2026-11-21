'use strict';
const assert=require('node:assert/strict');
const {verify}=require('./lock.cjs');
function projection(){
  const frozen=verify(),scores=require('./scores.json'),profiles=require('./profiles.json'),lineups=require('./lineup_probe.json');
  assert.deepEqual(lineups.coreOrder,[3,4,5]);
  assert.equal(scores.lockSha256,frozen.sha256);
  const fields={};
  for(const [id,r] of Object.entries(scores.fields)){
    const f=frozen.forecast.fields[id],p=profiles[id];
    assert.deepEqual(f.teams,r.teams);
    const pairs=f.pairs.map(({a,b,bo3,adjusted,eligible,triggered})=>({a,b,bo3,adjusted,eligible,triggered}));
    const matches=r.matches.map(({round,a,b,bo,score,source,original,candidate})=>{
      assert(/^https:\/\//.test(source) && score.length===2);
      return {round,a,b,bo,score,source,original,candidate};
    });
    const teams=f.teams.map(n=>{
      const {lockRank:rank,elite,other,difference,eligible}=p.teams[n];
      const overlap=lineups.fields[id].teams[n];
      assert.equal(overlap.elite.reduce((sum,v)=>sum+v,0),elite.n);
      assert.equal(overlap.other.reduce((sum,v)=>sum+v,0),other.n);
      return {rank,elite,other,difference,eligible,overlap:{elite:overlap.elite,other:overlap.other}};
    });
    const sim=r.simulation,card=sim?[
      ['实际命中',...['original','candidate'].map(k=>sim.arms[k].main.hits+'/10')],
      ['16 队 3–0 Brier',...['original','candidate'].map(k=>sim.arms[k].main.perfectBrier.toFixed(4))],
      ['16 队 0–3 Brier',...['original','candidate'].map(k=>sim.arms[k].main.zeroBrier.toFixed(4))]]:null;
    fields[id]={names:f.teams,teams,pairs,matches,metrics:r.metrics,passed:r.gate.passed,card,rankDay:p.rankDay,rankUrl:p.source};
    if(sim)fields[id].seedDirection=sim.passDirection;
  }
  const audit=require('./roster-audit.json'),stages={};
  for(const [id,f] of Object.entries(audit.fields)){
    const teams=f.teams.map(t=>({name:t.team,predicted:t.predicted,actual:t.actualOpening,vrs:t.vrsRoster,overlap:t.vrsMinOverlap,
      match:t.matchOnAllMaps,opponent:t.opponent,maps:t.maps,source:f.sources[t.matchId]}));
    assert(teams.length===16 && teams.every(t=>t.maps.length && t.source));
    stages[id]={asOf:f.strengthSnapshot,teams};
  }
  const sg=lineups.fields.singapore,archive=require('../bo5_history/singapore-forecast.json').forecast;
  assert.equal(sg.cutoffExclusive,archive.cutoffExclusive);
  const names=archive.teams.map(t=>t.name);
  assert.deepEqual(names,Object.keys(sg.teams));
  const coverage=require('./sg-coverage.json');
  const byName=new Map(coverage.teams.map(t=>[t.name,t]));
  assert.equal(coverage.cutoffExclusive,sg.cutoffExclusive);
  const singapore={cutoff:sg.cutoffExclusive,totals:coverage.totals,rows:names.map(n=>{
    const t=sg.teams[n];return [n,...t.elite.map((v,i)=>v+t.other[i])];
  }),extra:{}};
  for(const [name,,,baseline] of singapore.rows){
    const t=byName.get(name),profile=sg.teams[name];
    assert.equal(t.baseline,baseline);assert.equal(t.combined,t.baseline+t.new);
    const cases=t.cases.map(g=>{
      const game=coverage.series[g.seriesId],opponent=game.teams.indexOf(g.opponent);
      assert(opponent>=0 && game.teams[0]!==game.teams[1]);
      return {day:g.day,opponent:g.opponent,source:g.source,kind:g.classification,
        score:[game.score[1-opponent],game.score[opponent]]};
    });
    assert(cases.every(g=>g.day<sg.cutoffExclusive && /^https:\/\//.test(g.source)));
    const witness=profile.publicFullFive??null;
    singapore.extra[name]={griffin:t.griffin,overlap:t.overlap,added:t.new,combined:t.combined,uncertain:t.uncertain,cases,
      witness:witness?{day:witness.day,opponent:witness.opponent,source:witness.sourceUrl}:null,announcement:profile.publicRosterCheck?.sourceUrl??null};
  }
  const trial=require('../lineup_pairs/scores.json'),cards=require('../lineup_pairs/cards.json');
  const lineupStudy=Object.entries(trial.fields).map(([id,r])=>{
    const c=cards.fields[id];
    return {id,n:r.bo3.n,oldBrier:r.bo3.baseline.brier,newBrier:r.bo3.candidate.brier,
      oldHits:c.baseline[0].hits,newHits:c.candidate[0].hits,passes:c.direction.passed};
  });
  const rmr=require('../lineup_pairs/bo1/scores.json'),games=require('../lineup_pairs/bo1/matches.json');
  const rmrMatches=rmr.winnerProbabilities.filter(r=>r.bo===1).map(r=>{
    const g=games.find(g=>g.id===r.id);
    assert.equal(g.winner,r.winner);
    return {round:g.round,teams:g.teams,winner:g.winner,map:g.maps[0][0],source:g.source,
      baseline:r.baseline,candidate:r.candidate};
  });
  assert(rmrMatches.length===rmr.bo1.n && rmr.bo1.n===20);
  const rmrStudy={draw:rmr.bo1,actualMap:rmr.bo1ActualMap,bo3:rmr.bo3,passed:rmr.gatePassed,matches:rmrMatches};
  return {fields,guideUrl:require('./field-guide.json').source,audit:{counts:audit.counts,stages},singapore,lineupStudy,rmrStudy};
}
module.exports={projection};
if(require.main===module)console.log(JSON.stringify(projection()));
