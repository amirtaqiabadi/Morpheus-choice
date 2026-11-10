const test = require('node:test');
const assert = require('node:assert/strict');
const { PRIZES, choosePrize, prizeById } = require('../lib/wheel');
const { presentWinner } = require('../lib/leaderboard');

test('the server picks a known wheel prize and skips empty results on the board', () => {
  const ids = new Set(PRIZES.map((prize) => prize.id));
  for (let step = 0; step < 1000; step += 1) {
    const prize = choosePrize(step / 1000);
    assert.equal(ids.has(prize.id), true);
    assert.equal(prizeById(prize.id).label, prize.label);
  }
  assert.equal(choosePrize(0).id, 'sp');
  assert.equal(choosePrize(0.999999).empty, false);
  const hidden = presentWinner({
    game: 'wheel',
    prize_id: 'p4',
    first_name: 'آرمین',
    created_at: '2026-11-10T00:00:00.000Z',
  });
  assert.equal(hidden, null);
  const shown = presentWinner({
    game: 'box',
    prize_idx: 1,
    first_name: 'آرمین',
    username: 'armin',
    created_at: '2026-11-10T00:00:00.000Z',
  });
  assert.equal(shown.name, 'آرمین');
  assert.equal(shown.game, 'box');
  assert.equal(shown.label, '۳۰٪ کد تخفیف');
});
