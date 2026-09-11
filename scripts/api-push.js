// 通过 GitHub REST API 推送仓库内容（适用于 github.com:443 被阻断、仅 api.github.com 可达的网络环境）
// 用法：GITHUB_TOKEN=xxx node scripts/api-push.js <owner> <repo>
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const OWNER = process.argv[2];
const REPO = process.argv[3];
const TOKEN = process.env.GITHUB_TOKEN;
if (!OWNER || !REPO || !TOKEN) {
  console.error('usage: GITHUB_TOKEN=xxx node scripts/api-push.js <owner> <repo>');
  process.exit(1);
}

const API = 'https://api.github.com';
const H = {
  'Authorization': 'Bearer ' + TOKEN,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'vizgen-push',
  'Content-Type': 'application/json',
};

async function api(method, url, body) {
  const res = await fetch(API + url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
  if (!res.ok) {
    throw new Error(method + ' ' + url + ' -> ' + res.status + ' ' + (json && json.message ? json.message : text.slice(0, 200)));
  }
  return json;
}

(async () => {
  const root = path.join(__dirname, '..');
  const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  console.log('files to upload:', files.length);

  // 1. 为每个文件创建 blob
  const tree = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(root, f));
    const blob = await api('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64',
    });
    tree.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
    console.log('  blob:', f, blob.sha.slice(0, 7));
  }

  // 2. 创建 tree
  const treeRes = await api('POST', `/repos/${OWNER}/${REPO}/git/trees`, { tree });
  console.log('tree:', treeRes.sha.slice(0, 7));

  // 3. 创建 commit（若已有 main 引用则作为父提交，保持线性历史）
  const msg = execSync('git log -1 --pretty=%B', { cwd: root, encoding: 'utf8' }).trim();
  let parents = [];
  try {
    const cur = await api('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    if (cur && cur.object && cur.object.sha) parents = [cur.object.sha];
  } catch (e) { /* 空仓库：无父提交 */ }
  const commit = await api('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message: msg,
    tree: treeRes.sha,
    parents,
  });
  console.log('commit:', commit.sha.slice(0, 7), '| parents:', parents.length);

  // 4. 建立/更新 main 分支引用
  let refOk = false;
  try {
    await api('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: true });
    refOk = true;
  } catch (e) {
    if (/ -> 404| -> 422/.test(e.message)) {
      await api('POST', `/repos/${OWNER}/${REPO}/git/refs`, { ref: 'refs/heads/main', sha: commit.sha });
      refOk = true;
    } else throw e;
  }
  console.log('ref main:', refOk ? 'OK' : 'FAILED');

  const repo = await api('GET', `/repos/${OWNER}/${REPO}`);
  console.log('DONE ->', repo.html_url, '| default:', repo.default_branch, '| size:', repo.size, 'KB');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
