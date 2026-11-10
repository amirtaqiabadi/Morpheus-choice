const { WIN_PRIZES } = require('./monty');
const { DAILY_SPINS, prizeById } = require('./wheel');

async function recentWinners(sql, limit = 12) {
  const rows = await sql`
    SELECT first_name, last_name, username, game, prize_idx, prize_id, created_at
    FROM (
      SELECT u.first_name, u.last_name, u.username,
             'box'::text AS game,
             r.prize_idx,
             NULL::text AS prize_id,
             r.resolved_at AS created_at
      FROM monty_rounds r
      JOIN app_users u ON u.telegram_id = r.telegram_id
      WHERE r.status = 'resolved'
        AND r.won IS TRUE
        AND r.telegram_id IS NOT NULL
      UNION ALL
      SELECT u.first_name, u.last_name, u.username,
             'wheel'::text AS game,
             NULL::smallint AS prize_idx,
             s.prize_id,
             s.created_at
      FROM wheel_spins s
      JOIN app_users u ON u.telegram_id = s.telegram_id
      WHERE s.prize_id <> 'p4'
    ) wins
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(presentWinner).filter(Boolean);
}

async function spinsRemaining(sql, telegramId) {
  const rows = await sql`
    SELECT count(*)::int AS used
    FROM wheel_spins
    WHERE telegram_id = ${telegramId}::bigint
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'Asia/Tehran'
  `;
  return Math.max(0, DAILY_SPINS - Number(rows[0].used));
}

function presentWinner(row) {
  const wheel = row.game === 'wheel' ? prizeById(row.prize_id) : null;
  const box = row.game === 'box' ? WIN_PRIZES[Number(row.prize_idx)] : null;
  if (row.game === 'wheel' && (!wheel || wheel.empty)) return null;
  if (row.game === 'box' && !box) return null;
  const prize = wheel || box;
  return {
    name: displayName(row),
    game: row.game === 'wheel' ? 'wheel' : 'box',
    label: wheel ? wheel.label : box.val,
    emoji: prize.emoji,
    special: Boolean(wheel && wheel.special),
    at: toIso(row.created_at),
  };
}

function displayName(row) {
  const name = [row.first_name, row.last_name].filter((part) => typeof part === 'string' && part.trim()).join(' ').trim();
  if (name) return name.slice(0, 80);
  if (typeof row.username === 'string' && row.username.trim()) return `@${row.username.trim().slice(0, 32)}`;
  return 'بازیکن';
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date(0).toISOString();
  return date.toISOString();
}

module.exports = { recentWinners, spinsRemaining, presentWinner, displayName };
