const crypto = require('crypto');

const REFERRAL_GEMS = 3;
const COSTS = { boost: 2, 'wheel-empty': 5 };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function inviteUrl(code) {
  const username = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) return '';
  const app = String(process.env.TELEGRAM_APP_SHORT_NAME || '');
  const path = /^[A-Za-z0-9_]{1,64}$/.test(app) ? `/${app}` : '';
  return `https://t.me/${username}${path}?startapp=${code}`;
}

function makeCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

async function loginUser(sql, profile, startParam) {
  const created = await insertWithReferral(sql, profile, startParam || '');
  const profileRow = await loadUser(sql, profile.id);
  return { ...present(profileRow), referralApplied: created.referralApplied };
}

async function loadUser(sql, telegramId) {
  const rows = await sql`
    SELECT u.telegram_id, u.username, u.first_name, u.last_name, u.photo_url,
           u.referral_code, u.gems,
           (SELECT count(*)::int FROM referrals r WHERE r.inviter_id = u.telegram_id) AS invites
    FROM app_users u
    WHERE u.telegram_id = ${telegramId}::bigint
  `;
  return rows[0] || null;
}

async function spendGems(sql, telegramId, reason) {
  const cost = COSTS[reason];
  if (!cost) return { error: 'invalid' };
  const rows = await sql`
    UPDATE app_users
    SET gems = gems - ${cost}
    WHERE telegram_id = ${telegramId}::bigint
      AND gems >= ${cost}
    RETURNING gems
  `;
  if (!rows.length) {
    const current = await sql`
      SELECT gems FROM app_users WHERE telegram_id = ${telegramId}::bigint
    `;
    if (!current.length) return { error: 'unauthorized' };
    return { error: 'insufficient', gems: Number(current[0].gems) };
  }
  return { gems: Number(rows[0].gems) };
}

async function insertWithReferral(sql, profile, startParam) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeCode();
    let rows;
    try {
      // One statement, so a failed referral credit rolls the new account back with it.
      rows = await sql`
        WITH inserted AS (
          INSERT INTO app_users (telegram_id, username, first_name, last_name, photo_url, referral_code)
          VALUES (
            ${profile.id}::bigint,
            ${profile.username},
            ${profile.firstName},
            ${profile.lastName},
            ${profile.photoUrl},
            ${code}
          )
          ON CONFLICT (telegram_id) DO NOTHING
          RETURNING telegram_id
        ),
        inviter AS (
          SELECT u.telegram_id
          FROM app_users u
          WHERE ${startParam} <> ''
            AND u.referral_code = ${startParam}
            AND u.telegram_id <> ${profile.id}::bigint
            AND EXISTS (SELECT 1 FROM inserted)
        ),
        ins AS (
          INSERT INTO referrals (invitee_id, inviter_id, gems_awarded)
          SELECT ${profile.id}::bigint, inviter.telegram_id, ${REFERRAL_GEMS}
          FROM inviter
          ON CONFLICT (invitee_id) DO NOTHING
          RETURNING inviter_id, gems_awarded
        ),
        credited AS (
          UPDATE app_users AS u
          SET gems = u.gems + ins.gems_awarded
          FROM ins
          WHERE u.telegram_id = ins.inviter_id
          RETURNING ins.inviter_id
        )
        SELECT
          (SELECT count(*)::int FROM inserted) AS created,
          (SELECT count(*)::int FROM credited) AS credited
      `;
    } catch (error) {
      if (error && error.code === '23505') continue;
      throw error;
    }
    if (Number(rows[0].created) > 0) {
      return { referralApplied: Number(rows[0].credited) > 0 };
    }
    const existing = await sql`
      SELECT telegram_id FROM app_users WHERE telegram_id = ${profile.id}::bigint
    `;
    if (existing.length) {
      await sql`
        UPDATE app_users
        SET username = ${profile.username},
            first_name = ${profile.firstName},
            last_name = ${profile.lastName},
            photo_url = ${profile.photoUrl}
        WHERE telegram_id = ${profile.id}::bigint
      `;
      return { referralApplied: false };
    }
  }
  const error = new Error('referral code');
  error.code = 'CODE';
  throw error;
}

function present(row) {
  return {
    user: {
      id: String(row.telegram_id),
      firstName: row.first_name,
      lastName: row.last_name,
      username: row.username,
      photoUrl: row.photo_url,
    },
    gems: Number(row.gems),
    referralCode: row.referral_code,
    inviteUrl: inviteUrl(row.referral_code),
    invites: Number(row.invites),
  };
}

module.exports = { loginUser, loadUser, spendGems, present, inviteUrl, COSTS, REFERRAL_GEMS };
