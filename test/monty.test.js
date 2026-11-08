const test = require('node:test');
const assert = require('node:assert/strict');
const { BOX_COUNT, MAX_REMOVALS, chooseGoat, closedBoxes } = require('../lib/monty');

test('the host never opens the winning door or the first pick', () => {
  for (let winning = 0; winning < BOX_COUNT; winning += 1) {
    for (let first = 0; first < BOX_COUNT; first += 1) {
      const removed = [];
      for (let step = 0; step < MAX_REMOVALS; step += 1) {
        const goat = chooseGoat(winning, first, removed);
        assert.notEqual(goat, null);
        assert.notEqual(goat, winning);
        assert.notEqual(goat, first);
        assert.equal(removed.includes(goat), false);
        removed.push(goat);
      }
      const closed = closedBoxes(removed);
      assert.deepEqual(closed.length, 2);
      assert.equal(closed.includes(first), true);
      assert.equal(closed.includes(winning), true);
      if (first === winning) {
        assert.notEqual(chooseGoat(winning, first, removed), null);
      } else {
        assert.equal(chooseGoat(winning, first, removed), null);
      }
    }
  }
});

test('switching after every empty door is removed wins about eight times in nine', () => {
  const trials = 20000;
  let stayWins = 0;
  let switchWins = 0;
  for (let trial = 0; trial < trials; trial += 1) {
    const winning = trial % BOX_COUNT;
    const first = Math.floor(Math.random() * BOX_COUNT);
    const removed = [];
    for (let step = 0; step < MAX_REMOVALS; step += 1) {
      removed.push(chooseGoat(winning, first, removed));
    }
    const other = closedBoxes(removed).find((box) => box !== first);
    if (first === winning) stayWins += 1;
    if (other === winning) switchWins += 1;
  }
  const stayRate = stayWins / trials;
  const switchRate = switchWins / trials;
  assert.ok(stayRate > 0.09 && stayRate < 0.14, `stay rate ${stayRate}`);
  assert.ok(switchRate > 0.85 && switchRate < 0.93, `switch rate ${switchRate}`);
});
