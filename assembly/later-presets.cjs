'use strict';
// Use the same worker entry point as the sidebar to keep saved and live scores identical.
const path = require('node:path');
const assert = require('node:assert/strict');
const dist = path.resolve(__dirname, '../dist');
globalThis.self = globalThis;
globalThis.importScripts = (...files) => {
  for (const name of files) require(path.join(dist, name));
};
importScripts('history-worker.js');
const history = PickHistory;
assert.equal(history.events.length, 13, 'five opening stages plus eight subsequent Swiss stages');
const presets = {};
for (const event of PickLab.allEvents.filter(e => e.hasResults)) {
  const scores = {};
  for (const methodDefault of ['recommended','tree']) {
    for (const seedConditionalCard of [false,true]) {
      for (const stageTraining of [false,true]) {
        if (!stageTraining && !(event.stage > 1)) continue;
        const key = methodDefault + (seedConditionalCard ? 'SeedConditional' : '') + (stageTraining ? 'StageTraining' : '');
        scores[key] = history.scoreEvent(event.id, {methodDefault,seedConditionalCard,stageTraining}).scores;
        if (methodDefault==='recommended' && seedConditionalCard && event.stage===3) {
          scores[key+'GroupCard'] = history.scoreEvent(event.id,{methodDefault,seedConditionalCard,stageTraining,stage3Allocation:true}).scores;
        }
      }
    }
  }
  presets[event.id] = scores;
}
process.stdout.write(JSON.stringify(presets));
