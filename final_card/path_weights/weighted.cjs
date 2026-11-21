'use strict';
const assert = require('node:assert/strict');
const teams = Array.from({length:16},(_,i)=>i);
const bits = new Uint8Array(65536);
for(let i=1;i<bits.length;i++) bits[i]=bits[i>>>1]+(i&1);

function fit(sample, target) {
  const {count,outcomes}=sample, classes=new Uint8Array(count*16);
  for(let p=0;p<count;p++) for(const t of teams){
    let c=0;
    while(c<3 && !(outcomes[3*p+c] & (1<<t))) c++;
    classes[16*p+t]=4*t+c;
  }
  const desired=target.flat(), weights=new Float64Array(count).fill(1/count);
  const current=()=> {
    const f=new Float64Array(64);
    for(let p=0;p<count;p++)for(let t=0;t<16;t++) f[classes[16*p+t]]+=weights[p];
    return f;
  };
  let mass=current(),effective=count,steps=0;
  for(;steps<32;steps++){
    const logRatio=mass.map((x,i)=>Math.log((desired[i]+1e-12)/(x+1e-12))/16);
    const next=new Float64Array(count);
    let sum=0, squares=0;
    for(let p=0;p<count;p++){
      let shift=0;
      for(let t=0;t<16;t++) shift+=logRatio[classes[16*p+t]];
      const w=weights[p]*Math.exp(shift);
      next[p]=w;sum+=w;squares+=w*w;
    }
    const ess=sum*sum/squares;
    if(ess<count/2) break;
    for(let p=0;p<count;p++)weights[p]=next[p]/sum;
    effective=ess;mass=current();
  }
  assert(effective>=count/2 && Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-8);
  const marginals=teams.map(i=>Array.from(mass.slice(4*i,4*i+4)));
  return {weights,marginals,effective,steps};
}

function pass(card,outcomes,weights){
  const masks=[0,0,0];
  card.forEach((c,i)=>{if(c<3)masks[c]|=1<<i;});
  let sum=0;
  for(let i=0,p=0;i<outcomes.length;i+=3,p++)
    if(bits[outcomes[i]&masks[0]]+bits[outcomes[i+1]&masks[1]]+bits[outcomes[i+2]&masks[2]]>=5)
      sum+=weights ? weights[p] : 1;
  return weights ? sum : sum/(outcomes.length/3);
}

function choose(starts,outcomes,weights){
  const memo=new Map();
  function score(card){
    const k=card.join('');
    if(!memo.has(k))memo.set(k,pass(card,outcomes,weights));
    return memo.get(k);
  }
  let best=starts[0];
  for(const start of starts){
    let chosen=start;
    for(;;){
      let next=chosen;
      for(let i=0;i<16;i++)for(let j=i+1;j<16;j++){
        if(chosen[i]===chosen[j])continue;
        const candidate=chosen.slice();
        [candidate[i],candidate[j]]=[candidate[j],candidate[i]];
        if(score(candidate)>score(next)+1e-12)next=candidate;
      }
      if(next===chosen)break;
      chosen=next;
    }
    if(score(chosen)>score(best)+1e-12)best=chosen;
  }
  return best;
}
module.exports={fit,pass,choose};
