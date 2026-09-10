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

module.exports = { available, chatJSON, buildPlanMessages, buildModifyMessages, MODEL };
