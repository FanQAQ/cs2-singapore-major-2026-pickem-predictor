'use strict';
const assert=require('node:assert/strict');
const {read,hash,freeze,matrices}=require('./lock.cjs');
const {replayEsl}=require('../../../round_form/evaluate.cjs');
const {errors,cardScore}=require('../../score.cjs');
const {seeds}=require('../../../strategy_v4_eval/settings.cjs');
const truth=read('actual.json'),field=read('field.json'),inputs=read('matrices.json');
assert.deepEqual(matrices(),inputs);
for(const [name,digest] of Object.entries(truth.locks))assert.equal(hash(name),digest);
const {actual,matches}=replayEsl({...field,entrants:inputs.teams},truth);
const rows={};
for(const [key,prob] of Object.entries(inputs.models)){
  const {pilot,standard,large,matrixFileSHA256}=read(key+'-cards.json');
  assert.equal(matrixFileSHA256,hash('matrices.json'));
  assert.deepEqual(standard.map(s=>s.streams),seeds.map(s=>[s]));
  const grade=record=>({seed:record.streams[0],nTrain:record.nTrain,nAudit:record.nAudit,
    auditPasses:record.auditPasses,...cardScore(record.card,actual)});
  const repeat=standard.map(grade);
  rows[key]={bo3:errors(matches.map(({w,l})=>prob[w][l])),pilot:pilot.map(grade),
    main:repeat[0],large:large?grade(large):null,repeat,passes:repeat.filter(r=>r.hits>=5).length,
    hits:repeat.reduce((a,r)=>a+r.hits,0),winless:repeat.reduce((a,r)=>a+r.slots[2],0)};
}
const sides=truth.games.flatMap(g=>g.sides);
const result={id:field.id,verifiedMatches:matches.length,actual,teams:inputs.teams,
  sidesChecked:sides.filter(s=>s.shared!==null).length,allFive:sides.filter(s=>s.shared===5).length,rows};
freeze('report.json',result);
for(const [key,r] of Object.entries(rows))console.log(key,JSON.stringify({bo3:r.bo3,pilot:r.pilot.map(p=>p.hits),
  main:r.main,large:r.large,seedsPassed:r.passes,hits:r.hits,winless:r.winless}));
console.log('Match-side rosters',result.allFive,result.sidesChecked,'of',sides.length);
