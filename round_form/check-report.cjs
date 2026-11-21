'use strict';
const assert = require('node:assert/strict');
const {seeds, stages} = require('./report.json');
const {byStage, coverage} = require('./summary.json');
const methods = ['base', 'series', 'mapScore', 'roundShare'];
const near = (observed, expected, tolerance=1e-8) => assert(Math.abs(observed-expected)<tolerance);
const categories = assignments => [0, 1, 2, 3].map(c => assignments.filter(x => x===c).length);
let nPairs = 0, nCards = 0;
assert.equal(seeds.length,30);
assert.equal(new Set(seeds).size,30);

for (const stage of stages) {
  const names = stage.teams.map(t=>t.name);
  const pairs = new Map(stage.probabilities.map(row=>[row.a+'|'+row.b,row]));
  assert.equal(pairs.size,120);
  assert.deepEqual(categories(stage.actual),[2,6,2,6]);
  const info = coverage[stage.id];
  assert.equal(info.withPrior,33);
  assert.equal(info.eligibleTeams,8);
  assert.equal(stage.matches.length+stage.administrativeExcluded.length,33);
  assert(stage.donorRows.every(r=>r.day<stage.start));
  for (const method of methods) {
    const metrics = byStage[stage.id][method];
    for (const bo of [1,3]) {
      const probabilities = stage.matches.filter(g=>g.bo===bo).map(g => {
        const i = Math.min(g.w,g.l), j = Math.max(g.w,g.l);
        const row = pairs.get(names[i]+'|'+names[j]);
        const direct = bo===1 ? row.bo1 : row.bo3[method];
        const p = i===g.w ? direct : 1-direct;
        near(p, g.winProbability[method]);
        return p;
      });
      const metric = metrics.errors['bo'+bo];
      assert.equal(metric.n,probabilities.length);
      if (probabilities.length) {
        near(probabilities.reduce((n,p)=>n+(1-p)**2,0)/metric.n,metric.brier);
        near(probabilities.reduce((n,p)=>n-Math.log(p),0)/metric.n,metric.logLoss);
      } else assert.equal(metric.brier,null);
    }
    const rows = stage.records[method].rows;
    assert.deepEqual(rows.map(r=>r.seed),seeds);
    for (const [index,row] of rows.entries()) {
      assert.deepEqual(categories(row.card),[2,6,2,6]);
      const bySlot = [0,1,2].map(c=>stage.actual.reduce((n,v,i)=>n+Number(v===c && row.card[i]===c),0));
      assert.deepEqual(bySlot,row.bySlot);
      assert.equal(row.hits,bySlot.reduce((n,h)=>n+h,0));
      assert.equal(metrics.hits[index],row.hits);
      assert.equal(metrics.passes[index],Number(row.hits>=5));
      assert(row.simulatedPass>=0 && row.simulatedPass<=1);
      nCards++;
    }
  }
  nPairs += pairs.size;
}
assert.equal(nPairs,600);
assert.equal(nCards,600);
console.log('600 pairwise entries, 600 complete cards and five stages of BO1/BO3 errors verified.');
