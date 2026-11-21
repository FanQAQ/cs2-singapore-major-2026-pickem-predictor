'use strict';
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const modules = ['engine','data','format','style-model','rolling','boost','v4','adapter'];
for (const name of modules) require(path.join(root,'dist',name+'.js'));

const classic = {family:'logit',format:true,shrinkBO:true};
const v4 = {family:'v4',form:true,strong:true,weak:true,roundMargin:true,format:true,shrinkBO:true};
const budget = 24000;
const productionSeed = 33719;
const seeds = Array.from({length:30},(_,i)=>(productionSeed+i*0x9e3779b1)>>>0);
module.exports = {root,modules,classic,v4,budget,productionSeed,seeds};
