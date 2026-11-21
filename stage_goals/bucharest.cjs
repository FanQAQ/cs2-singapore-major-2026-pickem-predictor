'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {seeds,budget} = require('../strategy_v4_eval/settings.cjs');
require('../final_card/rules.js');
const input = require('./bucharest.json');
const earlier = require('../multi_stage/inputs.json').filter(stage=>stage.endDate<input.start);
const points = input.teams.map(t=>t.points);
const past = earlier.map(stage=>{
  const replay = CS.replay(stage.rounds);
  assert.ok(replay.ok && replay.matched===33);
  return {points:stage.teams.map(t=>t.points),actual:replay.actual};
});
const prior = PickFinalCard.prior(points,past);
const p = points.map(a=>points.map(b=>1/(1+10**((b-a)/400))));
const matrix = {bo1:p,bo3:p,allBo3:true};
const cards = seeds.map(seed=>{
  const sim = CS.run(matrix,budget,seed,[],{seedConditionalCard:true});
  return {seed,base:sim.card,grouped:PickFinalCard.card('historical',sim,points,prior)};
});
const outcomes = CS.replay(input.rounds.map(row=>row.map(m=>[m.w,m.l])));
assert.ok(outcomes.ok && outcomes.matched===33,'Swiss draw must reproduce all 33 observed matchups');
const rows = cards.map(({seed,base,grouped})=>({seed,
  base:CS.actualScore(base,outcomes.actual),grouped:CS.actualScore(grouped,outcomes.actual)}));
const summary = {};
for (const variant of ['base','grouped']) {
  const choices=cards[0][variant];
  summary[variant]={hits:rows[0][variant],passes:rows.filter(r=>r[variant]>=5).length,
    meanHits:rows.reduce((n,r)=>n+r[variant],0)/rows.length,
    picks:[0,1,2].map(slot=>input.teams.filter((t,i)=>choices[i]===slot).map(t=>t.name))};
}
const out={start:input.start,seed:seeds[0],budget,trainingStages:earlier.map(e=>e.id),
  replayed:outcomes.matched,summary,rows};
const file=path.join(__dirname,'bucharest-report.json');
const encoded=JSON.stringify(out,null,2)+'\n';
if(process.argv.includes('--check')) assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),out);
else fs.writeFileSync(file,encoded);
console.log(summary);
