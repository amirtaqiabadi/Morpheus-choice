const { getSql, ensureSchema } = require('../../lib/db');
const { send, readBody } = require('../../lib/http');
const { validateInitData } = require('../../lib/telegram');
const { loginUser } = require('../../lib/users');
const { issueSession } = require('../../lib/session');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const body = readBody(req);
    const initData = body && typeof body.initData === 'string' ? body.initData : '';
    if (!initData || initData.length > 4096) return send(res, 400, { error: 'invalid' });
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return send(res, 503, { error: 'no_telegram' });

    const parsed = validateInitData(initData, botToken);
    if (!parsed) return send(res, 401, { error: 'invalid' });

    const sql = getSql();
    await ensureSchema(sql);
    const profile = await loginUser(sql, parsed.user, parsed.startParam);
    const token = issueSession(res, req, profile.user.id);
    return send(res, 200, { ...profile, token });
  } catch (error) {
    return fail(res, error, 'miniapp auth failed');
  }
};

function fail(res, error, label) {
  if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
  if (error && error.code === 'NO_TELEGRAM') return send(res, 503, { error: 'no_telegram' });
  console.error(label);
  return send(res, 500, { error: 'server' });
}
