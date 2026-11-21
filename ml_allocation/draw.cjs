'use strict';
const assert=require('node:assert/strict');
require('../engine/engine.js');
const teams=Array.from({length:16},(_,i)=>i);
const counts=()=>teams.map(()=>[0,0,0,0]);

function samplesFromMasks(outcomes){
  const frequencies=counts(),count=outcomes.length/3;
  for(let j=0;j<outcomes.length;j+=3){
    for(let c=0;c<3;c++) {
      let mask=outcomes[j+c];
      while(mask){const i=31-Math.clz32(mask&-mask);frequencies[i][c]++;mask&=mask-1;}
    }
  }
  for(const row of frequencies)row[3]=count-row[0]-row[1]-row[2];
  return {count,outcomes,frequencies};
}

// Every possible perfect matching of one record group. First available is high-low.
function matchings(rest) {
  if(!rest.length)return [[]];
  const first=rest[0],rows=[];
  for(let j=rest.length-1;j>=1;j--) {
    const next=rest.slice(1,j).concat(rest.slice(j+1));
    for(const tail of matchings(next))rows.push([first,rest[j],...tail]);
  }
  return rows;
}
const patterns=Object.fromEntries([2,4,6,8].map(n=>[n,matchings(teams.slice(0,n))]));
function choose(group,met,random,ranked) {
  const patternsForSize=patterns[group.length];
  function repeats(p){
    let n=0;
    for(let j=0;j<p.length;j+=2)n+=Number(!!(met[group[p[j]]]&(1<<group[p[j+1]])));
    return n;
  }
  // Rejection sampling is uniform over valid matchings. The fallback also samples uniformly.
  if(!ranked)for(let i=0;i<12;i++){
    const p=patternsForSize[Math.floor(random()*patternsForSize.length)];
    if(repeats(p)===0)return p;
  }
  let minimum=Infinity,best=[];
  for(const p of patternsForSize){
    const n=repeats(p);
    if(n===0 && ranked)return p;
    if(n<minimum){minimum=n;best=[p];}
    else if(n===minimum)best.push(p);
  }
  return ranked?best[0]:best[Math.floor(random()*best.length)];
}
function elisaSamples(field,matrix,n,seed,scheme) {
  assert(['draw','ranked'].includes(scheme));
  const rng=CS.rng(seed),drawRng=CS.rng((seed^0x709d2c81)>>>0),outcomes=new Uint16Array(3*n);
  const opening=field.opening;
  assert.deepEqual(opening.flat().slice().sort((a,b)=>a-b),teams);
  const seedOrder=field.seedOrder;
  assert.deepEqual(seedOrder.slice().sort((a,b)=>a-b),teams);
  for(let trial=0;trial<n;trial++){
    const w=new Uint8Array(16),l=new Uint8Array(16),met=new Uint16Array(16);
    const play=(a,b)=>{
      const wins=rng()<matrix.bo3[a][b];
      w[wins?a:b]++;l[wins?b:a]++;
      met[a]|=1<<b;met[b]|=1<<a;
    };
    for(const [a,b] of opening)play(a,b);
    for(let round=2;round<=5;round++){
      const groups=[[],[],[]];
      for(const i of seedOrder)if(w[i]<3 && l[i]<3)groups[w[i]].push(i);
      for(let k=2;k>=0;k--){
        const g=groups[k];if(!g.length)continue;
        const p=choose(g,met,drawRng,scheme==='ranked');
        for(let j=0;j<p.length;j+=2)play(g[p[j]],g[p[j+1]]);
      }
    }
    for(const i of teams){
      const c=w[i]===3?(l[i]===0?0:1):(w[i]===0?2:3);
      if(c<3)outcomes[trial*3+c]|=1<<i;
    }
  }
  return samplesFromMasks(outcomes);
}
function samples(field,matrix,n,seed,scheme){
  if(scheme==='major')return samplesFromMasks(CS.sampleTerminalMasks(matrix,n,seed));
  if(scheme==='esl')return field.id==='epl21-stage2'?require('../tail_calibration/evaluate-esl21.cjs').draw(field,matrix,n,seed):
    require('../round_form/evaluate.cjs').eplSamples(matrix,field.liveRatings,n,seed);
  return elisaSamples(field,matrix,n,seed,scheme);
}
function inSeedOrder(sample,order) {
  if(order.every((v,i)=>v===i))return sample;
  const translation=new Uint16Array(65536);
  const pos=order.map((_,i)=>order.indexOf(i));
  for(let m=1;m<translation.length;m++){
    const bit=m&-m;
    translation[m]=translation[m^bit]|(1<<pos[31-Math.clz32(bit)]);
  }
  return {count:sample.count,frequencies:order.map(i=>sample.frequencies[i]),outcomes:sample.outcomes.map(m=>translation[m])};
}
module.exports={samples,inSeedOrder,teams};
