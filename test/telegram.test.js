const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { validateInitData, verifyIdToken } = require('../lib/telegram');
const { signPayload, readPayload } = require('../lib/session');
const { inviteUrl } = require('../lib/users');

const BOT = '123456:test-token';

function signedInitData(fields, token = BOT) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) params.set(key, value);
  const dataCheckString = [...params.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

test('a signed Mini App launch identifies the user and the invite code', () => {
  const now = 1_700_000_000;
  const initData = signedInitData({
    auth_date: String(now),
    start_param: 'FriendCode1',
    user: JSON.stringify({
      id: 424242,
      first_name: 'آرمین',
      username: 'armin',
      photo_url: 'https://cdn.example/a.jpg',
    }),
  });
  const parsed = validateInitData(initData, BOT, now);
  assert.equal(parsed.user.id, '424242');
  assert.equal(parsed.user.firstName, 'آرمین');
  assert.equal(parsed.user.username, 'armin');
  assert.equal(parsed.startParam, 'FriendCode1');
});

test('a changed Mini App payload is rejected', () => {
  const now = 1_700_000_000;
  const initData = signedInitData({
    auth_date: String(now),
    user: JSON.stringify({ id: 7, first_name: 'A' }),
  });
  const tampered = initData.replace('first_name', 'last_name');
  assert.equal(validateInitData(tampered, BOT, now), null);
  assert.equal(validateInitData(initData, 'other-token', now), null);
});

test('an old Mini App launch is rejected', () => {
  const now = 1_700_000_000;
  const initData = signedInitData({
    auth_date: String(now - 60 * 60 * 24 - 5),
    user: JSON.stringify({ id: 7, first_name: 'A' }),
  });
  assert.equal(validateInitData(initData, BOT, now), null);
});

test('the session token round-trips the Telegram id', () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT;
  const token = signPayload({ tid: '424242', exp: Math.floor(Date.now() / 1000) + 60 });
  const payload = readPayload(token);
  assert.equal(payload.tid, '424242');
  assert.equal(readPayload(`${token}x`), null);
});

test('invite links use the bot username and the startapp code', () => {
  process.env.TELEGRAM_BOT_USERNAME = 'MorpheusChoiceBot';
  delete process.env.TELEGRAM_APP_SHORT_NAME;
  assert.equal(inviteUrl('Ab12Cd34'), 'https://t.me/MorpheusChoiceBot?startapp=Ab12Cd34');
  process.env.TELEGRAM_APP_SHORT_NAME = 'play';
  assert.equal(inviteUrl('Ab12Cd34'), 'https://t.me/MorpheusChoiceBot/play?startapp=Ab12Cd34');
});

test('an OAuth id token is accepted only for this client and a current expiry', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  jwk.kid = 'kid-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const now = 1_700_000_000;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'kid-1', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    iss: 'https://oauth.telegram.org',
    aud: '555',
    exp: now + 600,
    iat: now,
    nonce: 'n',
    id: 424242,
    given_name: 'آرمین',
    preferred_username: 'armin',
    picture: 'https://cdn.example/a.jpg',
  })).toString('base64url');
  const data = `${header}.${body}`;
  const signature = crypto.sign('sha256', Buffer.from(data), privateKey).toString('base64url');
  const token = `${data}.${signature}`;
  const verified = verifyIdToken(token, '555', [jwk], now);
  assert.equal(verified.user.id, '424242');
  assert.equal(verified.user.firstName, 'آرمین');
  assert.equal(verified.nonce, 'n');
  assert.equal(verifyIdToken(token, '999', [jwk], now), null);
  assert.equal(verifyIdToken(token, '555', [jwk], now + 5000), null);
});
