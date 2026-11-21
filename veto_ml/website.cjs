'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const {errors}=require('../f1bre_models/score.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,file));
const hash=b=>createHash('sha256').update(b).digest('hex');
const bytes=read('models.json.gz'),models=JSON.parse(gunzipSync(bytes)).fields;
const sets=JSON.parse(read('sets.json')),cards=JSON.parse(read('cards.json'));
assert.equal(cards.modelSha256,hash(bytes));
assert.equal(sets.sources['models.json.gz'],cards.modelSha256);
const keys=['reference','original','candidate'];
function stats(g) {
  const methods=Object.fromEntries(keys.map(k=>{
    const m=g.methods[k];
    return [k,{passes:m.passes,hits:m.hits,slots:m.slots,bo1:m.errors.bo1,bo3:m.errors.bo3}];
  }));
  return {n:g.n,ids:g.ids,methods,passDirection:g.passDirection,hitDirection:g.hitDirection};
}
function field(f){
  const m=models[f.id],s=sets.fields[f.id];
  const known=new Map((s?.rows??[]).map(r=>[r.a*16+r.b,r]));
  const pairs=[],wins=[[],[],[]];
  for(const p of m.pairs){
    const r=known.get(p.a*16+p.b),a=m.teams[p.a],b=m.teams[p.b];
    if(s&&!r)continue;
    const base=m.baseline.bo3[p.a][p.b],candidate=m.bo3[p.a][p.b];
    const modes=[p.original,p.veto].map(weights=>{
      const i=weights.indexOf(Math.max(...weights));return {maps:m.triples[i],mass:weights[i]};
    });
    const item={a,b,nA:p.nA,nB:p.nB,base,candidate,modes};
    if(r){
      assert.deepEqual(r.teams,[a,b]);
      const winner=m.teams[r.winner];
      const game=f.matches.find(g=>g.bo===3 && f.teams[g.w]===winner && f.teams[g.l]===(winner===a?b:a));
      assert(game, f.id+' '+a+' '+b);
      Object.assign(item,{winner,round:game.round,day:r.day,planned:r.planned,playedMaps:r.playedMaps,
        conditional:r.actualSetBo3??null,masses:r.eligible?[r.originalMass,r.vetoMass]:null,source:r.sourceUrl,reason:r.reason});
      if(r.eligible){
        assert(m.triples.some(t=>t.every(name=>r.planned.includes(name))));
        const [i,j,k]=r.planned.map(map=>p.maps[m.pool.indexOf(map)]);
        assert(Math.abs(i*j+i*k+j*k-2*i*j*k-r.actualSetBo3)<1e-8);
        [base,candidate,r.actualSetBo3].forEach((v,n)=>wins[n].push(winner===a?v:1-v));
      }
    }
    pairs.push(item);
  }
  if(s){assert.equal(pairs.length,s.rows.length);assert.equal(wins[0].length,s.eligible);}
  pairs.sort((a,b)=>(a.round??0)-(b.round??0));
  const methods=Object.fromEntries(keys.map(k=>{
    const r=f.methods[k].main;return [k,{hits:r.hits,slots:r.slots,card:r.card}];
  }));
  return {id:f.id,group:f.group,start:f.start,teams:f.teams,actual:f.actual,methods,pairs,cutoff:m.cutoffExclusive,
    last:m.coverage.last,coverage:m.coverage.counts,both:m.coverage.both,one:m.coverage.one,neither:m.coverage.neither,
    set:s?{eligible:s.eligible,expected:s.expectedBO3,unused:s.unplayedDeciders,loss:[s.originalLogLoss,s.vetoLogLoss],errors:wins.map(errors)}:null};
}
function project(){
  const {status,frozenAt,actual,scores,webFile}=require('./singapore.cjs').status();
  return {seeds:cards.seeds.length,groups:Object.fromEntries(Object.entries(cards.groups).map(([k,g])=>[k,stats(g)])),
    forecast:{status,frozenAt,actual,scores,webFile},
    fields:cards.fields.map(field)};
}
if(require.main===module)console.log(JSON.stringify(project()));
module.exports={project};
