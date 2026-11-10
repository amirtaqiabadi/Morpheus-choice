const { getSql, ensureSchema } = require('../../lib/db');
const { send, readBody, gameId, boxId } = require('../../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const body = readBody(req);
    const id = gameId(body);
    const box = boxId(body && body.box);
    if (!id || box === null) return send(res, 400, { error: 'invalid' });

    const sql = getSql();
    await ensureSchema(sql);
    const rows = await sql`
      UPDATE monty_rounds
      SET first_pick = ${box},
          status = 'picked',
          picked_at = now()
      WHERE id = ${id}::uuid
        AND status = 'open'
        AND first_pick IS NULL
        AND winning_box IS NOT NULL
      RETURNING first_pick
    `;
    if (!rows.length) {
      const existing = await sql`
        SELECT status, first_pick FROM monty_rounds WHERE id = ${id}::uuid
      `;
      if (!existing.length) return send(res, 404, { error: 'not_found' });
      if (existing[0].first_pick !== null && Number(existing[0].first_pick) === box) {
        return send(res, 200, { gameId: id, firstPick: box });
      }
      return send(res, 409, { error: 'already_picked' });
    }
    return send(res, 200, { gameId: id, firstPick: Number(rows[0].first_pick) });
  } catch (error) {
    if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
    console.error('pick failed');
    return send(res, 500, { error: 'server' });
  }
};
