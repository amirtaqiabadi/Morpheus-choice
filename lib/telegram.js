const crypto = require('crypto');

const MAX_AGE_SECONDS = 60 * 60 * 24;
const CLOCK_SKEW_SECONDS = 60;
const START_PARAM = /^[A-Za-z0-9_-]{1,64}$/;
const TELEGRAM_ID = /^\d{1,19}$/;
const MAX_BIGINT = 9223372036854775807n;

function validateInitData(initData, botToken, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof initData !== 'string' || !initData || initData.length > 4096) return null;
  if (typeof botToken !== 'string' || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash') || '';
  if (!/^[0-9a-f]{64}$/i.test(hash)) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const given = Buffer.from(hash, 'hex');
  const wanted = Buffer.from(expected, 'hex');
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate)) return null;
  if (authDate > nowSeconds + CLOCK_SKEW_SECONDS) return null;
  if (nowSeconds - authDate > MAX_AGE_SECONDS) return null;

  let rawUser;
  try {
    rawUser = JSON.parse(params.get('user') || '');
  } catch {
    return null;
  }
  const user = userFromMiniApp(rawUser);
  if (!user) return null;

  const startParam = params.get('start_param') || '';
  return {
    user,
    startParam: START_PARAM.test(startParam) ? startParam : '',
  };
}

function userFromMiniApp(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = telegramId(raw.id);
  if (!id) return null;
  return {
    id,
    firstName: cleanText(raw.first_name, 64),
    lastName: cleanText(raw.last_name, 64),
    username: cleanText(raw.username, 32),
    photoUrl: httpsUrl(raw.photo_url),
  };
}

function userFromIdToken(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const id = telegramId(payload.id);
  if (!id) return null;
  const name = cleanText(payload.name, 128);
  return {
    id,
    firstName: cleanText(payload.given_name, 64) || name,
    lastName: cleanText(payload.family_name, 64),
    username: cleanText(payload.preferred_username, 32),
    photoUrl: httpsUrl(payload.picture),
  };
}

function verifyIdToken(idToken, clientId, keys, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof idToken !== 'string' || typeof clientId !== 'string' || !clientId) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!header || header.alg !== 'RS256' || !header.kid) return null;
  if (payload.iss !== 'https://oauth.telegram.org') return null;
  if (!audienceMatches(payload.aud, clientId)) return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds - CLOCK_SKEW_SECONDS) return null;
  if (Number.isFinite(payload.iat) && payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) return null;

  const jwk = (keys || []).find((key) => key && key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return null;
  let key;
  try {
    key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    return null;
  }
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  let signature;
  try {
    signature = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  const ok = crypto.verify('RSA-SHA256', data, key, signature);
  if (!ok) return null;
  const user = userFromIdToken(payload);
  if (!user) return null;
  return { user, nonce: typeof payload.nonce === 'string' ? payload.nonce : '' };
}

function audienceMatches(aud, clientId) {
  if (typeof aud === 'string') return aud === clientId;
  if (Array.isArray(aud)) return aud.some((item) => item === clientId);
  return false;
}

function telegramId(value) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : String(value ?? '');
  if (!TELEGRAM_ID.test(text)) return null;
  const parsed = BigInt(text);
  if (parsed <= 0n || parsed > MAX_BIGINT) return null;
  return text;
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function httpsUrl(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function referralCode(value) {
  return typeof value === 'string' && START_PARAM.test(value) ? value : '';
}

module.exports = {
  validateInitData,
  verifyIdToken,
  referralCode,
  userFromMiniApp,
  userFromIdToken,
};
