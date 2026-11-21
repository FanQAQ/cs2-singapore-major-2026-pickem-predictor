'use strict';
const fs=require('node:fs'), path=require('node:path'), zlib=require('node:zlib');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const read=file=>fs.readFileSync(path.join(__dirname,file));
const json=file=>JSON.parse(file.endsWith('.gz')?zlib.gunzipSync(read(file)):read(file));
const millis=86400000;
const day=text=>Date.parse(text.slice(0,10)+'T00:00:00Z')/millis;
const prob=diff=>1/(1+10**(-diff/400));
const fit=json('elo.json.gz'), history=json('elo-data.json.gz');
assert.equal(Object.keys(fit.fields).length,15);
for(const [f,sha] of Object.entries(fit.inputSha256))assert.equal(createHash('sha256').update(read(f)).digest('hex'),sha);
const examples=[];
for(const f of Object.values(fit.fields)){
  assert.equal(day(f.cutoffExclusive)-day(f.anchor),180);
  assert(day(f.ranking.published)<day(f.anchor));
  const games=history.rows.filter(g=>{
    const slack=Number(g.id.startsWith('ektarr:')), d=day(g.day);
    return d-slack>=day(f.anchor) && d+slack+1<day(f.cutoffExclusive) && !/cluj.*2026|2026.*cluj/i.test(g.event);
  });
  assert.equal(f.coverage.series,games.length);
  assert.equal(f.coverage.maps,games.reduce((s,g)=>s+g.maps.length,0));
  assert.equal(new Set(games.map(g=>g.id)).size,games.length);
  assert.deepEqual(f.teams,f.entrants.map(t=>t.name));
  assert.deepEqual(f.entrants.map(t=>t.seed),Array.from({length:16},(_,i)=>i+1));
  for(const t of f.entrants){
    assert(!t.games || t.lastCoreOverlap>=3);
    assert.equal(t.ratingSeries.length,new Set(t.ratingSeries).size);
    if(t.ratingSeries.length)assert(day(t.ratingAvailableThrough)<day(f.anchor));
    else assert.equal(t.ratingPrior,1);
    let expected;
    if(t.anchorPoints!==null) {
      const z=(t.anchorPoints-f.ranking.mean)/f.ranking.sd;
      const rank=Math.min(1600,Math.max(400,1000+200*z));
      const trust=Math.min(1,Math.max(.2,(z+1)/2));
      expected=.7*rank+.3*(1000+Math.min(60,Math.max(-60,150*(t.ratingPrior-1)*trust)));
    } else {
      const influence=t.ratingSeries.length<10?40:t.ratingSeries.length<30?25:15;
      expected=f.ranking.noVrsElo+Math.min(influence,Math.max(-influence,(t.ratingPrior-1)*10*influence));
    }
    assert(Math.abs(expected-t.initialElo)<1e-9);
  }
  for(const [key,sd] of [['bo1',60],['bo3',35]])for(let i=0;i<16;i++){
    assert.equal(f[key][i][i],.5);
    for(let j=i+1;j<16;j++){
      const diff=(f.entrants[i].elo-f.entrants[j].elo)*f.scale;
      // Independent normal integration using a shifted grid and a wider interval.
      let total=0,weight=0;
      for(let step=0;step<400;step++){
        const z=-10+(step+.5)*.05, w=Math.exp(-z*z/2);
        total+=w*prob(diff+Math.SQRT2*sd*z); weight+=w;
      }
      const p=f[key][i][j];assert(p>0&&p<1);assert(Math.abs(total/weight-p)<1e-12);
      assert.equal(f[key][j][i],1-p);
    }
  }
  examples.push([f.id,f.coverage.series,f.coverage.entrantsWithRatingPrior]);
}
const sharks=fit.fields.singapore.entrants.find(t=>t.name==='DENDELE');
assert.equal(sharks.anchorTeam,'Sharks');assert.equal(sharks.anchorPoints,1334);
assert.equal(sharks.lastCoreOverlap,5);
console.log(JSON.stringify({stages:examples.length,pairFormatProbabilities:examples.length*120*2,coverage:examples}));
