'use strict';
// Re-score the public output without invoking the Swiss simulator or its card scoring functions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const cards=require('./cards.json'),bytes=fs.readFileSync(path.join(__dirname,'models.json.gz'));
const models=JSON.parse(gunzipSync(bytes)).fields;
assert.equal(createHash('sha256').update(bytes).digest('hex'),cards.modelSha256);
const methods=['original','candidate'],policies=['standard','pure','tailOnly'];
const close=(x,y)=>assert(Math.abs(x-y)<1e-8,x+' differs from '+y);
let games=0,scoredCards=0,withdrawals=0;
for(const f of cards.fields){
  const model=models[f.id],names=model.teams;
  assert.deepEqual(f.teams.slice().sort(),names.slice().sort());assert.equal(f.teams.length,16);
  if(f.actual){assert.equal(f.matched,33);assert.equal(f.matches.length,33);assert.equal(f.actual.filter(c=>c===2).length,2);}
  else {assert.equal(f.id,'singapore');assert.equal(f.matched,null);assert.equal(f.matches.length,0);}
  for(const arm of methods){
    const m=arm==='original'?model.baseline:model.candidate,body=f.arms[arm];
    for(const format of [1,3]){
      const key='bo'+format,rows=f.matches.filter(g=>g.played && g.bo===format);
      const err=body.errors[key];assert.equal(err.n,rows.length);
      if(arm==='original')games+=rows.length;
      let bs=0,ll=0;
      for(const game of rows){
        const i=names.indexOf(f.teams[game.w]),j=names.indexOf(f.teams[game.l]),p=m[key][i][j];
        assert.equal(p,game.winnerProbability[arm]);bs+=(1-p)**2;ll-=Math.log(p);
      }
      if(rows.length){close(err.brier,bs/rows.length);close(err.logLoss,ll/rows.length);}
      else {assert.equal(err.brier,null);assert.equal(err.logLoss,null);}
    }
    close(body.main.teams.reduce((sum,t)=>sum+t.zero,0),2);
    if(f.actual){
      const brier=body.main.teams.reduce((sum,t,i)=>sum+(t.zero-Number(f.actual[i]===2))**2,0)/16;
      close(body.main.zeroBrier,brier);
    }else assert.equal(body.main.zeroBrier,null);
    assert.deepEqual(body.runs.map(r=>r.seed),cards.seeds);
    for(const run of body.runs){
      assert.deepEqual(run.cards.pure.card.map(c=>c<2),run.cards.standard.card.map(c=>c<2));
      assert.deepEqual(run.cards.tailOnly.card.map(c=>c<2?c:3),run.cards.standard.card.map(c=>c<2?c:3));
      for(const policy of policies){
        const c=run.cards[policy],indices=slot=>c.card.map((v,i)=>v===slot?i:null).filter(i=>i!==null);
        assert.deepEqual([0,1,2,3].map(v=>indices(v).length),[2,6,2,6]);
        assert(Number.isFinite(c.simulatedPass) && c.simulatedPass>=0 && c.simulatedPass<=1);
        if(!f.actual){assert.equal(c.hits,null);assert.equal(c.falseZeroQualified,null);continue;}
        const slots=[0,1,2].map(v=>indices(v).filter(i=>v===f.actual[i]).length);
        assert.deepEqual(slots,c.slots);assert.equal(c.hits,slots.reduce((a,b)=>a+b));
        assert.equal(c.passed,c.hits>=5);assert.deepEqual(c.falseZeroQualified,indices(2).filter(i=>f.actual[i]<2));
        scoredCards++;
      }
    }
  }
  withdrawals+=f.matches.filter(r=>!r.played).length;
}
for(const [group,o] of Object.entries(cards.groups)){
  const fields=cards.fields.filter(f=>f.group===group && f.actual);
  assert.equal(o.n,fields.length);
  for(const arm of methods)for(const policy of policies){
    const x=o.arms[arm].cards[policy];
    for(const [i] of cards.seeds.entries()){
      const rs=fields.map(f=>f.arms[arm].runs[i].cards[policy]);
      assert.equal(x.passesBySeed[i],rs.filter(r=>r.hits>=5).length);
      assert.equal(x.hitsBySeed[i],rs.reduce((sum,r)=>sum+r.hits,0));
    }
    const rows=fields.map(f=>f.arms[arm].main.cards[policy]);
    assert.equal(x.falseZeroQualified,rows.reduce((sum,c)=>sum+c.falseZeroQualified.length,0));
  }
}
assert.equal(cards.fields.length,21);assert.equal(withdrawals,1);assert.equal(games,659);
assert.equal(scoredCards,3600);console.log(JSON.stringify({completed:20,games,withdrawals,scoredCards}));
