// 看板配置：规则引擎默认生成 + 配置规范化校验修复 + 看板 HTML 渲染
'use strict';

const AGGS = ['sum', 'avg', 'count', 'max', 'min'];
const TYPES = ['kpi', 'bar', 'line', 'pie'];
const AGG_NAME = { sum: '总', avg: '平均', count: '数量', max: '最大', min: '最小' };

// 规则引擎：按字段类型推导默认看板
function defaultConfig(dataset) {
  const metrics = dataset.columns.filter(c => c.type === 'number');
  const dates = dataset.columns.filter(c => c.type === 'date');
  const dims = dataset.columns.filter(c => c.type === 'category');
  const charts = [];
  for (const m of metrics.slice(0, 3)) {
    charts.push({ type: 'kpi', title: '总' + m.name, field: m.name, agg: 'sum' });
  }
  const m0 = metrics[0];
  if (m0 && dims[0]) charts.push({ type: 'bar', title: '各' + dims[0].name + m0.name, dimension: dims[0].name, field: m0.name, agg: 'sum', topN: 8 });
  if (m0 && dates[0]) charts.push({ type: 'line', title: m0.name + '趋势', dimension: dates[0].name, field: m0.name, agg: 'sum' });
  if (m0 && dims[0]) charts.push({ type: 'pie', title: dims[0].name + m0.name + '占比', dimension: dims[0].name, field: m0.name, agg: 'sum', topN: 6 });
  return { title: dataset.name || '数据看板', charts };
}

// 规范化 + 校验 + 自动修复：剔除非法图表、纠正聚合方式
function normalizeConfig(raw, dataset) {
  const errors = [];
  const colMap = new Map(dataset.columns.map(c => [c.name, c]));
  const title = (raw && typeof raw.title === 'string' && raw.title.trim()) ? raw.title.trim().slice(0, 40) : '数据看板';
  const charts = [];
  const list = raw && Array.isArray(raw.charts) ? raw.charts : [];
  for (const ch of list) {
    if (!ch || typeof ch !== 'object') continue;
    if (!TYPES.includes(ch.type)) { errors.push('未知图表类型 "' + ch.type + '"，已跳过'); continue; }
    const agg = AGGS.includes(ch.agg) ? ch.agg : 'sum';
    const field = (typeof ch.field === 'string' && colMap.has(ch.field)) ? ch.field : null;
    if (!field) { errors.push('指标字段 "' + (ch.field || '?') + '" 不存在于数据，已剔除该图表'); continue; }
    if (agg !== 'count' && colMap.get(field).type !== 'number') { errors.push('字段 "' + field + '" 不是数值列，已剔除该图表'); continue; }
    const out = { type: ch.type, field, agg, title: (typeof ch.title === 'string' && ch.title.trim()) ? ch.title.trim().slice(0, 40) : (AGG_NAME[agg] + field) };
    if (ch.type !== 'kpi') {
      const dim = typeof ch.dimension === 'string' ? ch.dimension : null;
      if (!dim || !colMap.has(dim)) { errors.push('图表 "' + out.title + '" 缺少有效维度字段，已剔除'); continue; }
      if (dim === field) { errors.push('维度与指标不能是同一字段，已剔除'); continue; }
      out.dimension = dim;
      if (ch.topN != null) out.topN = Math.min(Math.max(parseInt(ch.topN, 10) || 8, 3), 20);
    }
    const sig = JSON.stringify(out);
    if (charts.some(c => JSON.stringify(c) === sig)) continue;
    charts.push(out);
  }
  return { config: { title, charts }, errors };
}

// 数字格式化（注入到生成应用中）
const FMT_JS = `
function fmtNum(n){
  if(n==null||isNaN(n))return '-';
  if(Math.abs(n)>=1e8)return (n/1e8).toFixed(2)+' 亿';
  if(Math.abs(n)>=1e4)return (n/1e4).toFixed(2)+' 万';
  if(Math.abs(n)>=1000)return n.toLocaleString('zh-CN',{maximumFractionDigits:2});
  return (Math.round(n*100)/100).toLocaleString('zh-CN');
}`;

// 渲染生成应用：完整自包含 HTML（ECharts CDN），带维度筛选与响应式
function renderDashboardHTML(config, dataset) {
  const payload = { columns: dataset.columns, rows: dataset.rows.slice(0, 5000) };
  const dataJs = JSON.stringify(payload).replace(/</g, '\\u003c');
  const cfgJs = JSON.stringify(config).replace(/</g, '\\u003c');
  const title = config.title || '数据看板';
  return '<!DOCTYPE html>\n<html lang="zh">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>' + esc(title) + '</title>\n' +
'<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"><\/script>\n' +
'<style>\n' +
`*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif;background:#f4f5f7;color:#1f2329;padding:20px}
header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px}
h1{font-size:20px;font-weight:600}
.filter{display:flex;align-items:center;gap:8px;font-size:13px;color:#646a73}
select{padding:6px 10px;border:1px solid #d5d7de;border-radius:8px;background:#fff;font-size:13px;outline:none}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.kpi{background:#fff;border:1px solid #e5e6eb;border-radius:12px;padding:16px}
.kpi .k-label{font-size:13px;color:#646a73;margin-bottom:6px}
.kpi .k-value{font-size:26px;font-weight:600;color:#4f46e5}
.kpi .k-agg{font-size:12px;color:#8f959e;margin-top:4px}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:12px}
.card{background:#fff;border:1px solid #e5e6eb;border-radius:12px;padding:14px}
.card h3{font-size:14px;font-weight:600;margin-bottom:4px}
.card .sub{font-size:12px;color:#8f959e;margin-bottom:8px}
.chart{height:300px}
footer{margin-top:16px;font-size:12px;color:#8f959e;text-align:center}
@media(max-width:760px){.charts{grid-template-columns:1fr}.chart{height:260px}}
</style>\n</head>\n<body>\n` +
'<header><h1>' + esc(title) + '</h1><div class="filter"><span>按 ' + esc(filterDimName(config, dataset) || '—') + ' 筛选</span><select id="dimFilter"><option value="">全部</option></select></div></header>\n' +
'<main><section id="kpis" class="kpis"></section><section id="charts" class="charts"></section></main>\n' +
'<footer>VizGen 生成 · ' + dataset.rowCount + ' 行源数据</footer>\n' +
'<script>\nvar DATA=' + dataJs + ';\nvar CONFIG=' + cfgJs + ';\n' + FMT_JS + `
var colIdx={},colType={};
DATA.columns.forEach(function(c,i){colIdx[c.name]=i;colType[c.name]=c.type;});
var filterDim=(function(){for(var i=0;i<CONFIG.charts.length;i++){var c=CONFIG.charts[i];if(c.dimension&&colType[c.dimension]==='category')return c.dimension;}return null;})();
var sel=document.getElementById('dimFilter');
if(filterDim){var seen={},ri=colIdx[filterDim];DATA.rows.forEach(function(r){var v=r[ri]||'(空)';if(!seen[v]){seen[v]=1;var o=document.createElement('option');o.value=v;o.textContent=v;sel.appendChild(o);}});sel.addEventListener('change',drawAll);}else{sel.style.display='none';}
function currentRows(){var rows=DATA.rows;if(filterDim&&sel.value){var ri=colIdx[filterDim];rows=rows.filter(function(r){return (r[ri]||'(空)')===sel.value;});}return rows;}
function aggregate(rows,ch){var di=ch.dimension?colIdx[ch.dimension]:-1,fi=colIdx[ch.field];var m={};for(var i=0;i<rows.length;i++){var k=di>=0?(rows[i][di]||'(空)'):'全部';var o=m[k]||(m[k]={sum:0,count:0,max:-Infinity,min:Infinity});if(ch.agg==='count'){o.count++;continue;}var v=Number(rows[i][fi]);if(!isNaN(v)){o.sum+=v;o.count++;if(v>o.max)o.max=v;if(v<o.min)o.min=v;}}
var out=[];for(var key in m){var o=m[key];var v=ch.agg==='sum'?o.sum:ch.agg==='avg'?(o.count?o.sum/o.count:0):ch.agg==='count'?o.count:ch.agg==='max'?o.max:o.min;out.push({name:key,value:v});}
return out;}
function drawChart(el,ch,rows){var data=aggregate(rows,ch);if(ch.topN){data=data.sort(function(a,b){return b.value-a.value;}).slice(0,ch.topN);}
if(ch.dimension&&colType[ch.dimension]==='date')data=data.sort(function(a,b){return a.name<b.name?-1:1;});
if(ch.type==='pie'){echarts.init(el).setOption({tooltip:{trigger:'item'},legend:{bottom:0,type:'scroll'},series:[{type:'pie',radius:['40%','68%'],center:['50%','45%'],data:data.map(function(d){return {name:d.name,value:Math.round(d.value*100)/100};}),label:{formatter:'{b}: {d}%'}}]});return;}
echarts.init(el).setOption({tooltip:{trigger:'axis'},grid:{left:50,right:20,top:24,bottom:ch.dimension&&colType[ch.dimension]==='date'?50:70},xAxis:{type:'category',data:data.map(function(d){return d.name;}),axisLabel:{rotate:ch.dimension&&colType[ch.dimension]==='date'?0:24}},yAxis:{type:'value',axisLabel:{formatter:function(v){return fmtNum(v);}}},series:[{type:ch.type==='bar'?'bar':'line',smooth:true,data:data.map(function(d){return Math.round(d.value*100)/100;}),itemStyle:{color:'#4f46e5'},areaStyle:ch.type==='line'?{opacity:0.08}:undefined}]});}
function drawAll(){var rows=currentRows();var kp=document.getElementById('kpis');kp.innerHTML='';var cs=document.getElementById('charts');cs.innerHTML='';CONFIG.charts.forEach(function(ch){if(ch.type==='kpi'){var rows2=DATA.rows;if(filterDim&&sel.value){var ri=colIdx[filterDim];rows2=rows2.filter(function(r){return (r[ri]||'(空)')===sel.value;});}var v=aggregate(rows2,ch)[0]?aggregate(rows2,ch)[0].value:0;var d=document.createElement('div');d.className='kpi';d.innerHTML='<div class=\"k-label\">'+ch.title+'</div><div class=\"k-value\">'+fmtNum(v)+'</div><div class=\"k-agg\">'+ch.agg+' · '+ch.field+'</div>';kp.appendChild(d);return;}
var card=document.createElement('div');card.className='card';card.innerHTML='<h3>'+ch.title+'</h3><div class=\"sub\">'+ch.agg+'('+ch.field+') 按 '+ch.dimension+'</div><div class=\"chart\"></div>';cs.appendChild(card);drawChart(card.querySelector('.chart'),ch,rows);});}
window.addEventListener('resize',function(){document.querySelectorAll('.chart').forEach(function(el){var i=echarts.getInstanceByDom(el);if(i)i.resize();});});
drawAll();
<\/script>\n</body>\n</html>`;
}

function filterDimName(config, dataset) {
  for (const ch of config.charts || []) {
    if (ch.dimension && dataset.columns.some(c => c.name === ch.dimension && c.type === 'category')) return ch.dimension;
  }
  return null;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { AGGS, TYPES, defaultConfig, normalizeConfig, renderDashboardHTML };
