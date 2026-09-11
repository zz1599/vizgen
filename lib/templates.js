// 内置应用模板：LLM 不可用或输出无效时的兜底
// 注意：内部代码不使用反引号与模板字符串，避免与外层拼接冲突
'use strict';

const SHELL = (title, body, script) => `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:linear-gradient(135deg,#eef2ff,#fdf2f8);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(79,70,229,.15);padding:28px;width:100%;max-width:420px}
h1{font-size:20px;color:#1e1b4b;margin-bottom:18px;text-align:center}
button{cursor:pointer;border:none;border-radius:10px;transition:all .15s}
</style>
</head>
<body>
<div class="card">
<h1>${title}</h1>
${body}
</div>
<script>
${script}
</script>
</body>
</html>`;

// ---------- 计算器 ----------
function calculator() {
  return SHELL('计算器', `
<div class="disp" id="disp" style="background:#1e1b4b;color:#fff;border-radius:14px;padding:18px;font-size:32px;text-align:right;font-family:monospace;min-height:68px;margin-bottom:16px;overflow:hidden">0</div>
<div id="keys" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px"></div>`, `
var disp = document.getElementById('disp');
var keys = document.getElementById('keys');
var layout = ['C','(',')','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','DEL','='];
var expr = '';
layout.forEach(function(k){
  var b = document.createElement('button');
  b.textContent = k;
  b.style.cssText = 'padding:16px 0;font-size:18px;background:' + (k === '=' ? '#4f46e5' : k === 'C' || k === 'DEL' ? '#fee2e2' : '#f1f5f9') + ';color:' + (k === '=' ? '#fff' : '#1e293b') + ';font-weight:600';
  b.onmousedown = function(){ b.style.transform = 'scale(.94)'; };
  b.onmouseup = b.onmouseleave = function(){ b.style.transform = ''; };
  b.onclick = function(){
    if (k === 'C') { expr = ''; }
    else if (k === 'DEL') { expr = expr.slice(0, -1); }
    else if (k === '=') {
      try {
        if (!/^[0-9+\\-*/(). ]+$/.test(expr)) throw new Error('bad');
        var r = Function('"use strict";return (' + expr + ')')();
        if (r === undefined || r === null || isNaN(r) || !isFinite(r)) throw new Error('bad');
        expr = String(Math.round(r * 1e10) / 1e10);
      } catch (e) { expr = ''; disp.textContent = '错误'; return; }
    } else { expr += k; }
    disp.textContent = expr || '0';
  };
  keys.appendChild(b);
});
document.addEventListener('keydown', function(e){
  var map = { Enter: '=', Backspace: 'DEL', Escape: 'C' };
  var k = map[e.key] || e.key;
  if (layout.indexOf(k) >= 0) { e.preventDefault(); var bs = keys.children[layout.indexOf(k)]; if (bs) bs.click(); }
});`);
}

// ---------- 待办清单 ----------
function todo() {
  return SHELL('待办清单', `
<div style="display:flex;gap:8px;margin-bottom:16px">
<input id="inp" placeholder="添加新任务…" style="flex:1;padding:12px 14px;border:1.5px solid #e2e8f0;border-radius:10px;font-size:14px;outline:none">
<button id="add" style="background:#4f46e5;color:#fff;padding:0 18px;font-size:14px;font-weight:600">添加</button>
</div>
<div id="filters" style="display:flex;gap:8px;margin-bottom:12px">
<button class="ft on" data-f="all" style="padding:5px 12px;font-size:12px;background:#eef2ff;color:#4f46e5">全部</button>
<button class="ft" data-f="active" style="padding:5px 12px;font-size:12px;background:#f1f5f9;color:#64748b">未完成</button>
<button class="ft" data-f="done" style="padding:5px 12px;font-size:12px;background:#f1f5f9;color:#64748b">已完成</button>
</div>
<ul id="list" style="list-style:none;display:flex;flex-direction:column;gap:8px"></ul>
<div id="stat" style="margin-top:14px;font-size:12px;color:#94a3b8;text-align:center"></div>`, `
var todos = [];
try { todos = JSON.parse(localStorage.getItem('todos') || '[]'); } catch (e) { todos = []; }
var list = document.getElementById('list'), stat = document.getElementById('stat'), filter = 'all';
function save(){ localStorage.setItem('todos', JSON.stringify(todos)); }
function render(){
  list.innerHTML = '';
  var shown = todos.filter(function(t){ return filter === 'all' || (filter === 'done' ? t.done : !t.done); });
  shown.forEach(function(t){
    var idx = todos.indexOf(t);
    var li = document.createElement('li');
    li.style.cssText = 'display:flex;align-items:center;gap:10px;padding:11px 14px;background:#f8fafc;border-radius:10px;border:1px solid #eef2f7';
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = t.done;
    cb.onchange = function(){ t.done = cb.checked; save(); render(); };
    var span = document.createElement('span');
    span.textContent = t.text; span.style.flex = '1';
    span.style.cssText += t.done ? ';text-decoration:line-through;color:#94a3b8' : ';color:#1e293b';
    var del = document.createElement('button');
    del.textContent = '✕';
    del.style.cssText = 'background:none;color:#cbd5e1;font-size:14px;padding:2px 6px';
    del.onclick = function(){ todos.splice(idx, 1); save(); render(); };
    li.appendChild(cb); li.appendChild(span); li.appendChild(del);
    list.appendChild(li);
  });
  var done = todos.filter(function(t){ return t.done; }).length;
  stat.textContent = todos.length ? '共 ' + todos.length + ' 项，已完成 ' + done + ' 项' : '还没有任务，添加一个吧';
}
document.getElementById('add').onclick = function(){
  var inp = document.getElementById('inp');
  var v = inp.value.trim();
  if (!v) return;
  todos.push({ text: v.slice(0, 60), done: false });
  inp.value = ''; save(); render();
};
document.getElementById('inp').addEventListener('keydown', function(e){ if (e.key === 'Enter') document.getElementById('add').click(); });
Array.prototype.forEach.call(document.querySelectorAll('.ft'), function(b){
  b.onclick = function(){
    filter = b.dataset.f;
    Array.prototype.forEach.call(document.querySelectorAll('.ft'), function(x){
      x.className = 'ft' + (x === b ? ' on' : '');
      x.style.background = x === b ? '#eef2ff' : '#f1f5f9';
      x.style.color = x === b ? '#4f46e5' : '#64748b';
    });
    render();
  };
});
render();`);
}

// ---------- 番茄钟 ----------
function pomodoro() {
  return SHELL('番茄钟', `
<div style="text-align:center">
<div id="ring" style="font-size:56px;font-family:monospace;color:#1e1b4b;font-weight:700;margin:10px 0 4px">25:00</div>
<div id="phase" style="font-size:13px;color:#64748b;margin-bottom:20px">专注时间</div>
<div style="height:8px;background:#eef2ff;border-radius:4px;overflow:hidden;margin-bottom:22px"><div id="bar" style="height:100%;width:0;background:#4f46e5;border-radius:4px;transition:width .5s"></div></div>
<div style="display:flex;gap:10px;justify-content:center">
<button id="toggle" style="background:#4f46e5;color:#fff;padding:12px 34px;font-size:15px;font-weight:600">开始</button>
<button id="reset" style="background:#f1f5f9;color:#475569;padding:12px 22px;font-size:15px">重置</button>
</div>
<div id="cnt" style="margin-top:16px;font-size:12px;color:#94a3b8">今日完成 0 个番茄</div>
</div>`, `
var WORK = 25 * 60, BREAK = 5 * 60;
var left = WORK, running = false, isWork = true, timer = null;
var done = parseInt(localStorage.getItem('pomodoro-' + new Date().toDateString()) || '0', 10) || 0;
var ring = document.getElementById('ring'), bar = document.getElementById('bar'),
    phase = document.getElementById('phase'), toggle = document.getElementById('toggle'), cnt = document.getElementById('cnt');
function fmt(s){ return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function paint(){
  ring.textContent = fmt(left);
  var pct = isWork ? 1 - left / WORK : left / BREAK;
  bar.style.width = (pct * 100).toFixed(1) + '%';
  bar.style.background = isWork ? '#4f46e5' : '#10b981';
  phase.textContent = isWork ? '专注时间' : '休息一下';
  phase.style.color = isWork ? '#64748b' : '#059669';
  cnt.textContent = '今日完成 ' + done + ' 个番茄';
  document.title = fmt(left) + ' · ' + (isWork ? '专注' : '休息');
}
function tick(){
  left--;
  if (left <= 0) {
    if (isWork) { done++; localStorage.setItem('pomodoro-' + new Date().toDateString(), String(done)); }
    isWork = !isWork;
    left = isWork ? WORK : BREAK;
  }
  paint();
}
toggle.onclick = function(){
  running = !running;
  toggle.textContent = running ? '暂停' : '开始';
  toggle.style.background = running ? '#f59e0b' : '#4f46e5';
  if (running) timer = setInterval(tick, 1000); else clearInterval(timer);
};
document.getElementById('reset').onclick = function(){
  clearInterval(timer); running = false; isWork = true; left = WORK;
  toggle.textContent = '开始'; toggle.style.background = '#4f46e5'; paint();
};
paint();`);
}

// ---------- 2048 ----------
function game2048() {
  return SHELL('2048', `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
<div style="font-size:13px;color:#64748b">方向键 / 滑动操作</div>
<div style="display:flex;gap:8px">
<div style="background:#eef2ff;border-radius:10px;padding:6px 14px;text-align:center"><div style="font-size:10px;color:#64748b">分数</div><div id="score" style="font-weight:700;color:#4f46e5">0</div></div>
<button id="ng" style="background:#4f46e5;color:#fff;padding:10px 14px;font-size:13px;font-weight:600">新游戏</button>
</div>
</div>
<div id="grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#cbbfb4;padding:10px;border-radius:14px;touch-action:none"></div>
<div id="over" style="display:none;text-align:center;margin-top:14px;font-weight:700;color:#dc2626">游戏结束！点击新游戏再来一局</div>`, `
var N = 4, grid, score;
var COLORS = { 2:'#eee4da',4:'#ede0c8',8:'#f2b179',16:'#f59563',32:'#f67c5f',64:'#f65e3b',128:'#edcf72',256:'#edcc61',512:'#edc850',1024:'#edc53f',2048:'#edc22e' };
var gridEl = document.getElementById('grid'), scoreEl = document.getElementById('score'), overEl = document.getElementById('over');
for (var i = 0; i < N * N; i++) {
  var c = document.createElement('div');
  c.style.cssText = 'aspect-ratio:1;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:24px;color:#776e65;background:rgba(238,228,218,.35)';
  gridEl.appendChild(c);
}
function paint(){
  for (var i = 0; i < N * N; i++) {
    var cell = gridEl.children[i], v = grid[Math.floor(i / N)][i % N];
    cell.textContent = v || '';
    cell.style.background = v ? (COLORS[v] || '#3c3a32') : 'rgba(238,228,218,.35)';
    cell.style.color = v >= 8 ? '#f9f6f2' : '#776e65';
    cell.style.fontSize = v >= 1024 ? '18px' : v >= 128 ? '21px' : '24px';
  }
  scoreEl.textContent = score;
  overEl.style.display = anyMove() ? 'none' : 'block';
}
function spawn(){
  var empty = [];
  for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (!grid[r][c]) empty.push([r, c]);
  if (!empty.length) return;
  var p = empty[Math.floor(Math.random() * empty.length)];
  grid[p[0]][p[1]] = Math.random() < 0.9 ? 2 : 4;
}
function slide(row){
  var a = row.filter(function(v){ return v; }), out = [], gained = 0;
  for (var i = 0; i < a.length; i++) {
    if (a[i] === a[i + 1]) { out.push(a[i] * 2); gained += a[i] * 2; i++; }
    else out.push(a[i]);
  }
  while (out.length < N) out.push(0);
  return { row: out, gained: gained };
}
function move(dir){
  var old = JSON.stringify(grid), gained = 0;
  for (var i = 0; i < N; i++) {
    var line = [];
    for (var j = 0; j < N; j++) {
      if (dir === 'left') line.push(grid[i][j]);
      if (dir === 'right') line.push(grid[i][N - 1 - j]);
      if (dir === 'up') line.push(grid[j][i]);
      if (dir === 'down') line.push(grid[N - 1 - j][i]);
    }
    var s = slide(line);
    gained += s.gained;
    for (var k = 0; k < N; k++) {
      if (dir === 'left') grid[i][k] = s.row[k];
      if (dir === 'right') grid[i][N - 1 - k] = s.row[k];
      if (dir === 'up') grid[k][i] = s.row[k];
      if (dir === 'down') grid[N - 1 - k][i] = s.row[k];
    }
  }
  if (JSON.stringify(grid) !== old) { score += gained; spawn(); paint(); }
}
function anyMove(){
  for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
    if (!grid[r][c]) return true;
    if (c < N - 1 && grid[r][c] === grid[r][c + 1]) return true;
    if (r < N - 1 && grid[r][c] === grid[r + 1][c]) return true;
  }
  return false;
}
function reset(){ grid = []; for (var r = 0; r < N; r++) grid.push([0,0,0,0]); score = 0; overEl.style.display = 'none'; spawn(); spawn(); paint(); }
document.getElementById('ng').onclick = reset;
document.addEventListener('keydown', function(e){
  var m = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (m[e.key]) { e.preventDefault(); move(m[e.key]); }
});
var sx = 0, sy = 0;
gridEl.addEventListener('touchstart', function(e){ sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
gridEl.addEventListener('touchend', function(e){
  var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
reset();`);
}

// ---------- 记事本 ----------
function notepad() {
  return SHELL('记事本', `
<div style="display:flex;gap:14px">
<div style="width:130px;display:flex;flex-direction:column;gap:8px">
<button id="new" style="background:#4f46e5;color:#fff;padding:9px 0;font-size:13px;font-weight:600">＋ 新建笔记</button>
<div id="notes" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow:auto"></div>
</div>
<div style="flex:1;display:flex;flex-direction:column;gap:8px">
<input id="title" placeholder="标题" style="padding:9px 12px;border:1.5px solid #e2e8f0;border-radius:9px;font-size:14px;outline:none;font-weight:600">
<textarea id="body" placeholder="在这里输入内容…自动保存" style="flex:1;min-height:260px;padding:12px;border:1.5px solid #e2e8f0;border-radius:9px;font-size:13.5px;resize:vertical;outline:none;font-family:inherit;line-height:1.6"></textarea>
<button id="del" style="align-self:flex-end;background:#fee2e2;color:#dc2626;padding:7px 16px;font-size:12.5px">删除当前笔记</button>
</div>
</div>
<div id="tip" style="margin-top:10px;font-size:11.5px;color:#94a3b8;text-align:center"></div>`, `
var notes = [];
try { notes = JSON.parse(localStorage.getItem('notes') || '[]'); } catch (e) { notes = []; }
var cur = notes.length ? 0 : -1;
var listEl = document.getElementById('notes'), titleEl = document.getElementById('title'), bodyEl = document.getElementById('body'), tipEl = document.getElementById('tip');
function save(){ localStorage.setItem('notes', JSON.stringify(notes)); }
function renderList(){
  listEl.innerHTML = '';
  notes.forEach(function(n, i){
    var b = document.createElement('button');
    b.textContent = n.title || '（无标题）';
    b.style.cssText = 'text-align:left;padding:9px 10px;font-size:12.5px;background:' + (i === cur ? '#eef2ff;color:#4f46e5;font-weight:600' : '#f1f5f9;color:#475569') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    b.onclick = function(){ cur = i; open(); renderList(); };
    listEl.appendChild(b);
  });
}
function open(){
  if (cur < 0 || !notes[cur]) { titleEl.value = ''; bodyEl.value = ''; return; }
  titleEl.value = notes[cur].title; bodyEl.value = notes[cur].body;
}
document.getElementById('new').onclick = function(){
  notes.unshift({ title: '新笔记', body: '', at: Date.now() });
  cur = 0; save(); open(); renderList();
};
document.getElementById('del').onclick = function(){
  if (cur < 0) return;
  if (!confirm('删除这篇笔记？')) return;
  notes.splice(cur, 1); cur = notes.length ? 0 : -1; save(); open(); renderList();
};
var t = null;
function autoSave(){
  if (cur < 0) return;
  notes[cur].title = titleEl.value.slice(0, 40) || '（无标题）';
  notes[cur].body = bodyEl.value;
  notes[cur].at = Date.now();
  save(); renderList();
  tipEl.textContent = '已自动保存 ' + new Date().toLocaleTimeString('zh-CN');
}
titleEl.addEventListener('input', function(){ clearTimeout(t); t = setTimeout(autoSave, 500); });
bodyEl.addEventListener('input', function(){ clearTimeout(t); t = setTimeout(autoSave, 500); });
open(); renderList();`);
}

const TEMPLATES = {
  calculator: { name: '计算器', keywords: /计算器|calculator/i, build: calculator },
  todo: { name: '待办清单', keywords: /待办|todo|清单|任务列表/i, build: todo },
  pomodoro: { name: '番茄钟', keywords: /番茄钟|番茄|pomodoro|专注/i, build: pomodoro },
  game2048: { name: '2048 游戏', keywords: /2048/i, build: game2048 },
  notepad: { name: '记事本', keywords: /记事本|笔记|便签|notepad|note/i, build: notepad },
};

function matchTemplate(message) {
  const msg = String(message || '');
  for (const key of Object.keys(TEMPLATES)) {
    const t = TEMPLATES[key];
    if (t.keywords.test(msg)) return { key, name: t.name, html: t.build() };
  }
  const fallback = TEMPLATES.calculator;
  return { key: 'calculator', name: fallback.name, html: fallback.build() };
}

module.exports = { TEMPLATES, matchTemplate };
