'use strict';
const field=require('./field.json');
const assert=require('node:assert/strict');
const teams=field.entrants.map((_,i)=>i);
const opening=teams.slice(0,8).map(i=>[i,15-i]);
function initial() {
  return {wins:new Uint8Array(16), losses:new Uint8Array(16), met:new Uint16Array(16), ratings:field.liveRatings.slice()};
}
function pairPool(pool,s) {
  pool.sort((a,b)=>s.ratings[a]-s.ratings[b] || a-b);
  const n=pool.length, mid=2*pool.reduce((v,i)=>v+s.ratings[i],0)/n;
  const pairCost=(a,b)=>(s.ratings[a]+s.ratings[b]-mid)**2;
  let natural=true;
  for(let i=0;i<n/2;i++)if(s.met[pool[i]]&(1<<pool[n-1-i]))natural=false;
  if(natural)return pool.slice(0,n/2).map((a,i)=>[a,pool[n-1-i]]);
  let best=Infinity, bestPairs;
  const active=[];
  function visit(mask,sum) {
    if(sum>=best)return;
    if(!mask){best=sum;bestPairs=active.slice();return;}
    const first=31-Math.clz32(mask&-mask), a=pool[first], left=mask^(1<<first);
    for(let j=n-1;j>first;j--){
      if(!(left&(1<<j)))continue;
      const b=pool[j];
      if(s.met[a]&(1<<b))continue;
      active.push([a,b]);visit(left^(1<<j),sum+pairCost(a,b));active.pop();
    }
  }
  visit((1<<n)-1,0);
  if(!bestPairs)throw Error('No eligible Swiss pairing');
  return bestPairs;
}
function pairs(s,round) {
  if(round===0)return opening;
  const groups=[[],[],[]];
  for(const i of teams) if(s.wins[i]<3 && s.losses[i]<3)groups[s.wins[i]].push(i);
  return groups.flatMap(group=>group.length?pairPool(group,s):[]);
}
function result(s,w,l,loserMaps) {
  const x=s.ratings[w]-s.ratings[l];
  const swing=5*(1-1/(1+10**((x-8)/10)))*(loserMaps===0?1:0.5);
  s.ratings[w]-=swing;s.ratings[l]+=swing;s.wins[w]++;s.losses[l]++;
  s.met[w]|=1<<l;s.met[l]|=1<<w;
}
function category(s,i){
  if(s.wins[i]===3)return s.losses[i]===0?0:1;
  return s.wins[i]===0?2:3;
}
function replay() {
  const s=initial(),expected=require('./actual.json').rounds;
  const key=(a,b)=>Math.min(a,b)*16+Math.max(a,b);
  expected.forEach((matches,r)=>{
    assert.deepEqual(pairs(s,r).map(([a,b])=>key(a,b)).sort((a,b)=>a-b),
      matches.map(([a,b])=>key(a,b)).sort((a,b)=>a-b),'ESL round '+(r+1));
    for(const [w,l,m] of matches)result(s,w,l,m);
  });
  return teams.map(i=>category(s,i));
}
module.exports={teams,initial,pairs,result,category,replay};
if(require.main===module)console.log('33/33 formula-derived matchups verified:',replay());
