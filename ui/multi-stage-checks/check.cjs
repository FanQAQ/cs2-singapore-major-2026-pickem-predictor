'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function assertGroups(page, family, variant) {
  const report = require('../../multi_stage_train/report.json');
  const expected = report.groups;
  for (const stage of [1, 2, 3]) {
    const row = page.locator('[data-history-stage="' + stage + '"]');
    const score = expected['stage'+stage][family][variant];
    assert.equal(await row.locator('.stage-passes').textContent(), score.passes+' / '+score.stages);
    assert.equal(await row.locator('.stage-hits').textContent(), score.hits+' / '+(score.stages*10));
  }
}

async function main() {
  const before = process.argv.includes('--before');
  const url = process.env.PICKEM_PREVIEW || pathToFileURL(path.resolve(__dirname, '../../dist/index.html')).href;
  const browser = await chromium.launch({
    executablePath: process.env.PICKEM_CHROME || undefined,
    headless: true
  });
  try {
    for (const [device, width, height] of [['desktop', 1440, 960], ['mobile', 390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: device === 'mobile', hasTouch: device === 'mobile' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url + '#picks');
      await page.waitForFunction(() => document.querySelectorAll('.ticket-team').length === 10 &&
        document.querySelectorAll('.history-score:not(.pending)').length === 5);
      const jump = page.getByRole('button', { name: '历史命中', exact: true });
      await jump.click();
      if (!before) {
        await page.waitForFunction(() => document.querySelector('#history-feedback')?.textContent.includes('13 次'));
        await assertGroups(page, 'recommended', 'base');
        await page.locator('[data-history-stage="2"]').click();
        await page.waitForFunction(() => document.querySelector('#history-stage-title')?.textContent.includes('Stage 2') &&
          document.querySelectorAll('.history-score:not(.pending)').length === 5);
      }
      await page.locator('.history-sidebar').evaluate(n => n.scrollIntoView({block: 'start'}));
      await page.screenshot({path: path.join(__dirname, device + (before ? '-before' : '-after') + '.png')});
      if (!before) {
        await page.locator('[data-history-stage="3"]').click();
        await page.waitForFunction(() => document.querySelectorAll('.history-score:not(.pending)').length === 3);
        assert.match(await page.locator('#history-notes').innerText(), /2024/);
        await page.locator('#history-list summary').first().click();
        assert.match(await page.locator('#history-list details[open]').innerText(), /BO3/);
        await page.locator('[data-family="boost"]').click();
        await page.waitForFunction(() => document.querySelector('#history-strategy')?.textContent.includes('决策树') &&
          document.querySelector('#history-feedback')?.textContent.includes('13 次'));
        await assertGroups(page, 'tree', 'base');
        await page.locator('#strategy-title').click();
        const training = page.locator('#feature-stageTraining');
        assert(await training.isEnabled());
        await training.click();
        await page.waitForFunction(() => document.querySelector('#history-strategy')?.textContent.includes('自选') &&
          document.querySelector('#history-feedback')?.textContent.includes('13 次'), null, {timeout:120000});
        await assertGroups(page, 'tree', 'multiStage');
        await page.locator('#history-training-study summary').click();
        assert.match(await page.locator('#history-training-comparison').innerText(), /科隆.*留出/);
        assert.equal(await page.locator('#history-training-comparison tbody tr').count(), 3);
        await page.locator('#feature-form').click();
        await page.waitForFunction(() => document.querySelector('#history-strategy')?.textContent.includes('当前自选特征') &&
          document.querySelector('#history-feedback')?.textContent.includes('13 次'), null, {timeout:120000});
        await page.selectOption('#fill-mode', 'seed');
        await page.waitForFunction(() => document.querySelector('#history-strategy')?.textContent.includes('种子'));
        assert.equal(await page.locator('#history-list .history-score').count(), 3);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        console.log(device, 'stage controls, feature update and seed mapping verified');
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
