const { chooseGoat, MAX_REMOVALS, WIN_PRIZES, LOSE_PRIZE } = require('./monty');

function asRemoved(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    return value.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number);
  }
  return [];
}

function prizeFor(won, prizeIdx) {
  if (!won) return LOSE_PRIZE;
  return WIN_PRIZES[Number(prizeIdx)] || WIN_PRIZES[0];
}

async function removeGoat(sql, gameId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rows = await sql`
      SELECT winning_box, first_pick, removed_boxes, status, final_pick
      FROM monty_rounds
      WHERE id = ${gameId}::uuid
    `;
    if (!rows.length) return { status: 404, error: 'not_found' };
    const row = rows[0];
    if (row.status !== 'picked' || row.first_pick === null || row.final_pick !== null) {
      return { status: 409, error: 'pick_required' };
    }
    const removed = asRemoved(row.removed_boxes);
    if (removed.length >= MAX_REMOVALS) return { status: 409, error: 'no_goat' };
    const goat = chooseGoat(Number(row.winning_box), Number(row.first_pick), removed);
    if (goat === null) return { status: 409, error: 'no_goat' };

    const updated = await sql`
      UPDATE monty_rounds
      SET removed_boxes = array_append(removed_boxes, ${goat})
      WHERE id = ${gameId}::uuid
        AND status = 'picked'
        AND final_pick IS NULL
        AND cardinality(removed_boxes) = ${removed.length}
        AND NOT (${goat} = ANY(removed_boxes))
        AND ${goat} <> winning_box
        AND ${goat} <> first_pick
      RETURNING removed_boxes
    `;
    if (updated.length) {
      return {
        status: 200,
        removedBox: goat,
        removed: asRemoved(updated[0].removed_boxes),
        remainingRemovals: MAX_REMOVALS - asRemoved(updated[0].removed_boxes).length,
      };
    }
  }
  return { status: 409, error: 'conflict' };
}

module.exports = { asRemoved, prizeFor, removeGoat };
