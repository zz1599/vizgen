// UI 冒烟检查：用系统 Edge 无头浏览器走完登录→工作台→生成→预览全流程
// 用法：node scripts/ui-check.js
'use strict';
const path = require('node:path');
const { chromium } = require('playwright-core');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SHOT_DIR = path.join(__dirname, '..', 'shots');

(async () => {
  const fs = require('node:fs');
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  // 1. 登录页
  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' });
  await page.fill('#email', 'demo@vizgen.dev');
  await page.fill('#password', 'demo1234');
  await page.click('#auth-go');
  await page.waitForURL('**/#/projects', { timeout: 10000 });
  await page.waitForSelector('.proj-card', { timeout: 10000 });
  console.log('[1] 登录 + 项目列表 OK');
  await page.screenshot({ path: path.join(SHOT_DIR, '1-projects.png') });

  // 2. 打开示例项目工作台
  await page.click('.proj-card:nth-child(2)');
  await page.waitForURL('**/workbench/**', { timeout: 10000 });
  await page.waitForSelector('.agent-card', { timeout: 10000 });
  await page.waitForSelector('#pv-frame', { timeout: 15000 });
  await page.waitForTimeout(2500); // 等 ECharts CDN 渲染
  console.log('[2] 工作台 + 看板预览 OK');
  await page.screenshot({ path: path.join(SHOT_DIR, '2-workbench.png') });

  // 3. 对话式迭代
  await page.fill('#chat-text', '把柱状图换成折线图');
  await page.click('#send-btn');
  await page.waitForFunction(() => document.querySelectorAll('#chat-msgs .agent-card').length >= 2, { timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('[3] 对话式迭代 OK');

  // 4. 切到代码视图
  await page.click('.tabs button[data-tab="code"]');
  await page.waitForTimeout(1200);
  console.log('[4] 代码视图 OK');
  await page.screenshot({ path: path.join(SHOT_DIR, '3-code.png') });

  await browser.close();
  if (errors.length) {
    console.log('\n发现前端错误:');
    errors.slice(0, 10).forEach(e => console.log('  - ' + e));
    process.exit(1);
  }
  console.log('\nUI 冒烟检查全部通过，无前端报错。截图见 shots/');
})().catch(e => { console.error('UI check failed:', e.message); process.exit(1); });
