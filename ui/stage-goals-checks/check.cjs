'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const before=process.argv.includes('--before');
const brandBefore=process.argv.includes('--brand-before');
const file=pathToFileURL(path.resolve(__dirname,'../../dist/index.html')).href;
const phase=n=>'[data-history-stage="'+n+'"]';
const totals=p=>p.locator('.stage-hits').allTextContents();
const ticket=p=>p.locator('.ticket-team .team-text').allTextContents();
async function ready(page,expected) {
  await page.waitForFunction(wanted=>document.querySelector('#workspace[aria-busy=false]') &&
    JSON.stringify([...document.querySelectorAll('.stage-hits')].map(n=>n.textContent))===JSON.stringify(wanted),expected,{timeout:90000});
}
async function check(browser,device,width,height,url,save=true) {
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:width<600,hasTouch:width<600});
  if(process.argv.includes('--roster-before') || process.argv.includes('--roster-panel')){
    const old=process.argv.includes('--roster-before');
    await page.goto(url+(old?'#picks':'#picks/rosters'));
    await ready(page,['27 / 50','25 / 50',old?'9 / 30':'13 / 30']);
    const card=page.locator('.ticket'), expected=require('../../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json');
    assert.deepEqual(await card.locator('.ticket-slot-0 .team-text').allTextContents(),expected.teams.filter((_,i)=>expected.card[i]===0).map(t=>t.team));
    if(!old){
      const panel=page.locator('[data-pick-detail="rosters"]');
      assert(await panel.evaluate(n=>n.open));
      const selector=panel.getByRole('combobox');
      assert.equal(await selector.locator('option').count(),16);
      assert.equal(await selector.inputValue(),'Eternal Fire');
      assert((await panel.innerText()).includes('24 胜 12 负'));
      assert((await panel.innerText()).includes('22.7%'));
      await selector.selectOption('9z');
      assert((await panel.innerText()).includes('history'));
      assert(!(await panel.innerText()).includes('24 胜 12 负'));
      await selector.selectOption('Eternal Fire');
      assert.equal(await panel.getByRole('link',{name:'PGL 报名名单'}).count(),1);
      const sim=panel.locator('details');
      await sim.locator('summary').click();
      assert((await sim.innerText()).includes('+1.31'));
      assert.equal(await sim.locator('tbody tr').count(),6);
      await sim.locator('summary').click();
      await panel.getByRole('link',{name:'换人权重回测'}).click();
      const study=page.locator('#lineup-study');
      assert(await study.evaluate(n=>n.open));
      assert.equal(await study.locator('table').first().locator('tbody tr').count(),4);
      const rmr=study.locator('#rmr-bo1-study');
      await rmr.locator(':scope > summary').click();
      assert((await rmr.innerText()).includes('0.2349 → 0.2463'));
      await rmr.getByText('逐场看实际赢家及赛前胜率',{exact:true}).click();
      assert.equal(await rmr.locator('tbody th a').count(),20);
      await page.goto(url+'#picks/rosters');
      await ready(page,['27 / 50','25 / 50','13 / 30']);
    }
    if(process.env.PICKEM_ROSTER_SHOTS && save){
      const target=old?card:page.locator('[data-pick-detail="rosters"]');
      const dest=path.join(process.env.PICKEM_ROSTER_SHOTS,device+(old?'-before':'-after'));
      await target.screenshot({type:'jpeg',quality:76,path:dest+'.jpg'});
      const clip=await target.evaluate(n=>{
        const r=n.getBoundingClientRect();
        return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:Math.min(390,r.height),scale:Math.min(1,780/r.width)};
      });
      const cdp=await page.context().newCDPSession(page);
      const shot=await cdp.send('Page.captureScreenshot',{format:'webp',quality:63,clip,captureBeyondViewport:true});
      fs.writeFileSync(dest+'.webp',Buffer.from(shot.data,'base64'));
      await cdp.detach();
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.close();console.log(device,old?'previous published card':'roster panel OK');return;
  }
  if(process.argv.includes('--no-shots'))save=false;
  const saveElite=save && process.argv.includes('--elite-shots');
  const saveBo5=save && !saveElite;
  if(process.argv.includes('--bo5-shots')||saveElite)save=false;
  if(['--veto-before','--bo5-before','--elite-before'].some(arg=>process.argv.includes(arg))){
    await page.goto(url+'#picks/stage3');
    const box=page.locator('#f1-sidebar');
    if(!await box.evaluate(n=>n.open))await box.locator('summary').click();
    const study=process.argv.includes('--veto-before')?'veto':process.argv.includes('--elite-before')?'elite':'bo5';
    await box.screenshot({path:path.join(__dirname,device+'-'+study+'-link-before.png')});
    await page.close();return;
  }
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(90000);
  if(!before && save) {
    await page.goto(url+'#picks');
    await ready(page,['27 / 50','25 / 50','13 / 30']);
    const brand=(await page.locator('.topbar .brand').innerText()).trim();
    if(brandBefore) assert(!brand.includes("Fango's Lab"));
    else {
      assert.equal(brand,"Fango's Lab");
      assert.match(await page.title(),/Fango's Lab/);
      const branding=await page.evaluate(async()=>{
        const icon=new Image();
        icon.src=document.querySelector('link[rel=icon]').href;
        await icon.decode();
        return [document.querySelector('meta[name=application-name]').content,
          document.querySelector('meta[name=theme-color]').content,icon.naturalWidth,icon.naturalHeight];
      });
      assert.deepEqual(branding,["Fango's Lab",'#101c29',64,64]);
    }
    assert.equal((await ticket(page)).length,10);
    await page.evaluate(()=>window.scrollTo(0,0));
    assert(await page.locator('.topbar').isVisible());
    await page.screenshot({path:path.join(__dirname,device+'-home-'+(brandBefore?'before':'after')+'.png')});
    if(brandBefore){await page.close();return;}
  }
  await page.goto(url+(before?'#picks':'#picks/round-form'));
  await ready(page,['27 / 50','25 / 50',before?'9 / 30':'13 / 30']);
  if(before) {
    assert.equal(await page.locator('#stage3-settings').count(),0,'Before screenshots require original production build');
    await page.locator(phase(3)).click();
  } else {
    assert.equal(await page.locator(phase(3)).getAttribute('aria-pressed'),'true');
    await page.waitForFunction(()=>document.querySelector('#round-form-study').open);
    await page.locator('#round-form-study > summary').click();
  }
  const names=await ticket(page);
  assert.equal(names.length,10);
  if(!before) {
    await page.goto(url+'#picks/forecasts');
    const sealed=page.locator('[data-pick-detail="sealed-tickets"]');
    assert(await sealed.evaluate(node=>node.open));
    const files=require('../../forecast_archive/singapore-stage1-seed-conditional-2026-11-21.json');
    const cross=require('../../forecast_archive/singapore-stage1-earlier-stages-2026-11-21.json');
    const rows=sealed.locator('tbody tr');
    for(const [i,record] of [files,cross].entries()) for(let slot=0;slot<3;slot++){
      const expected=record.teams.filter((_,n)=>record.card[n]===slot).map(t=>t.team).join('、');
      assert.equal(await rows.nth(slot).locator('td').nth(i).innerText(),expected);
    }
    const entries=await page.evaluate(()=>PICK_DATA.find(e=>e.id==='singapore').prospectiveStages);
    assert.deepEqual(await sealed.locator('h3').allTextContents(),entries.map(e=>'Stage '+e.stage));
    for(const [i,e] of entries.entries()) {
      const panel=sealed.locator('section').nth(i);
      if(e.source) assert((await panel.innerText()).includes('实际命中'));
      else assert((await panel.innerText()).includes('待完赛评分'));
    }
    if(save && device==='mobile') {
      await sealed.evaluate(n=>n.scrollIntoView({block:'center'}));
      await page.screenshot({path:path.join(__dirname,'mobile-sealed-stage1.png')});
    }
    await sealed.getByRole('link',{name:'查看新加坡禁选 ML 研究卡与 120 种潜在对阵'}).click();
    assert.equal(await page.locator('#veto-stage').inputValue(),'Singapore');
    assert.equal(await page.locator('#veto-match option').count(),120);
    await page.goto(url+'#picks/forecasts');
    await sealed.getByRole('link',{name:'对照新加坡补图前后的 0–3 研究卡'}).click();
    assert.equal(await page.locator('#bo5-group').inputValue(),'Singapore');
    await page.goto(url+'#picks/round-form');
    assert(await page.locator('#round-form-study').evaluate(n=>n.open));
    await page.locator('#round-form-study > summary').click();
    await page.goto(url+'#picks/stage3');
    const calendar=page.locator('[data-pick-detail="singapore-schedule"]');
    await calendar.locator(':scope > summary').click();
    const dates=await calendar.locator('.result-table').first().locator('tbody tr').allTextContents();
    assert.equal(dates.length,3);
    for(const [i,d] of ['11/24','11/28','12/2'].entries()) {
      assert(dates[i].includes(d) && dates[i].includes('12:00') && dates[i].includes('待核实'));
    }
    for(const section of await calendar.locator('.detail-body > details').all()) {
      await section.locator('summary').click();
      assert.equal(await section.locator('tbody tr').count(),8);
      await section.locator('summary').click();
    }
    await calendar.locator(':scope > summary').click();
    await page.locator('#stage3-allocation').check();
    await ready(page,['27 / 50','25 / 50','13 / 30']);
    const roundStudy=page.locator('#round-form-study'), roundSelect=roundStudy.getByRole('combobox');
    await roundStudy.locator(':scope > summary').click();
    const roundStats=require('../../round_form/summary.json'), allocations=require('../../round_form/allocation-summary.json');
    const roundRoot=page.locator('#round-form-result');
    for(const [key,expected] of Object.entries({major:roundStats.major,...roundStats.byStage})) {
      await roundSelect.selectOption(key);
      const first=roundRoot.locator('table').first(), methods=['base','series','mapScore','roundShare'];
      for(const [i,method] of methods.entries()) {
        const data=expected[method], cells=await first.locator('tbody tr').nth(i).locator('td').allTextContents();
        assert.deepEqual(cells,[data.fixedHits+'/'+(10*data.fixedByStage.length),data.fixedPasses+'/'+data.fixedByStage.length,data.errors.bo3.brier.toFixed(4)]);
      }
      assert((await roundRoot.innerText()).includes(expected.base.errors.bo3.n+' 场实际 BO3'));
      const cross=(key==='major'?allocations.major:allocations.byStage[key]), denominator=10*expected.base.fixedByStage.length;
      const comparisons=roundRoot.locator('table').nth(1).locator('tbody tr');
      for(const [index,prefix] of ['base','round'].entries()) {
        assert.deepEqual(await comparisons.nth(index).locator('td').allTextContents(),
          [cross[prefix+'Default'].fixedHits+'/'+denominator,cross[prefix+'Grouped'].fixedHits+'/'+denominator]);
      }
    }
    assert.deepEqual(await ticket(page),names);
    if(save) {
      await roundSelect.selectOption(device==='mobile'?'epl22-stage2':'major');
      await roundStudy.evaluate(n=>n.scrollIntoView({block:'center'}));
      await page.screenshot({path:path.join(__dirname,device+'-round-form.png')});
    }
    await roundStudy.locator(':scope > summary').click();
    const mapStudy=page.locator('#stage3-map-study');
    await mapStudy.locator(':scope > summary').click();
    const expectedMaps=require('../../stage3_maps/summary.json');
    const scores=await mapStudy.locator('tbody tr').allTextContents();
    for(const [i,key] of ['base','veto','appearance'].entries()) {
      const result=expectedMaps.major[key];
      assert(scores[i].includes(result.fixedPasses+'/3') && scores[i].includes(result.fixedHits+'/30') && scores[i].includes(result.bo3.brier.toFixed(4)));
    }
    const cologne=mapStudy.locator('details'), study=require('../../cologne_veto/eval-report.json');
    await cologne.locator('summary').click();
    const text=await cologne.innerText(), range=require('../../cologne_veto/map-range.json').summary;
    for(const bo of ['bo1','bo3']){
      const {verified,total}=study.sourceCoverage[bo];
      assert(text.includes(bo.toUpperCase()+' '+verified+'/'+total));
    }
    for(const group of ['old25','added']) assert(text.includes(study.summary[group].bo3.brier.toFixed(4)));
    assert(text.includes('其中 '+range.alwaysUnderdog+' 场'));
    assert(text.includes('固定卡中 '+study.summary.agreementOnly.fixedHits+'/10'));
    if(save && device==='mobile') {
      await cologne.evaluate(n=>n.scrollIntoView({block:'center'}));
      await page.screenshot({path:path.join(__dirname,'mobile-cologne-veto.png')});
    }
    await cologne.locator('summary').click();
    await mapStudy.locator(':scope > summary').click();
    assert.deepEqual(await page.locator('.history-score').allTextContents(),['5 /10','3 /10','5 /10']);
    assert.deepEqual(await ticket(page),names);
  }
  await page.locator('.history-sidebar').evaluate(n=>n.scrollIntoView({block:'start'}));
  if(save) await page.screenshot({path:path.join(__dirname,device+'-'+(before?'before':'after')+'.png')});
  if(!before){
    const study=await page.evaluate(()=>PICK_DATA.find(e=>e.id==='singapore').reverseStageStudy);
    for(const st of [1,2]){
      await page.locator(phase(st)).click();
      const fold=page.locator('#stage-transfer-study');
      if(await fold.getAttribute('open')===null) await fold.locator(':scope > summary').click();
      if(st===1) {
        const splits=fold.locator('.transfer-breakdown');
        assert.equal(await splits.count(),2);
        await splits.nth(0).locator('summary').click();
        for(const team of study.firstStageSources.shanghai) assert((await splits.nth(0).innerText()).includes(team.team));
        await splits.nth(0).locator('summary').click();
        await splits.nth(1).locator('summary').click();
        const rows=await splits.nth(1).locator('tbody tr').allTextContents();
        for(const [i,key] of ['vrs','targetOnly','earlierDonors'].entries()) {
          const out=study.firstStageSources.external[key];
          assert(rows[i].includes(out.hits+'/10') && rows[i].includes(out.brier.toFixed(4)));
        }
        if(save && device==='mobile') {
          await splits.nth(1).evaluate(n=>n.scrollIntoView({block:'center'}));
          await page.screenshot({path:path.join(__dirname,'mobile-external-stage1.png')});
        }
        await splits.nth(1).locator('summary').click();
      }
      const select=fold.getByRole('combobox');
      for(const e of study.stages.filter(r=>r.stage===st)) {
        await select.selectOption(e.id);
        const raw=await fold.locator('.same-edition-review').innerText();
        if(e.postDonorIds.length){
          assert(raw.includes(e.postThrough));assert(raw.includes(e.scores.earlierDonors+'/10'));assert(raw.includes(e.scores.hindsight+'/10'));
        }else assert(raw.includes('本届没有 Stage 3'));
      }
      if(st===1 && device==='mobile' && save) {
        await select.selectOption('cologne');
        await fold.evaluate(n=>n.scrollIntoView({block:'start'}));
        await page.screenshot({path:path.join(__dirname,'mobile-stage1-review.png')});
      }
      assert.deepEqual(await totals(page),['27 / 50','25 / 50','13 / 30']);
      assert.deepEqual(await ticket(page),names);
    }
    await page.locator(phase(3)).click();
    await page.locator('[data-family=boost]').click();
    await ready(page,['21 / 50','26 / 50','9 / 30']);
    assert(await page.locator('#stage3-allocation').isDisabled());
    await page.locator('[data-family=v4]').click();
    await ready(page,['27 / 50','25 / 50','13 / 30']);
    await page.locator('#stage3-allocation').uncheck();
    await ready(page,['27 / 50','25 / 50','9 / 30']);
    assert.deepEqual(await ticket(page),names);
    await page.locator('#strategy-title').click();
    const checked=await page.locator('#feature-form').isChecked();
    await page.locator('#feature-form').click();
    assert.notEqual(await page.locator('#feature-form').isChecked(),checked);
    await page.waitForFunction(()=>document.querySelector('#workspace[aria-busy=false]') && document.querySelector('#history-strategy')?.textContent.includes('自选') &&
      [...document.querySelectorAll('.stage-hits')].length===3 && [...document.querySelectorAll('.stage-hits')].every(n=>n.textContent.includes('/')));
    await page.locator('#restore-model').click();
    await ready(page,['27 / 50','25 / 50','13 / 30']);
    await page.locator('.workspace-tabs [data-view=bracket]').click();
    await page.locator('.sb-team').first().click();
    await ready(page,['27 / 50','25 / 50','13 / 30']);
    assert.equal(await page.locator('.sb-won').count(),1);
    await page.locator('[data-action=clear-locks]').last().click();
    await ready(page,['27 / 50','25 / 50','13 / 30']);
    assert.equal(await page.locator('.sb-won').count(),0);
    const windows=require('../../stage_goals/rolling.cjs').build(path.join(__dirname,'../../forecast_archive/prospective')).windows;
    const ledger=page.locator('#rolling-goal');
    for(const window of windows) {
      await page.locator(phase(window.stage)).click();
      if(!await ledger.evaluate(node=>node.open)) await ledger.locator('summary').click();
      assert.deepEqual(await ledger.locator('tbody tr td:last-child').allTextContents(),window.rows.map(r=>r.hits===null?'—':r.hits+'/10'));
      assert((await ledger.innerText()).includes('取最近 '+window.windowSize+' 届已完赛记录，目标为过 '+window.requiredPasses+' 届'));
      assert((await page.locator('#history-goal-status').innerText()).includes(window.requiredPasses+' 届过关'));
      for(const entry of window.pending) assert((await ledger.innerText()).includes(entry.label));
    }
    await page.goto(url+'#verify/calibration');
    const report=require('../../tail_calibration/summary.json'), studyPanel=page.locator('#context-calibration');
    const selector=studyPanel.getByRole('combobox');
    const sgStudy=studyPanel.locator('[data-pick-detail="singapore-calibration"]');
    await sgStudy.locator('summary').click();
    const frozen=require('../../tail_calibration/singapore-study.json');
    const download=await sgStudy.getByRole('link').getAttribute('href');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../dist',download),'utf8')),frozen);
    const officialScore=await page.evaluate(()=>PICK_DATA.find(e=>e.id==='singapore').tailScore);
    if(officialScore.status==='pending') assert((await sgStudy.innerText()).includes('完赛后'));
    else assert.equal(await sgStudy.locator('tbody tr').count(),4);
    await sgStudy.locator('summary').click();
    for(const key of ['s21','s22','s23','stage1','stage2','stage3']) {
      await selector.selectOption(key);
      const g=report[key], mainRows=studyPanel.locator('.result-table').first().locator('tbody tr');
      let index=0;
      for(const key of ['recommended','recommendedCal','vrs','vrsCal']) {
        const m=g.methods[key];
        if(!m) continue;
        assert.deepEqual(await mainRows.nth(index++).locator('td').allTextContents(),[m.passes+'/'+g.events.length,m.hits+'/'+(10*g.events.length),
          m.errors.bo3.brier.toFixed(4),m.errors.bo3.logLoss.toFixed(4)]);
      }
      for(const [base,bins] of Object.entries(g.upsetBins)) {
        const detail=studyPanel.locator('[data-pick-detail="cal-bins-'+base+'"]');
        if(!await detail.evaluate(node=>node.open)) await detail.locator('summary').click();
        assert.deepEqual(await detail.locator('tbody tr td:last-child').allTextContents(),bins.filter(b=>b.label!=='50/50').map(b=>String(b.actual)));
        await detail.locator('summary').click();
      }
    }
    if(save) {
      await selector.selectOption('s21');
      await studyPanel.locator('[data-pick-detail="cal-bins-vrs"] summary').click();
      await studyPanel.evaluate(n=>n.scrollIntoView({block:'start'}));
      await page.screenshot({path:path.join(__dirname,device+'-calibration.png')});
    }
    await page.goto(url+'#verify/f1bre');
    const f1=page.locator('#f1bre-model-compare'), f1Field=f1.locator('#f1-field');
    const stored=require('../../f1bre_models/website.cjs').build();
    for(const [key,g] of Object.entries(stored.groups)) {
      await f1Field.selectOption(key);
      const rows=f1.locator('#f1-history table').first().locator('tbody tr');
      for(const [i,id] of ['baseline','elo','ml','blend'].entries()) {
        const m=g.methods[id];
        const cells=await rows.nth(i).locator('td').allTextContents();
        assert.deepEqual(cells.slice(0,3),[m.passes+'/'+g.events,m.hits+'/'+(10*g.events),m.slots[2]+'/'+(2*g.events)]);
        await f1.locator('#f1-history-model').selectOption(id);
        const byEvent=f1.locator('#f1-history table').last().locator('tbody tr');
        assert.deepEqual(await byEvent.locator('td:last-child').allTextContents(),m.byEvent.map(r=>r.search.hits+'/10'));
      }
    }
    for(const stage of [1,2,3]){
      await page.locator(phase(stage)).click();
      const sidebar=page.locator('#f1-sidebar');
      if(!await sidebar.evaluate(n=>n.open))await sidebar.locator('summary').click();
      const g=stored.groups['stage'+stage];
      assert.deepEqual(await sidebar.locator('tbody td:last-child').allTextContents(),[...['baseline','elo','ml','blend'].map(k=>g.methods[k].hits+'/'+(10*g.events)),
        stored.formatStudy.groups['stage'+stage].hybrid.hits+'/'+(10*g.events)]);
      await sidebar.getByRole('link',{name:'查看实战与原帖卡面'}).click();
      assert.equal(await f1Field.inputValue(),'stage'+stage);
    }
    await page.locator('#f1-sidebar summary').click();
    await page.goto(url+'#verify/f1bre/formats');
    const formats=page.locator('#f1-format-study');
    assert(await formats.evaluate(n=>n.open));
    assert.equal(await formats.locator('tbody tr').count(),4);
    assert((await formats.innerText()).includes('0.2935 到 0.2499'));
    await f1Field.selectOption('stage3');
    if(save){
      await f1.evaluate(n=>n.parentElement.scrollIntoView({block:'start'}));
      await page.screenshot({path:path.join(__dirname,device+'-f1bre-after.png')});
    }
    const predictions=f1.locator('details').filter({has:page.locator('#f1-forecast-model')});
    await predictions.locator(':scope > summary').click();
    for(const [id,c] of Object.entries(stored.singapore.cards)) {
      await predictions.locator('select').selectOption(id);
      for(const [i,r] of (await predictions.locator('#f1-forecast table').first().locator('tbody tr').all()).entries()) {
        assert.deepEqual(await r.locator('td').allTextContents(),['standard','search'].map(k=>stored.singapore.teams.filter((_,j)=>c[k][j]===i).join('、')));
      }
      const ranked=predictions.locator('#f1-forecast details').first();
      await ranked.locator('summary').click();
      assert.equal(await ranked.locator('tbody tr').count(),3);
      const common=predictions.locator('#f1-forecast details').last();
      await common.locator('summary').click();
      const last=await common.locator('tbody td:last-child').allTextContents();
      assert.deepEqual(last,Object.values(stored.singapore.cross).map(g=>(100*g[id].search.passes/60000).toFixed(1)+'%'));
    }
    assert.equal(await predictions.locator('table').last().locator('tbody tr').count(),8);
    const author=f1.locator('details').filter({has:page.locator('#f1-author-pick')});
    await author.locator(':scope > summary').click();
    for(const item of stored.singapore.authorCards.cards){
      await author.locator('select').selectOption(item.id);
      assert.deepEqual(await author.locator('table').first().locator('tbody td').allTextContents(),item.groups.map(ns=>ns.join('、')));
      assert((await author.innerText()).includes(item.commonSlots+'/10'));
      assert((await author.innerText()).includes(item.reportedRate));
      assert.deepEqual(await author.locator('table').last().locator('tbody td:first-of-type').allTextContents(),
        ['baseline','elo','ml','blend'].map(k=>(100*item.pass[k]).toFixed(1)+'%'));
    }
    if(save){
      await author.locator('select').selectOption('ml1');
      await author.evaluate(n=>n.scrollIntoView({block:'start'}));
      await page.screenshot({path:path.join(__dirname,device+'-f1bre-author.png')});
    }
    const gaps=f1.locator('details').filter({has:page.locator('#f1-author-metric')});
    await gaps.locator(':scope > summary').click();
    for(const id of ['ml','elo'])for(const metric of ['qualified','zero']){
      await gaps.locator('select').selectOption(id+'-'+metric);
      const ns=stored.singapore.marginals.rows;
      assert.deepEqual(await gaps.locator('tbody tr td:first-of-type').allTextContents(),ns.map(t=>t.authors[id][metric].toFixed(1)+'%'));
      for(const team of stored.singapore.marginals.top[id][metric])assert((await gaps.locator('p').first().innerText()).includes(team.name));
    }
    const cologne=f1.locator('details').filter({has:page.getByText('作者在科隆三个阶段各中了几格？',{exact:true})});
    await cologne.locator(':scope > summary').click();
    for(const [i,stage] of stored.cologne.entries()){
      assert.deepEqual(await cologne.locator('table').nth(i).locator('tbody td:last-child').allTextContents(),stage.cards.map(c=>c.hits+'/10'));
      assert.equal(await cologne.getByRole('link').nth(i).getAttribute('href'),stage.source);
    }
    await page.goto(url+'#picks/stage3');
    const shortcut=page.locator('#f1-sidebar');
    if(!await shortcut.evaluate(n=>n.open))await shortcut.locator('summary').click();
    await shortcut.getByRole('link',{name:'同一批晋级队怎样填 3–0？'}).click();
    const panel=page.locator('#context-allocation');
    assert.equal(await panel.locator('#allocation-event').inputValue(),'stage3');
    const source=require('../../ml_allocation/summary.json');
    for(const [id,group] of Object.entries(source.groups)){
      await panel.locator('#allocation-event').selectOption(id);
      for(const [scheme,methods] of Object.entries(group.views)){
        if(scheme!=='primary')await panel.locator('#allocation-draw').selectOption(scheme);
        for(const [model,result] of Object.entries(methods)){
          await panel.locator('#allocation-model').selectOption(model);
          const rows=panel.locator('#allocation-results table').first().locator('tbody tr');
          for(const [i,p] of ['standard','within','grouped'].entries()){
            const r=result.policies[p];
            const passed=result.ns===1?(r.passes?'过关':'未过关'):r.passes+'/'+result.ns;
            assert.deepEqual(await rows.nth(i).locator('td').allTextContents(),[passed,r.hits+'/'+(10*result.ns),r.qualified+'/'+(8*result.ns),String(r.wrongTier)]);
          }
          if(id==='elisa-fall')assert((await panel.innerText()).includes('Endpoint'));
          if(result.donors){
            const prior=panel.locator('details').filter({hasText:'少用哪一届历史会改变过关结果？'});
            await prior.locator('summary').click();
            assert.deepEqual(await prior.locator('tbody tr td:last-child').allTextContents(),result.donors.map(r=>r.hits+'/30'));
          }
        }
      }
    }
    await panel.locator('#allocation-event').selectOption('austin-2025-3');
    await panel.locator('#allocation-model').selectOption('ml');
    await panel.getByText('逐队查看哪些位置变了',{exact:true}).click();
    assert((await panel.innerText()).includes('Spirit'));
    await panel.getByText('查看各栏命中和胜率误差',{exact:true}).click();
    if(save){await panel.evaluate(n=>n.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(__dirname,device+'-ml-allocation.png')});}
    await page.goto(url+'#picks/stage3');
    if(!await shortcut.evaluate(n=>n.open))await shortcut.locator('summary').click();
    await shortcut.getByRole('link',{name:'连续发挥会影响这一阶段吗？'}).click();
    const form=page.locator('#context-form'),data=await page.evaluate(()=>PICK_DATA.find(e=>e.id==='singapore').stageForm);
    assert.equal(await form.locator('#form-stage').inputValue(),'S3');
    for(const [group,models] of Object.entries(data.groups)){
      await form.locator('#form-stage').selectOption(group);
      for(const key of Object.keys(models)){
        await form.locator('#form-model').selectOption(key);
        for(const f of data.fields.filter(f=>f.group===group)){
          await form.locator('#form-event').selectOption(f.id);
          const scores=await form.locator('.form-scores tbody tr td:last-child').allTextContents();
          assert.deepEqual(scores,[f.models[key].control.hits+'/10',f.models[key].trained.hits+'/10']);
          const perfects=await form.locator('table').nth(1).locator('tbody th').allTextContents();
          assert.deepEqual(perfects,f.teams.filter((t,i)=>f.actual[i]===0));
        }
      }
    }
    await form.locator('#form-stage').selectOption('S3');
    await form.locator('#form-event').selectOption('budapest-2025-3');
    await form.locator('#form-model').selectOption('ml');
    const probabilities=form.getByText('查看全部 16 队的 3–0 和 0–3 概率',{exact:true});
    await probabilities.click();assert.equal(await form.locator('table').nth(2).locator('tbody tr').count(),16);await probabilities.click();
    await form.getByText('打完一轮再更新，下一轮能猜得更准吗？',{exact:true}).click();
    assert((await form.innerText()).includes('实打 BO3'));
    if(save){await form.evaluate(n=>n.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(__dirname,device+'-stage-form.png')});}
    await page.goto(url+'#picks/stage3');
    if(!await shortcut.evaluate(n=>n.open))await shortcut.locator('summary').click();
    if(save)await shortcut.screenshot({path:path.join(__dirname,device+'-veto-link-after.png')});
    await shortcut.getByRole('link',{name:'查对手禁选和 BO3 胜率'}).click();
    const veto=page.locator('#context-veto'),vetoStudy=await page.evaluate(()=>PICK_DATA.find(e=>e.id==='singapore').vetoML);
    assert.equal(await veto.locator('#veto-stage').inputValue(),'S3');
    for(const f of vetoStudy.fields){
      await veto.locator('#veto-stage').selectOption(f.group);
      await veto.locator('#veto-event').selectOption(f.id);
      assert.equal(await veto.locator('#veto-match option').count(),f.pairs.length);
      const i=Math.max(0,f.pairs.findIndex(p=>p.planned && p.playedMaps.length===2));
      await veto.locator('#veto-match').selectOption(String(i));
      const p=f.pairs[i],text=await veto.innerText();
      assert(text.includes((p.candidate*100).toFixed(1)+'%'));
      if(f.set){
        assert(text.includes(f.set.eligible+'/'+f.set.expected+' 场实打 BO3'));
        assert(text.includes('2–0，决胜图未打'));
        assert.deepEqual(await veto.locator('table').first().locator('tbody tr td:last-child').allTextContents(),
          ['reference','original','candidate'].map(k=>f.methods[k].hits+'/10'));
      }else{
        assert(text.includes('新加坡 Stage 1 已封存'));
        assert.equal(await veto.getByRole('link',{name:'下载赛前封存'}).getAttribute('href'),'forecasts/veto-ml-singapore-stage1.json');
      }
    }
    await veto.locator('#veto-stage').selectOption('S3');
    await veto.locator('#veto-event').selectOption('cologne-2026-3');
    if(save){await veto.evaluate(n=>n.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(__dirname,device+'-veto-ml.png')});}
    await page.goto(url+'#picks/stage3');
    if(!await shortcut.evaluate(n=>n.open))await shortcut.locator('summary').click();
    if(saveBo5)await shortcut.screenshot({path:path.join(__dirname,device+'-bo5-link-after.png')});
    await shortcut.getByRole('link',{name:'哪些 0–3 候选有漏算的比赛？'}).click();
    const bo5=page.locator('#context-bo5'),hist=await page.evaluate(()=>PICK_DATA.find(e=>e.id==='singapore').bo5History);
    assert.equal(await bo5.locator('#bo5-group').inputValue(),'S3');
    for(const f of hist.fields){
      await bo5.locator('#bo5-group').selectOption(f.group);
      if(hist.fields.filter(other=>other.group===f.group).length>1)await bo5.locator('#bo5-event').selectOption(f.id);
      assert.equal(await bo5.locator('#bo5-team option').count(),16);
      const t=f.teams.reduce((a,b)=>a.extra>b.extra?a:b);
      await bo5.locator('#bo5-team').selectOption(t.name);
      assert.equal(await bo5.locator('dd').first().innerText(),t.base+' → '+(t.base+t.extra));
      if(t.extra){
        const box=bo5.locator('details').filter({hasText:'查看补入的'});
        await box.locator('summary').click();
        assert.equal(await box.locator('li a').count(),t.history.length);
      }
      if(f.actual){
        const cell=hist.groups[f.group].n>1?'td:last-child':'td:nth-of-type(2)';
        const scores=await bo5.locator('table').first().locator('tbody tr '+cell).allTextContents();
        assert.deepEqual(scores,[f.cards[0][0],f.cards[1][0],f.cards[0][1],f.cards[1][1]].map(n=>n+'/10'));
      }else assert.equal(await bo5.getByRole('link',{name:'下载赛前研究卡与 120 对胜率'}).getAttribute('href'),hist.forecast.webFile);
      if(hist.cohorts[f.group]){
        const box=bo5.locator('details').filter({hasText:'上阶段 3–2 晋级的队伍，后来有几支 0–3？'});
        await box.locator('summary').click();
        assert.equal(await box.locator('tbody tr').count(),4);
      }
    }
    await bo5.locator('#bo5-group').selectOption('Astana');
    assert.equal(await bo5.locator('#bo5-team').inputValue(),'Ninjas in Pyjamas');
    assert.equal(await bo5.locator('dd').first().innerText(),'36 → 44');
    assert.equal(await bo5.locator('dd').last().innerText(),'3–2 晋级');
    await bo5.getByText('查看补入的 8 张地图（6 胜 2 负）',{exact:true}).click();
    if(saveBo5){await bo5.evaluate(n=>n.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(__dirname,device+'-bo5-history.png')});}
    await page.goto(url+'#picks/stage3');
    if(!await shortcut.evaluate(n=>n.open))await shortcut.locator('summary').click();
    if(saveElite)await shortcut.screenshot({path:path.join(__dirname,device+'-elite-link-after.png')});
    await shortcut.getByRole('link',{name:'打前八的战绩能改善 BO3 胜率吗？'}).click();
    const elite=page.locator('#context-elite'),eliteStudy=await page.evaluate(()=>PICK_DATA.find(e=>e.id==='singapore').eliteOpponents);
    for(const [id,f] of Object.entries(eliteStudy.fields)){
      await elite.locator('#elite-field').selectOption(id);
      assert.equal(await elite.locator('#elite-team option').count(),16);
      const i=f.names.length-1,j=0,p=f.pairs.find(r=>r.a===j && r.b===i);
      await elite.locator('#elite-team').selectOption(f.names[i]);
      await elite.locator('#elite-opponent').selectOption(f.names[j]);
      assert.equal(await elite.locator('dd').last().innerText(),((1-p.adjusted)*100).toFixed(1)+'%');
      const records=elite.locator('details').first();await records.locator('summary').click();
      assert.equal(await records.locator('tbody tr').count(),f.matches.filter(r=>r.a===i||r.b===i).length);
      const n=await elite.locator('table').first().locator('tbody tr td:first-of-type').allTextContents();
      assert.deepEqual(n,[f.metrics.bo3.n,f.metrics.eligible.n].map(String));
    }
    await elite.locator('#elite-field').selectOption('cluj-2025');
    const rosters=elite.locator('details').filter({hasText:'核对五届 Major 的实际首发'});
    await rosters.locator('summary').click();
    const currentFives=elite.locator('details').filter({hasText:'新加坡 16 队有多少同阵容 BO3？'});
    await currentFives.locator('summary').first().click();
    assert.equal(await currentFives.locator('tbody tr').count(),16);
    assert.deepEqual(await currentFives.locator('tr').filter({hasText:/^9z/}).locator('td').allTextContents(),['0','27','0']);
    const sgData=eliteStudy.singapore;
    for(const [n] of sgData.rows){
      await currentFives.locator('#elite-sg-team').selectOption(n);
      assert((await currentFives.innerText()).includes('两档合计 '+sgData.extra[n].combined+' 场'));
      if(sgData.extra[n].witness)assert(await currentFives.locator('a').evaluateAll((links,href)=>links.some(a=>a.href===href),sgData.extra[n].witness.source));
    }
    await currentFives.locator('summary').first().click();
    assert.equal(await rosters.locator('#elite-roster-stage option').count(),13);
    for(const [id,f] of Object.entries(eliteStudy.audit.stages)){
      await rosters.locator('#elite-roster-stage').selectOption(id);
      assert.equal(await rosters.locator('#elite-roster-team option').count(),16);
      const t=f.teams.find(t=>t.overlap<5)??f.teams[0];
      await rosters.locator('#elite-roster-team').selectOption(t.name);
      assert.equal(await rosters.locator('a').getAttribute('href'),t.source);
      assert.deepEqual(await rosters.locator('tbody td').allTextContents(),[t.predicted,t.actual,t.vrs].map(v=>v.join(' · ')));
    }
    await rosters.locator('summary').click();
    if(saveElite){await elite.evaluate(n=>n.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(__dirname,device+'-elite-opponents.png')});}
    await page.goto(url+'#picks/forecasts');
    await page.getByRole('link',{name:'核对新加坡 16 队同阵容的比赛'}).click();
    assert(await page.locator('#elite-singapore').evaluate(n=>n.open));
    if(saveElite){
      const sg=page.locator('#elite-singapore');
      await sg.locator('#elite-sg-team').selectOption('Chinggis Warriors');
      await sg.getByText('查看 Griffin 逐场记录',{exact:true}).click();
      await sg.evaluate(n=>n.scrollIntoView({block:'start'}));
      await page.screenshot({path:path.join(__dirname,device+'-singapore-bo3-coverage.png')});
    }
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);await page.close();
  console.log(device,before?'old sidebar captured':'separate goals, candidate and as-of controls verified');
}
async function checkFutureResearchCard(browser,origin){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  // A temporary browser response exercises the post-qualification UI without creating a forecast.
  await page.route('**/data.js',async route=>{
    const response=await route.fetch();
    const fixture=String(function(){
      const e=PICK_DATA.find(t=>t.id==='singapore'),original=e.prospectiveStages[0];
      const teams=e.teams.map(t=>t.name);
      const fakeScores=Object.fromEntries(['original','candidate','originalPure','candidatePure'].map((k,i)=>[k,{hits:3+i}]));
      e.bo5History.forecast={...e.bo5History.forecast,status:'scored',scores:fakeScores,actual:teams.map((_,i)=>i<2?0:i<8?1:i<10?2:3)};
      const standard=teams.map((_,i)=>i<2?0:i<8?1:i>13?2:3);
      const within=standard.slice();[within[1],within[4]]=[within[4],within[1]];
      e.prospectiveStages=[original,{...original,stage:3}];
      e.stage3MlForecasts=[{edition:original.edition,stage:3,teams,cards:{standard,within,grouped:within},frozenAt:original.cards[0].frozenAt,
        selectedPolicy:'within',webFile:'forecasts/prospective/example.json',score:{cards:{standard:{hits:4},within:{hits:6},grouped:{hits:5}}}}];
    });
    await route.fulfill({response,body:(await response.text())+'\n;('+fixture+')();'});
  });
  try {
    await page.goto(origin+'#picks/forecasts');
    const root=page.locator('[data-ml-ticket]');await root.locator('summary').click();
    assert.deepEqual(await root.locator('tbody tr').last().locator('td').allTextContents(),['4/10','6/10','5/10']);
    const rows=await root.locator('tbody tr').all();assert.equal(rows.length,4);
    assert.notEqual(await rows[0].locator('td').nth(0).innerText(),await rows[0].locator('td').nth(1).innerText());
    assert((await root.innerText()).includes('赛前指定的主要填法为只调 3–0'));
    await page.goto(origin+'#verify/bo5/singapore');
    const bo5=page.locator('#context-bo5');
    assert.equal(await bo5.locator('#bo5-group').inputValue(),'Singapore');
    const graded=bo5.locator('table').filter({hasText:'是否过关'});
    assert.deepEqual(await graded.locator('tbody tr td:first-of-type').allTextContents(),['3/10','4/10','5/10','6/10']);
  }finally{await page.close();}
}
async function main(){
  const dist=path.resolve(__dirname,'../../dist');
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const filename=path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!filename.startsWith(dist+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);res.end();return;}
    const types={'.js':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp'};
    res.writeHead(200,{'content-type':types[path.extname(filename)]||'application/octet-stream'});
    fs.createReadStream(filename).pipe(res);
  });
  const local=process.argv.includes('--http');
  if(local) await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=process.env.PICKEM_PREVIEW || (local?'http://127.0.0.1:'+server.address().port+'/':file);
  const browser=await chromium.launch({executablePath:process.env.PICKEM_CHROME||undefined,headless:true});
  try{
    await check(browser,'desktop',1440,960,origin);
    await check(browser,'mobile',390,844,origin);
    const checkingPrevious=['--veto-before','--bo5-before','--elite-before','--roster-before','--roster-panel'].some(v=>process.argv.includes(v));
    if(!before && !brandBefore && origin!==file && !checkingPrevious) await check(browser,'offline',390,844,file,false);
    if(!before && !brandBefore && local && !checkingPrevious)await checkFutureResearchCard(browser,origin);
  }finally{await browser.close();if(server.listening) await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
