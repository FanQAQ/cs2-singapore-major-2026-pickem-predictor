'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {getField,matrices}=require('./evaluate.cjs');
const {modelIds}=require('./singapore.cjs');
const field=getField('singapore'),models=matrices(field), proposals=require('./exact.json').singapore;
const pop=new Uint8Array(65536);
for(let i=1;i<pop.length;i++)pop[i]=pop[i>>>1]+(i&1);
function masks(card) {
  return [0,1,2].map(c=>card.reduce((bits,v,i)=>v===c?bits|(1<<i):bits,0));
}
function pass(draw,j,card) {
  return pop[draw[j]&card[0]]+pop[draw[j+1]&card[1]]+pop[draw[j+2]&card[2]]>=5;
}
const n=60000,rows={};
for(const world of modelIds) {
  const p=proposals[world], seed=(p.seed^0xa58f309d)>>>0;
  const draws=CS.sampleTerminalMasks(models[world],n,seed);
  const official=masks(proposals.baseline.standard.card);
  const scores={};
  for(const id of modelIds) {
    const e=proposals[id],body={};
    for(const [policy,entry] of Object.entries({standard:e.standard,search:e.full.top[e.full.selected]})) {
      const candidate=masks(entry.card);
      let yes=0,both=0,offerOnly=0,originalOnly=0;
      for(let j=0;j<draws.length;j+=3) {
        const a=pass(draws,j,official),b=pass(draws,j,candidate);
        yes+=Number(b);both+=Number(a&&b);offerOnly+=Number(b&&!a);originalOnly+=Number(a&&!b);
      }
      if(world===id)assert.equal(yes,entry.counts.confirm);
      body[policy]={passes:yes,both,offerOnly,originalOnly};
    }
    scores[id]=body;
  }
  for(const b of Object.values(scores))for(const v of Object.values(b)){
    assert.equal(v.both+v.offerOnly,v.passes);
    assert.equal(v.both+v.originalOnly,scores.baseline.standard.passes);
  }
  rows[world]=scores;
}
const out=JSON.stringify({id:'singapore',n,rows})+'\n', file=path.join(__dirname,'cross-audit.json');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8'),out);
else fs.writeFileSync(file,out);
