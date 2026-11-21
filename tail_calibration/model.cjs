'use strict';
const assert = require('node:assert/strict');

const logistic = x => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
const logOdds = p => Math.log(p) - Math.log1p(-p);
const elo = (a, b) => logistic((a-b) * Math.LN10 / 400);

function slope(rows) {
  if (!rows.length) return 1;
  const inputs = rows.map(({p,y}) => {
    assert(p > 0 && p < 1 && (y === 0 || y === 1));
    return {x: logOdds(p), y};
  });
  const derivative = b => inputs.reduce((sum,{x,y}) => sum + x * (logistic(b*x)-y), 4*(b-1));
  let lo = 0.05, hi = 4;
  if (derivative(lo) >= 0) return lo;
  if (derivative(hi) <= 0) return hi;
  for (let i = 0; i < 54; i++) {
    const m = (hi + lo) / 2;
    if (derivative(m) > 0) hi = m;
    else lo = m;
  }
  return (hi + lo) / 2;
}

function calibrated(p, b) {
  assert(p > 0 && p < 1 && Number.isFinite(b) && b > 0);
  if (b === 1) return p;
  const epsilon = Number.EPSILON / 2;
  return Math.min(1-epsilon, Math.max(epsilon, logistic(b * logOdds(p))));
}

function calibrateMatrix(matrix, b) {
  if (b === 1) return matrix;
  const bo3 = matrix.bo3.map(r => r.slice());
  for (let i = 0; i < bo3.length; i++) for (let j = i+1; j < bo3.length; j++) {
    bo3[i][j] = calibrated(matrix.bo3[i][j], b);
    bo3[j][i] = 1 - bo3[i][j];
  }
  return {...matrix, bo3};
}

const lowerEdges = [.5,.6,.7,.8,.9];
function bin(winnerBaseline, winnerCalibrated) {
  if (winnerBaseline === .5) return {index:5, expected:0, after:0, actual:0};
  const favorite = Math.max(winnerBaseline, 1-winnerBaseline);
  const index = lowerEdges.findLastIndex(x => favorite >= x);
  return {index, expected:1-favorite, after:Math.min(winnerCalibrated,1-winnerCalibrated), actual:Number(winnerBaseline < .5)};
}

module.exports = {elo, slope, calibrated, calibrateMatrix, bin};
