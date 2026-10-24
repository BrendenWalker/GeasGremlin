// Listed item prices are copper pieces. A delta is a percent added to that price.
// 0 is the list price. +20 is 120%. -50 is half. The result is whole copper, half rounds up.

const MIN_DELTA = -100;
const MAX_DELTA = 1000;

function adjustedCopper(price, deltaPercent) {
  if (!Number.isInteger(price) || price < 0) return null;
  if (!Number.isInteger(deltaPercent) || deltaPercent < MIN_DELTA || deltaPercent > MAX_DELTA) return null;
  return Math.floor((price * (100 + deltaPercent) + 50) / 100);
}

module.exports = { MIN_DELTA, MAX_DELTA, adjustedCopper };
