const BOX_COUNT = 9;
const MAX_REMOVALS = 7;

const WIN_PRIZES = [
  { emoji: '💰', val: '۵۰ هزار تومان اعتبار', win: true },
  { emoji: '⭐', val: '۳۰٪ کد تخفیف', win: true },
  { emoji: '🎁', val: 'هدیه ویژه', win: true },
];

const LOSE_PRIZE = { emoji: '❌', val: 'پوچ', win: false };

function chooseGoat(winningBox, firstPick, removed) {
  const gone = new Set(removed);
  const candidates = [];
  for (let box = 0; box < BOX_COUNT; box += 1) {
    if (box === winningBox || box === firstPick || gone.has(box)) continue;
    candidates.push(box);
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function closedBoxes(removed) {
  const gone = new Set(removed);
  const closed = [];
  for (let box = 0; box < BOX_COUNT; box += 1) {
    if (!gone.has(box)) closed.push(box);
  }
  return closed;
}

module.exports = {
  BOX_COUNT,
  MAX_REMOVALS,
  WIN_PRIZES,
  LOSE_PRIZE,
  chooseGoat,
  closedBoxes,
};
