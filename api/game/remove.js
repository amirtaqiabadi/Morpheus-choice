const { getSql, ensureSchema } = require('../../lib/db');
const { send, readBody, gameId } = require('../../lib/http');
const { readSession } = require('../../lib/session');
const { removeGoat } = require('../../lib/rounds');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const id = gameId(readBody(req));
    if (!id) return send(res, 400, { error: 'invalid' });
    const sql = getSql();
    await ensureSchema(sql);
    const result = await removeGoat(sql, id, playerId(req));
    if (result.error) {
      const body = { error: result.error };
      if (typeof result.gems === 'number') body.gems = result.gems;
      return send(res, result.status, body);
    }
    const body = {
      gameId: id,
      removedBox: result.removedBox,
      removed: result.removed,
      remainingRemovals: result.remainingRemovals,
    };
    if (typeof result.gems === 'number') body.gems = result.gems;
    return send(res, 200, body);
  } catch (error) {
    if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
    console.error('remove failed');
    return send(res, 500, { error: 'server' });
  }
};

function playerId(req) {
  try {
    if (!req.headers) return null;
    const session = readSession(req);
    return session ? session.telegramId : null;
  } catch (error) {
    if (error && error.code === 'NO_TELEGRAM') return null;
    throw error;
  }
}
