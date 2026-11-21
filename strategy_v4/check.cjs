/* Cross-check all v4 feature combinations through the production adapter. */
'use strict';
const assert = require('node:assert/strict');
for (const file of ['engine','data','format','style-model','rolling','boost','v4','adapter'])
  require('../dist/'+file+'.js');
const sigmoid = x => 1 / (1 + Math.exp(-x));
const close = (x,y) => assert.ok(Math.abs(x-y)<1e-12, x+' != '+y);
let pairs = 0, missingRoundPairs = 0;
for (const event of PickLab.events) {
  const model = event.v4Model;
  assert.ok(model.asOf < event.date.slice(0,10));
  for (let mask=0;mask<16;mask++) {
    const flags = {family:'v4',form:!!(mask&1),strong:!!(mask&2),weak:!!(mask&4),
      roundMargin:!!(mask&8),format:false};
    const [wVrs,wForm,wStrong,wWeak,wRound] = model.masks[mask].beta;
    const matrix = PickLab.matrixFor(event,flags);
    for(let i=0;i<16;i++) for(let j=i+1;j<16;j++) {
      const left=event.teams[i],right=event.teams[j];
      const a=model.teams[left.name],b=model.teams[right.name];
      const gap=(left.points-right.points)/100;
      const p=sigmoid(model.calibrationSlope*gap);
      const margin=a.nRound && b.nRound ? a.round-b.round : 0;
      const logit = wVrs*gap + wForm*(a.form-b.form)
        + wStrong*((1-p)*a.strong-p*b.strong) + wWeak*(p*a.weak-(1-p)*b.weak) + wRound*margin;
      close(matrix[i][j],sigmoid(logit));
      close(matrix[i][j]+matrix[j][i],1);
      close(PickLab.duel(event.id,flags,i,j).bo3,matrix[i][j]);
      pairs++;
      if(mask===15 && (!a.nRound || !b.nRound)) missingRoundPairs++;
    }
  }
  const flags={...PickV4.preset,fresh:true,seedPrior:true,experience:true,h2h:true};
  const series=PickLab.seriesMatrices(event,flags);
  for(let i=0;i<16;i++) for(let j=i+1;j<16;j++){
    const duel=PickLab.duel(event.id,flags,i,j);
    close(duel.bo1,series.bo1[i][j]);
    close(duel.bo3,series.bo3[i][j]);
    close(duel.bo3+PickLab.duel(event.id,flags,j,i).bo3,1);
  }
  const locked = PickLab.setWinner([],1,0,0);
  const run = PickLab.run(event.id,{...flags,locks:locked},250);
  assert.equal(run.path.lockedCount,1);
  close(run.matchups.bo1[0][8],series.bo1[0][8]);
  assert.equal(typeof run.compareCards,'function');
}
assert.ok(missingRoundPairs>0);
console.log(pairs+' v4 feature-mask pair predictions verified, including sparse matchups and locked paths.');
