'use strict';
const assert=require('node:assert/strict');
const {cardScore}=require('../score.cjs');
const {read,freeze}=require('../format_split/astana/lock.cjs');
function maximum(card,actual,pool,target,other){
  let best=-1,choices=0;
  for(const [pos,a] of pool.entries())for(const b of pool.slice(pos+1)){
    const c=card.slice();
    for(const i of pool)c[i]=i===a||i===b?target:other;
    best=Math.max(best,cardScore(c,actual).hits);
    choices++;
  }
  assert.equal(choices,28);
  return best;
}
function bounds(card,actual){
  const groups=[[],[]];
  card.forEach((v,i)=>groups[Number(v>=2)].push(i));
  const {hits,qualified}=cardScore(card,actual);
  const top=maximum(card,actual,groups[0],0,1),bottom=maximum(card,actual,groups[1],2,3);
  // Hits in the two disjoint groups add, so their separate maxima can be attained together.
  const both=top+bottom-hits;
  assert(hits<=top && hits<=bottom && both<=10);
  return {hits,qualified,top,bottom,both};
}
const reports=require('../report.json').fields;
const main=reports.filter(f=>f.stage===3&&f.actual).map(f=>[f.id,f.methods.baseline.runs[0].card,f.actual]);
assert.equal(main.length,3);
const astana=read('actual.json'),played=CS.replay(astana.rounds.map(rr=>rr.map(g=>g.slice(0,2))));
assert(played.ok && played.matched===33);
main.push(['astana-2026',read('scores.json').rows[0].control.card,played.actual]);
const kat=require('../format_split/epl24/report.json'),buch=require('../format_split/bucharest26/report.json');
main.push(['epl24',require('../format_split/epl24/recommended-cards.json').standard[0].card,kat.actual],
  ['masters-bucharest-2026',require('../format_split/bucharest26/cards.json').cards.recommended[0].card,buch.actual]);
const result=Object.fromEntries(main.map(([id,card,actual])=>[id,bounds(card,actual)]));
freeze('ceilings.json',result,__dirname);
console.log(JSON.stringify(result));
