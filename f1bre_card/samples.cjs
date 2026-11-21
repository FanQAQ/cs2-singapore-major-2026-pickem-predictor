'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
globalThis.self=globalThis;
globalThis.importScripts=(...files)=>files.forEach(f=>require(path.join(dist,f)));
importScripts('history-worker.js');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const directory=process.argv[2], seedCount=Number(process.argv[3]);
const names=process.argv.slice(4);
const manifest=[];
for(const e of PickLab.events.filter(event=>names.includes(event.id))) {
  const flags={...PickMethods.defaults('recommended',e),seedConditionalCard:true};
  const m=PickLab.seriesMatrices(e,flags), n=budget/2;
  for(const [index,seed] of seeds.slice(0,e.id==='singapore'?1:seedCount).entries()) {
    const base=CS.run(m,budget,seed,[],{seedConditionalCard:true});
    const files={};
    const salts={train:0,select:0x4f9bd32c,audit:0xc5398da1};
    if(e.id==='singapore') salts.confirm=0xa58f309d;
    for(const [label,salt] of Object.entries(salts)){
      const count=label==='confirm'?60000:n;
      const masks=CS.sampleTerminalMasks(m,count,(seed^salt)>>>0);
      const bytes=Buffer.from(masks.buffer,masks.byteOffset,masks.byteLength);
      files[label]=e.id+'-'+index+'-'+label+'.bin';
      fs.writeFileSync(path.join(directory,files[label]),bytes);
      if(label==='train') {
        const observed=Array.from({length:16},()=>[0,0,0]);
        for(let k=0;k<masks.length;k+=3) for(let c=0;c<3;c++) for(let t=0;t<16;t++)
          if(masks[k+c]&(1<<t)) observed[t][c]++;
        assert.deepEqual(observed,base.searchCounts.map(row=>row.slice(0,3)));
      }
    }
    manifest.push({id:e.id,seed,index,teams:e.teams.map(t=>t.name),actual:e.hasResults?CS.replay(e.rounds).actual:null,
      files,released:base.card,local:base.basePassCard,baseAudit:base.pass});
  }
}
fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify(manifest));
