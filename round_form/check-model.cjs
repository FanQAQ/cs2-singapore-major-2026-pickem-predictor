'use strict';
const assert = require('node:assert/strict');
const {mapProbability, mapMeans, residual} = require('./model.cjs');

// Independent forward recursion over actual scorelines. Each tied phase enters another overtime.
function enumerateMaps(p) {
  const mass = [0, 0], weightedShare = [0, 0];
  let queue = new Map([['0/0', 1]]);
  while (queue.size) {
    const next = new Map();
    for (const [score, probability] of queue) {
      const [a,b] = score.split('/').map(Number);
      for (const [x,y,q] of [[a + 1,b,p],[a,b + 1,1 - p]]) {
        const lo = Math.min(x,y), hi = Math.max(x,y), weight = probability * q;
        const finished = lo < 12 ? hi === 13 : hi === 16 + 3 * Math.floor((lo - 12) / 3);
        if (finished) {
          const i = Number(x > y);
          mass[i] += weight;
          weightedShare[i] += weight * x / (x + y);
        } else if (weight > 1e-20) {
          const id = x + '/' + y;
          next.set(id,(next.get(id) || 0) + weight);
        }
      }
    }
    queue = next;
  }
  assert(Math.abs(mass[0] + mass[1] - 1) < 1e-12);
  return {mapWin:mass[1],win:weightedShare[1]/mass[1],loss:weightedShare[0]/mass[0]};
}

for (const p of [.28,.43,.5,.57,.72]) {
  const direct = enumerateMaps(p), model = mapMeans(direct.mapWin);
  assert(Math.abs(mapProbability(p) - direct.mapWin) < 1e-12);
  for (const side of ['win','loss']) assert(Math.abs(model[side] - direct[side]) < 1e-10);
}
const two = [['Mirage',16,14],['Nuke',13,2]];
for (const p of [.18,.5,.87]) {
  for (const maps of [two.slice(0,1),two,[two[0],['Dust2',11,13],two[1]]]) {
    const bo = maps.length === 1 ? 1 : 3;
    const score = [Math.ceil(bo/2),maps.length - Math.ceil(bo/2)];
    const a = residual(p,bo,1,score,maps);
    const b = residual(1-p,bo,0,score.slice().reverse(),maps.map(([m,x,y]) => [m,y,x]));
    for (const k of ['roundResidual','mapResidual']) assert(Math.abs(a[k] + b[k]) < 1e-11);
    if (bo === 1) assert.equal(a.mapResidual,0);
  }
}
assert.throws(() => residual(.6,1,1,[1,0],[['Mirage',13,12]]));
console.log('MR12/MR3 outcome mass and conditional means verified by independent scoreline recursion.');
