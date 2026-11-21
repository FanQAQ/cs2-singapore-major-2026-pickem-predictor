'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const source = name => path.join(__dirname,'..',name);
const read = name => JSON.parse(fs.readFileSync(source(name),'utf8'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const normalize = s => s.normalize('NFKC').trim().toLowerCase();
const overlap = (a,b) => new Set(a.map(normalize).filter(v=>b.map(normalize).includes(v))).size;
const round = v => Number(v.toFixed(6));

const docs = read('datajob/stage_roster_sources.json').singapore;
const archive = read('forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json');
const methods = read('method_archive/singapore-stage1-methods-2026-11-21.json');
const rawMay = fs.readFileSync(path.join(__dirname,'2026_05_04.md'));
const mayRows = rawMay.toString('utf8').split('\n').filter(line=>/^\|\s*\d+\s*\|/.test(line))
  .map(line=>{
    const [,rank,points,name,players]=line.split('|').map(v=>v.trim());
    return {rank:Number(rank), points:Number(points), name, roster:players.split(', ')};
  });

// F1bre builds the global VRS distribution from the highest-points row for each
// case-insensitive team name. The stockpile of raw rows is kept for the roster join.
const byName = new Map();
for (const row of mayRows) {
  const key=normalize(row.name);
  if (!byName.has(key) || byName.get(key).points<row.points) byName.set(key,row);
}
const values=Array.from(byName.values(),r=>r.points).sort((a,b)=>a-b);
const mean=values.reduce((a,b)=>a+b)/values.length;
const sd=Math.sqrt(values.reduce((v,row)=>v+(row-mean)**2,0)/values.length);
const at=(values.length-1)*0.05;
const p5=values[Math.floor(at)]+(at-Math.floor(at))*(values[Math.ceil(at)]-values[Math.floor(at)]);
const mapped=points=>1000+200*(points-mean)/sd;
const neutralFallback=Math.max(400,mapped(p5));
const neutralWithVrs=points=>0.7*Math.max(400,Math.min(1600,mapped(points)))+0.3*1000;
function matchCore(team) {
  const candidates=mayRows.filter(row=>new Set(row.roster.map(normalize)).size===5)
    .map(row=>({row,n:overlap(row.roster,team.roster)}))
    .filter(candidate=>candidate.n>=3).sort((a,b)=>b.n-a.n);
  if (!candidates.length || candidates[1]?.n===candidates[0].n) return null;
  return candidates[0];
}
const anchor=archive.teams.map(team=>{
  const literal=byName.get(normalize(team.team));
  const core=matchCore(team);
  return {seed:team.seed,team:team.team,exactName:literal?.name??null,
    nameOverlap:literal?overlap(literal.roster,team.roster):null,
    coreName:core?.row.name??null,coreOverlap:core?.n??null,
    coreRank:core?.row.rank??null,corePoints:core?.row.points??null};
});
const identity=anchor.find(row=>row.team==='DENDELE');
assert.equal(identity.exactName,null);
assert.equal(identity.coreName,'Sharks');
assert.equal(identity.coreOverlap,5);
const model=methods.methods.recommended;
const rawMatrix=fs.readFileSync(source(model.matrixReference.file));
assert.equal(digest(rawMatrix),model.matrixReference.sha256);
const matrix=JSON.parse(rawMatrix)[model.matrixReference.field];
assert.equal(digest(JSON.stringify(matrix)),model.matrixSha256);
assert.equal(model.matrixSha256,archive.matrixSha256);
const ix=identity.seed-1;
assert.deepEqual(methods.seeds,archive.teams);
assert.deepEqual(model.probabilities[ix],archive.probabilities[ix]);
assert.equal(model.card[ix],archive.card[ix]);

require(source('dist/data.js'));
const current=PICK_DATA.find(s=>s.id==='singapore'),previous=PICK_DATA.find(s=>s.id==='cologne');
const now=current.teams[ix],then=previous.teams.find(t=>t.name==='Sharks');
assert.equal(now.name,'DENDELE');
assert.equal(overlap(now.roster,then.roster),5);
assert.equal(overlap(now.roster,archive.teams[ix].roster),5);
const history=read('major_form/all_stages.json').editions.cologne;
const cologne=history.matches.filter(m=>m.stage===1).flatMap(m=>{
  const a=overlap(now.roster,m.rosterA),b=overlap(now.roster,m.rosterB);
  if (a<3 && b<3) return [];
  assert.equal(Math.max(a,b),5);
  return [{id:m.id,date:m.day,labelInResults:a>=3?m.a:m.b,
    opponent:a>=3?m.b:m.a,won:a>=3?m.y:1-m.y,overlap:Math.max(a,b)}];
});
const major=current.majorForm.teams[now.name];
assert.equal(cologne.length,major.series);
assert.equal(cologne.reduce((n,m)=>n+m.won,0),major.wins);
assert.deepEqual(major.byEdition[0].teams,[then.name]);
assert.equal(major.byEdition[0].overlapCounts['5'],cologne.length);
const report={
  cutoff:'2026-11-20',anchorDate:'2026-05-24',vrsDate:'2026-05-04',snapshotSha256:digest(rawMay),
  snapshotCommit:'aac2074bc10fd62a8bf0b2146d7edfb67d224bcf',
  neutralRatingAudit:{assumedPlayerRating:1,uniqueNames:values.length,mean:round(mean),populationSd:round(sd),
    percentile5:round(p5),nameFallback:round(neutralFallback),confirmedCore:round(neutralWithVrs(identity.corePoints))},
  anchor,officialFive:now.roster,sourceRoster:docs.sources[0].url,
  cologne:{nameThen:then.name,points:then.points,source:then.source,matches:cologne},
  singapore:{nameNow:now.name,rank:now.rank,points:now.points,source:now.source,date:current.asOf,
    coreRetained:now.coreAudit.retained,recentUsed:now.n,v4Used:current.v4Model.teams[now.name].n,
    majorSeries:major.series,majorWins:major.wins,appliedMajorAdjustment:major.logit,
    sealInputCutoff:methods.inputCutoff,startingFiveAsOf:methods.startingFiveAsOf,flags:model.flags,
    matrixSha256:model.matrixSha256,firstOpponent:archive.teams[1].team,
    firstBo1:matrix.bo1[ix][1],firstBo3:matrix.bo3[ix][1],card:archive.card[ix],categoryOrder:archive.categoryOrder,
    stageProbabilities:archive.probabilities[ix]}
};
const file=path.join(__dirname,'report.json');
if (process.argv.includes('--write')) fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
else assert.deepEqual(report,JSON.parse(fs.readFileSync(file)));
console.log(JSON.stringify({identity,neutral:report.neutralRatingAudit,singapore:report.singapore},null,2));
