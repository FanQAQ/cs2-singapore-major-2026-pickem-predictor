// Independent checks against raw leaderboard rows and the published pre-feature adapter.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
const {root,strategies} = require('../integrated_eval/runtime.cjs');
require(path.join(root,'dist','region-vrs.js'));
const site = PickLab;
require(path.join(root,'forecast_archive/runtime-integrated/adapter.js'));
const original = PickLab;
const raw = JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'region_vrs_data/tables.json.gz'))));
const normalize = name=>name.normalize('NFKC').trim().toLowerCase();
const counts = {pairFormats:0,trainedEffects:0,sameRegion:0,removedFromTopTen:0};

// Work directly from the complete official regional lists. The model stores the
// first eleven rows because ten other teams suffice even when the target is first.
function checkPeers(rows, entrant, result) {
  const target = new Set(entrant.roster.map(normalize));
  const peers = rows.filter(([, , names])=>names.filter(n=>target.has(normalize(n))).length<3);
  const all = [...rows].sort((a,b)=>b[0]-a[0]);
  peers.sort((a,b)=>b[0]-a[0]);
  assert.equal(result.depth,(peers[4][0]+peers[5][0])/2,entrant.name);
  const removed = all.slice(0,10).some(r=>!peers.includes(r));
  assert.equal(result.excludedSelf,removed,entrant.name);
  counts.removedFromTopTen+=Number(removed);
}

for (const event of site.events) {
  const model = event.regionVrsModel;
  assert.ok(model && model.asOf<=event.asOf && event.asOf<event.date.slice(0,10));
  const rows = raw[model.asOf];
  assert.equal(model.officialGlobal,Array.isArray(rows.global));
  for (const entrant of event.teams) {
    const profile = model.teams[entrant.name];
    if (profile.region) checkPeers(rows[profile.region],entrant,profile);
  }
  for (const flags of [strategies.base,strategies.region,strategies.combined,{...strategies.base,mapVeto:true}]) {
    const reference=original.seriesMatrices(event,flags);
    assert.deepEqual(site.seriesMatrices(event,flags),reference);
    assert.deepEqual(site.seriesMatrices(event,{...flags,regionVrs:false}),reference);
  }
  for (const flags of [strategies.base,strategies.region]) {
    for (let i=0;i<event.teams.length;i++) for(let j=i+1;j<event.teams.length;j++) {
      const base=original.duel(event.id,flags,i,j);
      const result=site.duel(event.id,{...flags,regionVrs:true},i,j);
      for (const format of ['BO1','BO3']) {
        const correction=result['regionVrs'+format];
        const baseline=base[format.toLowerCase()];
        const hasLan=!!base['region'+format]?.active;
        assert.equal(correction.variant,hasLan?'withLan':'solo');
        assert.equal(correction.base,baseline);
        if(correction.active) {
          const {unitPoints,maxGap}=model;
          const gap=(correction.left.depth-correction.right.depth)/unitPoints;
          const term=Math.max(-maxGap,Math.min(maxGap,gap))*model.variants[correction.variant].coefficient;
          const adjusted=1/(1+Math.exp(-Math.log(baseline/(1-baseline))-term));
          assert.ok(Math.abs(result[format.toLowerCase()]-adjusted)<1e-12);
          counts.trainedEffects++;
        } else {
          assert.equal(result[format.toLowerCase()],baseline);
          if(correction.reason==='same-region') counts.sameRegion++;
        }
        counts.pairFormats++;
      }
    }
  }
  // The caller can have a stronger fresh-cutoff view. Conversely an archived
  // older view cannot consume a future regional snapshot or the wrong five.
  const p=0.58;
  const earlier={...event,asOf:'1900-01-01'};
  assert.equal(PickRegionVrs.apply(earlier,0,1,p).probability,p);
  const switchedFive={...event,teams:event.teams.map((t,i)=>i ? t : {...t,roster:t.roster.map((_,k)=>'test-'+k)})};
  assert.equal(PickRegionVrs.apply(switchedFive,0,1,p).active,false);
}
assert.ok(counts.sameRegion>0 && counts.removedFromTopTen>0);
console.log('Published settings, peer depth, time, lineup and per-format incremental adjustments verified.',counts);
