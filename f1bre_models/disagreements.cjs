'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const read=name=>fs.readFileSync(path.join(__dirname,name));
const fields=JSON.parse(read('major-fields.json')).fields;
fields['cluj-2026']=JSON.parse(read('cluj-field.json'));
globalThis.self=globalThis;
globalThis.importScripts=(...files)=>files.forEach(f=>require(path.resolve(__dirname,'../dist',f)));
importScripts('history-worker.js');
const unpack=name=>JSON.parse(zlib.gunzipSync(read(name))).fields;
const elo=unpack('elo.json.gz'),ml=unpack('ml.json.gz');
const groups={singapore:[],stage1:[],stage2:[],stage3:[],cluj:[]};
const models=['baseline','elo','ml'];

for(const [id,f] of Object.entries(fields)){
  const group=id==='singapore'?'singapore':id==='cluj-2026'?'cluj':'stage'+f.stage;
  const event=PickLab.allEvents.find(t=>t.id===id);
  const score=f.teams.map(t=>f.teams.map(v=>1/(1+10**((v.points-t.points)/400))));
  const baseline=event?PickLab.seriesMatrices(event,PickMethods.defaults('recommended',event)):{bo3:score};
  const e=elo[id],m=ml[id],bo=f.allBo3?'bo3':'bo1';
  const pairNumber=(a,b)=>a*(31-a)/2+b-a-1;
  for(let a=0;a<8;a++){
    const b=a+8,idx=pairNumber(a,b);
    const ps=[baseline[bo][a][b],e[bo][a][b],m[bo][a][b]];
    const mapOrder=m.pool.map((name,i)=>({name,p:m.mapProbabilities[idx][i]})).sort((a,b)=>a.p-b.p);
    groups[group].push({id,start:f.start,bo,a,b,teams:[f.teams[a].name,f.teams[b].name],
      p:ps,span:Math.max(...ps)-Math.min(...ps),points:[f.teams[a].points,f.teams[b].points],
      ratings:[e.entrants[a].elo,e.entrants[b].elo],eloSamples:[e.entrants[a].games,e.entrants[b].games],
      coreMaps:[m.priorCoreMaps[a],m.priorCoreMaps[b]],weakMap:mapOrder[0],strongMap:mapOrder.at(-1),
      withoutPlayers:m.ablation[bo][a][b],teamOnly:m.teamOnly[bo][a][b]});
  }
}
const selected=Object.entries(groups).flatMap(([k,rows])=>rows.sort((a,b)=>
  b.span-a.span||a.start.localeCompare(b.start)||a.a-b.a||a.id.localeCompare(b.id)).slice(0,k==='singapore'?2:1));
assert.equal(selected.length,6);
if(!process.argv.includes('--selection-only')){
  const {truth}=require('./evaluate.cjs');
  const reports=JSON.parse(read('report.json')).fields,exact=JSON.parse(read('exact.json'));
  const table=read('DISAGREEMENTS.md').toString('utf8').split(/\r?\n/).filter(line=>line.startsWith('|'));
  for(const r of selected){
    const f=fields[r.id],rows=truth(r.id,f.teams.map(t=>t.name));
    assert(exact[r.id]?.ml?.full?.visited===10090080);
    r.winner=null;
    if(rows){
      const known=reports.find(t=>t.id===r.id);
      const i=known.matches.findIndex(g=>(g.w===r.a&&g.l===r.b)||(g.w===r.b&&g.l===r.a));
      assert(i>=0 && known.matches[i].bo===Number(r.bo.slice(-1)));
      const actual=known.matches[i];r.winner=known.teams[actual.w];
      const firstRound=r.id==='cluj-2026'?JSON.parse(read('cluj-results.json')).rounds[0]:
        PickLab.allEvents.find(t=>t.id===r.id).rounds[0];
      assert(firstRound.some(([w,l])=>w===actual.w&&l===actual.l));
      for(const [j,k] of models.entries()){
        const observed=known.methods[k].matchPs[i],p=r.p[j];
        assert(Math.abs(observed-(actual.w===r.a?p:1-p))<1e-9);
      }
    }
    const line=table.find(t=>t.includes(r.teams.join(' – ')));
    const values=[...r.p.map(p=>(100*p).toFixed(1)+'%'),(100*r.span).toFixed(1)+' 个百分点',r.winner??'待赛'];
    assert(line?.includes('| '+values.join(' | ')+' |'),r.id+' document row');
  }
}
console.log(JSON.stringify(selected,null,2));
