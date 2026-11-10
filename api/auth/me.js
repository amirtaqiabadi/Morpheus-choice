const { getSql, ensureSchema } = require('../../lib/db');
const { send } = require('../../lib/http');
const { readSession } = require('../../lib/session');
const { loadUser, present } = require('../../lib/users');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  try {
    const session = readSession(req);
    if (!session) return send(res, 401, { error: 'unauthorized' });
    const sql = getSql();
    await ensureSchema(sql);
    const row = await loadUser(sql, session.telegramId);
    if (!row) return send(res, 401, { error: 'unauthorized' });
    return send(res, 200, present(row));
  } catch (error) {
    if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
    if (error && error.code === 'NO_TELEGRAM') return send(res, 503, { error: 'no_telegram' });
    console.error('session failed');
    return send(res, 500, { error: 'server' });
  }
};
