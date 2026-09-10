// CSV 解析与数据集构建（类型推断）
'use strict';

const DATE_RE = /^\d{4}[-/年]\d{1,2}([-/月]\d{1,2})?日?$/;

// 极简 CSV 解析：支持引号包裹、转义引号、CRLF
function parseCSVText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0].trim() !== '') rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); if (row.length > 1 || row[0].trim() !== '') rows.push(row); }
  return rows;
}

function inferType(values) {
  const vals = values.filter(v => v !== '' && v != null);
  if (!vals.length) return 'category';
  const nums = vals.filter(v => isFinite(Number(v))).length;
  if (nums / vals.length >= 0.8) return 'number';
  const dates = vals.filter(v => DATE_RE.test(String(v).trim())).length;
  if (dates / vals.length >= 0.8) return 'date';
  return 'category';
}

function buildDataset(name, text) {
  const rows = parseCSVText(String(text || '').trim());
  if (rows.length < 2) throw new Error('CSV 至少需要一行表头和一行数据');
  const headers = rows[0].map((h, i) => (h || '').trim() || ('列' + (i + 1)));
  const body = rows.slice(1).filter(r => r.some(c => (c || '').trim() !== ''));
  if (!body.length) throw new Error('CSV 没有数据行');
  const columns = headers.map((h, i) => ({ name: h, type: inferType(body.map(r => (r[i] == null ? '' : String(r[i]).trim()))) }));
  return {
    name: name || '未命名数据',
    columns,
    rows: body.map(r => headers.map((_, i) => (r[i] == null ? '' : String(r[i]).trim()))),
    rowCount: body.length,
  };
}

module.exports = { parseCSVText, buildDataset };
