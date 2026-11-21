'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const {summarize}=require('./cohorts.cjs');
const entry=require('./entrants.json');
const read=file=>fs.readFileSync(path.join(__dirname,file));
const keys=['original','candidate'],policies=['standard','pure','tailOnly'];
function projection(){
  const cardsBytes=read('cards.json'),cards=JSON.parse(cardsBytes),cov=JSON.parse(gunzipSync(read('coverage.json.gz')));
  assert.equal(cards.modelSha256,createHash('sha256').update(read('models.json.gz')).digest('hex'));
  const verified=require('./singapore.cjs').status(),{status,frozenAt,webFile,scores,actual}=verified;
  assert(['pending','scored'].includes(status));
  const frozen=JSON.parse(read('singapore-forecast.json')).forecast;
  assert.equal(frozen.inputs['cards.json'],createHash('sha256').update(cardsBytes).digest('hex'));
  assert.equal(cards.seed,frozen.seed);
  const fields=cards.fields.map(f=>{
    const cover=cov.fields[f.id];
    if(f.id==='singapore')assert.deepEqual(f.teams,verified.teams);
    const teams=f.teams.map((name,i)=>{
      const t=cover.teams[name],prior=entry[f.id]?.teams[name],v=f.arms;
      const record=f.actual?[f.matches.filter(m=>m.w===i).length,f.matches.filter(m=>m.l===i).length]:null;
      if(record){const [w,l]=record;assert.equal(w===3?(l===0?0:1):w===0?2:3,f.actual[i]);}
      const history=t.added.map(x=>{
        const r=cov.series[x.id];assert(r && r.available<=f.cutoffExclusive && r.day<f.start);
        const opponent=x.side===0?r.b:r.a;
        return {id:x.id,day:r.day,opponent,side:x.side,w:x.w,l:x.l,core:x.overlap};
      }).sort((a,b)=>b.day.localeCompare(a.day)||a.id.localeCompare(b.id));
      assert.equal(history.reduce((n,r)=>n+r.w+r.l,0),t.extraCoreMaps);
      const probability=keys.map(k=>v[k].main.teams[i].zero),slots=keys.map(k=>policies.map(p=>v[k].main.cards[p].card[i]));
      if(f.id==='singapore'){
        for(const [j,k] of keys.entries()){
          probability[j]=verified.zeroProbabilities[k][i];
          slots[j][0]=verified.cards[k].card[i];slots[j][1]=verified.cards[k+'Pure'].card[i];
        }
      }
      return {name,base:t.baseCoreMaps,extra:t.extraCoreMaps,win:t.extraWins,loss:t.extraLosses,history,entry:prior?.entry,core:prior?.minCore,
        p:probability,q:keys.map(k=>v[k].main.teams[i].qualified),cards:slots,actual:f.actual?.[i]??null,record};
    });
    return {id:f.id,group:f.group,start:f.start,cutoff:f.cutoffExclusive,teams,actual:f.actual,
      cards:keys.map(k=>policies.map(p=>f.arms[k].main.cards[p].hits))};
  });
  const narrow=c=>({passes:c.passes,hits:c.hits,slots:c.slots,falseZeroQualified:c.falseZeroQualified});
  const groups=Object.fromEntries(Object.entries(cards.groups).map(([k,g])=>[k,{n:g.n,dir:g.passDirection,hitDir:g.hitDirection,
    arms:keys.map(key=>{const a=g.arms[key];return {bo1:a.errors.bo1,bo3:a.errors.bo3,zero:a.zeroBrier,cards:policies.map(p=>narrow(a.cards[p]))};})}]));
  const seen=new Set(fields.flatMap(f=>f.teams.flatMap(t=>t.history.map(m=>m.id))));
  const series=Object.fromEntries([...seen].map(id=>{const r=cov.series[id];return [id,{event:r.event,url:r.sourceUrl,maps:r.maps}];}));
  return {seeds:cards.seeds.length,seed:cards.seed,audit:verified.auditPaths,groups,cohorts:summarize(cards.fields),series,fields,forecast:{status,frozenAt,webFile,scores,actual}};
}
module.exports={projection};
if(require.main===module)console.log(JSON.stringify(projection()));
