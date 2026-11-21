// Fixed tickets from the 2026-11-18 snapshot. No ticket search on the evaluation paths.
'use strict';
const assert = require('node:assert/strict');
const {load} = require('./score.cjs');
const {teams, currentCard, baselineOdds} = load();
const upstream = 'https://github.com/Canyun259/cs2-singapore-major-pickem/blob/2587b511b06e0371b8974016d034851a55a3d934/hedge-result.json';
const names = [
  ['Ninjas in Pyjamas','HEROIC','FaZe','Eternal Fire','100 Thieves','M80'],
  ['Ninjas in Pyjamas','HEROIC','FaZe','Liquid','Eternal Fire','100 Thieves']
];
function ticket(groups) {
  const card = Array(16).fill(3);
  groups.forEach((group,slot)=>{
    assert.equal(group.length,[2,6,2][slot]);
    for (const name of group) {
      const index = teams.indexOf(name);
      assert(index >= 0 && card[index] === 3);
      card[index] = slot;
    }
  });
  return card;
}
// One position changed. M80 faces NiP in round one.
const sameOpener = [...currentCard];
assert.equal(sameOpener[5],0);
assert.equal(sameOpener[8],3);
sameOpener[5]=3;
sameOpener[8]=0;
const cards = {
  recommended:currentCard,
  sameOpener,
  upstreamOriginal:ticket([['PARIVISION','Liquid'],names[0],['GOSH','Chinggis Warriors']]),
  upstreamSameOpener:ticket([['PARIVISION','DENDELE'],names[1],['GOSH','Chinggis Warriors']])
};
const bits=new Uint8Array(65536);
for(let i=1;i<bits.length;i++) bits[i]=bits[i>>1]+(i&1);
const pathCount=5000;
const runs=[41001,41002,41003].map(seed=>{
  const masks=CS.sampleTerminalMasks(baselineOdds,pathCount,seed);
  const results={};
  for(const [key,card] of Object.entries(cards)){
    const slots=[0,1,2].map(k=>card.reduce((mask,slot,i)=>slot===k?mask|(1<<i):mask,0));
    assert.deepEqual(slots.map(m=>bits[m]),[2,6,2]);
    let passed=0, anySweep=0, bothSweep=0;
    for(let j=0;j<masks.length;j+=3){
      const sweep=bits[slots[0]&masks[j]];
      if(sweep) anySweep++;
      if(sweep===2) bothSweep++;
      if(sweep+bits[slots[1]&masks[j+1]]+bits[slots[2]&masks[j+2]]>=5) passed++;
    }
    results[key]={passed,anySweep,bothSweep};
  }
  assert.equal(results.sameOpener.bothSweep,0);
  assert.equal(results.upstreamSameOpener.bothSweep,0);
  return {seed,results};
});
console.log(JSON.stringify({upstream,pathCount,runs},null,2));
