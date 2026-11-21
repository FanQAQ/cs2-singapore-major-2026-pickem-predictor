'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
require('../engine/engine.js');
require('../robust_card/robust.js');
const report=require('./report.json'),frozen=require('./singapore-forecast.json');
const readModel=id=>JSON.parse(gunzipSync(fs.readFileSync(path.join(__dirname,id+'.json.gz')))).fields;
const archives={elo:readModel('elo'),ml:readModel('ml')},seed=report.seeds[0];
const f=frozen.forecast;
assert.equal(createHash('sha256').update(JSON.stringify(f)).digest('hex'),frozen.sha256);
assert.equal(seed,f.seed);assert.equal(report.searchN,f.searchPaths);assert.equal(report.auditN,f.auditPaths);
const current={id:'singapore',teams:f.teams.map(t=>t.name),pairs:f.pairs.map(p=>[...p.probs.elo,...p.probs.ml])};
const fields={};
const seedCard=[0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
for(const r of report.fields.filter(r=>r.id!=='cluj-2026')) {
  const elo=archives.elo[r.id],ml=archives.ml[r.id];
  assert.deepEqual(elo.teams,r.teams);assert.deepEqual(ml.teams,r.teams);
  assert.equal(elo.cutoffExclusive,ml.cutoffExclusive);
  const details={cutoff:elo.cutoffExclusive,series:elo.coverage.series,train:ml.training.treeMaps,cal:ml.training.calibrationMaps};
  fields[r.id]=details;
  if(r.actual) details.scores={};
  for(const [family,key] of [['elo','elo'],['ml','ml'],['hybrid','blend']]) {
    const matrix={allBo3:!!elo.allBo3};
    for(const format of ['bo1','bo3']){
      matrix[format]=family==='elo'?elo[format]:family==='ml'?ml[format]:
        elo[format].map((row,i)=>row.map((p,j)=>(p+ml[format][i][j])/2));
    }
    const simulation=CS.run(matrix,report.searchN+report.auditN,seed,[],{seedConditionalCard:true});
    assert.deepEqual(simulation.card,r.methods[key].runs[0].card);
    if(!r.actual){
      assert.equal(r.id,current.id);assert.deepEqual(r.teams,current.teams);assert.deepEqual(simulation.card,f.cards[key].standard);
      f.pairs.forEach(({a,b,probs})=>assert.deepEqual(probs[key],[matrix.bo1[a][b],matrix.bo3[a][b]]));
      continue;
    }
    const hits=card=>CS.actualScore(card,r.actual);
    const standard={...simulation,card:simulation.basePassCard,passCard:simulation.basePassCard};
    const robust=PickRobust.apply(standard,matrix,seed);
    details.scores[family]={conditional:hits(simulation.card),pass:hits(simulation.basePassCard),
      expected:hits(simulation.expectedCard),robust:hits(robust.card),seed:hits(seedCard)};
    assert.equal(details.scores[family].conditional,r.methods[key].fixed.hits);
  }
}
const source=fs.readFileSync(path.join(__dirname,'browser.js'),'utf8').replace(/\r\n/g,'\n');
const marker='/*__RESEARCH_FIELDS__*/null';
assert(source.includes(marker));
const output=source.replace(marker,()=>JSON.stringify({fields,current}));
const file=path.join(__dirname,'../dist/research-models.js');
if(process.argv.includes('--check'))assert.equal(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'),output);
else fs.writeFileSync(file,output);
