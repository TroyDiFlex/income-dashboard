import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {CONFIG} from '../config.js';
import {validateData, summarize} from '../model.js';
import {harness} from '../tests/server-harness.mjs';
import {demoData, screenshotDate} from '../docs/screenshots/demo-data.mjs';

let chromium;
try { ({chromium} = await import('playwright')); }
catch { ({chromium} = await import('../.local/node_modules/playwright/index.mjs')); }

const root = new URL('../',import.meta.url);
const output = new URL('../docs/screenshots/',import.meta.url);
const files = new Set(['index.html','style.css','app.js','api.js','config.js','model.js','chart.js','pwa.js','icon.svg','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png']);
const types = {html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',svg:'image/svg+xml',png:'image/png',webmanifest:'application/manifest+json'};
const server = http.createServer(async (req,res) => {
  try {
    const name = new URL(req.url,'http://localhost').pathname.slice(1) || 'index.html';
    if (!files.has(name)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type',types[name.split('.').at(-1)]);
    res.setHeader('Cache-Control','no-store');
    res.end(await fs.readFile(new URL(name,root)));
  } catch { res.writeHead(500).end(); }
});

await fs.mkdir(output,{recursive:true});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const snapshots = [], errors = [], unexpectedRequests = [];
let browser;

async function settle(page) {
  await page.mouse.move(0,0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
    for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame);
  });
}

async function start(theme, mobile = false) {
  const fixture = validateData(demoData());
  const backend = await harness(fixture,'readme-demo-only');
  backend.advance(new Date(screenshotDate).getTime() - backend.now());
  const context = await browser.newContext({
    viewport: mobile ? {width:390,height:844} : {width:1600,height:1000},
    deviceScaleFactor:2, locale:'ru-RU', timezoneId:'Asia/Tbilisi',
    reducedMotion:'reduce', isMobile:mobile, hasTouch:mobile, serviceWorkers:'block',
  });
  // Every API call stays in the in-memory harness. No live credentials or data.
  await context.route('**/*',async route => {
    const request = route.request();
    if (request.url() === CONFIG.apiUrl) {
      const result = backend.request(JSON.parse(request.postData()));
      if (!result.ok) errors.push(`Demo API: ${result.code}`);
      await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    } else if (new URL(request.url()).origin === origin) {
      await route.continue();
    } else {
      unexpectedRequests.push(new URL(request.url()).origin);
      await route.abort();
    }
  });
  await context.addInitScript(value => localStorage.setItem('potok-theme',value),theme);
  const page = await context.newPage();
  page.on('pageerror',error => errors.push(error.message));
  await page.clock.setFixedTime(new Date(screenshotDate));
  await page.goto(origin);
  await page.locator('#password').fill('readme-demo-only');
  await page.locator('#login-submit').click();
  await page.locator('#workspace').waitFor({state:'visible'});
  await settle(page);
  assert.equal(await page.locator('#login-error').textContent(),'');
  assert.equal(await page.locator('.metric').count(),6);
  const total = summarize(fixture).total / 100;
  assert.equal(Number((await page.locator('#hero-total').textContent()).replace(/\D/g,'')),total);
  return {page,context};
}

async function capture(page,name,description) {
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page);
  const state = await page.evaluate(() => ({
    theme:document.documentElement.dataset.theme,
    route:location.hash || '#overview',
    viewport:{width:innerWidth,height:innerHeight},
    scrollY:Math.round(scrollY),
    tableScrollX:Math.round(document.querySelector('#table-container').scrollLeft),
    pageWidth:document.documentElement.scrollWidth,
  }));
  assert.ok(state.pageWidth <= state.viewport.width,`${name}: horizontal page overflow`);
  const path = fileURLToPath(new URL(`${name}.png`,output));
  await page.screenshot({path,animations:'disabled'});
  snapshots.push({file:`${name}.png`,description,...state});
  console.log(`Saved ${name}: ${state.theme}, scroll ${state.scrollY}, table ${state.tableScrollX}`);
}

async function entries(page,mode) {
  await page.locator('[data-route="entries"]').click();
  await page.locator('#entries-view').waitFor({state:'visible'});
  await page.locator(`[data-mode="${mode}"]`).click();
  if (mode === 'month') await page.locator('#entry-month').fill('2026-08');
  await page.evaluate(() => scrollTo(0,0));
}

try {
  const channel = process.env.SCREENSHOT_BROWSER || 'msedge';
  browser = await chromium.launch({headless:true,...(channel === 'chromium' ? {} : {channel})});

  {
    const {page,context} = await start('violet');
    await page.locator('#source-filter-trigger').click();
    for (const id of ['salary','freelance','consulting']) {
      await page.locator(`.source-filter-option:has([data-filter-source][value="${id}"])`).click();
    }
    await page.locator('#source-filter-trigger').click();
    await settle(page);
    assert.equal(await page.locator('#chart .data-line').count(),4);
    assert.equal(await page.locator('#source-filter-label').textContent(),'Все источники + 3');
    const coverTotal = summarize(demoData()).total / 100;
    assert.equal(Number((await page.locator('#hero-total').textContent()).replace(/\D/g,'')),coverTotal);
    const overviewHeight = await page.locator('.breakdowns').evaluate(element => Math.floor(element.getBoundingClientRect().top) - 1);
    await page.setViewportSize({width:1600,height:overviewHeight});
    await capture(page,'overview-violet','Обзор: общая сумма и три источника · Аметист');
    await entries(page,'month');
    await page.setViewportSize({width:1600,height:1140});
    await capture(page,'month-violet','Ввод за август 2026 · Аметист');
    await context.close();
  }
  {
    const {page,context} = await start('midnight');
    await page.locator('[data-period="custom"]').click();
    await page.locator('#filter-from').fill('2025-09');
    await page.locator('[data-chart="bars"]').click();
    const overviewHeight = await page.locator('.breakdowns').evaluate(element => Math.floor(element.getBoundingClientRect().top) - 1);
    await page.setViewportSize({width:1600,height:overviewHeight});
    await capture(page,'overview-midnight','Столбцы за выбранный период · Полночь');
    await context.close();
  }
  {
    const {page,context} = await start('forest');
    await page.locator('[data-chart="smooth"]').click();
    await page.evaluate(() => scrollTo(0,document.documentElement.scrollHeight));
    await capture(page,'analytics-forest','Прокрутка к структуре дохода · Лес');
    await context.close();
  }
  {
    const {page,context} = await start('light');
    await page.locator('[data-comparison="average"]').click();
    await page.evaluate(() => scrollTo(0,document.documentElement.scrollHeight));
    await capture(page,'analytics-light','Сравнение средних доходов · Жемчуг');
    await entries(page,'table');
    await page.locator('#table-container').evaluate(element => { element.scrollLeft = 330; });
    await capture(page,'entries-light','Таблица 2026 с горизонтальной прокруткой · Жемчуг');
    await context.close();
  }
  {
    const {page,context} = await start('violet',true);
    await capture(page,'mobile-violet','Мобильный обзор · Аметист');
    await context.close();
  }
  {
    const {page,context} = await start('forest',true);
    await page.locator('.share-card').evaluate(element => scrollTo(0,element.getBoundingClientRect().top + scrollY - 24));
    await capture(page,'mobile-forest','Мобильная структура доходов после прокрутки · Лес');
    await context.close();
  }
  {
    const {page,context} = await start('midnight',true);
    await entries(page,'month');
    await capture(page,'mobile-midnight','Мобильный ввод за август 2026 · Полночь');
    await context.close();
  }
  assert.deepEqual(unexpectedRequests,[],'No external network requests');
  assert.deepEqual(errors,[],'No browser or demo API errors');
  await fs.writeFile(new URL('manifest.json',output),JSON.stringify({
    data:'Fictional; generated by demo-data.mjs',date:screenshotDate,deviceScaleFactor:2,snapshots,
  },null,2) + '\n');
  console.log(`Verified ${snapshots.length} screenshots. No external requests or browser errors.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
