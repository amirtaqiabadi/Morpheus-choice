const { getSql, ensureSchema } = require('../lib/db');
const { send, queryOf } = require('../lib/http');
const { readSession } = require('../lib/session');
const { recentWinners, spinsRemaining } = require('../lib/leaderboard');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const requested = Number(queryOf(req).limit);
    const limit = Number.isInteger(requested) && requested >= 1 && requested <= 20 ? requested : 12;
    const winners = await recentWinners(sql, limit);
    const body = { winners };
    const player = playerId(req);
    if (player) body.spinsLeft = await spinsRemaining(sql, player);
    return send(res, 200, body);
  } catch (error) {
    if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
    console.error('leaderboard failed');
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
