const { getSql, ensureSchema } = require('../../lib/db');
const { send, readBody, gameId } = require('../../lib/http');
const { removeGoat } = require('../../lib/rounds');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const id = gameId(readBody(req));
    if (!id) return send(res, 400, { error: 'invalid' });
    const sql = getSql();
    await ensureSchema(sql);
    const result = await removeGoat(sql, id);
    if (result.error) return send(res, result.status, { error: result.error });
    return send(res, 200, {
      gameId: id,
      removedBox: result.removedBox,
      removed: result.removed,
      remainingRemovals: result.remainingRemovals,
    });
  } catch (error) {
    if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
    console.error('remove failed');
    return send(res, 500, { error: 'server' });
  }
};
