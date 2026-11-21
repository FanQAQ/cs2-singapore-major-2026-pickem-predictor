'use strict';
const assert=require('node:assert/strict');
const {observed}=require('../sweep_decider/score.cjs');
const {fields}=require('../sweep_decider/lock.cjs');
const {read,freeze}=require('../format_split/astana/lock.cjs');
const {cardScore}=require('../score.cjs');
const full=process.argv.includes('--full'),prefix=full?'full-':'';
const locked=read(prefix+'cards.json',__dirname),result={};
const controls=read(prefix+'cards.json',require('node:path').resolve(__dirname,'../core_sweep'));
for(const [id,{f}] of Object.entries(fields())){
  const {actual}=observed(id,f),record=locked[id];
  assert.deepEqual(record.teams,f.teams.map(t=>t.name));
  result[id]=record.rows.map((r,i)=>{
    assert.equal(r.seed,controls[id].rows[i].seed);
    assert.deepEqual(r.original,controls[id].rows[i].original);
    const option=r.options[r.chosen],indices=option.swap;
    const rebuilt=r.original.slice();
    if(indices.length){
      const [a,b]=indices;
      [rebuilt[a],rebuilt[b]]=[rebuilt[b],rebuilt[a]];
    }
    assert.deepEqual(rebuilt,r.selected);
    const grade=card=>cardScore(card,actual);
    return {seed:r.seed,swap:indices.map(j=>record.teams[j]),original:grade(r.original),selected:grade(r.selected),mapML:grade(r.mapML)};
  });
}
const majorIds=Object.keys(result).filter(id=>id.endsWith('-3'));
assert.equal(majorIds.length,3);
const passed=seedIndex=>majorIds.filter(id=>result[id][seedIndex].selected.hits>=5).length;
const externalPreserved=Object.entries(result).filter(([id])=>!majorIds.includes(id)).every(([,r])=>r[0].original.hits<5 || r[0].selected.hits>=5);
const passGate=passed(0)>=2 && (passed(1)>=2 || passed(2)>=2) && externalPreserved;
freeze(prefix+'report.json',{result,passGate,externalPreserved},__dirname);
console.log(JSON.stringify({hits:Object.fromEntries(Object.entries(result).map(([id,r])=>[id,r.map(s=>[s.original.hits,s.selected.hits])])),passGate,externalPreserved}));
