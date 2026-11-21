'use strict';
const assert=require('node:assert/strict');
require('./model.js');
const pool=['Ancient','Anubis','Cache','Dust2','Inferno','Mirage','Nuke'];
const keyed=fn=>Object.fromEntries(pool.map((map,k)=>[map,fn(k)]));
const rates=(n,ban,pick)=>({n,ban:keyed(ban),pick:keyed(pick),
  banOpportunities:keyed(()=>100),pickOpportunities:keyed(()=>100)});
function fixture() {
  const a=rates(40,i=>i===0?96:1,i=>i===0?75:4);
  const b=rates(30,i=>i===0?98:1,i=>i===3?90:3);
  const strength=sign=>({n:70,maps:keyed(i=>({n:10,logitOffset:sign*(i===0?.6:-.1)}))});
  return {asOf:'2026-11-02',teams:[{name:'A'},{name:'B'}],
    mapStrength:{pool,asOf:'2026-11-02',teams:{A:strength(1),B:strength(-1)}},
    mapVeto:{pool:[...pool].reverse(),asOf:'2026-11-02',teams:{A:{bo1:a,bo3:a},B:{bo1:b,bo3:b}}}};
}
const apply=(event,bo,base=.66)=>PickMap.apply(event,0,1,bo,base);
const close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
const e=fixture();
// Independent full permutations identify the sole survivor or all three planned maps.
function vetoOracle(bo,lastBansAB=false) {
  const profiles=['A','B'].map(t=>e.mapVeto.teams[t]['bo'+bo]);
  const actors=bo===1?[0,0,1,1,1,0]:lastBansAB?[0,1,0,1,0,1]:[0,1,0,1,1,0];
  const actions=bo===1?Array(6).fill('ban'):['ban','ban','pick','pick','ban','ban'];
  const w=profiles.map(row=>Object.fromEntries(['ban','pick'].map(action=>{
    const count=Object.values(row[action]).reduce((a,b)=>a+b,0);
    return [action,keyed(i=>(row[action][pool[i]]+4*count/700)/104)];
  })));
  const out=new Map();
  function recurse(order,remaining,prob,first) {
    if(remaining.length===1){
      const played=bo===1?remaining:[order[2],order[3],remaining[0]];
      const key=played.sort().join('/');
      out.set(key,(out.get(key)||0)+prob);
      return;
    }
    const step=order.length,weight=w[actors[step]^first][actions[step]];
    const denom=remaining.reduce((s,m)=>s+weight[m],0);
    for(const m of remaining) recurse([...order,m],remaining.filter(x=>x!==m),prob*weight[m]/denom,first);
  }
  recurse([],pool,.5,0);recurse([],pool,.5,1);
  return out;
}
for(const bo of [1,3]) {
  const forecast=apply(e,bo);
  const reverse=PickMap.apply(e,1,0,bo,.34);
  close(forecast.probability+reverse.probability,1);
  assert.equal(forecast.status,'both');
  assert.equal(forecast.sharedMaps,7);
  assert.deepEqual(forecast.vetoN,reverse.vetoN.slice().reverse());
  const oracle=vetoOracle(bo);
  assert.equal(oracle.size,bo===1?7:35);
  let withVeto=0,uniform=0;
  for(const [key,mass] of oracle) {
    const win=key.split('/').map(m=>forecast.maps.find(x=>x.name===m).mapWin);
    const [p,q,r]=win;
    const series=bo===1?p:p*q+p*(1-q)*r+(1-p)*q*r;
    withVeto+=mass*series;
    uniform+=series/oracle.size;
  }
  close(withVeto,forecast.probability);
  close(uniform,.66);
  for (const [k,m] of forecast.maps.entries()) {
    close(m.mapWin+reverse.maps[k].mapWin,1);
    const selection=[...oracle].reduce((s,[key,mass])=>s+(key.split('/').includes(m.name)?mass:0),0);
    close(m.selection,selection);
    assert.ok(m.selection>=0 && m.selection<=1);
  }
  close(forecast.maps.reduce((s,m)=>s+m.selection,0),bo);
  assert.ok(forecast.maps[0].selection<1/7); // Both teams frequently remove Ancient.
  assert.ok(forecast.probability<.66);
  const noVeto=fixture();noVeto.mapVeto.teams={};
  assert.equal(apply(noVeto,bo).probability,.66);assert.equal(apply(noVeto,bo).status,'no-veto');
  const one=fixture();delete one.mapVeto.teams.A;
  assert.equal(apply(one,bo).status,'one');
  const wrongPool=fixture();wrongPool.mapVeto.pool=['wrong',...pool.slice(1)];
  assert.equal(apply(wrongPool,bo).status,'invalid-pool');
  const late=fixture();late.mapVeto.asOf='2026-11-03';
  assert.equal(apply(late,bo).probability,.66);
  const sparse=fixture();sparse.mapStrength.teams.A.maps={};
  assert.equal(apply(sparse,bo).status,'no-strength');
  const flat=fixture();flat.mapStrength.teams.B=flat.mapStrength.teams.A;
  assert.equal(apply(flat,bo).probability,.66);
  const unbiased=fixture();for (const t of ['A','B']) unbiased.mapVeto.teams[t]['bo'+bo]=rates(20,()=>2,()=>1);
  assert.equal(apply(unbiased,bo).probability,.66);
  assert.equal(apply(e,bo,0).probability,0);
  assert.equal(apply(e,bo,1).probability,1);
}
const esl=fixture();
esl.mapVeto.lastBansAB=true;
for(const bo of [1,3]) {
  const distribution=vetoOracle(bo,true), forecast=apply(esl,bo);
  for(const {name,selection} of forecast.maps) {
    const expected=[...distribution].filter(([maps])=>maps.split('/').includes(name)).reduce((n,[,mass])=>n+mass,0);
    close(selection,expected);
  }
}
console.log('Major and ESL veto sequences, seven map exposures, uniform anchors, symmetry and fallbacks verified.');
