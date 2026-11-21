'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {seal}=require('../pooled.cjs');
const {samples}=require('../../../ml_allocation/draw.cjs');
const {productionSeed:seed}=require('../../../strategy_v4_eval/settings.cjs');
const file=path.join(__dirname,'provisional-ml.json'),raw=fs.readFileSync(file),odds=JSON.parse(raw);
const field=require('./field.json');
assert.equal(odds.cutoffExclusive,field.cutoffExclusive);assert.equal(field.allBo3,true);
assert.deepEqual(odds.teams,field.teams.map(t=>t.name));
const matrix={bo1:odds.bo3,bo3:odds.bo3,allBo3:true};
const original=CS.cardsFromSamples(samples(field,matrix,12000,seed,'major'),true).card;
const large=seal(field.id,matrix,seed);
const data=JSON.stringify({id:field.id,forecastSHA256:createHash('sha256').update(raw).digest('hex'),
  cutoffExclusive:odds.cutoffExclusive,teams:odds.teams,small:original,large})+'\n';
const target=path.join(__dirname,'provisional-ml-cards.json');
if(fs.existsSync(target))assert.equal(fs.readFileSync(target,'utf8'),data,'Provisional lock differs');
else fs.writeFileSync(target,data,{flag:'wx'});
