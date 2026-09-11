// 应用生成辅助：LLM 输出清洗、HTML 校验
'use strict';

const { matchTemplate } = require('./templates');

// 去掉 markdown 代码块围栏与前后解释文字，提取完整 HTML
function stripToHTML(text) {
  if (!text) return '';
  let s = String(text).trim();
  // 去掉 ```html ... ``` 围栏
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence && /<!doctype html|<html/i.test(fence[1])) s = fence[1].trim();
  // 只保留从 <!DOCTYPE 或 <html 开始的部分（去掉前导说明文字）
  const start = s.search(/<!doctype html|<html/i);
  if (start > 0) s = s.slice(start);
  // 去掉尾部的解释文字（</html> 之后的内容）
  const end = s.toLowerCase().lastIndexOf('</html>');
  if (end >= 0) s = s.slice(0, end + '</html>'.length);
  return s.trim();
}

// 校验生成的应用 HTML 是否可用
function validateAppHTML(html) {
  const errors = [];
  const s = String(html || '');
  if (s.length < 300) errors.push('代码过短（' + s.length + ' 字符），疑似未生成完整应用');
  if (!/<html[\s>]/i.test(s)) errors.push('缺少 <html> 标签');
  if (!/<\/html>/i.test(s)) errors.push('缺少 </html> 闭合标签');
  if (!/<script[\s>]/i.test(s) && !/<button/i.test(s)) errors.push('未检测到任何交互逻辑（script/button）');
  if (/```/.test(s)) errors.push('残留 markdown 围栏');
  if (/作为AI|作为一个AI|抱歉[，,]?我无法/i.test(s)) errors.push('疑似输出了拒绝说明而非应用代码');
  if (/https?:\/\//i.test(s.replace(/<!--[\s\S]*?-->/g, '')) && !/w3\.org/i.test(s)) {
    // 引用外部资源会导致 iframe 离线不可用，仅提示不判失败（少量注释误报可容忍）
  }
  return { ok: errors.length === 0, errors };
}

// 从 HTML 中提取 <title>
function extractTitle(html, fallback) {
  const m = String(html || '').match(/<title>([^<]*)<\/title>/i);
  const t = m ? m[1].trim() : '';
  return (t || fallback || '未命名应用').slice(0, 30);
}

module.exports = { stripToHTML, validateAppHTML, extractTitle, matchTemplate };
