'use strict';
const assert = require('node:assert/strict');
const legacy = require('./legacy.json');
const sigmoid = x => 1 / (1 + Math.exp(-x));
const logit = p => Math.log(p / (1-p));
const dot = (a,b) => a.reduce((acc,v,i)=>acc + v*b[i],0);

function csgoSeries(event) {
  assert.ok(event.lastPriorMajor < event.start && event.start <= event.end);
  return event.series.flatMap(({w,l,bo}) => {
    const a = event.teams[w], b = event.teams[l];
    if (!a.verifiedOn || !b.verifiedOn || !a.vector || !b.vector) return [];
    assert.ok(a.verifiedOn < event.start && b.verifiedOn < event.start);
    const p = sigmoid(a.strength - b.strength);
    // The pre-event strength rating predicts a single map. Three-map series
    // use the independent fair-map baseline before applying a series residual.
    const s = bo === 1 ? p : p*p*(3-2*p);
    return [{offset:logit(s), x:a.vector.map((v,i)=>v-b.vector[i])}];
  });
}

function metrics(records) {
  assert.ok(records.length);
  const avg = f => records.reduce((s,r)=>s+f(r),0)/records.length;
  const brier = key => avg(r=>(1-sigmoid(r[key]))**2);
  const loss = key => avg(r=>Math.log1p(Math.exp(-r[key])));
  return {n:records.length, baseBrier:brier('offset'), shiftBrier:brier('shifted'),
    baseLogLoss:loss('offset'), shiftLogLoss:loss('shifted')};
}

function shifted(rows, beta) {
  return rows.map(({offset,x})=>({offset,shifted:offset+dot(x,beta)}));
}

function testCS2(beta, cutoff) {
  // Reserve the final calendar block intact. Use the earlier block only to fit
  // one VRS-to-series log-odds slope with no intercept. No target Major rows.
  const rows = legacy.transfer;
  assert.ok(rows.every((r,i)=>r.date < cutoff && r.date >= '2023-09-27' &&
    (i===0 || r.date >= rows[i-1].date) && (r.y===0 || r.y===1)));
  const boundary = rows[Math.floor(rows.length*.6)].date;
  const early = rows.filter(r=>r.date < boundary), late = rows.filter(r=>r.date >= boundary);
  assert.ok(early.length>=50 && late.length>=50 && early.at(-1).date < late[0].date);
  let slope = 0;
  for(let i=0;i<30;i++) {
    let grad=.1*slope, hess=.1;
    for(const {vrs,y} of early) {
      const p = sigmoid(slope*vrs);
      grad += vrs*(p-y);
      hess += vrs*vrs*p*(1-p);
    }
    const delta = grad/hess;
    slope -= delta;
    if(Math.abs(delta) < 1e-11) break;
  }
  const records = late.map(r=>{
    const sign = r.y ? 1 : -1;
    return {offset:sign*slope*r.vrs, shifted:sign*(slope*r.vrs+dot(r.x,beta))};
  });
  return {...metrics(records),baselineFit:early.length, firstTest:boundary,
    lastTest:late.at(-1).date, baselineSlope:slope};
}

function legacyPrior(fit, cutoff) {
  assert.ok(legacy.sourceCommitDate < cutoff && legacy.rosterSourceDate < cutoff);
  const past=[], holdout=[], editions=[];
  const halfFit = r=>fit(r).map(x=>x*.5);
  let lastEnd = '';
  for(const event of legacy.events) {
    assert.ok(lastEnd < event.start && event.end < cutoff);
    const rows = csgoSeries(event);
    if(past.length) holdout.push(...shifted(rows,halfFit(past)));
    past.push(...rows);
    lastEnd = event.end;
    editions.push(event.name);
  }
  const candidate = halfFit(past);
  const csgo = metrics(holdout), cs2 = testCS2(candidate, cutoff);
  // Fixed gate, conditioned only on data which existed before Copenhagen.
  const improved = m=>m.shiftBrier < m.baseBrier && m.shiftLogLoss < m.baseLogLoss;
  const enabled = improved(csgo) && improved(cs2);
  const note = '哥本哈根是首届 CS2 Major。已补入此前 '+editions.length+' 届 CS:GO Major 的 '+past.length+
    ' 场首阶段比赛，并用 '+cs2.n+' 场赛前 CS2 非 Major 比赛检验跨版本效果。'+
    (enabled?'两组检验均改善，经验项采用减半的跨版本系数。':'跨版本启用条件未满足，经验修正保留为零。');
  return {beta:enabled?candidate:[0,0,0],candidateBeta:candidate, trainingMatches:past.length,cs2Matches:0,
    legacyMatches:past.length,legacyEditions:editions,coefficientSource:enabled?'csgo-transfer':'csgo-transfer-gated',
    validation:{csgo, cs2},transferWeight:enabled ? .5 : 0, note, sources:[
      {title:'2021–2023 Major 地图与比赛档案（GitHub 固定版本）',url:legacy.source},
      {title:'Major 实际出场选手名册',url:legacy.rosterSource}]};
}
module.exports={legacyPrior};
