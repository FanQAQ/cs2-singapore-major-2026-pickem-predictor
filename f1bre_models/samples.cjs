'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {getField,matrices}=require('./evaluate.cjs');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const [directory,id,method,seedIndex]=process.argv.slice(2),index=Number(seedIndex),seed=seeds[index];
const field=getField(id),matrix=matrices(field,[method])[method];
assert(['baseline','elo','ml','blend'].includes(method) && Number.isInteger(seed));
const base=CS.run(matrix,budget,seed,[],{seedConditionalCard:true});
const files={};
for(const [key,salt] of Object.entries({train:0,select:0x4f9bd32c,audit:0xc5398da1,confirm:0xa58f309d})) {
  if(key==='confirm' && id!=='singapore') continue;
  const masks=CS.sampleTerminalMasks(matrix,key==='confirm'?60000:budget/2,(seed^salt)>>>0);
  files[key]=key+'.bin';fs.writeFileSync(path.join(directory,files[key]),Buffer.from(masks.buffer,masks.byteOffset,masks.byteLength));
}
// Outcomes stay outside the input to search and reranking.
console.log(JSON.stringify({id,seed,index:0,teams:field.teams.map(t=>t.name),files,actual:null,released:base.card,local:base.basePassCard,baseAudit:base.pass}));
