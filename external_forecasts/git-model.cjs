'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root='https://github.com/Leclowndu93150/pickem-prediction-model/blob/';
const filename='git-model-2026-11-22.json';
const local=require('../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json');
const publicData=require('./singapore-stage1-2026-11-21.json');
const canon=s=>publicData.aliases[s] || s;
const gitBlob=data=>createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
function extract(directory){
  function source(blob){
    const b=fs.readFileSync(path.join(directory,blob+'.source'));
    assert.equal(gitBlob(b),blob);
    return b.toString('utf8');
  }
  const cologneBlob='3cef821f2a8b4546e502248fe9983cc7cbf82afe',singaporeBlob='a56f26d06150a7de0c7b06eef92b68e0321747aa';
  const text=source(cologneBlob).split('### Stage 3 prediction')[1].split('Reproduce with:')[0];
  const ticket={threeZero:[],ordinary:[],zeroThree:[]};
  const groups={'3-0':'threeZero',advance:'ordinary','0-3':'zeroThree'};
  for(const m of text.matchAll(/^\| (3-0|advance|0-3) \| ([^|]+?) \|/gm))ticket[groups[m[1]]].push(m[2]);
  assert.deepEqual(Object.values(ticket).map(x=>x.length),[2,6,2]);
  const cologne={id:'cologne-2026-3',source:root+'e6ad6fe4f6e13201e11e65242a9cc86cb87f0fef/README.md',blob:cologneBlob,
    githubSignatureVerifiedAt:'2026-06-10T22:43:30Z',stageStartDay:'2026-06-11',...ticket};
  const s=JSON.parse(source(singaporeBlob));
  assert.equal(s.event,'PGL Major Singapore 2026 Stage 1');
  assert.equal(s.rounds_played,0);
  assert.equal(s.matches.length,8);
  assert(s.matches.every(m=>m.winner===null && m.best_of===1 && m.record.every(x=>x===0)));
  const teams=s.teams.map(t=>{
    const home=local.teams[t.seed-1];
    assert.equal(canon(t.team),home.team);
    const sorted=names=>names.map(x=>x.toLowerCase()).sort();
    assert.deepEqual(sorted(t.lineup),sorted(home.roster));
    const p=t.odds;
    const probabilities=[p['3-0'],p['3-1']+p['3-2'],p['0-3'],p['1-3']+p['2-3']];
    assert(probabilities.every(q=>q>=0 && q<=1) && Math.abs(probabilities.reduce((a,b)=>a+b,0)-1)<1e-8);
    return {seed:t.seed,team:home.team,roster:t.lineup,probabilities};
  }).sort((a,b)=>a.seed-b.seed);
  assert.deepEqual(teams.map(t=>t.team),local.teams.map(t=>t.team));
  const singapore={id:publicData.stage,source:root+'0aea354ae205ed8585917999b8e350dd97cbddbe/predictions/pgl-major-singapore-2026-stage-1.json',
    blob:singaporeBlob,committedAt:'2026-11-20T00:52:17Z',recordedAt:'2026-11-21T18:26:59Z',dataUntil:s.data_until,
    roundsPlayed:s.rounds_played,categoryOrder:local.categoryOrder,teams,threeZero:s.picks.three_zero,ordinary:s.picks.advance,zeroThree:s.picks.zero_three,
    roundOne:s.first_round.map(m=>[canon(m.a),canon(m.b),m.p_a])};
  return {cologne,singapore};
}
function scoreCologne(c){
  const {getField,truth,cardScore}=require('../f1bre_models/evaluate.cjs');
  const f=getField(c.id),teams=f.teams.map(t=>t.name);
  assert.equal(f.start,c.stageStartDay);
  assert(Date.parse(c.githubSignatureVerifiedAt)<Date.parse(f.start+'T00:00:00Z'));
  const {actual}=truth(f.id,teams),groups=[c.threeZero,c.ordinary,c.zeroThree];
  assert.deepEqual(groups.map(x=>x.length),[2,6,2]);
  assert.equal(new Set(groups.flat()).size,10);
  assert(groups.flat().every(t=>teams.includes(t)));
  const card=teams.map(t=>{const i=groups.findIndex(g=>g.includes(t));return i<0?3:i;});
  const hits=groups.map((g,k)=>g.filter(t=>actual[teams.indexOf(t)]===k));
  const formal=require('../f1bre_models/report.json').fields.find(e=>e.id===c.id).methods.baseline.runs[0].card;
  return {external:cardScore(card,actual),published:cardScore(formal,actual),hitTeams:hits};
}
if(require.main===module){
  const file=path.join(__dirname,filename);
  if(process.argv[2]){
    const content=JSON.stringify(extract(process.argv[2]),null,2)+'\n';
    if(fs.existsSync(file))assert.equal(fs.readFileSync(file,'utf8'),content);
    else fs.writeFileSync(file,content,{flag:'wx'});
  }
  console.log(JSON.stringify(scoreCologne(require('./'+filename).cologne)));
}
