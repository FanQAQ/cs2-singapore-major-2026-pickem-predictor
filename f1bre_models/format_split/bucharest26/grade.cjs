'use strict';
const assert=require('node:assert/strict');
const {read,freeze}=require('../astana/lock.cjs');
const {hash}=require('./lock.cjs');
const {errors,cardScore}=require('../../score.cjs');
const take=n=>read(n,__dirname);
const truth=take('actual.json'),odds=take('matrices.json'),forecasts=take('cards.json');
for(const [name,sha] of Object.entries(truth.locks))assert.equal(hash(name),sha);
assert.equal(forecasts.matrixSHA256,hash('matrices.json'));
const replay=CS.replay(truth.rounds.map(rr=>rr.map(({w,l})=>[w,l])));
assert(replay.ok && replay.matched===33);
const games=truth.rounds.flat(),same=games.filter(g=>g.sides.every(s=>s.shared===5));
assert.equal(same.length,31);
const rows={};
for(const [name,m] of Object.entries(odds.models)){
  const score=card=>cardScore(card,replay.actual);
  const evaluate=matches=>errors(matches.map(({w,l})=>m.bo3[w][l]));
  const regular=forecasts.cards[name].map(c=>({seed:c.seed,...score(c.card)}));
  rows[name]={bo3:evaluate(games),sameStarters:evaluate(same),pilot:forecasts.pilot.methods[name].runs.map(r=>score(r.card)),
    main:regular[0],repeat:regular,passed:regular.filter(r=>r.hits>=5).length,large:name==='mapML'?score(forecasts.large.card):null};
}
const report={teams:odds.teams,actual:replay.actual,verified:replay.rounds.map(r=>r.matched),rows};
freeze('report.json',report,__dirname);
for(const [k,r] of Object.entries(rows))console.log(k,JSON.stringify({bo3:r.bo3,unchanged:r.sameStarters,pilot:r.pilot.map(s=>s.hits),
  main:r.main,passed:r.passed,large:r.large}));
