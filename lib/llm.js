// LLM 通道：OpenAI 兼容接口（DeepSeek/GLM/通义均可），JSON 模式输出
'use strict';

const BASE = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'deepseek-chat';

const available = () => !!KEY;

const SYSTEM_PROMPT = `你是 VizGen 平台的看板规划专家。你会收到一份 CSV 数据的字段说明（名称+类型：number/category/date）、若干样例行，以及用户需求。
你的任务是输出一个看板配置 JSON，格式如下：
{
  "title": "看板标题（简短）",
  "charts": [
    {"type":"kpi","title":"KPI名称","field":"数值字段名","agg":"sum|avg|count|max|min"},
    {"type":"bar","title":"图表标题","dimension":"类别或日期字段名","field":"数值字段名","agg":"sum","topN":8},
    {"type":"line","title":"图表标题","dimension":"日期或类别字段名","field":"数值字段名","agg":"sum"},
    {"type":"pie","title":"图表标题","dimension":"类别字段名","field":"数值字段名","agg":"sum","topN":6}
  ]
}
规则：
1. field 必须是数据中真实存在的列名；agg 非 count 时 field 必须是 number 类型列。
2. dimension 必须是真实存在的列名，且不能与 field 相同。
3. KPI 用于关键指标汇总（2-3 个为宜）；bar 适合类别对比；line 适合日期趋势；pie 适合占比。
4. 只输出 JSON，不要输出任何其他文字。`;

function buildPlanMessages(dataset, userMessage) {
  const sample = dataset.rows.slice(0, 5).map(r => r.join(' | ')).join('\n');
  const cols = dataset.columns.map(c => c.name + '(' + c.type + ')').join(', ');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: '数据集：' + (dataset.name || '') + '\n字段：' + cols + '\n共 ' + dataset.rowCount + ' 行，样例：\n' + sample + '\n\n用户需求：' + (userMessage || '生成一个合理的数据看板') },
  ];
}

function buildModifyMessages(dataset, currentConfig, userMessage) {
  const cols = dataset.columns.map(c => c.name + '(' + c.type + ')').join(', ');
  return [
    { role: 'system', content: SYSTEM_PROMPT + '\n\n当前已存在一个看板配置，用户会提出修改意见（换图表类型、增删图表、改指标等）。基于当前配置做增量调整后输出完整的新配置 JSON。只输出 JSON。' },
    { role: 'user', content: '数据字段：' + cols + '\n\n当前配置：\n' + JSON.stringify(currentConfig) + '\n\n用户修改意见：' + userMessage },
  ];
}

async function chatJSON(messages) {
  if (!KEY) throw new Error('LLM_API_KEY 未配置');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.3, response_format: { type: 'json_object' } }),
    });
    if (!res.ok) throw new Error('LLM HTTP ' + res.status);
    const j = await res.json();
    const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!content) throw new Error('LLM 返回为空');
    return JSON.parse(content);
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 通用应用生成（vibe coding）----------
const APP_SYSTEM_PROMPT = `你是 VizGen 平台的全栈应用生成专家。用户会用一句话描述想要一个 Web 小应用（如计算器、2048 游戏、待办清单、番茄钟、记事本等）。
你的任务是输出一个【完整、可直接运行的单文件 HTML 应用】。

硬性要求：
1. 只输出完整 HTML 代码（从 <!DOCTYPE html> 到 </html>），不要输出任何解释文字，不要使用 markdown 代码块围栏。
2. 单文件自包含：所有 CSS 和 JavaScript 全部内联，禁止引用任何外部资源（CDN、外链图片、字体、fetch 网络请求均不允许）。
3. 使用原生 HTML/CSS/JS，不依赖任何框架。
4. 界面美观现代：居中布局、柔和配色、圆角卡片、适当阴影与过渡动画，适配桌面与手机。
5. 交互完整可用：按钮、输入、状态变化都要真实生效；用 localStorage 持久化数据（若应用有状态）。
6. 代码健壮：边界情况（空输入、极端值）要处理，不出现 JS 报错。`;

function buildAppCreateMessages(idea) {
  return [
    { role: 'system', content: APP_SYSTEM_PROMPT },
    { role: 'user', content: '请为我生成这个 Web 应用：' + idea },
  ];
}

function buildAppModifyMessages(currentHtml, request) {
  return [
    { role: 'system', content: APP_SYSTEM_PROMPT + '\n\n当前已存在一个应用，用户会提出修改意见（改样式、加功能、改交互等）。在现有代码基础上做增量修改，输出修改后的完整 HTML，规则同上。' },
    { role: 'user', content: '当前应用代码：\n' + currentHtml + '\n\n修改意见：' + request },
  ];
}

async function chatText(messages) {
  if (!KEY) throw new Error('LLM_API_KEY 未配置');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  try {
    const res = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.6, max_tokens: 8000 }),
    });
    if (!res.ok) throw new Error('LLM HTTP ' + res.status);
    const j = await res.json();
    const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!content) throw new Error('LLM 返回为空');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { available, chatJSON, buildPlanMessages, buildModifyMessages, chatText, buildAppCreateMessages, buildAppModifyMessages, MODEL };
