'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {cardScore}=require('./score.cjs');
const file=path.join(__dirname,'upstream-cologne.json');
const studies=require('./report.json').fields;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const stageIds=['cologne','cologne-2026-2','cologne-2026-3'];
const postIds=[182421774,182820875,183113941];
const split=text=>text.split('|');
// Transcribed visually from the linked, dated article figures in their published slot order.
const picks=[
  [
    ['elo-1',[1],'B8|MIBR','GamerLegion|HEROIC|BetBoom|M80|NRG|Liquid','TYLOO|THUNDER dOWNUNDER'],
    ['ml-1',[4],'GamerLegion|BetBoom','B8|HEROIC|M80|MIBR|SINNERS|TYLOO','Gaimin Gladiators|Liquid']
  ],[
    ['elo-1',[1],'Spirit|paiN','FUT|Astralis|G2|Legacy|B8|GamerLegion','TYLOO|BIG'],
    ['elo-2',[4],'Spirit|Legacy','FUT|Astralis|G2|paiN|B8|GamerLegion','MIBR|TYLOO'],
    ['elo-3',[4],'Spirit|Legacy','FUT|Astralis|G2|B8|GamerLegion|M80','MIBR|TYLOO'],
    ['ml-1',[5],'Spirit|paiN','FUT|Astralis|G2|Legacy|B8|MIBR','Monte|TYLOO'],
    ['ml-2',[7],'Spirit|paiN','FUT|Astralis|G2|Legacy|9z|B8','TYLOO|Monte'],
    ['ml-3',[7],'Spirit|G2','FUT|Astralis|MIBR|Legacy|9z|B8','TYLOO|Monte']
  ],[
    ['elo-sorted',[1,3],'Vitality|Falcons','Natus Vincere|Aurora|FURIA|MOUZ|Spirit|G2','9z|Monte'],
    ['ml-1',[5],'Vitality|Spirit','Natus Vincere|Falcons|FURIA|9z|BetBoom|Legacy','PARIVISION|Monte'],
    ['ml-2',[5],'Vitality|Spirit','Natus Vincere|Falcons|G2|9z|BetBoom|Legacy','PARIVISION|Monte'],
    ['ml-3',[5],'Vitality|Spirit','Natus Vincere|Falcons|The MongolZ|9z|BetBoom|Legacy','PARIVISION|Monte']
  ]
];
function score(groups,actual,names) {
  const slots=names.map(name=>{const i=groups.findIndex(x=>x.includes(name));return i<0?3:i;});
  assert.deepEqual(groups.map(g=>g.length),[2,6,2]);
  assert.equal(new Set(groups.flat()).size,10); assert(groups.flat().every(n=>names.includes(n)));
  const result=cardScore(slots,actual);
  const hitTeams=groups.map((g,i)=>g.filter(n=>actual[names.indexOf(n)]===i));
  assert.deepEqual(result.slots,hitTeams.map(g=>g.length));
  return {groups,hits:result.hits,slots:result.slots,hitTeams};
}
function build(sources){
  return {asOf:'2026-11-21',categoryOrder:['3-0','3-1 / 3-2','0-3'],stages:sources.map((e,idx)=>{
    const id=stageIds[idx], f=studies.find(r=>r.id===id), names=f.teams;
    assert.equal(postIds[idx],e.postId);
    assert(e.createdAt.slice(0,10)<f.start);
    assert.equal(f.matches.length,33);
    const played=require('../major_form/all_stages.json').editions.cologne.matches.filter(g=>g.stage===idx+1);
    assert.equal(played.length,33);
    assert(e.modifiedAt.slice(0,10)>played.map(g=>g.day).sort().at(-1));
    const wins=Array(16).fill(0),losses=Array(16).fill(0);
    for(const m of f.matches){wins[m.w]++;losses[m.l]++;}
    const actual=wins.map((w,i)=>w===3?(losses[i]===0?0:1):(w===0?2:3));
    assert.deepEqual([0,1,2,3].map(v=>actual.filter(c=>c===v).length),[2,6,2,6]);
    assert.deepEqual(actual,f.actual);
    const groups=card=>[0,1,2].map(c=>names.filter((_,i)=>card[i]===c));
    const site=score(groups(f.methods.baseline.runs[0].card),actual,names);
    const cards=picks[idx].map(([id,imageNumbers,a,b,c])=>{
      assert(imageNumbers.every(i=>e.images.some(p=>p.number===i)));
      const [type,r]=id.split('-');
      const method=type==='elo'?'Elo':'ML',rank=r==='sorted'?null:Number(r);
      const label=rank===null?'Elo 按概率简单排序':method+' Top '+rank;
      return {id,label,method,rank,imageNumbers,...score([a,b,c].map(split),actual,names)};
    });
    return {id,stage:idx+1,...e,actualGroups:groups(actual),site,cards};
  })};
}
const attributes=['postId','source','author','createdAt','modifiedAt','mirror','images'];
function fromCache(dir){
  const posts=JSON.parse(fs.readFileSync(path.join(dir,'cologne-public-search.json'),'utf8'));
  const dates=JSON.parse(fs.readFileSync(path.join(dir,'cologne-dates.json'),'utf8'));
  return postIds.map((postId,idx)=>{
    const m=posts.find(p=>p.linkid===postId);assert.equal(m.user.username,'F1bre');
    assert.equal(m.imgs.length,[5,7,6][idx]);
    return {postId,source:'https://www.xiaoheihe.cn/app/bbs/link/'+postId,author:m.user.username,
      createdAt:new Date(m.create_at*1000).toISOString(),modifiedAt:new Date(m.modify_at*1000).toISOString(),
      mirror:idx===1?'https://www.vgover.com/news/218958':null,
      images:m.imgs.map((url,i)=>{
        const bytes=fs.readFileSync(path.join(dir,'cologne-public-'+postId+'-img-'+(i+1)+'.webp'));
        const header=dates.find(d=>d.post===postId && d.image===i+1);
        assert.equal(header.url,url);
        return {number:i+1,url,sha256:digest(bytes),bytes:bytes.length,cdnLastModified:header.lastModified??null};
      })};
  });
}
if(require.main===module){
  if(process.argv[2]==='--from-cache'){
    const data=build(fromCache(process.argv[3]));
    fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
  } else {
    assert(process.argv.length===2 || (process.argv.length===3 && process.argv[2]==='--check'));
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    const input=saved.stages.map(s=>Object.fromEntries(attributes.map(k=>[k,s[k]])));
    assert.deepEqual(build(input),saved);
    for(const s of saved.stages)console.log(s.stage,s.site.hits,s.cards.map(c=>[c.id,c.slots,c.hits]));
  }
}
