'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {seeds,budget}=require('../strategy_v4_eval/settings.cjs');
const {samples,teams}=require('../ml_allocation/draw.cjs');
const {cardScore,errors}=require('../f1bre_models/score.cjs');
const {fieldFor,truthFor}=require('../ml_allocation/evaluate.cjs');
const legacy=require('../veto_ml/cards.json'),existing=require('../f1bre_models/report.json');
const masterId='masters-bucharest-2025',armKeys=['original','candidate'],policies=['standard','pure','tailOnly'];
const additionalEpl=['epl21-stage2','epl22-stage2'];
const n=budget/2,root=__dirname;
const hash=b=>createHash('sha256').update(b).digest('hex'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f)));
const zip=f=>JSON.parse(gunzipSync(fs.readFileSync(path.join(root,f))));
const sum=values=>values.reduce((a,b)=>a+b,0),mean=values=>sum(values)/values.length;
const bits=new Uint8Array(65536);
for(let i=1;i<bits.length;i++)bits[i]=bits[i>>>1]+(i&1);

function align(model,names) {
  const axis=model.teams,ix=names.map(name=>axis.indexOf(name));
  assert.deepEqual([...axis].sort(),[...names].sort());assert.equal(new Set(names).size,16);
  assert.equal(new Set(model.pool).size,7);
  return Object.fromEntries(armKeys.map(k=>{
    const src=k==='original'?model.baseline:model.candidate,mm={};
    assert.equal(src.mapProbabilities.length,120);
    for(const row of src.mapProbabilities)assert(row.length===7 && row.every(p=>Number.isFinite(p)&&p>0&&p<1));
    for(const format of ['bo1','bo3']){
      const a=src[format];assert(a.length===16 && a.every(r=>r.length===16));
      mm[format]=ix.map(i=>ix.map(j=>a[i][j]));
      for(const i of teams)for(const j of teams){
        const p=a[i][j];assert(Number.isFinite(p)&&p>0&&p<1);assert(Math.abs(p+a[j][i]-1)<1e-8);
        if(i===j)assert.equal(p,.5);
      }
    }
    return [k,mm];
  }));
}
function confirmMaps(id,model,previousModel) {
  const original=align(model,previousModel.teams).original;
  for(const format of ['bo1','bo3'])for(const i of teams)for(const j of teams)
    assert(Math.abs(original[format][i][j]-previousModel.baseline[format][i][j])<=1.1e-10,id+' original '+format);
  const pi=model.pool.map(map=>previousModel.pool.indexOf(map));
  assert.deepEqual([...pi].sort(),[0,1,2,3,4,5,6]);
  const byPair=new Map(previousModel.pairs.map(p=>[[previousModel.teams[p.a],previousModel.teams[p.b]].sort().join('/'),p]));
  let row=0;
  for(const i of teams)for(let j=i+1;j<16;j++){
    const a=model.teams[i],b=model.teams[j],p=byPair.get([a,b].sort().join('/'));
    assert(p && p.maps.length===7);const same=previousModel.teams[p.a]===a;
    for(let k=0;k<7;k++)assert(Math.abs(model.baseline.mapProbabilities[row][k]-(same?p.maps[pi[k]]:1-p.maps[pi[k]]))<=1.1e-8,id+' original map probability');
    row++;
  }
}
function masters(){
  const f=read('masters-field.json'),r=read('masters-results.json');
  assert.equal(f.id,masterId);assert.equal(r.id,f.id);assert.equal(f.start,'2025-10-26');
  assert.deepEqual(f.seedOrder,teams);assert.deepEqual(f.entrants,f.teams.map(t=>t.name));
  const replay=CS.replay(r.rounds);assert(replay.ok && replay.matched===33);assert.deepEqual(r.actual,replay.actual);
  const matches=r.matches.map(g=>({id:g.id,w:g.w,l:g.l,round:g.round,bo:g.bo,day:g.day,played:g.played!==false}));
  assert.deepEqual(matches.map(({w,l})=>[w,l]),r.rounds.flat());
  for(const g of matches)assert.equal(g.bo,3);
  return {id:f.id,teams:f.entrants,start:f.start,actual:r.actual,matched:33,matches,group:'Masters'};
}
function field(id){
  if(additionalEpl.includes(id)){
    const modelField=fieldFor(id),r=truthFor(modelField);
    const raw=id===additionalEpl[0]?require('../tail_calibration/epl21-results.json'):require('../round_form/epl22-results.json');
    assert.equal(r.verifiedCount,33);
    const byId=new Map([...r.matches,...r.excluded].map(g=>[g.id,g]));
    const matches=raw.rounds.flatMap((round,i)=>round.map(([w,l],j)=>{
      const matchId=raw.matchIds[i][j],g=byId.get(matchId);
      assert.equal(g.w,w);assert.equal(g.l,l);
      return {w,l,bo:3,id:matchId,round:i+1,day:raw.matches?.find(m=>m.id===matchId)?.day??null,played:!raw.administrativeMatchIds.includes(matchId)};
    }));
    assert.equal(matches.filter(m=>m.played).length,id===additionalEpl[0]?33:32);
    const old={id,teams:modelField.teams.map(t=>t.name),start:modelField.start,group:'EPL',actual:r.actual,matched:33,matches};
    return {old,modelField,allBo3:true};
  }
  const old=id===masterId?masters():legacy.fields.find(row=>row.id===id);assert(old);
  const modelField=id==='epl23-stage2'?fieldFor(id):{id,scheme:'major'};
  if(modelField.scheme==='esl')assert.deepEqual(modelField.teams.map(t=>t.name),old.teams);
  return {old,modelField,allBo3:['EPL','Masters','Astana','Bucharest','Cluj'].includes(old.group)||id==='cologne-2026-3'};
}
function tally(card,sample) {
  const masks=[0,0,0];card.forEach((v,i)=>{if(v<3)masks[v]|=1<<i;});
  let passes=0;const out=sample.outcomes;
  for(let i=0;i<out.length;i+=3)passes+=Number(bits[out[i]&masks[0]]+bits[out[i+1]&masks[1]]+bits[out[i+2]&masks[2]]>=5);
  return passes;
}
function select(train){
  const result=CS.cardsFromSamples(train,true),standard=result.card,pure=result.basePassCard;
  const tailOnly=standard.map(c=>c===2?3:c);
  const tail=teams.filter(i=>tailOnly[i]===3).sort((a,b)=>train.frequencies[b][2]-train.frequencies[a][2] || a-b).slice(0,2);
  for(const i of tail)tailOnly[i]=2;
  assert.deepEqual(pure.map(c=>c<2),standard.map(c=>c<2));
  return {standard,pure,tailOnly};
}
function score(card,test,actual){
  const real=cardScore(card,actual);
  return {card,hits:real?.hits??null,passed:real?real.hits>=5:null,slots:real?.slots??null,
    falseZeroQualified:real?teams.filter(i=>card[i]===2 && actual[i]<2):null,simulatedPass:tally(card,test)/n};
}
function play(modelField,matrix,seed,actual,includeTeams){
  const train=samples(modelField,matrix,n,seed,modelField.scheme),test=samples(modelField,matrix,n,(seed^0xc5398da1)>>>0,modelField.scheme);
  const cards=Object.fromEntries(Object.entries(select(train)).map(([p,card])=>[p,score(card,test,actual)]));
  const probs=test.frequencies.map(row=>({perfect:row[0]/n,ordinary:row[1]/n,zero:row[2]/n,qualified:(row[0]+row[1])/n}));
  const zeroBrier=actual?mean(probs.map((p,i)=>(p.zero-Number(actual[i]===2))**2)):null;
  return {seed,cards,zeroBrier,...(includeTeams?{teams:probs}:{})};
}
function errorsByFormat(matches,k){
  return Object.fromEntries([1,3].map(bo=>['bo'+bo,errors(matches.filter(g=>g.bo===bo && g.played!==false).map(g=>g.winnerProbability[k]))]));
}
function evaluate(id,model){
  const {old,modelField,allBo3}=field(id),matrix=align(model,old.teams),arms={};
  assert.equal(model.start,old.start);assert(model.cutoffExclusive<=model.start);
  const matches=old.matches.map(({id:matchId,day,round,bo,w,l,played,winnerProbability:prior})=>{
    const ps=Object.fromEntries(armKeys.map(k=>[k,matrix[k]['bo'+bo][w][l]]));
    if(prior)assert(Math.abs(ps.original-prior.original)<1.1e-10);
    return {id:matchId,day,round,bo,w,l,played:played!==false,winnerProbability:ps};
  });
  for(const k of armKeys){
    const runs=seeds.map((s,i)=>play(modelField,{...matrix[k],allBo3},s,old.actual,i===0));
    const main=runs[0],formatErrors=errorsByFormat(matches,k);
    if(k==='original' && old.methods){
      const previous=old.methods.original,report=existing.fields.find(f=>f.id===id)?.methods.ml;
      assert.deepEqual(formatErrors,previous.errors);
      for(const [i,r] of runs.entries()){
        const oldCard=previous.runs[i];assert.deepEqual(r.cards.standard.card,oldCard.card,id+' standard '+r.seed);
        assert.equal(r.cards.standard.simulatedPass,oldCard.simulatedPass);
        if(report){assert.deepEqual(r.cards.pure.card,report.runs[i].local,id+' pure '+r.seed);}
      }
      for(const [i,p] of main.teams.entries())assert.equal(p.zero,previous.main.teams[i].zero);
    }
    if(k==='original' && additionalEpl.includes(id)){
      const previous=require('../latent_form/trained-summary.json').fields.find(f=>f.id===id).models.ml.control;
      assert.deepEqual(runs.map(r=>r.cards.standard.card),previous.cardsBySeed);
      assert.deepEqual(main.teams.map(t=>t.zero),previous.main.zero);
      assert.equal(main.cards.standard.simulatedPass,previous.main.simulatedPass);
    }
    arms[k]={errors:formatErrors,main,runs:runs.map(({teams:detail,...r})=>r)};
  }
  return {id,group:old.group,start:old.start,cutoffExclusive:model.cutoffExclusive,teams:old.teams,actual:old.actual,
    matched:old.matched,matches,arms};
}
function direction(old,candidate){
  const ds=candidate.map((v,i)=>v-old[i]);
  return {better:ds.filter(x=>x>0).length,same:ds.filter(x=>x===0).length,worse:ds.filter(x=>x<0).length};
}
function aggregate(fields) {
  assert(fields.length && fields.every(f=>f.actual));
  const arms={};
  for(const k of armKeys){
    const bs=fields.map(f=>f.arms[k]),cards={};
    for(const p of policies){
      const assists=i=>bs.map(b=>b.runs[i].cards[p]);
      const passesBySeed=seeds.map((_,i)=>assists(i).filter(x=>x.passed).length);
      const hitsBySeed=seeds.map((_,i)=>sum(assists(i).map(x=>x.hits))),primary=assists(0);
      const slots=[0,1,2].map(t=>sum(primary.map(c=>c.slots[t]))),falseZeroQualified=sum(primary.map(c=>c.falseZeroQualified.length));
      cards[p]={passes:passesBySeed[0],hits:hitsBySeed[0],slots,falseZeroQualified,passesBySeed,hitsBySeed};
    }
    const zeroBrierBySeed=seeds.map((_,i)=>mean(bs.map(b=>b.runs[i].zeroBrier)));
    arms[k]={errors:errorsByFormat(fields.flatMap(f=>f.matches),k),zeroBrier:zeroBrierBySeed[0],zeroBrierBySeed,cards};
  }
  const orig=arms.original.cards.standard,cand=arms.candidate.cards.standard,pure=arms.original.cards.pure;
  return {n:fields.length,ids:fields.map(f=>f.id),arms,passDirection:direction(orig.passesBySeed,cand.passesBySeed),
    hitDirection:direction(orig.hitsBySeed,cand.hitsBySeed),allocationPassDirection:direction(orig.passesBySeed,pure.passesBySeed)};
}
async function main(){
  const bytes=fs.readFileSync(path.join(root,'models.json.gz')),models=JSON.parse(gunzipSync(bytes)).fields;
  const prior=zip('../veto_ml/models.json.gz').fields,esl=zip('../ml_allocation/ml.json.gz').fields;
  const targets=[...legacy.fields.map(row=>row.id),...additionalEpl,masterId];
  assert.deepEqual(Object.keys(models).sort(),targets.slice().sort());
  // Validate both frozen arms for the entire cohort before loading the new holdout outcome.
  for(const id of targets){
    align(models[id],models[id].teams);
    if(prior[id])confirmMaps(id,models[id],prior[id]);
    else if(additionalEpl.includes(id)){
      assert.deepEqual(models[id].teams,esl[id].teams);assert.deepEqual(models[id].pool,esl[id].pool);
      for(const k of ['bo1','bo3','mapProbabilities'])assert.deepEqual(models[id].baseline[k],esl[id][k]);
    }
  }
  const rows=new Array(targets.length);let next=0;
  async function work(){while(next<targets.length){
    const index=next++,id=targets[index];
    rows[index]=await new Promise((resolve,reject)=>{
      const w=new Worker(__filename,{workerData:{id,model:models[id]}});
      w.once('message',resolve);w.once('error',reject);w.once('exit',code=>{if(code)reject(Error(id+' worker '+code));});
    });
  }}
  await Promise.all(Array.from({length:Math.min(7,targets.length)},work));
  const groups=Object.fromEntries([...new Set(rows.filter(f=>f.actual).map(f=>f.group))].map(g=>[g,aggregate(rows.filter(f=>f.group===g))]));
  assert.deepEqual(['S1','S2','S3','Masters'].map(k=>groups[k].n),[5,5,3,1]);
  assert.deepEqual(rows.filter(f=>!f.actual).map(f=>f.id),['singapore']);
  const output={modelSha256:hash(bytes),seed:seeds[0],seeds,pathsPerPartition:n,fields:rows,groups};
  const data=JSON.stringify(output)+'\n',dest=path.join(root,'cards.json');
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(dest,'utf8'),data,'BO5-history study differs');
  else fs.writeFileSync(dest,data);
  console.log(rows.length+' fields / '+rows.filter(f=>f.actual).length+' completed');
}
module.exports={align,confirmMaps,select,score,play,evaluate,aggregate,policies,armKeys};
if(require.main===module){
  if(!isMainThread)parentPort.postMessage(evaluate(workerData.id,workerData.model));
  else main().catch(e=>{console.error(e);process.exitCode=1;});
}
