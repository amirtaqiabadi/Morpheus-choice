const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '..', '.env.local'));

const enabled = process.env.REFERRAL_INTEGRATION === '1' && process.env.DATABASE_URL;
const inviterId = '810000000000001';
const inviteeId = '810000000000002';
const strangerId = '810000000000003';

test('a new friend credits the inviter once', { skip: !enabled }, async () => {
  process.env.TELEGRAM_BOT_USERNAME = 'MorpheusChoiceBot';
  const { getSql, ensureSchema } = require('../lib/db');
  const { loginUser, spendGems } = require('../lib/users');
  const sql = getSql();
  await ensureSchema(sql);
  await cleanup(sql);
  try {
    const inviter = profile(inviterId, 'Inviter');
    const created = await loginUser(sql, inviter, '');
    assert.equal(created.gems, 0);
    assert.equal(created.invites, 0);
    assert.match(created.inviteUrl, /^https:\/\/t\.me\/MorpheusChoiceBot\?startapp=/);

    const invitee = await loginUser(sql, profile(inviteeId, 'Friend'), created.referralCode);
    assert.equal(invitee.referralApplied, true);
    assert.equal(invitee.gems, 0);

    const again = await loginUser(sql, inviter, invitee.referralCode);
    assert.equal(again.referralApplied, false);
    assert.equal(again.gems, 3);
    assert.equal(again.invites, 1);

    const repeat = await loginUser(sql, profile(inviteeId, 'Friend'), created.referralCode);
    assert.equal(repeat.referralApplied, false);
    const afterRepeat = await loginUser(sql, inviter, '');
    assert.equal(afterRepeat.gems, 3);

    const self = await loginUser(sql, profile(strangerId, 'Self'), 'not-a-real-code');
    assert.equal(self.referralApplied, false);
    const spent = await spendGems(sql, inviterId, 'boost');
    assert.equal(spent.gems, 1);
    const broke = await spendGems(sql, inviterId, 'wheel-empty');
    assert.equal(broke.error, 'insufficient');
  } finally {
    await cleanup(sql);
  }
});

function profile(id, name) {
  return { id, firstName: name, lastName: null, username: null, photoUrl: null };
}

async function cleanup(sql) {
  const ids = [inviterId, inviteeId, strangerId];
  await sql`DELETE FROM referrals WHERE invitee_id = ANY(${ids}::bigint[]) OR inviter_id = ANY(${ids}::bigint[])`;
  await sql`DELETE FROM app_users WHERE telegram_id = ANY(${ids}::bigint[])`;
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
