'use strict';
const assert=require('node:assert/strict');
const {cardScore}=require('../f1bre_models/score.cjs');
const snapshots=require('./pley-historical-stage3.json');
const archive=require('../f1bre_models/report.json').fields;
const rows=snapshots.map(s=>{
  const f=archive.find(f=>f.id===s.id);
  assert(s.publishedAt.slice(0,10)<f.start && s.modifiedAt.slice(0,10)>f.start);
  const tags=[s.threeZero,s.ordinary,s.zeroThree],used=tags.flat();
  assert.equal(new Set(used).size,used.length);
  assert.deepEqual(tags.map(t=>t.length),s.id==='austin-2025-3'?[2,6,1]:[2,6,2]);
  const card=f.teams.map(team=>{
    const category=tags.findIndex(group=>group.includes(team));
    return category<0?3:category;
  });
  assert.equal(card.filter(c=>c<3).length,used.length);
  const slots=tags.map((group,c)=>group.filter(t=>f.actual[f.teams.indexOf(t)]===c).length);
  const known=slots.reduce((a,b)=>a+b,0);
  // Bound the missing Austin selection by considering every legal completion, including a miss.
  const possible=used.length===10?[known]:f.teams.flatMap((t,i)=>{
    if(card[i]!==3)return [];
    const complete=card.slice();complete[i]=2;return [cardScore(complete,f.actual).hits];
  });
  return {id:s.id,supplied:used.length,known,slots,possibleHits:[...new Set(possible)].sort(),
    publishedModel:cardScore(f.methods.baseline.runs[0].card,f.actual).hits};
});
console.log(JSON.stringify(rows));
