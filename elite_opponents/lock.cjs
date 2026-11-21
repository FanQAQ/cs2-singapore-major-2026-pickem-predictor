'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const read=file=>fs.readFileSync(path.join(__dirname,file));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const target=path.join(__dirname,'matrices-v2.json');
const stageIds=['cluj-2025','austin-2025-3','budapest-2025-3','cologne-2026-3'];

function estimate(p,left,right){
  const againstElite=t=>Number.isInteger(t.lockRank) && t.lockRank>=1 && t.lockRank<=8;
  const useLeft=left.eligible && againstElite(right),useRight=right.eligible && againstElite(left);
  const delta=((useLeft?left.difference:0)-(useRight?right.difference:0))/2;
  const adjusted=delta===0?p:Math.min(.99,Math.max(.01,p+delta));
  assert(p>0 && p<1 && Number.isFinite(adjusted));
  return {eligible:useLeft||useRight,triggered:Math.abs(adjusted-p)>1e-12,adjusted};
}

function compute(){
  const previous=JSON.parse(read('matrices.json'));
  const supersedesSha256=sha(JSON.stringify(previous.forecast));
  assert.equal(previous.sha256,supersedesSha256);
  assert.equal(supersedesSha256,'b5042b6fb7c270f7692071486417ca8e471250c4487b4dec72ba5addf0e23713');
  for(const name of ['field.json','profiles.json','base.json.gz']){
    assert.equal(sha(read('superseded/'+name)),previous.forecast.inputs[name]);
  }
  const profiles=JSON.parse(read('profiles.json')),base=JSON.parse(gunzipSync(read('base.json.gz'))).fields;
  assert.deepEqual(Object.keys(base).sort(),[...stageIds].sort());
  const fields={};
  for(const id of stageIds){
    const f=base[id],profile=profiles[id],teams=f.teams;
    assert.equal(profile.start,f.start);
    assert.deepEqual(Object.keys(profile.teams).sort(),[...teams].sort());
    const pairs=[];
    for(let a=0;a<teams.length;a++)for(let b=a+1;b<teams.length;b++){
      const left=profile.teams[teams[a]],right=profile.teams[teams[b]];
      const bo3=f.bo3[a][b],bo1=f.bo1[a][b],result=estimate(bo3,left,right);
      assert(Math.abs(1-result.adjusted-estimate(f.bo3[b][a],right,left).adjusted)<1e-10);
      pairs.push({a,b,bo1,bo3,...result});
    }
    assert.equal(pairs.length,120);
    fields[id]={start:f.start,cutoffExclusive:f.cutoffExclusive,teams,pairs};
  }
  const inputs={};
  for(const file of ['field.json','august-global.json','profiles.json','base.json.gz',
    '../tail_calibration/training.json.gz','../tail_calibration/training-releases.json']){
    inputs[file]=sha(read(file));
  }
  const protocol='../bo5_history/NEXT-ELITE.md';
  const oldTeam=JSON.parse(read('superseded/field.json')).teams.find(t=>t.name==='Imperial Valkyries');
  const newTeam=JSON.parse(read('field.json')).teams.find(t=>t.name==='Imperial Valkyries');
  assert(oldTeam.roster.some(p=>p.toLowerCase()==='bubble') && !oldTeam.roster.some(p=>p.toLowerCase()==='tory'));
  assert(newTeam.roster.some(p=>p.toLowerCase()==='tory') && !newTeam.roster.some(p=>p.toLowerCase()==='bubble'));
  for(const id of stageIds.slice(1))assert.deepEqual(fields[id],previous.forecast.fields[id]);
  return {supersedesSha256,definitionCommit:'931fbb0bf43338d4b6896d989d4049f679c33636',
    protocolSha256LF:sha(read(protocol).toString('utf8').replace(/\r\n/g,'\n')),inputs,fields};
}

function verify(){
  const record=JSON.parse(fs.readFileSync(target));
  assert.equal(record.sha256,sha(JSON.stringify(record.forecast)));
  const {lockedAt,...body}=record.forecast;
  assert(Number.isFinite(Date.parse(lockedAt)));
  assert.deepEqual(body,compute());
  return record;
}
if(require.main===module){
  if(process.argv[2]==='--seal'){
    const forecast={lockedAt:new Date().toISOString(),...compute()};
    fs.writeFileSync(target,JSON.stringify({sha256:sha(JSON.stringify(forecast)),forecast})+'\n',{flag:'wx'});
  }
  console.log('Verified retrospective matrix lock',verify().sha256);
}
module.exports={verify};
