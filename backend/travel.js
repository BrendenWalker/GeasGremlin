/**
 * Wilderness travel from Basic Fantasy RPG r142, printed page 45.
 * Miles use the location's stored movement percent. The clock does not move.
 * Getting lost is a result for the GM. It does not move the party.
 *
 * ponytail: a gale says 2d8 per hour and does not roll it. There is no ship.
 * Air travel doubles the base miles and names one-third of the slowest move.
 * It does not track which creature is winged.
 */

const { abilityModifier } = require('./body');

const DIRECTIONS = [
  'Northerly',
  'Northeasterly',
  'Easterly',
  'Southeasterly',
  'Southerly',
  'Southwesterly',
  'Westerly',
  'Northwesterly',
];

const WINDS = [
  { lo: 1, hi: 5, name: 'Becalmed', sailing: [0, 1], tacking: [0, 1], note: 'Sailing ships cannot move. Oared ships may row.' },
  { lo: 6, hi: 13, name: 'Very Light Breeze', sailing: [1, 3], tacking: [0, 1] },
  { lo: 14, hi: 25, name: 'Light Breeze', sailing: [1, 2], tacking: [1, 3] },
  { lo: 26, hi: 40, name: 'Moderate Breeze', sailing: [2, 3], tacking: [1, 3] },
  { lo: 41, hi: 70, name: 'Average Winds', sailing: [1, 1], tacking: [1, 2] },
  { lo: 71, hi: 85, name: 'Strong Winds', sailing: [4, 3], tacking: [2, 3] },
  { lo: 86, hi: 96, name: 'Very Strong Winds', sailing: [3, 2], tacking: [0, 1], note: 'Sailing against the wind is not possible.' },
  { lo: 97, hi: 100, name: 'Gale', sailing: [2, 1], tacking: [0, 1], note: 'Sailing against the wind is not possible. A ship in a gale takes 2d8 damage per hour sailed.' },
];

function factorLabel(pair) {
  const [num, den] = pair;
  if (num === 0) return '×0';
  if (den === 1) return `×${num}`;
  return `×${num}/${den}`;
}

function adjustedMiles(baseMiles, movementPct) {
  if (!Number.isInteger(baseMiles) || baseMiles < 0) return null;
  if (!Number.isInteger(movementPct)) return null;
  return Math.round((baseMiles * (100 + movementPct)) / 100);
}

function forcedMiles(miles) {
  if (!Number.isInteger(miles) || miles < 0) return null;
  return Math.round((miles * 3) / 2);
}

function airMiles(baseMiles) {
  if (!Number.isInteger(baseMiles) || baseMiles < 0) return null;
  return baseMiles * 2;
}

function stallFeet(move) {
  if (!Number.isInteger(move) || move < 1) return null;
  return Math.ceil(move / 3);
}

function deathRaySave(roll, modifier, target) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) return { error: 'bad roll' };
  if (!Number.isInteger(target)) return { error: 'no Death Ray save' };
  const mod = Number.isInteger(modifier) ? modifier : 0;
  const total = roll + mod;
  return { roll, modifier: mod, total, target, success: total >= target };
}

function marchDay(state, rollD20, rollD6) {
  const day = (Number(state.days) || 0) + 1;
  if (day === 1) {
    return { day, damage: 0, saved: null, failed: false };
  }
  if (state.failed === true) {
    const damage = rollD6();
    if (!Number.isInteger(damage) || damage < 1 || damage > 6) return { error: 'bad roll' };
    return { day, damage, saved: false, failed: true };
  }
  const save = deathRaySave(rollD20(), abilityModifier(state.constitution), state.target);
  if (save.error) return save;
  if (save.success) {
    return { day, damage: 0, saved: true, failed: false, save };
  }
  const damage = rollD6();
  if (!Number.isInteger(damage) || damage < 1 || damage > 6) return { error: 'bad roll' };
  return { day, damage, saved: false, failed: true, save };
}

function lostCheck(choice, rollD20) {
  if (choice.following === true) return { lost: false, skipped: true };
  const save = deathRaySave(rollD20(), abilityModifier(choice.wisdom), choice.target);
  if (save.error) return save;
  return { lost: !save.success, skipped: false, save };
}

function windDirection(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 12) return { error: 'bad roll' };
  if (roll >= 9) return { roll, direction: 'Prevailing wind for this locale' };
  return { roll, direction: DIRECTIONS[roll - 1] };
}

function windCondition(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) return { error: 'bad roll' };
  const row = WINDS.find((band) => roll >= band.lo && roll <= band.hi);
  return {
    roll,
    condition: row.name,
    sailing: factorLabel(row.sailing),
    tacking: factorLabel(row.tacking),
    note: row.note || null,
  };
}

function sailingDay(directionRoll, conditionRoll, navigator) {
  const direction = windDirection(directionRoll);
  if (direction.error) return direction;
  const condition = windCondition(conditionRoll);
  if (condition.error) return condition;
  return {
    ...direction,
    ...condition,
    hours: navigator ? 24 : 12,
    distance: navigator ? '×2' : '×1',
  };
}

module.exports = {
  adjustedMiles,
  forcedMiles,
  airMiles,
  stallFeet,
  deathRaySave,
  marchDay,
  lostCheck,
  sailingDay,
  windDirection,
  windCondition,
};
