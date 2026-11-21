'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {load,modelIds}=require('./singapore.cjs');
const filename=name=>path.join(__dirname,name);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const labels=['perfect','advance','zero'];
const sizes=[2,6,2];
const pop=new Uint8Array(65536);
for(let i=1;i<pop.length;i++)pop[i]=pop[i>>>1]+(i&1);
const nameKey=name=>name.normalize('NFKC').trim().toLowerCase().replace(/[\s.\-_'’]/gu,'');
const aliases={
  nip:'Ninjas in Pyjamas',ninjasinpyjamas:'Ninjas in Pyjamas',ninjasinpajamas:'Ninjas in Pyjamas',
  pari:'PARIVISION',pv:'PARIVISION',her:'HEROIC',fazeclan:'FaZe',teamliquid:'Liquid',tl:'Liquid',
  ef:'Eternal Fire','100t':'100 Thieves',hundredthieves:'100 Thieves',team9z:'9z',
  imperialesports:'Imperial',imp:'Imperial',wc:'Wildcard',teamgosh:'GOSH',fq:'FlyQuest',
  cw:'Chinggis Warriors',lvg:'Lynn Vision',lynnvisiongaming:'Lynn Vision'
};

function decode(row,teams){
  const card=Array(16).fill(3),reasons=[];
  const members=new Map(teams.map((n,i)=>[nameKey(n),i]));
  for(const [short,name] of Object.entries(aliases))members.set(short,teams.indexOf(name));
  if(row.complete!==true)reasons.push('source-not-fully-verified');
  for(const [bucket,group] of labels.entries()){
    const values=row[group];
    if(!Array.isArray(values)||values.length!==sizes[bucket])reasons.push(group+'-count');
    for(const value of Array.isArray(values)?values:[]){
      const i=typeof value==='string'?members.get(nameKey(value)):undefined;
      if(i===undefined||i<0){reasons.push(group+'-unknown-name');continue;}
      if(card[i]!==3){reasons.push(group+'-duplicate');continue;}
      card[i]=bucket;
    }
  }
  return reasons.length?{card:null,reasons:[...new Set(reasons)]}:{card,reasons:[]};
}

function masks(card){
  assert.deepEqual([0,1,2,3].map(g=>card.filter(v=>v===g).length),[2,6,2,6]);
  const bits=[0,0,0];
  card.forEach((g,i)=>{if(g<3)bits[g]|=1<<i;});
  return bits;
}

function outcomes(card,stream){
  const bits=masks(card),histogram=Array(11).fill(0),passed=new Uint8Array(stream.length/3);
  for(let i=0;i<passed.length;i++){
    const j=3*i;
    const n=pop[bits[0]&stream[j]]+pop[bits[1]&stream[j+1]]+pop[bits[2]&stream[j+2]];
    histogram[n]++;passed[i]=Number(n>=5);
  }
  const passes=histogram.slice(5).reduce((a,b)=>a+b,0);
  return {histogram,passed,passes,passProbability:passes/passed.length,
    meanHits:histogram.reduce((a,v,i)=>a+v*i,0)/passed.length};
}

function diff(author,ours,teams){
  const byGroup={};let slots=0;
  for(const [g,key] of labels.entries()){
    const authorOnly=teams.filter((_,i)=>author[i]===g && ours[i]!==g);
    const frozenOnly=teams.filter((_,i)=>ours[i]===g && author[i]!==g);
    assert.equal(authorOnly.length,frozenOnly.length);
    slots+=authorOnly.length;byGroup[key]={authorOnly,frozenOnly};
  }
  return {differentSlots:slots,commonSlots:10-slots,changedTeamLabels:author.filter((g,i)=>g!==ours[i]).length,byGroup};
}

function paired(author,ours){
  let both=0;
  for(let i=0;i<author.passed.length;i++)both+=author.passed[i]&ours.passed[i];
  const n=author.passed.length,authorOnly=author.passes-both,frozenOnly=ours.passes-both;
  const delta=(authorOnly-frozenOnly)/n;
  const se=Math.sqrt(Math.max(0,((authorOnly+frozenOnly)/n-delta*delta)/(n-1)));
  return {frozenPasses:ours.passes,both,authorOnly,frozenOnly,neither:n-both-authorOnly-frozenOnly,
    authorMinusFrozenPp:delta*100,pairedMc95Pp:[(delta-1.96*se)*100,(delta+1.96*se)*100]};
}

function confirm(f,id,exact){
  const table=()=>Array.from({length:16},()=>Array(16).fill(.5));
  const matrix={bo1:table(),bo3:table(),allBo3:false};
  assert.equal(f.pairs.length,120);
  for(const {a,b,probs} of f.pairs){
    ['bo1','bo3'].forEach((key,j)=>{
      const p=probs[id][j];matrix[key][a][b]=p;matrix[key][b][a]=1-p;
    });
  }
  const seed=(f.seed^0xa58f309d)>>>0;
  const stream=CS.sampleTerminalMasks(matrix,f.confirmPaths,seed);
  const bytes=Buffer.from(stream.buffer,stream.byteOffset,stream.byteLength);
  const sha256=digest(bytes);assert.equal(sha256,exact[id].streams.confirm,id+' confirmation stream');
  const group=f.cards[id];
  const references={standard:group.standard,search:group.search};
  const expected={standard:group.standardConfirm,search:group.searchConfirm};
  group.topThree.forEach((v,i)=>{references['top'+(i+1)]=v.card;expected['top'+(i+1)]=v.confirmPasses;});
  const scores={};
  for(const [key,card] of Object.entries(references)){
    scores[key]=outcomes(card,stream);
    assert.equal(scores[key].passes,expected[key],id+' '+key+' frozen count');
  }
  return {stream,sha256,references,scores,seed};
}

function run(){
  require('../engine/engine.js');
  const f=load(),teams=f.teams.map(t=>t.name),exact=require('./exact.json').singapore;
  const sourceName='upstream-singapore.json',sourceBytes=fs.readFileSync(filename(sourceName));
  const source=JSON.parse(sourceBytes.toString('utf8').replace(/^\uFEFF/,''));
  const envelope=JSON.parse(fs.readFileSync(filename('singapore-forecast.json'),'utf8'));
  assert.equal(f.confirmPaths,60000);assert.equal(new Set(teams).size,16);
  const tests=Object.fromEntries(modelIds.map(id=>[id,confirm(f,id,exact)]));
  const rows=[];
  for(const method of ['elo','ml']){
    const supplied=source.methods[method]??[];
    assert(Array.isArray(supplied)&&supplied.length<=3);
    for(const rank of [1,2,3]){
      const hits=supplied.filter((v,i)=>(v.rank??i+1)===rank);
      assert(hits.length<=1,method+' duplicate Top'+rank);
      const row=hits[0]??{complete:false};
      const parsed=decode(row,teams);
      const rate=typeof row.rate==='string'?row.rate.trim():null;
      const numeric=rate?.match(/^(\d+(?:\.\d+)?)\s*[%％]$/u);
      const reportedProbability=numeric&&Number(numeric[1])<=100?Number(numeric[1])/100:null;
      const item={method,rank,reportedRate:row.rate??null,reportedProbability,sourceImage:row.sourceImage??null,
        status:parsed.card?'scored-in-frozen-simulations':'unavailable',
        unavailableReasons:parsed.reasons,card:parsed.card,groups:null,actualHits:null,models:null};
      if(parsed.card){
        item.groups=Object.fromEntries(labels.map((k,g)=>[k,teams.filter((_,i)=>parsed.card[i]===g)]));
        item.models={};
        for(const [id,test] of Object.entries(tests)){
          const v=outcomes(parsed.card,test.stream),refs={};
          for(const [name,card] of Object.entries(test.references))refs[name]={
            ...diff(parsed.card,card,teams),...paired(v,test.scores[name])
          };
          item.models[id]={passes:v.passes,passProbability:v.passProbability,meanHits:v.meanHits,
            hitHistogram:v.histogram,references:refs};
        }
      }
      rows.push(item);
    }
  }
  return {source:source.source,author:source.author,published:source.published??null,
    observedAt:source.observedAt??null,sourceFile:sourceName,sourceSha256:digest(sourceBytes),
    frozenAt:f.frozenAt,forecastSha256:envelope.sha256,teams,pathsPerModel:f.confirmPaths,
    confirmationSeed:tests.baseline.seed,confirmationStreams:Object.fromEntries(modelIds.map(id=>[id,tests[id].sha256])),
    eligibleCards:rows.filter(r=>r.card).length,expectedRows:6,rows};
}
module.exports={decode,diff,outcomes,paired,confirm,run};
if(require.main===module){
  const out=run(),dest=filename('upstream-audit.json'),json=JSON.stringify(out,null,2)+'\n';
  if(process.argv.includes('--check'))assert.equal(fs.readFileSync(dest,'utf8'),json);
  else fs.writeFileSync(dest,json);
  console.log(out.eligibleCards+' / 6 complete cards scored; all four 60,000-path streams and all frozen reference counts reproduced.');
}
