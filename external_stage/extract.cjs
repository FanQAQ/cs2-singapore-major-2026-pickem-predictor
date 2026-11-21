'use strict';
// Only retain the rows relevant to the pre-stage starting fives.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const stages = require('../multi_stage/inputs.json');
const {blend} = require('../world_rank/evaluate.cjs');
const file = path.join(__dirname,'weeks.json');
const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : {};
const gitBlob = bytes => createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

async function datedWeek(stage) {
  const day = new Date(stage.date+'T00:00:00Z');
  const delta = (day.getUTCDay()+6)%7 || 7;
  day.setUTCDate(day.getUTCDate()-delta);
  const week = day.toISOString().slice(0,10), year=week.slice(0,4);
  const source = 'https://www.hltv.org/ranking/teams/'+year+'/'+day.toLocaleString('en-US',{month:'long',timeZone:'UTC'}).toLowerCase()+'/'+day.getUTCDate();
  const name = year+'/'+week+'.json';
  let commit = old[stage.id]?.commit, committedAt = old[stage.id]?.committedAt;
  if (!commit) {
    const commits = await request('https://api.github.com/repos/julienc91/hltv-ranking/commits?sha=rankings&per_page=1&path='+name);
    const [selected] = JSON.parse(commits);
    commit=selected.sha; committedAt=selected.commit.committer.date;
  }
  const archive='https://raw.githubusercontent.com/julienc91/hltv-ranking/'+commit+'/'+name;
  let raw;
  try { raw=await request(archive); }
  catch {
    const content=await request('https://api.github.com/repos/julienc91/hltv-ranking/contents/'+name+'?ref='+commit);
    const item=JSON.parse(content);
    assert.equal(item.encoding,'base64');
    raw=Buffer.from(item.content,'base64');
  }
  const report=JSON.parse(raw);
  assert.equal(report.date,week);
  assert.equal(report.type,'world');
  const full=report.teams.map(t=>({rank:t.rank,team:t.name,roster:t.players.map(p=>p.name)}));
  const {audit}=blend(stage,{date:week,rows:full});
  const filter=new Set(audit.map(t=>t.rank).filter(Number.isInteger));
  const rows=full.filter(t=>filter.has(t.rank));
  return {date:week,source,archive,commit,committedAt,gitBlob:gitBlob(raw),coverage:rows.length,rows};
}
async function request(url) {
  let reason;
  for(let n=0;n<3;n++) {
    try {
      const response=await fetch(url,{headers:{'User-Agent':'CS2-Pickem-Research'},signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error(response.status+' '+url);
      return Buffer.from(await response.arrayBuffer());
    } catch(err) { reason=err; }
  }
  throw Error(url+' '+reason,{cause:reason});
}
async function main() {
  const weeks={};
  for(const stage of stages) weeks[stage.id]=await datedWeek(stage);
  if(process.argv.includes('--check')) assert.deepEqual(weeks,old);
  else fs.writeFileSync(file,JSON.stringify(weeks,null,2)+'\n');
  for(const [id,w] of Object.entries(weeks)) console.log(id,w.date,w.committedAt,w.coverage);
}
main().catch(err=>{console.error(err);process.exitCode=1;});
