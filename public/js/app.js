// VizGen 前端 SPA
(function () {
  const app = document.getElementById('app');
  const state = { projectId: null, project: null, tab: 'preview', device: 'desktop', versionId: null, previewCache: {} };

  // ---------- 工具 ----------
  const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const toast = (msg) => { const t = h('<div class="toast">' + esc(msg) + '</div>'); document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
  const timeAgo = (s) => { const d = new Date(s.replace(' ', 'T')); return isNaN(d) ? s : d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const engineBadge = (e) => e === 'llm' ? '<span class="badge badge-llm">LLM 规划</span>' : '<span class="badge badge-rule">规则引擎</span>';

  // ---------- 路由 ----------
  function route() {
    const hash = location.hash || '#/';
    if (hash.startsWith('#/workbench/')) {
      const id = Number(hash.split('/')[2]);
      API.token() ? renderWorkbench(id) : (location.hash = '#/login');
    } else if (hash.startsWith('#/projects')) {
      API.token() ? renderProjects() : (location.hash = '#/login');
    } else {
      API.token() ? (location.hash = '#/projects') : renderAuth();
    }
  }
  window.addEventListener('hashchange', route);

  // ---------- 认证页 ----------
  function renderAuth(mode = 'login') {
    document.title = 'VizGen · 登录';
    app.innerHTML = `
    <div class="auth-wrap">
      <div class="logo"><span class="logo-mark">${logoSvg()}</span>VizGen <span style="font-size:12px;color:var(--text-3);font-weight:400">AI 应用工厂</span></div>
      <div class="card auth-card fade-in">
        <h2>${mode === 'login' ? '欢迎回来' : '创建账号'}</h2>
        <div class="sub">对话生成任何 Web 应用 — 计算器、游戏、看板、工具，一句话搞定</div>
        <div class="auth-tabs">
          <button class="${mode === 'login' ? 'active' : ''}" data-m="login">登录</button>
          <button class="${mode === 'register' ? 'active' : ''}" data-m="register">注册</button>
        </div>
        <div class="auth-field"><label>邮箱</label><input class="input" id="email" type="email" placeholder="you@example.com"></div>
        <div class="auth-field"><label>密码</label><input class="input" id="password" type="password" placeholder="至少 6 位"></div>
        <div class="auth-err" id="auth-err"></div>
        <button class="btn btn-primary" id="auth-go" style="width:100%;justify-content:center">${mode === 'login' ? '登录' : '注册并开始'}</button>
        <div class="auth-tip">演示账号：<span class="demo-fill" id="demo-fill">demo@vizgen.dev / demo1234</span>（点击填入）</div>
      </div>
    </div>`;
    app.querySelectorAll('.auth-tabs button').forEach(b => b.onclick = () => {
      const email = document.getElementById('email').value;
      const pw = document.getElementById('password').value;
      renderAuth(b.dataset.m);
      document.getElementById('email').value = email;
      document.getElementById('password').value = pw;
    });
    document.getElementById('demo-fill').onclick = () => {
      document.getElementById('email').value = 'demo@vizgen.dev';
      document.getElementById('password').value = 'demo1234';
    };
    const go = async () => {
      const errEl = document.getElementById('auth-err');
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      errEl.textContent = '';
      try {
        const r = await API.post('/api/auth/' + (mode === 'login' ? 'login' : 'register'), { email, password });
        API.setToken(r.token);
        location.hash = '#/projects';
      } catch (e) { errEl.textContent = e.message; }
    };
    document.getElementById('auth-go').onclick = go;
    app.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }, { once: true });
  }

  function logoSvg() {
    return '<svg viewBox="0 0 100 100" fill="none"><rect x="20" y="52" width="15" height="28" rx="4" fill="white"/><rect x="42" y="36" width="15" height="44" rx="4" fill="white"/><rect x="64" y="22" width="15" height="58" rx="4" fill="white"/></svg>';
  }

  // ---------- 项目列表 ----------
  async function renderProjects() {
    document.title = 'VizGen · 我的项目';
    app.innerHTML = '<div class="page"><div class="page-head"><div class="logo"><span class="logo-mark">' + logoSvg() + '</span>VizGen</div><div style="display:flex;gap:10px;align-items:center"><span id="user-email" style="font-size:13px;color:var(--text-2)"></span><button class="btn btn-ghost" id="logout">退出</button></div></div><div id="proj-area" style="color:var(--text-3)">加载中…</div></div>';
    document.getElementById('logout').onclick = () => { API.setToken(''); location.hash = '#/login'; };
    API.get('/api/me').then(me => { document.getElementById('user-email').textContent = me.email; }).catch(() => {});
    const grid = h('<div class="proj-grid"></div>');
    const addNew = h('<div class="card new-proj"><div class="plus">+</div><div>新建项目</div>' +
      '<div class="new-proj-form" id="np-form" style="display:none;flex-direction:column;gap:10px;align-items:stretch">' +
        '<div style="display:flex;gap:8px">' +
          '<button class="kind-btn active" data-k="app" style="flex:1;padding:9px 6px;border-radius:10px;border:1.5px solid var(--primary);background:var(--primary-soft,#eef2ff);color:var(--primary);font-size:13px;font-weight:600">🤖 AI 应用</button>' +
          '<button class="kind-btn" data-k="dashboard" style="flex:1;padding:9px 6px;border-radius:10px;border:1.5px solid var(--border);background:#fff;color:var(--text-2);font-size:13px;font-weight:600">📊 数据看板</button>' +
        '</div>' +
        '<input class="input" id="np-name" placeholder="项目名称，如：番茄钟 / 门店销售分析">' +
        '<button class="btn btn-primary" id="np-create" style="justify-content:center">创建项目</button>' +
      '</div></div>');
    let newKind = 'app';
    addNew.onclick = (e) => {
      if (e.target.id === 'np-create' || e.target.classList.contains('kind-btn')) return;
      const f = addNew.querySelector('#np-form'); f.style.display = 'flex';
      addNew.querySelector('.plus').style.display = 'none';
      addNew.querySelector('div:nth-child(2)').style.display = 'none';
      addNew.querySelector('#np-name').focus();
    };
    addNew.querySelectorAll('.kind-btn').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      newKind = b.dataset.k;
      addNew.querySelectorAll('.kind-btn').forEach(x => {
        const on = x === b;
        x.classList.toggle('active', on);
        x.style.borderColor = on ? 'var(--primary)' : 'var(--border)';
        x.style.background = on ? 'var(--primary-soft,#eef2ff)' : '#fff';
        x.style.color = on ? 'var(--primary)' : 'var(--text-2)';
      });
      addNew.querySelector('#np-name').placeholder = newKind === 'app' ? '项目名称，如：番茄钟 / 2048 / 记账本' : '项目名称，如：门店销售分析';
    });
    addNew.querySelector('#np-create').onclick = async (e) => {
      e.stopPropagation();
      const name = addNew.querySelector('#np-name').value.trim() || (newKind === 'app' ? '新应用' : '未命名项目');
      const r = await API.post('/api/projects', { name, kind: newKind });
      location.hash = '#/workbench/' + r.id;
    };
    addNew.querySelector('#np-name').onkeydown = (e) => { if (e.key === 'Enter') addNew.querySelector('#np-create').click(); };
    grid.appendChild(addNew);
    document.getElementById('proj-area').innerHTML = '';
    document.getElementById('proj-area').appendChild(grid);
    try {
      const list = await API.get('/api/projects');
      for (const p of list) {
        const isApp = p.kind === 'app';
        const card = h(`
          <div class="card proj-card fade-in">
            <button class="proj-del" title="删除">✕</button>
            <h3>${esc(p.name)}</h3>
            <div class="proj-meta"><span>${isApp ? '🤖 AI 应用' : '📊 数据看板'}</span><span>${p.version_count} 个版本</span><span>更新于 ${timeAgo(p.updated_at)}</span></div>
          </div>`);
        card.onclick = () => { location.hash = '#/workbench/' + p.id; };
        card.querySelector('.proj-del').onclick = async (e) => {
          e.stopPropagation();
          if (!confirm('确定删除项目「' + p.name + '」？此操作不可恢复。')) return;
          await API.del('/api/projects/' + p.id);
          renderProjects();
        };
        grid.appendChild(card);
      }
    } catch (e) { toast(e.message); }
  }

  // ---------- 工作台 ----------
  async function renderWorkbench(id) {
    state.projectId = id;
    state.tab = 'preview';
    state.previewCache = {};
    let data;
    try { data = await API.get('/api/projects/' + id); }
    catch (e) { toast(e.message); location.hash = '#/projects'; return; }
    state.project = data;
    state.kind = data.kind === 'app' ? 'app' : 'dashboard';
    const isApp = state.kind === 'app';
    state.versionId = data.latestVersionId || null;
    document.title = 'VizGen · ' + data.project.name;

    app.innerHTML = `
      <div class="wb">
        <div class="wb-top">
          <a href="#/projects" style="color:var(--text-2);font-size:13px">‹ 我的项目</a>
          <span class="logo-mark" style="width:26px;height:26px;border-radius:6px">${logoSvg()}</span>
          <span class="proj-name">${esc(data.project.name)}</span>
          <span class="badge ${isApp ? 'badge-llm' : 'badge-rule'}">${isApp ? '🤖 AI 应用' : '📊 数据看板'}</span>
          <span class="spacer"></span>
          <button class="btn btn-ghost" id="share-btn" ${data.latestVersionId ? '' : 'disabled'}>${isApp ? '分享应用' : '分享看板'}</button>
          <button class="btn btn-ghost" id="wb-logout">退出</button>
        </div>
        <div class="wb-body">
          <div class="chat">
            <div class="chat-head"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span>${isApp ? 'Agent 就绪，描述你想生成的应用' : 'Agent 就绪，描述你的看板需求'}</div>
            <div class="chat-msgs" id="chat-msgs"></div>
            <div class="suggest" id="suggest"></div>
            <div class="chat-input">
              <textarea id="chat-text" placeholder="${isApp ? '例如：做一个番茄钟，25 分钟专注 + 5 分钟休息' : '例如：生成一个销售看板，重点看区域对比'}"></textarea>
              <button class="send-btn" id="send-btn" title="发送"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg></button>
            </div>
          </div>
          <div class="preview" id="preview-pane"></div>
        </div>
      </div>`;

    document.getElementById('wb-logout').onclick = () => { API.setToken(''); location.hash = '#/login'; };
    document.getElementById('share-btn').onclick = () => {
      const url = location.origin + '/s/' + state.versionId;
      navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast('分享链接已复制：' + url), () => prompt('分享链接：', url));
    };

    renderChatHistory(data);
    renderPreviewPane();
    wireChatInput();

    if (!isApp && !data.dataset) renderSetup();
    else renderPreview();
  }

  // ----- 数据准备面板 -----
  function renderSetup() {
    const pane = document.getElementById('preview-pane');
    pane.innerHTML = `
      <div class="setup">
        <div class="card setup-card fade-in">
          <h2>第一步：导入数据</h2>
          <div class="sub">上传 CSV 文件或直接粘贴。Agent 会自动识别字段类型并规划看板。</div>
          <div class="setup-opts">
            <label class="setup-opt" for="csv-file">点击选择 CSV 文件上传</label>
            <input type="file" id="csv-file" accept=".csv,text/csv" style="display:none">
            <div class="setup-or">— 或 —</div>
            <textarea class="csv-box" id="csv-text" placeholder="date,region,amount&#10;2026-01-01,华东,1200&#10;2026-01-02,华北,800"></textarea>
            <button class="btn btn-ghost" id="csv-submit" style="justify-content:center">使用粘贴的数据</button>
            <div class="setup-or">— 或 —</div>
            <div class="setup-opt" id="use-sample">使用内置示例数据（2026 年销售流水）</div>
          </div>
          <div class="schema-preview" id="schema-preview" style="display:none"></div>
        </div>
      </div>`;
    const submit = (csv, name, useSample) => async () => {
      try {
        const r = await API.post('/api/projects/' + state.projectId + '/data', { csv, name, useSample });
        state.project.dataset = { name: r.name, columns: r.columns, rowCount: r.rowCount };
        const cols = r.columns.map(c => c.name + '（' + ({ number: '数值', category: '类别', date: '日期' }[c.type]) + '）').join('、');
        toast('数据导入成功');
        addAgentMessage({
          steps: [{ id: 'ingest', title: '数据接入', status: 'done', detail: r.rowCount + ' 行 × ' + r.columns.length + ' 列：' + cols }],
          summary: '数据「' + r.name + '」已就绪，试试下方的建议，或直接描述你想要的看板。', engine: null,
        });
        renderSuggest(true);
        renderPreviewPane();
        renderPreview();
      } catch (e) { toast(e.message); }
    };
    pane.querySelector('#csv-file').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = () => submit(reader.result, f.name.replace(/\.csv$/i, ''))();
      reader.readAsText(f, 'utf-8');
    };
    pane.querySelector('#csv-submit').onclick = () => submit(pane.querySelector('#csv-text').value)();
    pane.querySelector('#use-sample').onclick = submit(null, null, true);
  }

  // ----- 预览区（tabs）-----
  function renderPreviewPane() {
    const pane = document.getElementById('preview-pane');
    const isApp = state.kind === 'app';
    if (!isApp && !state.project.dataset) { pane.innerHTML = ''; return; }
    const versions = state.project.versions;
    pane.innerHTML = `
      <div class="pv-toolbar">
        <div class="tabs">
          <button data-tab="preview" class="${state.tab === 'preview' ? 'active' : ''}">预览</button>
          <button data-tab="code" class="${state.tab === 'code' ? 'active' : ''}">代码</button>
          ${isApp ? '' : '<button data-tab="config" class="' + (state.tab === 'config' ? 'active' : '') + '">配置</button>'}
        </div>
        <div class="seg" id="device-seg">
          <button data-d="desktop" class="${state.device === 'desktop' ? 'active' : ''}">桌面</button>
          <button data-d="mobile" class="${state.device === 'mobile' ? 'active' : ''}">移动</button>
        </div>
        <select id="ver-select">${versions.map(v => '<option value="' + v.id + '"' + (v.id === state.versionId ? ' selected' : '') + '>v' + v.id + ' · ' + esc((v.note || '').slice(0, 18)) + '</option>').join('')}</select>
        <span class="spacer" style="flex:1"></span>
        <button class="btn btn-ghost" id="open-new" style="padding:5px 12px;font-size:12.5px">新窗口打开</button>
      </div>
      <div id="pv-content"></div>`;
    pane.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; renderPreviewPane(); renderPreview(); });
    pane.querySelectorAll('#device-seg button').forEach(b => b.onclick = () => { state.device = b.dataset.d; renderPreviewPane(); renderPreview(); });
    pane.querySelector('#ver-select').onchange = (e) => { state.versionId = Number(e.target.value); renderPreview(); };
    pane.querySelector('#open-new').onclick = () => { if (state.versionId) window.open('/api/versions/' + state.versionId + '/preview'); };
    if (!versions.length) state.versionId = null;
    if (state.tab === 'config' && isApp) state.tab = 'preview';
  }

  async function renderPreview() {
    const c = document.getElementById('pv-content');
    if (!c) return;
    const isApp = state.kind === 'app';
    if (!state.versionId) {
      c.innerHTML = isApp
        ? '<div class="pv-empty"><div class="big" style="font-size:40px;opacity:.4">🤖</div><div>还没有应用，在左侧描述你的想法，Agent 会即时生成<br><span style="font-size:12px;color:var(--text-3)">试试：计算器、2048 游戏、待办清单、番茄钟、记事本、记账本…</span></div></div>'
        : '<div class="pv-empty"><div class="big" style="font-size:40px;opacity:.4">📊</div><div>还没有看板，在左侧描述你的需求，Agent 会即时生成</div></div>';
      return;
    }
    if (state.tab === 'preview') {
      c.innerHTML = '<div class="pv-stage"><div class="pv-frame-wrap ' + (state.device === 'mobile' ? 'mobile' : '') + '"><iframe class="pv-frame" id="pv-frame"></iframe></div></div>';
      try {
        const html = await API.previewText(state.versionId);
        const f = document.getElementById('pv-frame');
        f.onload = () => { try { f.contentWindow.scrollTo(0, 0); } catch (e) { /* 跨域时忽略 */ } };
        f.srcdoc = html;
      } catch (e) { toast('预览加载失败：' + e.message); }
    } else if (state.tab === 'code') {
      c.innerHTML = '<div class="code-view"><pre>加载中…</pre></div>';
      const html = await API.previewText(state.versionId);
      c.querySelector('pre').textContent = html;
    } else {
      const cur = state.project.latestConfig;
      const prevV = state.project.versions.find(v => v.id < state.versionId);
      let prevCfg = null;
      if (prevV) {
        const full = state.project.versions.find(v => v.id === prevV.id);
        prevCfg = full && full.config;
      }
      const diffs = diffConfigs(prevCfg, cur);
      c.innerHTML = '<div class="cfg-view">' +
        (diffs.length ? '<div class="cfg-diff">' + diffs.map(d => '<div class="diff-item ' + d.kind + '">' + esc(d.text) + '</div>').join('') + '</div>' : '') +
        '<pre style="font-family:var(--mono);font-size:12.5px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px">' + esc(JSON.stringify(cur, null, 2)) + '</pre></div>';
    }
  }

  function chartSig(ch) { return ch.type + ':' + (ch.title || '') + ':' + (ch.field || '') + ':' + (ch.agg || '') + ':' + (ch.dimension || ''); }
  function diffConfigs(oldCfg, newCfg) {
    if (!oldCfg || !newCfg) return [];
    const a = oldCfg.charts.map(chartSig), b = newCfg.charts.map(chartSig);
    const out = [];
    for (const s of b) if (!a.includes(s)) out.push({ kind: 'add', text: '新增图表：' + s.split(':')[1] });
    for (const s of a) if (!b.includes(s)) out.push({ kind: 'del', text: '移除图表：' + s.split(':')[1] });
    if (oldCfg.title !== newCfg.title) out.push({ kind: 'mod', text: '标题：「' + oldCfg.title + '」→「' + newCfg.title + '」' });
    return out;
  }

  // ----- 聊天 -----
  function renderChatHistory(data) {
    const box = document.getElementById('chat-msgs');
    box.innerHTML = '';
    for (const m of data.messages) {
      if (m.role === 'user') box.appendChild(h('<div class="msg-user">' + esc(m.text) + '</div>'));
      else addAgentMessage(m, box);
    }
    box.scrollTop = box.scrollHeight;
    renderSuggest(state.kind === 'app' || !!data.dataset);
  }

  function stepIcon(st) {
    if (st === 'done') return '<span class="step-ico ok">✓</span>';
    if (st === 'error') return '<span class="step-ico err">✕</span>';
    return '<span class="step-ico run"><span class="spinner"></span></span>';
  }

  function addAgentMessage(m, container) {
    const box = container || document.getElementById('chat-msgs');
    const el = h(`
      <div class="msg-agent">
        <div class="agent-card fade-in">
          <div class="agent-head"><span class="dot"></span><span class="t">VizGen Agent</span></div>
          <div class="steps"></div>
          <div class="agent-summary" style="display:none"></div>
          <div class="agent-meta"></div>
        </div>
      </div>`);
    const stepsEl = el.querySelector('.steps');
    (m.steps || []).forEach(s => stepsEl.appendChild(stepRow(s)));
    if (m.summary) {
      const sm = el.querySelector('.agent-summary');
      sm.textContent = m.summary; sm.style.display = 'block';
    }
    const meta = el.querySelector('.agent-meta');
    if (m.versionId) {
      meta.innerHTML = engineBadge(m.engine) + ' <a href="#" class="v-link">查看 v' + m.versionId + '</a>';
      meta.querySelector('.v-link').onclick = (e) => { e.preventDefault(); state.versionId = m.versionId; renderPreviewPane(); renderPreview(); };
    }
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }

  function stepRow(s) {
    return h('<div class="step"><span class="step-ico">' + stepIconInner(s.status) + '</span><div class="step-body"><div class="s-title">' + esc(s.title) + '</div>' + (s.detail ? '<div class="s-detail">' + esc(s.detail) + '</div>' : '') + '</div><span class="step-line"></span></div>');
  }
  function stepIconInner(st) {
    if (st === 'done') return '<span class="step-ico ok" style="margin:0">✓</span>';
    if (st === 'error') return '<span class="step-ico err" style="margin:0">✕</span>';
    return '<span class="step-ico run" style="margin:0"><span class="spinner"></span></span>';
  }

  function renderSuggest(ready) {
    const el = document.getElementById('suggest');
    const isApp = state.kind === 'app';
    let items;
    if (isApp) {
      items = !state.project.versions.length
        ? ['做一个计算器', '做一个 2048 游戏', '做一个番茄钟，25分钟专注+5分钟休息']
        : ['把配色改成深色主题', '让界面完整显示在一屏内，不要被裁剪', '加一个统计功能，显示已完成数量'];
    } else if (ready && !state.project.versions.length) {
      items = ['生成一个数据看板', '重点看销售额趋势和区域对比', '加一个占比分析饼图'];
    } else if (ready) {
      items = ['把柱状图换成折线图', '标题改成「销售业绩总览」', '删除饼图，加一个KPI指标卡'];
    } else {
      items = ['（导入数据后可开始对话）'];
    }
    el.innerHTML = items.map(t => '<button>' + esc(t) + '</button>').join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => {
      if (!ready) { toast('请先导入数据'); return; }
      document.getElementById('chat-text').value = b.textContent;
      document.getElementById('send-btn').click();
    });
  }

  function wireChatInput() {
    const ta = document.getElementById('chat-text');
    const btn = document.getElementById('send-btn');
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btn.click(); }
    });
    ta.addEventListener('input', () => { ta.style.height = '44px'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
    btn.onclick = () => sendMessage(ta.value.trim());
  }

  let busy = false;
  async function sendMessage(text) {
    if (!text || busy) return;
    if (state.kind !== 'app' && !state.project.dataset) { toast('请先导入数据'); return; }
    busy = true;
    const btn = document.getElementById('send-btn');
    btn.disabled = true;
    document.getElementById('chat-text').value = '';
    const box = document.getElementById('chat-msgs');
    box.appendChild(h('<div class="msg-user">' + esc(text) + '</div>'));
    box.scrollTop = box.scrollHeight;

    // 实时 Agent 卡片
    const live = addAgentMessage({ steps: [], summary: '' });
    const liveCard = live.querySelector('.agent-card');
    liveCard.querySelector('.agent-head .t').textContent = 'VizGen Agent 工作中…';
    const liveSteps = live.querySelector('.steps');
    const liveSummary = live.querySelector('.agent-summary');
    const liveMeta = live.querySelector('.agent-meta');

    try {
      const res = await fetch('/api/projects/' + state.projectId + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API.token() },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'HTTP ' + res.status); }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          const evt = JSON.parse(line);
          if (evt.type === 'steps') {
            liveSteps.innerHTML = '';
            evt.steps.forEach(s => liveSteps.appendChild(stepRow(s)));
            box.scrollTop = box.scrollHeight;
          } else if (evt.type === 'result') {
            liveCard.querySelector('.agent-head .t').textContent = 'VizGen Agent';
            liveSummary.textContent = evt.summary; liveSummary.style.display = 'block';
            liveMeta.innerHTML = engineBadge(evt.engine) + ' <a href="#" class="v-link">查看 v' + evt.versionId + '</a>';
            liveMeta.querySelector('.v-link').onclick = (e) => { e.preventDefault(); state.versionId = evt.versionId; renderPreviewPane(); renderPreview(); };
            // 更新本地状态
            const vd = await API.get('/api/projects/' + state.projectId);
            state.project.versions = vd.versions;
            state.project.latestConfig = vd.latestConfig;
            state.versionId = evt.versionId;
            renderSuggest(true);
            renderPreviewPane();
            renderPreview();
          } else if (evt.type === 'error') {
            liveCard.querySelector('.agent-head .t').textContent = 'VizGen Agent';
            liveSummary.textContent = '出错了：' + evt.message; liveSummary.style.display = 'block';
            liveSummary.style.color = 'var(--red)';
          }
        }
      }
    } catch (e) {
      liveSummary.textContent = '请求失败：' + e.message;
      liveSummary.style.display = 'block';
      liveSummary.style.color = 'var(--red)';
    }
    busy = false;
    btn.disabled = false;
  }

  route();
})();
