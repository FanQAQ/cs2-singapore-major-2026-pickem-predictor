/* Run from anywhere with node history_ui/check-history.cjs after assembling the website. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dist = path.resolve(__dirname,'../dist');
const source = fs.readFileSync(path.join(__dirname,'history.js'),'utf8');
const slotCard = [0,0,1,1,1,1,1,1,3,3,3,3,3,3,2,2];
const editions = ['copenhagen','shanghai','austin','budapest','cologne'];
const base = {format:true,shrinkBO:true};
const boost = {...base,family:'boost',form:true,strong:true,weak:true};
const plain = x => JSON.parse(JSON.stringify(x));

async function scores() {
  for (const file of ['engine','data','format','style-model','rolling','boost','v4','map-model','close-model','region-risk','region-vrs','major-form','robust-card','pick-signal','lan-signal','methods','stage-inputs','stage-training','adapter'])
    require(path.join(dist,file+'.js'));
  require('./history.js');
  const meta = PickHistory.events;
  assert.deepEqual(meta.filter(e=>e.stage===1).map(e=>e.id),[...editions].reverse());
  assert.deepEqual([1,2,3].map(stage=>meta.filter(e=>e.stage===stage).length),[5,5,3]);
  const changes = [
    {family:'logit',form:true,format:false,h2h:true,rolling:true},
    base,boost,PickV4.preset, {...PickV4.preset,weak:false}, {...PickV4.preset,regionVrs:true,majorForm:true}, {...PickV4.preset,regionVrs:true}, {...PickV4.preset,mapVeto:true},
    {...PickV4.preset,closeForm:true,regionRisk:true,robustCard:true},
    {methodDefault:'recommended'},{methodDefault:'tree'},{methodDefault:'recommended',robustCard:true},
    {methodDefault:'recommended',seedConditionalCard:true},{methodDefault:'tree',seedConditionalCard:true},
    {methodDefault:'recommended',seedConditionalCard:true,stageTraining:true},{methodDefault:'tree',stageTraining:true},
    {...PickV4.preset,form:false,seedConditionalCard:true},
    {...PickV4.preset,pickSignal:true},{...boost,lanSignal:true,pickSignal:true}
  ];
  for (const flags of changes) {
    const received = [];
    const rows = await PickHistory.compare({...flags,locks:[[1]],scenario:{assignments:{unknown:'duel'}}},
      {onRow:r=>received.push(r)});
    assert.deepEqual(rows.map(r=>r.id),meta.map(e=>e.id));
    assert.deepEqual([...received].sort((a,b)=>a.id.localeCompare(b.id)),[...rows].sort((a,b)=>a.id.localeCompare(b.id)));
    for (const item of rows) {
      const stage = PickLab.allEvents.find(e=>e.id===item.id);
      let effective = flags.methodDefault ? {...PickMethods.defaults(flags.methodDefault,stage),
        ...(flags.stageTraining && {stageTraining:true}),robustCard:!!flags.robustCard,seedConditionalCard:!!flags.seedConditionalCard} : flags;
      if(stage.stage>1) effective=PickStageInputs.localFlags(stage,effective).flags;
      const r = PickLab.run(item.id,effective,24000);
      // Data gaps that deliberately disable a feature must agree with the fallback
      // implementation of the corresponding event in PickLab.
      assert.deepEqual(item.actual,CS.replay(stage.rounds).actual);
      assert.deepEqual(item.scores,{
        model:CS.actualScore(r.card,item.actual),expected:CS.actualScore(r.expectedCard,item.actual),
        seed:CS.actualScore(slotCard,item.actual)
      });
      if (flags.methodDefault && !flags.robustCard && !flags.stageTraining && !(stage.stage>1)) {
        const study = require('../method_eval/report.json').stages.find(s=>s.id===stage.id);
        const picked = study.selectedBefore[flags.methodDefault];
        assert.equal(stage.methodSelection[flags.methodDefault],picked);
        const preset = flags.methodDefault+(flags.seedConditionalCard?'SeedConditional':'');
        assert.deepEqual(item.scores,stage.historyPresets[preset]);
        if (!flags.seedConditionalCard) assert.equal(item.scores.model,study.models[flags.methodDefault][picked].card.hits);
        if (flags.seedConditionalCard && flags.methodDefault==='recommended') {
          const frozen = require('../research_cards/conditionalSeed.json').stages.find(s=>s.id===stage.id);
          assert.equal(item.scores.model,frozen.trials[0].candidateScore.hits);
        }
      }
      if (!(stage.stage>1) && !flags.methodDefault && (flags === base || flags === boost || flags === PickV4.preset || flags.mapVeto || flags.regionVrs || flags.robustCard)) {
        const preset = flags.robustCard ? 'integrated' : flags.mapVeto ? 'map' : flags.majorForm ? 'majorForm' : flags.regionVrs ? 'regionVrs' : flags === base ? 'default' : flags.family;
        const saved = stage.historyPresets?.[preset];
        assert.deepEqual(saved,item.scores);
      }
      // Manual editing is transferred by the Singapore seed positions, not by names.
      const manual = slotCard.slice();
      [manual[1],manual[9]]=[manual[9],manual[1]];
      assert.equal(CS.actualScore(manual,item.actual),manual.filter((slot,i)=>slot<3 && slot===item.actual[i]).length);
    }
  }
}

function verifyWorker() {
  // Run the deployed worker entrypoint (and its real imports) in a classic-script
  // context. Use a non-precomputed strategy so the entire path evaluates the model.
  const messages = [];
  const box = vm.createContext({postMessage:message=>messages.push(message)});
  box.self = box;
  box.importScripts = (...files) => {
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),box,{filename:file});
  };
  vm.runInContext(fs.readFileSync(path.join(dist,'history-worker.js'),'utf8'),box);
  const ids = [editions[0], editions[4], PickHistory.events.find(e=>e.stage===2).id, PickHistory.events.find(e=>e.stage===3).id];
  const flags = {family:'v4',roundMargin:true,strong:true,format:true,mapVeto:true,regionVrs:true,majorForm:true,closeForm:true,regionRisk:true,robustCard:true};
  flags.lanSignal=true;
  flags.pickSignal=true;
  box.onmessage({data:{request:8,flags,ids}});
  assert.equal(messages.length,ids.length+1);
  assert.deepEqual(plain(messages.at(-1)),{request:8,done:true});
  for(const [index,id] of ids.entries()) {
    assert.equal(messages[index].request,8);
    const row = PickHistory.scoreEvent(id,flags);
    assert.deepEqual(plain(messages[index].row),row);
  }
}

async function lifecycle() {
  const events = editions.map((id,i)=>({
    id,label:id,date:String(20240000+i),hasResults:true,rounds:{},
    teams:['former','rival',...Array.from({length:14},(_,i)=>'seed'+(i+3))].map(name=>({name})),
    pickSignal:{},lanSignal:{},boostModel:{},formatModel:{},formatWeight:{weight:0},
    profileEvidence:{former:{profile:'duel'},rival:{profile:'system'}}
  }));
  const calls = [];
  function run(id,flags,budget) {
    calls.push({id,flags,budget});
    return {card:slotCard,expectedCard:slotCard};
  }
  let workers = [];
  class FakeWorker {
    constructor(){workers.push(this);}
    terminate(){this.terminated=true;}
    postMessage(msg){this.lastMessage=msg;}
  }
  require('../strategy_v4/predict.js');
  const box = {setTimeout,URL,Worker:FakeWorker,location:{protocol:'https:'},
    PickV4:globalThis.PickV4,
    PickMethods:{defaults:(method,event)=>({family:method==='recommended'?'v4':'boost',
      lanSignal:event.id==='cologne',pickSignal:event.id==='shanghai'})},
    PickLab:{events,run},CS:{replay:()=>({ok:true,total:33,actual:slotCard}),actualScore:()=>10},
    PickStyle:{pairs:[{key:'duel:system',a:'duel',b:'system'},{key:'duel:tempo',a:'duel',b:'tempo'}]}};
  vm.runInNewContext(source,box);
  const history = box.PickHistory;
  const a = history.compare({format:false});
  const b = history.compare({style:true,scenario:{assignments:{singapore:'unknown'},edges:{'duel:system':8}}});
  await assert.rejects(a,e=>e.name==='AbortError');
  assert.ok(workers[0].terminated);
  const next=workers[1];
  assert.deepEqual(plain(next.lastMessage.ids),[...editions].reverse());
  const joined=history.compare({...next.lastMessage.flags,locks:[[1]]});
  assert.equal(b,joined);
  next.onerror();
  const rows=await b;
  assert.equal(rows.length,5);
  assert.ok(rows.every(r=>r.notes.some(n=>n.includes('2/16') && n.includes('采用手动幅度'))));
  assert.equal(calls.length,5);
  for(const {flags,budget} of calls) {
    assert.equal(budget,24000);
    assert.equal(flags.locks,undefined);
    assert.deepEqual(plain(flags.scenario),{assignments:{former:'duel',rival:'system'},edges:{'duel:system':8}});
  }
  const cached=await history.compare({...next.lastMessage.flags,locks:[[9]]});
  assert.deepEqual(cached,rows);
  assert.equal(calls.length,5);
  assert.equal(workers.length,2);
  // Zero is a user-selected scenario. It should use the same model and cache as a disabled scenario.
  const off=await history.compare({format:false});
  const runCount=calls.length;
  const untouched=await history.compare({format:false,style:true,scenario:{edges:{'duel:system':0}}});
  assert.equal(untouched,off);
  assert.equal(calls.length,runCount);
  assert.ok(untouched.every(row=>row.notes.every(n=>!n.includes('打法'))));
  const disjoint=history.scoreEvent(editions[0],{format:false,style:true,scenario:{edges:{'duel:tempo':8}}});
  assert.ok(disjoint.notes.some(n=>n.includes('2/16') && n.includes('没有对阵')));

  const rollingCalls = calls.length;
  const released=await history.compare({methodDefault:'recommended',family:'v4',lanSignal:true});
  assert.equal(released.length,5);
  for (const {id,flags} of calls.slice(rollingCalls)) {
    assert.equal(flags.lanSignal,id==='cologne');
    assert.equal(flags.pickSignal,id==='shanghai');
    assert.equal(flags.family,'v4');
  }
  assert.equal(calls.length,rollingCalls+5);
  const custom = history.scoreEvent('shanghai',{family:'boost',pickSignal:false,lanSignal:true});
  assert.equal(custom.id,'shanghai');
  assert.equal(calls.at(-1).flags.lanSignal,true);
  assert.equal(calls.at(-1).flags.pickSignal,false);
  const event=events[0];
  function ratingNotes() {return history.scoreEvent(event.id,{format:false,fresh:true}).notes.join(' ');}
  assert.match(ratingNotes(),/尚无可核实的临赛积分榜/);
  const rated=Object.fromEntries(event.teams.map(t=>[t.name,{points:1234,overlap:5}]));
  event.recentRating={asOf:'2024-03-04',monthlyAsOf:'2024-03-04',basis:'Valve 官方地区榜',
    rankScope:'regional',sameAsBase:true,teams:rated};
  assert.match(ratingNotes(),/16\/16.*名次仅在各赛区内比较.*同一期/);
  rated.former.overlap=2;
  assert.match(ratingNotes(),/15\/16.*其余 1 队沿用基础积分/);
  event.experience={model:{trainingMatches:30,beta:[0,0,0],note:'经验系数经过跨版本验证。'}};
  const calibrated=history.scoreEvent(event.id,{format:false,experience:true});
  assert.deepEqual(plain(calibrated.notes).filter(n=>n.includes('经验')),['经验系数经过跨版本验证。']);
}

(async()=>{
  await lifecycle();
  if (process.argv.includes('--client-only')) { console.log('Client cancellation, projection and fallback verified.'); return; }
  await scores();
  verifyWorker();
  console.log('13 Swiss stages across both models, default and custom presets, calibration, manual seed mapping, cache, cancellation and offline fallback verified.');
})().catch(e=>{console.error(e);process.exitCode=1;});
