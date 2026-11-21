'use strict';
const assert=require('node:assert/strict');
const {fields}=require('../sweep_decider/lock.cjs');
const {matrices}=require('../evaluate.cjs');
const {freeze,digest}=require('../format_split/astana/lock.cjs');
const {audit}=require('../format_split/pooled.cjs');
const {samples}=require('../../ml_allocation/draw.cjs');
const {seeds}=require('../../strategy_v4_eval/settings.cjs');
const {pass}=require('../../final_card/path_weights/weighted.cjs');

function candidates(base,ml){
  const options=[{swap:[],card:base}];
  for(let i=0;i<base.length;i++)for(let j=i+1;j<base.length;j++){
    if(base[i]===ml[i] || base[j]===ml[j] || base[i]===base[j])continue;
    if(base[i]!==ml[j] && base[j]!==ml[i])continue;
    const card=base.slice();
    [card[i],card[j]]=[card[j],card[i]];
    options.push({swap:[i,j],card});
  }
  return options;
}
function lock(f,base,alternative,seed,n,evalN){
  const models=[base,alternative],scheme=f.liveRatings?'esl':'major';
  const draw=(model,count,key)=>samples(f,model,count,key,scheme);
  const [original,mapML]=models.map(m=>CS.cardsFromSamples(draw(m,n,seed),true).card);
  const options=candidates(original,mapML);
  const selectionDraws=models.map(m=>draw(m,evalN,audit(seed)).outcomes);
  const counts=(card,draws)=>draws.map(paths=>Math.round(pass(card,paths)*evalN));
  const selection=options.map(x=>counts(x.card,selectionDraws));
  const best=models.map((_,m)=>Math.max(...selection.map(count=>count[m])));
  const losses=selection.map(count=>Math.max(...best.map((b,m)=>b-count[m])));
  const chosen=losses.indexOf(Math.min(...losses));
  const test=models.map(m=>draw(m,evalN,(seed^0x37ae85db)>>>0).outcomes);
  return {seed,n,evalN,original,mapML,chosen,options:options.map(({swap},i)=>({swap,passes:selection[i],loss:losses[i]})),
    selected:options[chosen].card,test:{original:counts(original,test),selected:counts(options[chosen].card,test)}};
}
function generate(full){
  const selected=full?seeds:seeds.slice(0,3),n=full?12000:2000,evalN=full?12000:4000;
  const streams=selected.flatMap(s=>[s,audit(s),(s^0x37ae85db)>>>0]);
  assert.equal(new Set(streams).size,streams.length);
  const out={};
  for(const [id,input] of Object.entries(fields())){
    const {f,base,ml}=input;
    const alternate=base.allBo3?{bo1:ml,bo3:ml,allBo3:true}:matrices(f,['ml']).ml;
    assert.deepEqual(alternate.bo3,ml);
    out[id]={teams:f.teams.map(t=>t.name),start:f.start,matrixHash:digest([base,alternate]),
      rows:selected.map(s=>lock(f,base,alternate,s,n,evalN))};
  }
  freeze(full?'full-cards.json':'cards.json',out,__dirname);
}
if(require.main===module)generate(process.argv.includes('--full'));
