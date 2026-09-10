'use strict';
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'https://e652c870f6df42de82948001404991fa.app.workbuddy.link';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('response', async r => { if (r.url().includes('/api/') && r.status() >= 400) errors.push('API ' + r.status() + ' ' + r.url().split('/api/')[1]); });

  const email = 'e2e' + Date.now() + '@test.dev';
  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' });
  await page.click('.auth-tabs button[data-m="register"]');
  await page.fill('#email', email);
  await page.fill('#password', 'test123456');
  await page.click('#auth-go');
  await page.waitForURL('**/#/projects', { timeout: 15000 });
  await page.waitForSelector('.new-proj', { timeout: 10000 });

  await page.click('.new-proj');
  await page.waitForSelector('#np-name', { timeout: 5000 });
  await page.fill('#np-name', '端到端验证项目');
  await page.click('#np-create');
  await page.waitForURL('**/workbench/**', { timeout: 15000 });
  console.log('[1] 注册 + 创建项目 + 进入工作台 OK:', await page.evaluate(() => location.hash));

  // 导入示例数据并生成
  await page.waitForSelector('#use-sample', { timeout: 10000 });
  await page.click('#use-sample');
  await page.waitForTimeout(1500);
  await page.fill('#chat-text', '生成一个销售数据看板');
  await page.click('#send-btn');
  await page.waitForFunction(() => document.body.innerText.includes('已生成看板') || document.body.innerText.includes('已更新'), { timeout: 60000 });
  console.log('[2] 导入示例数据 + Agent 生成看板 OK');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'shots/e2e-final.png' });

  await browser.close();
  if (errors.length) { console.log('错误:'); errors.slice(0, 8).forEach(e => console.log(' ', e)); process.exit(1); }
  console.log('端到端全流程通过，无 4xx/5xx、无前端报错');
})().catch(e => { console.error('E2E FAILED:', e.message); process.exit(1); });
