'use strict';
const assert=require('node:assert/strict'),{createHash}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const report=require('./trained-summary.json'),rounds=require('./round-validation.json'),training=require('./training.json');
const hash=createHash('sha256').update(fs.readFileSync(path.join(__dirname,'training.json'))).digest('hex');
assert.equal(hash,report.trainingSha256);
assert.equal(hash,rounds.trainingSha256);
const groups=Object.fromEntries(Object.entries(report.groups).map(([group,models])=>[group,
  Object.fromEntries(Object.entries(models).map(([name,m])=>[name,{
    n:m.control.denominator,control:[m.control.passes,m.control.hits],trained:[m.trained.passes,m.trained.hits],
    direction:m.direction,rounds:rounds.summary[group][name].allBo3}]))]));
const fields=report.fields.map(f=>({
  id:f.id,group:f.group,start:f.start,teams:f.teams,actual:f.actual,scale:f.scale,pairs:f.pairs,events:f.events,
  covariance:f.covariance,ci:f.covarianceCI95,models:Object.fromEntries(Object.entries(f.models).map(([key,m])=>{
    const live=rounds.fields.find(r=>r.id===f.id && r.name===key);assert(live && live.scale===f.scale);
    assert.deepEqual([...live.teams].sort(),[...f.teams].sort());
    const pick=s=>({hits:s.main.hits,card:s.main.card,perfect:s.pooledPerfect,zero:s.pooledZero});
    return [key,{control:pick(m.control),trained:pick(m.trained),rounds:live.metrics}];
  }))}));
const s=training.targets.singapore;
console.log(JSON.stringify({groups,fields,singapore:{scale:s.scale,pairs:s.pairs,events:s.events},seed:report.seed,seeds:report.seeds.length}));
