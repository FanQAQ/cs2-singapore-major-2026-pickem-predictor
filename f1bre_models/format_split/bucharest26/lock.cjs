'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {inputs,freeze}=require('../astana/lock.cjs');
const {samples}=require('../../../ml_allocation/draw.cjs');
const {productionSeed,seeds}=require('../../../strategy_v4_eval/settings.cjs');
const {pass}=require('../../../final_card/path_weights/weighted.cjs');
const {screen}=require('../../screen.cjs');
const {seal,audit}=require('../pooled.cjs');
const hash=name=>createHash('sha256').update(fs.readFileSync(path.join(__dirname,name))).digest('hex');
function lock(){
  const prior=['copenhagen','shanghai','austin','budapest','cologne'];
  const {f,flags,recommended,candidate}=inputs(__dirname,prior);
  const models={recommended,mapML:candidate};
  const probabilities={teams:f.teams.map(t=>t.name),flags,models,
    hashes:Object.fromEntries(['field.json','ml.json','v4-strength.json','format.json','region.json','classic.json'].map(n=>[n,hash(n)]))};
  freeze('matrices.json',probabilities,__dirname);
  const pilot=screen(f,models);
  const cards={};
  for(const [name,m] of Object.entries(models)){
    cards[name]=seeds.map(seed=>{
      const take=s=>samples(f,m,12000,s,'major');
      const card=CS.cardsFromSamples(take(seed),true).card;
      const independent=take(audit(seed));
      return {seed,card,trainN:12000,auditN:independent.count,auditPasses:Math.round(independent.count*pass(card,independent.outcomes))};
    });
  }
  assert.equal(seeds[0],productionSeed);
  freeze('cards.json',{matrixSHA256:hash('matrices.json'),pilot,cards,large:seal(f.id,candidate,productionSeed)},__dirname);
}
if(require.main===module)lock();
module.exports={hash};
