// Agent 流水线：Planner → Builder → Checker → Fixer → Render
// 以异步生成器产出 NDJSON 步骤事件，最后产出 result
'use strict';

const { defaultConfig, normalizeConfig, renderDashboardHTML } = require('./engine');
const llm = require('./llm');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 规则引擎的修改模式：关键词 → 图表类型映射（LLM 不可用时的降级）
const TYPE_WORDS = [
  { re: /折线|趋势线|line/i, type: 'line' },
  { re: /饼图|占比|pie/i, type: 'pie' },
  { re: /柱状|柱形|条形|bar/i, type: 'bar' },
];

function ruleModify(currentConfig, dataset, message) {
  const changes = [];
  const cfg = JSON.parse(JSON.stringify(currentConfig));
  const metrics = dataset.columns.filter(c => c.type === 'number');
  const dims = dataset.columns.filter(c => c.type === 'category');
  const dates = dataset.columns.filter(c => c.type === 'date');
  const modified = new Set(); // 本轮已处理过的图表，防止类型反复改写
  const TYPE_NAME = { bar: '柱状图', line: '折线图', pie: '饼图' };
  const wordType = (w) => /柱|条/.test(w) ? 'bar' : /折|趋势/.test(w) ? 'line' : 'pie';

  // 句式一："把X图 换成/改为/改成 Y图" → 精准替换第一个 X 类型图表
  const swap = message.match(/把\s*(柱状|柱形|条形|折线|趋势|饼)\s*图?\s*(?:换成|改为|改成|变成)\s*(柱状|柱形|条形|折线|趋势|饼)\s*图?/);
  if (swap) {
    const from = wordType(swap[1]), to = wordType(swap[2]);
    const target = cfg.charts.find(ch => ch.type !== 'kpi' && ch.type === from);
    if (target && to !== from) {
      changes.push('将「' + target.title + '」改为' + TYPE_NAME[to]);
      target.type = to;
      modified.add(target);
      if (to === 'pie' && dataset.columns.find(c => c.name === target.dimension && c.type === 'date')) {
        const alt = dims[0];
        if (alt) { target.dimension = alt.name; changes.push('饼图维度改用「' + alt.name + '」'); }
      }
    }
  }

  // 句式二：仅出现目标类型关键词（如"改成折线图"），作用于第一个未处理的非 KPI 图表
  if (!swap) {
    for (const tw of TYPE_WORDS) {
      if (tw.re.test(message)) {
        let target = null;
        for (const ch of cfg.charts) {
          if (ch.type !== 'kpi' && !modified.has(ch) && ch.title && message.includes(ch.title)) { target = ch; break; }
        }
        if (!target) target = cfg.charts.find(ch => ch.type !== 'kpi' && !modified.has(ch));
        if (target && target.type !== tw.type) {
          changes.push('将「' + target.title + '」改为' + TYPE_NAME[tw.type]);
          target.type = tw.type;
          modified.add(target);
          if (tw.type === 'pie' && dataset.columns.find(c => c.name === target.dimension && c.type === 'date')) {
            const alt = dims[0];
            if (alt) { target.dimension = alt.name; changes.push('饼图维度改用「' + alt.name + '」'); }
          }
        }
      }
    }
  }
  // 删除：删除 KPI 或指定标题
  if (/删除|去掉|移除|不要/.test(message)) {
    const before = cfg.charts.length;
    cfg.charts = cfg.charts.filter(ch => !(ch.title && message.includes(ch.title)));
    if (cfg.charts.length < before) changes.push('删除了指定的图表');
    if (/kpi|指标卡|汇总/i.test(message)) {
      const n = cfg.charts.length;
      cfg.charts = cfg.charts.filter(c => c.type !== 'kpi');
      if (cfg.charts.length < n) changes.push('删除了 KPI 指标卡');
    }
  }
  // 增加：加一个某类型图表
  if (/加一[个条]|新增|添加|增加/.test(message)) {
    for (const tw of TYPE_WORDS) {
      if (tw.re.test(message) && metrics[0]) {
        const type = tw.type;
        const dim = (type === 'pie' ? (dims[0] || dates[0]) : (dates[0] && /趋势|按月|按日/.test(message) ? dates[0] : dims[0])) || dims[0] || dates[0];
        if (dim) {
          const ch = { type, title: dim.name + metrics[0].name, dimension: dim.name, field: metrics[0].name, agg: 'sum' };
          if (type !== 'line') ch.topN = 8;
          cfg.charts.push(ch);
          changes.push('新增了「' + ch.title + '」图表');
          break;
        }
      }
    }
    if (/kpi|指标卡/i.test(message) && metrics[0] && !cfg.charts.some(c => c.type === 'kpi')) {
      cfg.charts.unshift({ type: 'kpi', title: '总' + metrics[0].name, field: metrics[0].name, agg: 'sum' });
      changes.push('新增了 KPI 指标卡');
    }
  }
  // 改标题
  const tm = message.match(/标题.{0,6}(?:改成|改为|改为|换成|设置为)\s*["「']?([^"」']+)["」']?/);
  if (tm) { cfg.title = tm[1].trim().slice(0, 40); changes.push('看板标题改为「' + cfg.title + '」'); }
  return { config: cfg, changes };
}

async function* runPipeline({ mode, message, dataset, currentConfig }) {
  const steps = [];
  const snap = () => ({ type: 'steps', steps: steps.map(s => ({ ...s })) });
  const add = (id, title, detail) => { steps.push({ id, title, status: 'running', detail: detail || '' }); return snap(); };
  const done = (id, status, detail) => { const s = steps.find(x => x.id === id); if (s) { s.status = status; if (detail !== undefined) s.detail = detail; } return snap(); };

  const isCreate = mode === 'create';

  // ---- 1. 分析 ----
  yield add('analyze', isCreate ? '解析数据结构' : '理解修改需求');
  await sleep(250);
  const counts = { number: 0, category: 0, date: 0 };
  for (const c of dataset.columns) counts[c.type] = (counts[c.type] || 0) + 1;
  if (isCreate) {
    yield done('analyze', 'done', dataset.rowCount + ' 行 × ' + dataset.columns.length + ' 列（数值 ' + counts.number + '、类别 ' + counts.category + '、日期 ' + counts.date + '）');
  } else {
    yield done('analyze', 'done', '当前看板 ' + (currentConfig.charts || []).length + ' 个图表，修改意见：' + String(message).slice(0, 60));
  }

  // ---- 2. 规划 ----
  yield add('plan', '规划看板布局');
  let engine = 'rule';
  let raw = null;
  let planDetail;
  if (llm.available()) {
    engine = 'llm';
    try {
      raw = isCreate
        ? await llm.chatJSON(llm.buildPlanMessages(dataset, message))
        : await llm.chatJSON(llm.buildModifyMessages(dataset, currentConfig, message));
      planDetail = 'LLM（' + llm.MODEL + '）已完成图表选型与指标规划';
    } catch (e) {
      engine = 'rule';
      planDetail = 'LLM 调用失败（' + e.message + '），已降级到本地规则引擎';
    }
  } else {
    planDetail = '本地规则引擎：按字段类型匹配图表（数值列→指标，类别/日期列→维度）';
  }
  yield done('plan', 'done', planDetail);

  // ---- 3. 生成配置 ----
  yield add('build', '生成看板配置');
  let norm = raw ? normalizeConfig(raw, dataset) : null;
  if (isCreate) {
    if (!norm || !norm.config.charts.length) {
      norm = normalizeConfig(defaultConfig(dataset), dataset);
      if (engine === 'llm') planDetail = 'LLM 结果不可用，规则引擎兜底生成';
    }
  } else {
    const rm = ruleModify(currentConfig, dataset, message);
    if (raw && norm && norm.config.charts.length) {
      // LLM 修改成功
    } else if (rm.changes.length) {
      norm = normalizeConfig(rm.config, dataset);
      if (engine === 'llm') planDetail = 'LLM 修改失败，规则引擎完成修改';
      engine = 'rule';
    } else {
      norm = norm && norm.config.charts.length ? norm : normalizeConfig(currentConfig, dataset);
    }
  }
  await sleep(engine === 'llm' ? 0 : 300);
  yield done('build', 'done', '共 ' + norm.config.charts.length + ' 个图表组件' + (raw ? '' : '（规则引擎）'));

  // ---- 4. 校验 ----
  yield add('check', '校验配置与数据匹配');
  await sleep(250);
  if (norm.errors.length) {
    yield done('check', 'error', '发现 ' + norm.errors.length + ' 个问题，例如：' + norm.errors[0]);
    // ---- 5. 修复 ----
    yield add('fix', '自动修复配置');
    await sleep(250);
    yield done('fix', 'done', '已剔除无效图表、修正聚合方式，剩余 ' + norm.config.charts.length + ' 个有效图表');
  } else {
    yield done('check', 'done', '字段存在性与类型匹配全部通过（' + norm.config.charts.length + ' 个图表）');
  }

  // ---- 6. 渲染 ----
  yield add('render', '渲染看板应用');
  const html = renderDashboardHTML(norm.config, dataset);
  await sleep(200);
  yield done('render', 'done', '生成自包含 HTML 应用（' + (html.length / 1024).toFixed(1) + ' KB），引擎：' + (engine === 'llm' ? 'LLM 智能规划' : '本地规则引擎'));

  yield { type: 'result', config: norm.config, engine, html };
}

module.exports = { runPipeline, ruleModify };
