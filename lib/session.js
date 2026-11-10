const crypto = require('crypto');

const SESSION_COOKIE = 'mc_session';
const OAUTH_COOKIE = 'mc_oauth';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_SECONDS = 60 * 10;

function sessionKey() {
  const material = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_CLIENT_SECRET;
  if (!material) {
    const error = new Error('Telegram credentials are not set');
    error.code = 'NO_TELEGRAM';
    throw error;
  }
  return crypto.createHmac('sha256', material).update('morpheus-session-v1').digest();
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readPayload(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const dot = token.indexOf('.');
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected;
  try {
    expected = crypto.createHmac('sha256', sessionKey()).update(body).digest('base64url');
  } catch (error) {
    if (error && error.code === 'NO_TELEGRAM') throw error;
    return null;
  }
  const given = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function issueSession(res, req, telegramId) {
  const token = signPayload({
    tid: String(telegramId),
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  });
  setCookie(res, req, SESSION_COOKIE, token, SESSION_SECONDS);
  return token;
}

function readSession(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const token = bearer || cookies(req)[SESSION_COOKIE] || '';
  const payload = token ? readPayload(token) : null;
  if (!payload || typeof payload.tid !== 'string' || !/^\d{1,19}$/.test(payload.tid)) return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return { telegramId: payload.tid };
}

function issueOAuth(res, req, fields) {
  const token = signPayload({
    kind: 'oauth',
    state: fields.state,
    verifier: fields.verifier,
    nonce: fields.nonce,
    ref: fields.ref || '',
    exp: Math.floor(Date.now() / 1000) + OAUTH_SECONDS,
  });
  setCookie(res, req, OAUTH_COOKIE, token, OAUTH_SECONDS);
}

function readOAuth(req) {
  const payload = readPayload(cookies(req)[OAUTH_COOKIE] || '');
  if (!payload || payload.kind !== 'oauth') return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  if (typeof payload.state !== 'string' || typeof payload.verifier !== 'string' || typeof payload.nonce !== 'string') {
    return null;
  }
  return payload;
}

function clearOAuth(res, req) {
  setCookie(res, req, OAUTH_COOKIE, '', 0);
}

function cookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      out[key] = part.slice(eq + 1).trim();
    }
  }
  return out;
}

function setCookie(res, req, name, value, maxAge) {
  const secure = requestIsHttps(req) ? '; Secure' : '';
  const cookie = `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  const current = res.getHeader('Set-Cookie');
  if (!current) res.setHeader('Set-Cookie', cookie);
  else if (Array.isArray(current)) res.setHeader('Set-Cookie', current.concat(cookie));
  else res.setHeader('Set-Cookie', [current, cookie]);
}

function requestIsHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https';
}

function requestOrigin(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`;
}

module.exports = {
  issueSession,
  readSession,
  issueOAuth,
  readOAuth,
  clearOAuth,
  requestOrigin,
  signPayload,
  readPayload,
};
