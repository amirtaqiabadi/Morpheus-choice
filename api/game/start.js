const { randomInt, randomUUID } = require('crypto');
const { getSql, ensureSchema } = require('../../lib/db');
const { send } = require('../../lib/http');
const { readSession } = require('../../lib/session');
const { BOX_COUNT, WIN_PRIZES } = require('../../lib/monty');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const id = randomUUID();
    const winningBox = randomInt(0, BOX_COUNT);
    const prizeIdx = randomInt(0, WIN_PRIZES.length);
    const player = playerId(req);
    const inserted = await sql`
      INSERT INTO monty_rounds (id, winning_box, prize_idx, telegram_id)
      VALUES (${id}::uuid, ${winningBox}, ${prizeIdx}, ${player}::bigint)
      RETURNING id
    `;
    if (!inserted.length) return send(res, 500, { error: 'not_stored' });

    const stored = await sql`
      SELECT winning_box
      FROM monty_rounds
      WHERE id = ${id}::uuid
        AND first_pick IS NULL
        AND status = 'open'
    `;
    if (!stored.length || stored[0].winning_box === null || stored[0].winning_box === undefined) {
      return send(res, 500, { error: 'not_stored' });
    }

    return send(res, 200, {
      gameId: inserted[0].id,
      committed: true,
      boxCount: BOX_COUNT,
    });
  } catch (error) {
    if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
    console.error('start failed');
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
