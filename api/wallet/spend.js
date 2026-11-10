const { getSql, ensureSchema } = require('../../lib/db');
const { send, readBody } = require('../../lib/http');
const { readSession } = require('../../lib/session');
const { spendGems } = require('../../lib/users');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const session = readSession(req);
    if (!session) return send(res, 401, { error: 'unauthorized' });
    const body = readBody(req);
    const reason = body && typeof body.reason === 'string' ? body.reason : '';
    const sql = getSql();
    await ensureSchema(sql);
    const result = await spendGems(sql, session.telegramId, reason);
    if (result.error === 'invalid') return send(res, 400, { error: 'invalid' });
    if (result.error === 'unauthorized') return send(res, 401, { error: 'unauthorized' });
    if (result.error === 'insufficient') return send(res, 409, { error: 'insufficient', gems: result.gems });
    return send(res, 200, { gems: result.gems });
  } catch (error) {
    if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
    if (error && error.code === 'NO_TELEGRAM') return send(res, 503, { error: 'no_telegram' });
    console.error('spend failed');
    return send(res, 500, { error: 'server' });
  }
};
