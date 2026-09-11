// VizGen 服务器入口
'use strict';

// 零依赖 .env 加载（KEY=VALUE，# 注释），必须在其他模块 require 之前
(() => {
  try {
    const fs0 = require('node:fs');
    const path0 = require('node:path');
    const envPath = path0.join(__dirname, '.env');
    if (!fs0.existsSync(envPath)) return;
    for (const line of fs0.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) { console.warn('[env] .env 加载失败:', e.message); }
})();

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const db = require('./lib/db');
const authLib = require('./lib/auth');
const { buildDataset } = require('./lib/csv');
const { runPipeline } = require('./lib/pipeline');
const { renderDashboardHTML } = require('./lib/engine');
const SAMPLE_CSV = require('./lib/sample');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// API 响应禁止 CDN/浏览器缓存（防止 401/旧数据被边缘缓存）
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); next(); });

// ---------- auth ----------
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (exists) return res.status(409).json({ error: '该邮箱已注册' });
  const r = db.prepare('INSERT INTO users(email, password_hash) VALUES (?, ?)').run(String(email).toLowerCase(), authLib.hashPassword(password));
  const token = authLib.issueToken(Number(r.lastInsertRowid), String(email).toLowerCase());
  authLib.setAuthCookie(res, token);
  res.json({ token, email: String(email).toLowerCase() });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  if (!u || !authLib.verifyPassword(password || '', u.password_hash)) return res.status(401).json({ error: '邮箱或密码错误' });
  const token = authLib.issueToken(u.id, u.email);
  authLib.setAuthCookie(res, token);
  res.json({ token, email: u.email });
});

app.get('/api/me', authLib.requireAuth, (req, res) => {
  res.json({ uid: req.user.uid, email: req.user.email });
});

// ---------- 诊断端点（部署问题排查用，仅返回认证失败记录摘要）----------
const crypto = require('node:crypto');
app.get('/api/debug', (req, res) => {
  const log = authLib.getRejectedLog().slice(-5).map(r => ({
    at: r.at, authHeader: (r.authHeader || '').slice(0, 120) || null, cookieHeader: (r.cookieHeader || '').slice(0, 200) || null,
    tokenLen: r.tokenLen, tokenHead: r.tokenHead, tokenTail: r.tokenTail,
  }));
  res.json({ node: process.version, recentRejected: log });
});

// ---------- projects ----------
app.get('/api/projects', authLib.requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM versions v WHERE v.project_id = p.id) AS version_count
    FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`).all(req.user.uid);
  res.json(rows);
});

app.post('/api/projects', authLib.requireAuth, (req, res) => {
  const name = String((req.body && req.body.name) || '').trim() || '未命名项目';
  const kind = (req.body && req.body.kind === 'app') ? 'app' : 'dashboard';
  const r = db.prepare('INSERT INTO projects(user_id, name, kind) VALUES (?, ?, ?)').run(req.user.uid, name, kind);
  res.json({ id: Number(r.lastInsertRowid), name, kind });
});

function getOwnedProject(req, res) {
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!p || p.user_id !== req.user.uid) { res.status(404).json({ error: '项目不存在' }); return null; }
  return p;
}

app.get('/api/projects/:id', authLib.requireAuth, (req, res) => {
  const p = getOwnedProject(req, res); if (!p) return;
  const dataset = db.prepare('SELECT * FROM datasets WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(p.id);
  const versions = db.prepare('SELECT id, engine, note, created_at FROM versions WHERE project_id = ? ORDER BY id DESC').all(p.id);
  const latest = versions[0] ? db.prepare('SELECT * FROM versions WHERE id = ?').get(versions[0].id) : null;
  const messages = db.prepare('SELECT id, role, content_json, created_at FROM messages WHERE project_id = ? ORDER BY id ASC').all(p.id)
    .map(m => ({ id: m.id, role: m.role, created_at: m.created_at, ...JSON.parse(m.content_json) }));
  res.json({
    project: p,
    kind: p.kind === 'app' ? 'app' : 'dashboard',
    dataset: dataset ? { id: dataset.id, name: dataset.name, columns: JSON.parse(dataset.columns_json), rowCount: dataset.row_count } : null,
    versions,
    latestVersionId: latest ? latest.id : null,
    latestKind: latest ? (latest.kind === 'app' ? 'app' : 'dashboard') : null,
    latestConfig: latest ? JSON.parse(latest.config_json) : null,
    messages,
  });
});

app.delete('/api/projects/:id', authLib.requireAuth, (req, res) => {
  const p = getOwnedProject(req, res); if (!p) return;
  for (const t of ['messages', 'versions', 'datasets']) db.prepare('DELETE FROM ' + t + ' WHERE project_id = ?').run(p.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

// ---------- dataset ----------
app.post('/api/projects/:id/data', authLib.requireAuth, (req, res) => {
  const p = getOwnedProject(req, res); if (!p) return;
  const { csv, name, useSample } = req.body || {};
  let text = csv;
  if (useSample) { text = SAMPLE_CSV; if (!name) { /* keep sample name */ } }
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'CSV 内容为空' });
  let dataset;
  try { dataset = buildDataset(name || (useSample ? '2026年销售流水（示例）' : '导入数据'), text); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  const r = db.prepare('INSERT INTO datasets(project_id, name, columns_json, rows_json, row_count) VALUES (?, ?, ?, ?, ?)')
    .run(p.id, dataset.name, JSON.stringify(dataset.columns), JSON.stringify(dataset.rows), dataset.rowCount);
  db.prepare("UPDATE projects SET updated_at = datetime('now','localtime') WHERE id = ?").run(p.id);
  res.json({ datasetId: Number(r.lastInsertRowid), name: dataset.name, columns: dataset.columns, rowCount: dataset.rowCount });
});

// ---------- generate（NDJSON 流式 Agent，双模式：数据看板 / 通用应用）----------
app.post('/api/projects/:id/generate', authLib.requireAuth, async (req, res) => {
  const p = getOwnedProject(req, res); if (!p) return;
  const message = String((req.body && req.body.message) || '').trim();
  if (!message) return res.status(400).json({ error: '消息不能为空' });

  const projectKind = p.kind === 'app' ? 'app' : 'dashboard';
  const datasetRow = db.prepare('SELECT * FROM datasets WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(p.id);

  if (projectKind === 'dashboard' && !datasetRow) return res.status(400).json({ error: '请先导入数据' });

  const dataset = datasetRow ? {
    name: datasetRow.name,
    columns: JSON.parse(datasetRow.columns_json),
    rows: JSON.parse(datasetRow.rows_json),
    rowCount: datasetRow.row_count,
  } : null;
  const currentVersion = db.prepare('SELECT * FROM versions WHERE project_id = ? ORDER BY id DESC LIMIT 1').get(p.id);
  const mode = currentVersion ? 'modify' : 'create';

  db.prepare('INSERT INTO messages(project_id, role, content_json) VALUES (?, ?, ?)')
    .run(p.id, 'user', JSON.stringify({ text: message }));

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let finalSteps = [];
  try {
    for await (const evt of runPipeline({
      kind: projectKind, mode, message, dataset,
      currentConfig: currentVersion ? JSON.parse(currentVersion.config_json) : null,
      currentHtml: currentVersion && currentVersion.kind === 'app' ? currentVersion.html_text : null,
    })) {
      if (evt.type === 'steps') finalSteps = evt.steps;
      if (evt.type === 'result') {
        let versionId, summary;
        if (evt.kind === 'app') {
          const r = db.prepare("INSERT INTO versions(project_id, dataset_id, config_json, html_text, kind, engine, note) VALUES (?, NULL, ?, ?, 'app', ?, ?)")
            .run(p.id, JSON.stringify({ title: evt.title, prompt: message.slice(0, 200) }), evt.html, evt.engine, message.slice(0, 80));
          versionId = Number(r.lastInsertRowid);
          summary = (mode === 'create' ? '已生成应用「' + evt.title + '」' : '应用已更新（' + message.slice(0, 40) + '）') + '，' + (evt.html.length / 1024).toFixed(1) + ' KB 代码';
        } else {
          const r = db.prepare('INSERT INTO versions(project_id, dataset_id, config_json, engine, note) VALUES (?, ?, ?, ?, ?)')
            .run(p.id, datasetRow.id, JSON.stringify(evt.config), evt.engine, message.slice(0, 80));
          versionId = Number(r.lastInsertRowid);
          const chartCount = (evt.config.charts || []).length;
          summary = (mode === 'create' ? '已生成看板「' + evt.config.title + '」' : '看板已更新（' + message.slice(0, 40) + '）') + '，共 ' + chartCount + ' 个图表';
        }
        db.prepare('INSERT INTO messages(project_id, role, content_json) VALUES (?, ?, ?)')
          .run(p.id, 'assistant', JSON.stringify({ steps: finalSteps, summary, versionId, engine: evt.engine }));
        db.prepare("UPDATE projects SET updated_at = datetime('now','localtime') WHERE id = ?").run(p.id);
        res.write(JSON.stringify({
          type: 'result', versionId, kind: evt.kind,
          config: evt.config || null, engine: evt.engine, summary,
        }) + '\n');
      } else {
        res.write(JSON.stringify(evt) + '\n');
      }
    }
  } catch (e) {
    try { res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n'); } catch (_) { /* noop */ }
  }
  res.end();
});

// ---------- preview / share ----------
function buildPreview(versionRow) {
  // 应用版本：HTML 直接落库，原样返回
  if (versionRow.kind === 'app' && versionRow.html_text) return versionRow.html_text;
  const ds = db.prepare('SELECT * FROM datasets WHERE id = ?').get(versionRow.dataset_id);
  if (!ds) return '<h3 style="font-family:sans-serif">该版本缺少数据集，无法渲染</h3>';
  const cfg = JSON.parse(versionRow.config_json);
  return renderDashboardHTML(cfg, {
    name: ds.name, columns: JSON.parse(ds.columns_json), rows: JSON.parse(ds.rows_json), rowCount: ds.row_count,
  });
}

app.get('/api/versions/:vid/preview', authLib.requireAuth, (req, res) => {
  const v = db.prepare('SELECT * FROM versions WHERE id = ?').get(req.params.vid);
  if (!v) return res.status(404).json({ error: '版本不存在' });
  const p = db.prepare('SELECT * FROM projects WHERE id = ?').get(v.project_id);
  if (!p || p.user_id !== req.user.uid) return res.status(404).json({ error: '版本不存在' });
  res.type('html').send(buildPreview(v));
});

// 公开分享链接（无需登录）
app.get('/s/:vid', (req, res) => {
  const v = db.prepare('SELECT * FROM versions WHERE id = ?').get(req.params.vid);
  if (!v) return res.status(404).send('<h3 style="font-family:sans-serif">分享链接不存在或已失效</h3>');
  res.type('html').send(buildPreview(v));
});

// ---------- seed ----------
function seed() {
  const n = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (n > 0) return;
  const r = db.prepare('INSERT INTO users(email, password_hash) VALUES (?, ?)').run('demo@vizgen.dev', authLib.hashPassword('demo1234'));
  const uid = Number(r.lastInsertRowid);
  const pr = db.prepare('INSERT INTO projects(user_id, name) VALUES (?, ?)').run(uid, '2026 销售数据看板（示例）');
  const pid = Number(pr.lastInsertRowid);
  const dataset = buildDataset('2026年销售流水（示例）', SAMPLE_CSV);
  const dr = db.prepare('INSERT INTO datasets(project_id, name, columns_json, rows_json, row_count) VALUES (?, ?, ?, ?, ?)')
    .run(pid, dataset.name, JSON.stringify(dataset.columns), JSON.stringify(dataset.rows), dataset.rowCount);
  const { defaultConfig } = require('./lib/engine');
  const cfg = defaultConfig(dataset);
  const vr = db.prepare('INSERT INTO versions(project_id, dataset_id, config_json, engine, note) VALUES (?, ?, ?, ?, ?)')
    .run(pid, Number(dr.lastInsertRowid), JSON.stringify(cfg), 'rule', '生成一个销售数据看板');
  db.prepare('INSERT INTO messages(project_id, role, content_json) VALUES (?, ?, ?)')
    .run(pid, 'user', JSON.stringify({ text: '用这份数据生成一个销售看板' }));
  db.prepare('INSERT INTO messages(project_id, role, content_json) VALUES (?, ?, ?)')
    .run(pid, 'assistant', JSON.stringify({
      steps: [
        { id: 'analyze', title: '解析数据结构', status: 'done', detail: dataset.rowCount + ' 行 × ' + dataset.columns.length + ' 列' },
        { id: 'plan', title: '规划看板布局', status: 'done', detail: '本地规则引擎：按字段类型匹配图表' },
        { id: 'build', title: '生成看板配置', status: 'done', detail: '共 ' + cfg.charts.length + ' 个图表组件' },
        { id: 'check', title: '校验配置与数据匹配', status: 'done', detail: '字段存在性与类型匹配全部通过' },
        { id: 'render', title: '渲染看板应用', status: 'done', detail: '生成自包含 HTML 应用' },
      ],
      summary: '已生成看板「' + cfg.title + '」，共 ' + cfg.charts.length + ' 个图表',
      versionId: Number(vr.lastInsertRowid),
      engine: 'rule',
    }));
  console.log('[seed] demo 账号已创建：demo@vizgen.dev / demo1234');

  // 示例二：2048 应用（通用应用模式演示）
  const { matchTemplate } = require('./lib/templates');
  const g = matchTemplate('做一个 2048 游戏');
  const pr2 = db.prepare("INSERT INTO projects(user_id, name, kind) VALUES (?, ?, 'app')").run(uid, '2048 小游戏（示例）');
  const pid2 = Number(pr2.lastInsertRowid);
  const vr2 = db.prepare("INSERT INTO versions(project_id, dataset_id, config_json, html_text, kind, engine, note) VALUES (?, NULL, ?, ?, 'app', 'rule', ?)")
    .run(pid2, JSON.stringify({ title: '2048', prompt: '做一个 2048 游戏' }), g.html, '做一个 2048 游戏');
  db.prepare('INSERT INTO messages(project_id, role, content_json) VALUES (?, ?, ?)')
    .run(pid2, 'user', JSON.stringify({ text: '做一个 2048 游戏' }));
  db.prepare('INSERT INTO messages(project_id, role, content_json) VALUES (?, ?, ?)')
    .run(pid2, 'assistant', JSON.stringify({
      steps: [
        { id: 'analyze', title: '理解应用需求', status: 'done', detail: '需求：做一个 2048 游戏' },
        { id: 'plan', title: '设计功能与交互', status: 'done', detail: 'LLM 未配置，使用内置模板「2048 游戏」' },
        { id: 'build', title: '生成应用代码', status: 'done', detail: '内置模板生成完成' },
        { id: 'check', title: '校验应用完整性', status: 'done', detail: 'HTML 结构完整，包含可运行交互逻辑' },
        { id: 'render', title: '渲染应用预览', status: 'done', detail: '自包含 HTML 应用，引擎：内置模板' },
      ],
      summary: '已生成应用「2048」，方向键或滑动即可开始游戏',
      versionId: Number(vr2.lastInsertRowid),
      engine: 'rule',
    }));
  console.log('[seed] 示例应用项目已创建：2048 小游戏');
}

seed();
app.listen(PORT, () => console.log('[vizgen] listening on http://localhost:' + PORT));
