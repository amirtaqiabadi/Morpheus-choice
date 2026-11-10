const DAILY_SPINS = 3;

const PRIZES = [
  { id: 'sp', label: 'جک‌پات', emoji: '⭐', special: true, empty: false, weight: 0.35 },
  { id: 'p4', label: 'پوچ', emoji: '❌', special: false, empty: true, weight: 0.45 },
  { id: 'p1', label: '۵۰ هزار اعتبار', emoji: '💰', special: false, empty: false, weight: 1 },
  { id: 'p2', label: 'چرخش رایگان', emoji: '🎟', special: false, empty: false, weight: 1 },
  { id: 'p3', label: '۱۰٪ تخفیف', emoji: '🎁', special: false, empty: false, weight: 1 },
  { id: 'p5', label: '۲× برابر', emoji: '⚡', special: false, empty: false, weight: 1 },
  { id: 'p6', label: 'جعبه راز', emoji: '🎀', special: false, empty: false, weight: 1 },
  { id: 'p7', label: '۱۰۰ هزار اعتبار', emoji: '💸', special: false, empty: false, weight: 1 },
];

const TOTAL_WEIGHT = PRIZES.reduce((sum, prize) => sum + prize.weight, 0);

function choosePrize(random) {
  const roll = Math.min(Math.max(Number(random) || 0, 0), 0.999999) * TOTAL_WEIGHT;
  let cursor = 0;
  for (const prize of PRIZES) {
    cursor += prize.weight;
    if (roll < cursor) return prize;
  }
  return PRIZES[PRIZES.length - 1];
}

function prizeById(id) {
  return PRIZES.find((prize) => prize.id === id) || null;
}

module.exports = { DAILY_SPINS, PRIZES, choosePrize, prizeById };
