const { randomUUID, randomInt } = require('crypto');
const { getSql, ensureSchema } = require('../../lib/db');
const { send } = require('../../lib/http');
const { readSession } = require('../../lib/session');
const { spinsRemaining } = require('../../lib/leaderboard');
const { choosePrize } = require('../../lib/wheel');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const session = readSession(req);
    if (!session) return send(res, 401, { error: 'unauthorized' });
    const sql = getSql();
    await ensureSchema(sql);
    const prize = choosePrize(randomInt(0, 1_000_000) / 1_000_000);
    const id = randomUUID();
    const inserted = await sql`
      WITH today AS (
        SELECT count(*)::int AS used
        FROM wheel_spins
        WHERE telegram_id = ${session.telegramId}::bigint
          AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'Asia/Tehran'
      )
      INSERT INTO wheel_spins (id, telegram_id, prize_id)
      SELECT ${id}::uuid, ${session.telegramId}::bigint, ${prize.id}
      FROM today
      WHERE today.used < 3
      RETURNING id
    `;
    if (!inserted.length) {
      const left = await spinsRemaining(sql, session.telegramId);
      return send(res, 409, { error: 'no_spins', spinsLeft: left });
    }
    return send(res, 200, {
      spinId: inserted[0].id,
      prizeId: prize.id,
      label: prize.label,
      emoji: prize.emoji,
      special: prize.special,
      empty: prize.empty,
      spinsLeft: await spinsRemaining(sql, session.telegramId),
    });
  } catch (error) {
    if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
    if (error && error.code === 'NO_TELEGRAM') return send(res, 503, { error: 'no_telegram' });
    if (error && error.code === '23503') return send(res, 401, { error: 'unauthorized' });
    console.error('spin failed');
    return send(res, 500, { error: 'server' });
  }
};
