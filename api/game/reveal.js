const { getSql, ensureSchema } = require('../../lib/db');
const { send, readBody, gameId, boxId } = require('../../lib/http');
const { asRemoved, prizeFor } = require('../../lib/rounds');
const { WIN_PRIZES } = require('../../lib/monty');

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
      SET final_pick = ${box},
          status = 'resolved',
          won = (winning_box = ${box}),
          resolved_at = now()
      WHERE id = ${id}::uuid
        AND status = 'picked'
        AND first_pick IS NOT NULL
        AND final_pick IS NULL
        AND NOT (${box} = ANY(removed_boxes))
      RETURNING winning_box, prize_idx, first_pick, final_pick, removed_boxes, won
    `;
    if (!rows.length) {
      const existing = await sql`
        SELECT status FROM monty_rounds WHERE id = ${id}::uuid
      `;
      if (!existing.length) return send(res, 404, { error: 'not_found' });
      return send(res, 409, { error: existing[0].status === 'open' ? 'pick_required' : 'already_resolved' });
    }

    const row = rows[0];
    const won = row.won === true || row.won === 't';
    const firstPick = Number(row.first_pick);
    const finalPick = Number(row.final_pick);
    const winningPrize = WIN_PRIZES[Number(row.prize_idx)] || WIN_PRIZES[0];
    return send(res, 200, {
      gameId: id,
      won,
      winningBox: Number(row.winning_box),
      firstPick,
      finalPick,
      stayed: finalPick === firstPick,
      removed: asRemoved(row.removed_boxes),
      prize: prizeFor(won, row.prize_idx),
      winningPrize,
    });
  } catch (error) {
    if (error && error.code === 'NO_DATABASE') return send(res, 503, { error: 'no_database' });
    console.error('reveal failed');
    return send(res, 500, { error: 'server' });
  }
};
