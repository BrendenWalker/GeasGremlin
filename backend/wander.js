/**
 * When a wander check is due. The mark moves by whole intervals, so a long
 * step keeps every check it crossed and leaves the remainder in the next one.
 * A roll of 1 or below is a hit. The table row is the inclusive face match.
 */

const INSIDE_INTERVAL = 1800;
const OUTSIDE_INTERVAL = 14400;

function checksDue(lastSeconds, nowSeconds, intervalSeconds) {
  if (!Number.isInteger(lastSeconds) || lastSeconds < 0) return null;
  if (!Number.isInteger(nowSeconds) || nowSeconds < 0) return null;
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1) return null;
  if (nowSeconds < lastSeconds) return null;
  const count = Math.floor((nowSeconds - lastSeconds) / intervalSeconds);
  const at = [];
  for (let i = 1; i <= count; i += 1) at.push(lastSeconds + i * intervalSeconds);
  return { count, at, nextMark: lastSeconds + count * intervalSeconds };
}

function checkHit(roll) {
  return Number.isInteger(roll) && roll <= 1;
}

function matchingRow(rows, face) {
  if (!Number.isInteger(face)) return null;
  for (const row of rows || []) {
    if (face >= row.face_lo && face <= row.face_hi) return row;
  }
  return null;
}

function blankToNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function acceptRoll(roll) {
  if (!roll) return { error: 'No roll to accept' };
  if (roll.accepted === true) return { error: 'That roll is already accepted' };
  if (roll.table_roll == null) return { error: 'The last check missed' };
  const name = typeof roll.label === 'string' ? roll.label.trim() : '';
  if (!name) return { error: 'That roll has no name' };
  return {
    enemy: {
      name,
      monster_id: roll.monster_id == null ? null : roll.monster_id,
      quantity: blankToNull(roll.quantity),
      treasure_type: blankToNull(roll.treasure_type),
    },
  };
}

module.exports = {
  INSIDE_INTERVAL,
  OUTSIDE_INTERVAL,
  checksDue,
  checkHit,
  matchingRow,
  acceptRoll,
};
