const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

loadEnv(path.join(__dirname, '..', '.env.local'));

const start = require('../api/game/start');
const pick = require('../api/game/pick');
const remove = require('../api/game/remove');
const reveal = require('../api/game/reveal');
const { getSql } = require('../lib/db');

(async () => {
  const started = await call(start, {});
  assert.equal(started.status, 200);
  assert.equal(started.body.committed, true);
  assert.equal(Object.hasOwn(started.body, 'winningBox'), false);
  const gameId = started.body.gameId;

  const sql = getSql();
  const stored = await sql`SELECT winning_box, first_pick FROM monty_rounds WHERE id = ${gameId}::uuid`;
  assert.equal(stored[0].first_pick, null);
  const winning = Number(stored[0].winning_box);
  assert.equal(Number.isInteger(winning) && winning >= 0 && winning <= 8, true);

  const early = await call(remove, { gameId });
  assert.equal(early.status, 409);

  const first = winning === 0 ? 1 : 0;
  const picked = await call(pick, { gameId, box: first });
  assert.equal(picked.status, 200);
  assert.equal(picked.body.firstPick, first);

  const removed = [];
  for (let i = 0; i < 7; i += 1) {
    const step = await call(remove, { gameId });
    assert.equal(step.status, 200, JSON.stringify(step.body));
    assert.notEqual(step.body.removedBox, winning);
    assert.notEqual(step.body.removedBox, first);
    removed.push(step.body.removedBox);
  }
  const extra = await call(remove, { gameId });
  assert.equal(extra.status, 409);

  const other = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((box) => box !== first && !removed.includes(box));
  const opened = await call(reveal, { gameId, box: other });
  assert.equal(opened.status, 200);
  assert.equal(opened.body.winningBox, winning);
  assert.equal(opened.body.won, other === winning);
  assert.equal(opened.body.stayed, false);
  const again = await call(reveal, { gameId, box: other });
  assert.equal(again.status, 409);

  let immutable = false;
  try {
    await sql`UPDATE monty_rounds SET winning_box = ${(winning + 1) % 9} WHERE id = ${gameId}::uuid`;
  } catch (error) {
    immutable = /immutable|winning door/i.test(String(error.message || error));
  }
  assert.equal(immutable, true);
  console.log(JSON.stringify({
    ok: true,
    switchedToStoredDoor: opened.body.won === (other === winning),
    removalsAvoidedWinner: true,
    doorLocked: true,
  }));
})().catch((error) => {
  const message = String(error && error.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted]');
  console.error(message);
  process.exit(1);
});

function call(handler, body) {
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', body };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function loadEnv(file) {
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1);
  }
}
