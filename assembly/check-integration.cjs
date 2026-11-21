"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dist = path.join(__dirname, "../dist");
for (const name of ["engine", "format", "style-model", "rolling", "boost", "data", "adapter"]) require(path.join(dist,name+".js"));
const historicalEvents = PickLab.events.filter(event=>event.hasResults);
assert.deepEqual(historicalEvents.map(e=>e.id).sort(),["austin","budapest","cologne","copenhagen","shanghai"]);
assert.deepEqual(PickLab.events.filter(e=>!e.hasResults).map(e=>e.id),["singapore"]);
const flags = {form:true,strong:true,weak:true,format:true};
let differentiatingPairs = 0, directionalReversals = 0;
for (const event of PickLab.events) {
  const matrices = PickLab.seriesMatrices(event,flags);
  const scenario = PickStyle.empty();
  const [first,second] = event.teams;
  scenario.assignments[first.name] = "duel";
  scenario.assignments[second.name] = "system";
  scenario.edges["duel:system"] = 10;
  const control = PickLab.duel(event.id,flags,0,1);
  const customized = {...flags,style:true,h2h:true,scenario};
  const p = PickLab.duel(event.id,customized,0,1);
  const q = PickLab.duel(event.id,customized,1,0);
  const baseNoStyle = PickLab.duel(event.id,{...flags,h2h:true},0,1);
  assert.ok(p.bo1 > baseNoStyle.bo1 && p.bo3 > baseNoStyle.bo3);
  assert.ok(Math.abs(p.bo1 + q.bo1 - 1)<1e-10 && Math.abs(p.bo3 + q.bo3 - 1)<1e-10);
  assert.deepEqual(PickLab.duel(event.id,{...flags,style:true,scenario:PickStyle.empty()},0,1),control);
  for (const evidence of Object.values(event.profileEvidence)) {
    assert.ok(evidence.date < event.date.slice(0,10) && evidence.overlap >= 3);
    if (!event.hasResults) assert.ok(evidence.date <= event.rosterAsOf);
  }
  for (const team of event.teams) {
    const asset = event.logos?.[team.name];
    if (!event.hasResults || asset) {
      assert.ok(asset && fs.statSync(path.join(dist,asset)).size > 100, "Missing logo: "+team.name);
    }
  }
  for (let i=0; i<16; i++) for (let j=i+1; j<16; j++) {
    const subject = PickLab.duel(event.id,flags,i,j);
    const reversed = PickLab.duel(event.id,flags,j,i);
    for (const kind of ["bo1","bo3"]) {
      assert.ok(subject[kind] > 0 && subject[kind] < 1);
      assert.ok(Math.abs(subject[kind]+reversed[kind]-1)<1e-10);
      assert.equal(subject[kind],matrices[kind][i][j]);
    }
    const pooled = PickLab.duel(event.id,{...flags,format:false},i,j);
    assert.equal(pooled.bo1,pooled.bo3);
    if (Math.abs(subject.bo1-subject.bo3) > .005) differentiatingPairs++;
    if ((subject.bo1-.5)*(subject.bo3-.5) < 0) directionalReversals++;
  }
  const locked = PickLab.setWinner([],1,0,0);
  const r = PickLab.run(event.id,{...customized,locks:locked},100);
  assert.equal(r.path.lockedCount,1);
  assert.equal(r.path.rounds[0].matches[0].probability,r.matchups.bo1[0][8]);
  assert.equal(r.opponents.length,5);
}
assert.ok(differentiatingPairs > 0);
console.log({differentiatingPairs, directionalReversals, possiblePairs:PickLab.events.length*120});

// Check that optional sources, shrinkage and the sealed Singapore forecast reproduce.
const crypto = require("node:crypto");
for (const event of PickLab.events) {
  const a = 0, b = 1;
  const raw = PickLab.duel(event.id,{format:true},a,b);
  const guard = PickLab.duel(event.id,{format:true,shrinkBO:true},a,b);
  const w = event.formatWeight?.weight ?? 1;
  assert.ok(w >= 0 && w <= 1);
  for (const bo of ["bo1","bo3"])
    assert.ok(Math.abs(guard[bo] - (raw.base + w*(raw[bo]-raw.base))) < 1e-12);
  const contextual = {fresh:true,seedPrior:true,rolling:true,shrinkBO:true,format:true};
  const odds = PickLab.duel(event.id,contextual,a,b);
  const other = PickLab.duel(event.id,contextual,b,a);
  assert.ok(Math.abs(odds.bo3 + other.bo3 - 1) < 1e-12);
  if (event.recentRating) {
    const p=PickLab.duel(event.id,{fresh:true,format:false},a,b);
    const points=event.teams.map(t=>{
      const rating = event.recentRating.teams[t.name];
      return rating?.overlap>=3 && Number.isFinite(rating.points) ? rating.points : t.points;
    });
    const known=points.filter(Number.isFinite).sort((x,y)=>x-y);
    const mid=known.length ? (known[Math.floor(known.length/2)]+known[Math.floor((known.length-1)/2)])/2 : 0;
    for(let i=0;i<points.length;i++) if(!Number.isFinite(points[i])) points[i]=mid;
    assert.ok(Math.abs(p.base-1/(1+Math.exp(-event.model.masks[0].beta[0]*(points[a]-points[b])/100))) < 1e-12);
  }
  if (['austin','cologne','copenhagen','shanghai'].includes(event.id)) {
    const rating=event.recentRating;
    assert.equal(rating.provider,'Valve');
    assert.ok(rating.publishedAt.slice(0,10) < event.date.slice(0,10));
    assert.equal(Object.keys(rating.teams).length,16);
    assert.ok(Object.values(rating.teams).every(t=>t.overlap>=3 && t.overlap<=5));
    assert.equal(rating.rankScope,event.id==='copenhagen'?'regional':'global');
    assert.equal(rating.sameAsBase,event.id!=='shanghai');
    const original=PickLab.seriesMatrices(event,{format:false});
    const latest=PickLab.seriesMatrices(event,{format:false,fresh:true});
    if(rating.sameAsBase) assert.deepEqual(latest,original);
    else assert.notDeepEqual(latest,original);
  }
  if (event.frozenForecast) {
    const file = fs.readFileSync(path.join(dist,event.frozenForecast.path));
    assert.equal(crypto.createHash("sha256").update(file).digest("hex"), event.frozenForecast.sha256);
    const snap = JSON.parse(file);
    assert.equal(event.frozenForecast.sha256, "73df45b5d7ea8d72785cb7c5a11e3d406e0dde00364018afb75760e278f6b8d6");
    assert.deepEqual(snap.forecast.map(t=>t.name),event.teams.map(t=>t.name));
    const revised = PickLab.run(event.id,{format:true,shrinkBO:true,experience:true},1000);
    assert.ok(Number.isFinite(revised.score(revised.expectedCard).expected));
    assert.equal(revised.expectedCard.filter(c=>c===1).length,6);
  }
}

for (const event of PickLab.events) {
  const exp = event.experience;
  assert.ok(exp.latest < exp.asOf && !exp.model.stagesSeen.includes(event.id));
  for (const t of event.teams) {
    assert.deepEqual(exp.teams[t.name].players.map(p=>p.name),t.roster);
    if (t.points!==null) assert.ok(t.vrsCoreOverlap >= 3, event.id+': '+t.name);
  }
  const preceding=historicalEvents.filter(e=>e.date<event.date).sort((a,b)=>a.date.localeCompare(b.date));
  assert.deepEqual(exp.model.stagesSeen,preceding.map(e=>e.id));
  const elapsed = exp.validation.concat(exp.laterValidation)
    .filter(row=>exp.model.stagesSeen.includes(row.id)).reduce((n,row)=>n+row.eligible,0);
  assert.equal(exp.model.cs2Matches,elapsed);
  assert.equal(exp.model.trainingMatches,exp.model.cs2Matches || exp.model.legacyMatches);
  if (!elapsed) {
    assert.ok(exp.model.legacyMatches > 0 && exp.model.legacyEditions.length);
  }
  for(let i=0;i<16;i++) for(let j=i+1;j<16;j++) {
    const enabled={format:true,shrinkBO:true,experience:true};
    const one=PickLab.duel(event.id,enabled,i,j), two=PickLab.duel(event.id,enabled,j,i);
    assert.ok(Math.abs(one.bo1+two.bo1-1)<1e-12 && Math.abs(one.bo3+two.bo3-1)<1e-12);
  }
}

// Every finished opening/first stage uses the same score bins. Recompute stage
// outcomes independently from the per-round records to check Swiss replay.
const seedCard = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
for (const event of historicalEvents) {
  const replay=CS.replay(event.rounds);
  assert.ok(replay.ok && replay.matched===33 && replay.total===33,event.id);
  const wins=Array(16).fill(0), losses=Array(16).fill(0);
  for(const [w,l] of event.rounds.flat()) { wins[w]++; losses[l]++; }
  const expected=wins.map((w,i)=>w===3 ? (losses[i]===0 ? 0 : 1) : w===0 ? 2 : 3);
  assert.deepEqual(replay.actual,expected);
  assert.deepEqual([0,1,2,3].map(c=>expected.filter(x=>x===c).length),[2,6,2,6]);
  const seedScore=seedCard.filter((c,i)=>c!==3 && c===expected[i]).length;
  assert.equal(CS.actualScore(seedCard,expected),seedScore);
}

for (const event of PickLab.events) {
  assert.ok(event.boostModel,event.id+" lacks a pre-event GBDT");
  const flags={family:"boost",form:true,strong:true,weak:true,format:true,shrinkBO:true};
  const boosted=PickLab.seriesMatrices(event,flags);
  const baseline=PickLab.seriesMatrices(event,{...flags,family:"logit"});
  let distinct=false;
  for (const key of ["bo1","bo3"]) {
    for (let i=0;i<16;i++) for (let j=0;j<16;j++) {
      const p=boosted[key][i][j];
      assert.ok(Number.isFinite(p) && p>0 && p<1 && Math.abs(p+boosted[key][j][i]-1)<1e-10);
      if(Math.abs(p-baseline[key][i][j])>1e-5) distinct=true;
    }
  }
  assert.ok(distinct,event.id+": GBDT toggle did not change any probability");
}
