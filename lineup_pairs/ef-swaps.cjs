'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const {getField,matrices}=require('../f1bre_models/evaluate.cjs');
const ticket=require('../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json');
const archive=require('../f1bre_models/singapore-forecast.json').forecast;
const names=ticket.teams.map(t=>t.team), ef=names.indexOf('Eternal Fire');
assert.deepEqual(archive.teams.map(t=>t.name),names);
assert.equal(ticket.card[ef],0);
const others=ticket.card.flatMap((v,i)=>v===1?[i]:[]);
assert.equal(others.length,6);
const asMasks=card=>[0,1,2].map(slot=>card.reduce((bits,v,i)=>bits|(v===slot?1<<i:0),0));
const cards=[asMasks(ticket.card),...others.map(i=>{
  const card=ticket.card.slice();card[ef]=1;card[i]=0;return asMasks(card);
})];
const pop=new Uint8Array(65536);
for(let i=1;i<pop.length;i++)pop[i]=pop[i>>>1]+(i&1);
const grids=matrices(getField('singapore'));
const limit=budget/2, count=seeds.length*limit, worlds={};
for(const id of ['baseline','elo','ml']){
  const grid=grids[id],wins=Array(7).fill(0),gains=Array(6).fill(0),losses=Array(6).fill(0);
  const at=[0,0,0,0];
  for(const {a,b,probs} of archive.pairs){
    for(const [i,k] of ['bo1','bo3'].entries())assert.equal(grid[k][a][b],probs[id][i]);
  }
  for(const seed of seeds){
    const draws=CS.sampleTerminalMasks(grid,limit,(seed^0x6d2b79f5)>>>0);
    for(let i=0;i<draws.length;i+=3){
      const hit=cards.map(c=>Number(pop[draws[i]&c[0]]+pop[draws[i+1]&c[1]]+pop[draws[i+2]&c[2]]>=5));
      hit.forEach((v,j)=>{wins[j]+=v;});
      const slot=[0,1,2].find(c=>draws[i+c]&(1<<ef))??3;at[slot]++;
      for(let j=0;j<6;j++){
        gains[j]+=Number(hit[j+1]>hit[0]);losses[j]+=Number(hit[j+1]<hit[0]);
      }
    }
  }
  worlds[id]={original:wins[0],efFinishes:at,swaps:others.map((j,i)=>{
    assert.equal(wins[i+1]-wins[0],gains[i]-losses[i]);
    return {team:names[j],passes:wins[i+1],gains:gains[i],losses:losses[i]};
  })};
}
const payload=JSON.stringify({seeds:seeds.map(s=>(s^0x6d2b79f5)>>>0),pathsPerSeed:limit,count,worlds})+'\n';
const dest=path.join(__dirname,'ef-swaps.json');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(dest,'utf8'),payload);
else fs.writeFileSync(dest,payload);
for(const [id,v] of Object.entries(worlds))
  console.log(id,(100*v.original/count).toFixed(3),v.swaps.map(s=>[s.team,(100*(s.gains-s.losses)/count).toFixed(3)]));
