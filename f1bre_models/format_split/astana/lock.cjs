'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const {createHash}=require('node:crypto');
const {samples}=require('../../../ml_allocation/draw.cjs');
const {productionSeed}=require('../../../strategy_v4_eval/settings.cjs');
const {choose}=require('../../../method_eval/metrics.cjs');
require('../../../dist/methods.js');
require('../../../dist/region-vrs.js');
const {screen}=require('../../screen.cjs');
const {seal}=require('../pooled.cjs');
const read=(f,directory=__dirname)=>JSON.parse(fs.readFileSync(path.join(directory,f)));
const hash=(f,directory=__dirname)=>createHash('sha256').update(fs.readFileSync(path.join(directory,f))).digest('hex');
const digest=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
function freeze(file,data,directory=__dirname){
  const target=path.join(directory,file),txt=JSON.stringify(data)+'\n';
  if(fs.existsSync(target)) assert.equal(fs.readFileSync(target,'utf8'),txt,file);
  else fs.writeFileSync(target,txt,{flag:'wx'});
}
function inputs(directory=__dirname,priorIds=['copenhagen','shanghai','austin','budapest']){
  const load=name=>read(name,directory);
  const f=load('field.json'), ml=load('ml.json'), strength=load('v4-strength.json');
  const format=load('format.json'), region=load('region.json'), classic=load('classic.json');
  for(const source of [strength,format,region]) assert.equal(source.fieldSHA256,hash('field.json',directory));
  assert.equal(ml.inputs['field.json'],hash('field.json',directory));
  const earlier=require('../../../method_eval/diagnostics.json').stages.filter(e=>priorIds.includes(e.id));
  assert.deepEqual(earlier.map(e=>e.id),priorIds);
  const selected=choose(earlier,'recommended'); assert.equal(selected,'base');
  const event={...f,asOf:f.strengthRelease.rankDay,methodSelection:{recommended:selected},model:classic,
    v4Model:strength.v4Model,regionVrsModel:region.regionVrs,...format};
  const flags=PickMethods.defaults('recommended',event);
  const recommended=PickLab.seriesMatrices(event,flags);
  assert.deepEqual(ml.teams,f.teams.map(t=>t.name));
  const candidate={bo1:ml.bo3,bo3:ml.bo3,allBo3:true};
  for(const m of [recommended,candidate]){
    assert(m.allBo3 && m.bo3.length===16);
    for(const [i,row] of m.bo3.entries())for(const [j,p] of row.entries())
      assert(p>0 && p<1 && Math.abs(1-p-m.bo3[j][i])<1e-8);
  }
  return {f,flags,recommended,candidate};
}
if(require.main===module){
  const {f,flags,recommended,candidate}=inputs();
  const standard=m=>CS.cardsFromSamples(samples(f,m,12000,productionSeed,'major'),true).card;
  const data={teams:f.teams.map(t=>t.name),seed:productionSeed,flags,
    hashes:Object.fromEntries(['field.json','ml.json','classic.json','v4-strength.json','format.json','region.json'].map(f=>[f,hash(f)])),
    matrices:{recommended:digest(recommended),candidate:digest(candidate)},recommended:standard(recommended),
    candidate:standard(candidate),pilot:screen(f,{recommended,candidate})};
  freeze('cards.json',data);
  const file='candidate-large.json';
  if(!fs.existsSync(path.join(__dirname,file)) || process.argv.includes('--check-large'))
    freeze(file,{matrix:digest(candidate),...seal(f.id,candidate,productionSeed)});
  assert.equal(read(file).matrix,digest(candidate));
}
module.exports={inputs,digest,read,freeze};
