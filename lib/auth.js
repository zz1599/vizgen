// 认证：scrypt 密码哈希 + HMAC 签名 token（无外部依赖）
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// secret 持久化，避免重启后 token 全部失效
const SECRET_FILE = path.join(DATA_DIR, '.secret');
let SECRET;
if (process.env.AUTH_SECRET) SECRET = process.env.AUTH_SECRET;
else if (fs.existsSync(SECRET_FILE)) SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
else { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(SECRET_FILE, SECRET); }

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return salt + ':' + h;
}

function verifyPassword(pw, stored) {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const c = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(c, 'hex'));
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function issueToken(userId, email) {
  return sign({ uid: userId, email, exp: Date.now() + 30 * 24 * 3600 * 1000 });
}

// express 中间件：认证提取优先级
// 1. Cookie（网关原样转发）2. 自定义头 X-VizGen-Token 3. Bearer 头
// 注意：本平台网关会用其自身 JWT 覆盖 Authorization 头，故 Bearer 仅作最后兜底
function getTokenFromReq(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)vizgen_token=([^;]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; } }
  const x = req.headers['x-vizgen-token'];
  if (x) return String(x);
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

// 认证失败记录（诊断用，最多保留 20 条）
const rejectedLog = [];

function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  const payload = verify(token);
  if (!payload) {
    rejectedLog.push({
      at: new Date().toISOString(),
      authHeader: req.headers.authorization || null,
      cookieHeader: req.headers.cookie || null,
      tokenLen: token ? token.length : 0,
      tokenHead: token ? token.slice(0, 48) : null,
      tokenTail: token ? token.slice(-24) : null,
    });
    if (rejectedLog.length > 20) rejectedLog.shift();
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  req.user = payload;
  next();
}

function getRejectedLog() { return rejectedLog; }

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', 'vizgen_token=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Max-Age=2592000; SameSite=Lax');
}

module.exports = { hashPassword, verifyPassword, issueToken, requireAuth, verify, setAuthCookie, getRejectedLog };
