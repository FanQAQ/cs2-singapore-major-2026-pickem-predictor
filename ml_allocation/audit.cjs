'use strict';
// Read-only reconstruction from stage records, entrant lists, frozen forecasts, and Swiss paths.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const majorStages = require('../multi_stage/inputs.json');
const editions = require('../major_form/all_stages.json').editions;
const archived = require('../f1bre_models/report.json').fields;
const old = require('../f1bre_models/evaluate.cjs');
const {externalDocs} = require('../tail_calibration/evaluate.cjs');
const {fieldFor,modelsFor} = require('./evaluate.cjs');
const {samples} = require('./draw.cjs');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname,name),'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const indices = Array.from({length:16},(_,i)=>i);
const policies = ['standard','within','grouped'];
const roundsShape = [8,8,8,6,3];
const POP = new Uint8Array(65536);
for (let i=1;i<POP.length;i++) POP[i]=1+POP[i&(i-1)];
const equal = assert.deepEqual;
const sum = xs => xs.reduce((a,b)=>a+b,0);

function score(picks,actual) {
  equal(picks.length,16);
  equal([0,1,2,3].map(c=>picks.filter(p=>p===c).length),[2,6,2,6]);
  const slots=[0,0,0];
  let qualified=0,wrongTier=0;
  picks.forEach((pick,i)=>{
    if(pick<3 && actual[i]===pick) slots[pick]++;
    if(pick<=1 && actual[i]<=1){qualified++; if(actual[i]!==pick)wrongTier++;}
  });
  return {hits:sum(slots),slots,qualified,wrongTier};
}

function sourceTruth(id) {
  const major=majorStages.find(m=>m.id===id),elisa=id.startsWith('elisa-');
  const source=major || (elisa ? read('holdout-'+id.slice(6)+'-results.json') : externalDocs[id]().truth);
  equal(source.rounds.map(r=>r.length),roundsShape);
  const replaced=new Set((source.changes??[]).map(x=>x.slot));
  const admin=new Set((source.administrativeMatchIds??[]).map(String));
  const wins=indices.map(()=>0),losses=wins.slice(),matches=[];
  for (const [r,round] of source.rounds.entries()) {
    const active=new Set(indices.filter(i=>wins[i]<3 && losses[i]<3));
    for(const [k,[w,l]] of round.entries()) {
      assert(active.delete(w) && active.delete(l));
      equal([wins[w],losses[w]],[wins[l],losses[l]]);
      const bo=major ? major.formats[r][k] : 3;
      if(major) equal(bo,major.allBo3 || wins[w]===2 || losses[w]===2?3:1);
      const matchId=source.matchIds?.[r][k],played=!admin.has(String(matchId));
      let core=null;
      if(elisa){
        const m=source.matches.find(g=>g.id===matchId);
        equal([m.w,m.l,m.played],[w,l,played]);core=m.coreEligible;
        if(played)equal(typeof core,'boolean');
      }
      if(played && !replaced.has(w) && !replaced.has(l))matches.push({w,l,bo,core});
      wins[w]++;losses[l]++;
    }
    equal(active.size,0);
  }
  const seat=indices.map(i=>wins[i]===3?(losses[i]===0?0:1):(wins[i]===0?2:3));
  equal([0,1,2,3].map(c=>seat.filter(v=>v===c).length),[2,6,2,6]);
  return {seat,actual:seat.map((v,i)=>replaced.has(i)?4:v),matches};
}

function metrics(matrix,matches){
  const probabilities=matches.map(m=>matrix['bo'+m.bo][m.w][m.l]);
  const average=values=>values.length?Number((sum(values)/values.length).toFixed(9)):null;
  return {n:matches.length,brier:average(probabilities.map(p=>(1-p)**2)),
    logLoss:average(probabilities.map(p=>-Math.log(p)))};
}

function groupPrior(field,history) {
  const direct=new Set(field.direct),points=field.teams.map(t=>t.points);
  const rank=(values,invited)=>{
    const usable=values.filter(Number.isFinite).sort((a,b)=>a-b);
    const middle=(usable[Math.floor((usable.length-1)/2)]+usable[Math.floor(usable.length/2)])/2;
    const ranked=indices.slice().sort((a,b)=>(values[b]??middle)-(values[a]??middle)||a-b);
    return indices.map(i=>ranked.filter(j=>invited.has(j)===invited.has(i)).indexOf(i));
  };
  const targetRanks=rank(points,direct),prior=indices.map(()=>[0,0,0,0]);
  const directPast=new Set(indices.slice(0,8));
  for(const past of history){
    const positions=rank(past.teams.map(t=>t.points),directPast),terminal=sourceTruth(past.id).actual;
    for(const i of indices)for(const j of indices)if(direct.has(i)===directPast.has(j)){
      prior[i][terminal[j]]+=Math.max(0,3-Math.abs(targetRanks[i]-positions[j]));
    }
  }
  return prior;
}

function independentMaximum(values) {
  // Maximize three-category gain with exact category sizes; no production card optimizer is called.
  const best=new Float64Array(63).fill(-Infinity);
  best[0]=0;
  for(const v of values){
    for(let all=2;all>=0;all--)for(let adv=6;adv>=0;adv--)for(let out=2;out>=0;out--){
      const cell=all*21+adv*3+out;
      if(all)best[cell]=Math.max(best[cell],best[cell-21]+v[0]);
      if(adv)best[cell]=Math.max(best[cell],best[cell-3]+v[1]);
      if(out)best[cell]=Math.max(best[cell],best[cell-1]+v[2]);
    }
  }
  return best[62];
}

function verifyPaths(field,matrix,scheme,run,prior,count){
  const draw=samples(field,matrix,count,run.seed,scheme);
  const held=samples(field,matrix,count,(run.seed^0xc5398da1)>>>0,scheme);
  equal([draw,held].map(s=>hash(Buffer.from(s.outcomes.buffer,s.outcomes.byteOffset,s.outcomes.byteLength))),run.paths);
  assert.notEqual(run.paths[0],run.paths[1]);
  if(field.group==='elisa'){
    // The hypothetical seed order changes card selection, while all simulated and scored labels retain official slots.
    const position=indices.map(i=>field.seedOrder.indexOf(i)),translate=new Uint16Array(65536);
    for(let i=1;i<65536;i++){
      const bit=i&-i;translate[i]=translate[i^bit]+2**position[31-Math.clz32(bit)];
    }
    const ordered={count,frequencies:field.seedOrder.map(i=>draw.frequencies[i]),
      outcomes:draw.outcomes.map(m=>translate[m])};
    const standard=CS.cardsFromSamples(ordered,true).card;
    equal(run.standard,indices.map(i=>standard[position[i]]));
  }
  const v=indices.map(i=>draw.frequencies[i].map((n,k)=>(9*n/count+prior[i][k])/(9+sum(prior[i]))));
  const credit=card=>sum(card.map((slot,i)=>slot<3?v[i][slot]:0));
  assert(Math.abs(independentMaximum(v)-credit(run.grouped))<1e-10);
  for(const a of indices.filter(i=>run.within[i]===0))for(const b of indices.filter(i=>run.within[i]===1)){
    assert(v[a][0]-v[a][1]>=v[b][0]-v[b][1]-1e-12);
  }
  const counts=policies.map(()=>({passes:0,both:0}));
  const masks=policies.map(p=>[0,1,2].map(c=>sum(run[p].map((v,i)=>v===c?2**i:0))));
  for(let j=0;j<held.outcomes.length;j+=3){
    const a=held.outcomes[j],b=held.outcomes[j+1],c=held.outcomes[j+2];
    assert(POP[a]===2 && POP[b]===6 && POP[c]===2 && !(a&b) && !(a&c) && !(b&c));
    const pass=masks.map(m=>POP[a&m[0]]+POP[b&m[1]]+POP[c&m[2]]>=5);
    for(const [k,t] of counts.entries()){if(pass[k])t.passes++; if(pass[k] && pass[0])t.both++;}
  }
  equal(Object.fromEntries(policies.map((p,i)=>[p,counts[i]])),run.audit);
}

function auditStage(stage,report,allPaths) {
  const {id,scheme}=stage, field=fieldFor(id);
  const major=majorStages.find(s=>s.id===id);
  const cutoff=major ? editions[major.parent].start : field.start;
  equal(stage.cutoff,cutoff);
  const history=majorStages.filter(s=>editions[s.parent].end<cutoff);
  equal(stage.history,history.map(s=>s.id));
  assert(history.every(s=>s.id!==id && (!major || s.parent!==major.parent)));
  const {actual,seat,matches}=sourceTruth(id);
  equal(stage.actual,actual);
  if(stage.seatActual)equal(stage.seatActual,seat);
  equal(stage.excluded,33-matches.length);
  const original=archived.find(e=>e.id===id);
  equal(stage.teams,field.teams.map(t=>t.name));
  equal(new Set(stage.teams).size,16);
  equal(new Set(stage.direct).size,8);
  const matrices=modelsFor(field),prior=groupPrior(field,history);
  for(const [key,model] of Object.entries(stage.methods)){
    equal(model.runs.map(x=>x.seed),report.seeds);
    for(const bo of [1,3])equal(model.errors['bo'+bo],metrics(matrices[key],matches.filter(m=>m.bo===bo)));
    if(id.startsWith('elisa-'))equal(model.coreErrors,metrics(matrices[key],matches.filter(m=>m.core)));
    for(const [i,run] of model.runs.entries()){
      if(original)equal(run.standard,original.methods[key].runs[i].card);
      if(!original && key==='baseline' && id.startsWith('epl')){
        const saved=require('../tail_calibration/report.json').stages.find(e=>e.id===id);
        equal(run.standard,saved.methods.vrs.rows[i].card);
      }
      for(const p of policies){
        equal(run.scores[p],score(run[p],actual));
        if(actual.includes(4))equal(run.seatHits[p],score(run[p],seat).hits);
      }
      for(const j of indices){
        if(run.standard[j]<2)assert(run.within[j]<2);
        else equal(run.standard[j],run.within[j]);
      }
      for(const p of policies){
        const {passes,both}=run.audit[p];
        assert(both>=Math.max(0,passes+run.audit.standard.passes-report.auditN));
        assert(both<=Math.min(passes,run.audit.standard.passes) && passes<=report.auditN);
      }
      equal(run.audit.standard.both,run.audit.standard.passes);
      assert(run.paths.length===2 && run.paths.every(h=>/^[a-f0-9]{64}$/.test(h)) && run.paths[0]!==run.paths[1]);
      if(allPaths || !i)verifyPaths(field,matrices[key],scheme,run,prior,report.searchN);
    }
  }
}

function singapore(){
  const sealed=require('../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json');
  const buffer=fs.readFileSync(path.join(__dirname,'..',sealed.matrixReference.file));
  equal(hash(buffer),sealed.matrixReference.sha256);
  const matrix=JSON.parse(buffer)[sealed.matrixReference.field];
  equal(hash(JSON.stringify(matrix)),sealed.matrixSha256);
  const live=old.prodMatrix(old.getField('singapore'));
  equal([live.bo1,live.bo3],[matrix.bo1,matrix.bo3]);
  const s=CS.run(matrix,sealed.searchPaths+sealed.evaluationPaths,sealed.seed,[],{seedConditionalCard:true});
  equal(s.card,sealed.card);
  equal(s.pass,sealed.passProbability);
  equal(s.expected,sealed.expectedHits);
  const original=archived.find(e=>e.id==='singapore');equal(original.actual,null);
  equal(original.methods.baseline.runs[0].card,sealed.card);
}

function summary(report){
  const groups=read('summary.json').groups;
  function check(rows,view) {
    for(const k of ['baseline','ml'])for(const p of policies){
      const fixed=rows.map(s=>score(s.methods[k].runs[0][p],s.actual));
      const published=view[k].policies[p];
      equal(view[k].ns,rows.length);
      equal([published.hits,published.passes,published.qualified,published.wrongTier],
        [sum(fixed.map(x=>x.hits)),fixed.filter(x=>x.hits>=5).length,sum(fixed.map(x=>x.qualified)),sum(fixed.map(x=>x.wrongTier))]);
      equal(published.slots,[0,1,2].map(c=>sum(fixed.map(s=>s.slots[c]))));
      const changes={hits:[0,0,0],passes:[0,0,0]};
      for(let i=0;i<report.seeds.length;i++){
        const difference=[0,0];
        for(const stage of rows){
          const run=stage.methods[k].runs[i],a=score(run[p],stage.actual).hits,b=score(run.standard,stage.actual).hits;
          difference[0]+=a-b;difference[1]+=Number(a>=5)-Number(b>=5);
        }
        changes.hits[1-Math.sign(difference[0])]++;
        changes.passes[1-Math.sign(difference[1])]++;
      }
      equal(published.changes,changes);
    }
  }
  for(const g of ['stage2','stage3','esl'])check(report.stages.filter(s=>s.group===g),groups[g].views.primary);
  for(const s of report.stages)check([s],groups[s.id].views[s.group==='elisa'?s.scheme:'primary']);
}

function main(){
  const report=read('report.json'),all=process.argv.includes('--all-paths');
  const expected=majorStages.map(s=>s.id+'|major').concat(
    [21,22,23].map(n=>'epl'+n+'-stage2|esl'),['spring','fall'].flatMap(s=>['draw','ranked'].map(v=>'elisa-'+s+'|'+v)));
  equal(report.stages.map(s=>s.id+'|'+s.scheme).sort(),expected.sort());
  equal(report.stages.filter(s=>s.group==='stage3').map(s=>s.id),['austin-2025-3','budapest-2025-3','cologne-2026-3']);
  equal([report.searchN,report.auditN],[12000,12000]);
  equal(report.seeds,[...Array(30)].map((_,i)=>(33719+i*0x9e3779b1)>>>0));
  for(const s of report.stages)auditStage(s,report,all);
  singapore();
  summary(report);
  console.log('Verified '+report.stages.length+' stage/draw combinations, '+report.stages.length*30*2*3+
    ' scored cards, '+report.stages.length*2*(all?30:1)+' search and audit path pairs, and the sealed Singapore recommendation.');
}
if(require.main===module)main();
