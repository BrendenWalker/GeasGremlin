/**
 * Retainers, specialists, and mercenaries from Basic Fantasy RPG r142,
 * printed pages 46–48. Hiring is not the encounter reaction table.
 * A retainer is the only hireling who enters a dungeon.
 *
 * ponytail: monthly cost is shown, not deducted. There is no stronghold.
 * Heavy horseman morale is 8; the table cell sits on the page break.
 */

const { abilityModifier } = require('./body');

const SPECIALISTS = [
  { role: 'Alchemist', cost: 1000 },
  { role: 'Animal Trainer', cost_lo: 250, cost_hi: 750 },
  { role: 'Armorer', cost_lo: 100, cost_hi: 500 },
  { role: 'Engineer', cost: 750 },
  { role: 'Savant', cost: 1500 },
  { role: 'Captain', cost: 300 },
  { role: 'Navigator', cost: 200 },
  { role: 'Sailor', cost: 10 },
  { role: 'Rower', cost: 3 },
];

const MERCENARIES = [
  { role: 'Light Foot, Human', cost: 2, morale: 8, equipment: 'Leather armor, shield, and longsword' },
  { role: 'Light Foot, Elf', cost: 8, morale: 8, equipment: 'Leather armor, shield, and longsword' },
  { role: 'Light Foot, Orc', cost: 1, morale: 7, equipment: 'Leather armor and spear' },
  { role: 'Heavy Foot, Human', cost: 3, morale: 8, equipment: 'Chainmail, shield, and longsword' },
  { role: 'Heavy Foot, Dwarf', cost: 6, morale: 9, equipment: 'Chainmail, shield, and shortsword' },
  { role: 'Heavy Foot, Orc', cost: 2, morale: 8, equipment: 'Chainmail, shield, and shortsword' },
  { role: 'Archer, Human', cost: 5, morale: 8, equipment: 'Leather armor, shortbow, and shortsword' },
  { role: 'Archer, Elf', cost: 15, morale: 8, equipment: 'Chainmail, shortbow, and shortsword' },
  { role: 'Archer, Orc', cost: 3, morale: 8, equipment: 'Leather armor, shortbow, and shortsword' },
  { role: 'Crossbowman, Human', cost: 5, morale: 8, equipment: 'Chainmail, crossbow, and shortsword' },
  { role: 'Crossbowman, Dwarf', cost: 12, morale: 9, equipment: 'Platemail, crossbow, and shortsword' },
  { role: 'Longbowman, Human', cost: 9, morale: 8, equipment: 'Chainmail, longbow, and shortsword' },
  { role: 'Longbowman, Elf', cost: 20, morale: 8, equipment: 'Chainmail, longbow, and longsword' },
  { role: 'Light Horseman, Human', cost: 10, morale: 8, equipment: 'Leather armor, shield, lance, and longsword' },
  { role: 'Light Horseman, Elf', cost: 22, morale: 8, equipment: 'Leather armor, lance, shortbow, and longsword' },
  { role: 'Medium Horseman, Human', cost: 15, morale: 8, equipment: 'Chainmail, shield, lance, and longsword' },
  { role: 'Medium Horseman, Elf', cost: 33, morale: 9, equipment: 'Chainmail, lance, shortbow, and longsword' },
  { role: 'Heavy Horseman, Human', cost: 20, morale: 8, equipment: 'Platemail, shield, lance, and longsword' },
];

function retainerCap(charisma) {
  return Math.max(0, 4 + abilityModifier(charisma));
}

function maxRetainerLevel(level) {
  if (!Number.isInteger(level) || level < 2) return 0;
  return Math.floor(level / 2);
}

function startingLoyalty(charisma, highAcceptance) {
  const score = 7 + abilityModifier(charisma) + (highAcceptance ? 1 : 0);
  return Math.min(12, Math.max(2, score));
}

function hireBand(total) {
  if (total <= 2) return { result: 'Refusal', further: -1 };
  if (total <= 5) return { result: 'Refusal', further: 0 };
  if (total <= 8) return { result: 'Try again', further: 0 };
  if (total <= 11) return { result: 'Acceptance', further: 0 };
  return { result: 'Acceptance', further: 0, loyalty_bonus: 1 };
}

function hireReaction({ bonus, penalty, adjustment, rollDie }) {
  if (!Number.isInteger(bonus)) return { error: 'charisma bonus must be an integer' };
  if (!Number.isInteger(penalty) || penalty < -1 || penalty > 0) return { error: 'bad penalty' };
  if (!Number.isInteger(adjustment) || adjustment < -10 || adjustment > 10) {
    return { error: 'hire adjustment must be from -10 to 10' };
  }
  const first = rollDie(6);
  const second = rollDie(6);
  if (!Number.isInteger(first) || first < 1 || first > 6) return { error: 'bad roll' };
  if (!Number.isInteger(second) || second < 1 || second > 6) return { error: 'bad roll' };
  const dice = first + second;
  const total = dice + bonus + penalty + adjustment;
  return { faces: [first, second], dice, bonus, penalty, adjustment, total, ...hireBand(total) };
}

function canHireRetainer({ employerLevel, retainerLevel, charisma, retained }) {
  const cap = retainerCap(charisma);
  const maxLevel = maxRetainerLevel(employerLevel);
  if (maxLevel < 1) return { error: 'A 1st level character cannot hire a retainer', cap, maxLevel };
  if (!Number.isInteger(retainerLevel) || retainerLevel < 1 || retainerLevel > maxLevel) {
    return { error: `Retainer level must be from 1 to ${maxLevel}`, cap, maxLevel };
  }
  if (retained >= cap) return { error: 'That character is at the retainer cap', cap, maxLevel };
  return { cap, maxLevel };
}

function loyaltyCheck({ score, adjustment, combat, rollDie }) {
  if (!Number.isInteger(score) || score < 2 || score > 12) return { error: 'loyalty must be from 2 to 12' };
  if (!Number.isInteger(adjustment) || adjustment < -2 || adjustment > 2) {
    return { error: 'loyalty adjustment must be from -2 to 2' };
  }
  const first = rollDie(6);
  const second = rollDie(6);
  if (!Number.isInteger(first) || first < 1 || first > 6) return { error: 'bad roll' };
  if (!Number.isInteger(second) || second < 1 || second > 6) return { error: 'bad roll' };
  const roll = first + second;
  const target = score + adjustment;
  const holds = roll <= target;
  const bump = combat === true && roll === 2 ? 1 : 0;
  return {
    faces: [first, second],
    roll,
    score,
    adjustment,
    target,
    result: holds ? 'holds' : 'leaves',
    loyalty: Math.min(12, score + bump),
  };
}

function specialistCost(role, offered) {
  const row = SPECIALISTS.find((item) => item.role === role);
  if (!row) return { error: 'Unknown specialist' };
  if (row.cost != null) return { cost: row.cost, role: row.role };
  const cost = offered == null ? row.cost_lo : offered;
  if (!Number.isInteger(cost) || cost < row.cost_lo || cost > row.cost_hi) {
    return { error: `${row.role} costs ${row.cost_lo} to ${row.cost_hi} gp` };
  }
  return { cost, role: row.role };
}

function mercenaryOffer(role, level, quantity) {
  const row = MERCENARIES.find((item) => item.role === role);
  if (!row) return { error: 'Unknown mercenary' };
  if (!Number.isInteger(level) || level < 1 || level > 20) return { error: 'mercenary level must be from 1 to 20' };
  if (!Number.isInteger(quantity) || quantity < 1) return { error: 'quantity must be a positive integer' };
  return {
    role: row.role,
    morale: row.morale,
    equipment: row.equipment,
    cost: row.cost * level * quantity,
    level,
    quantity,
  };
}

module.exports = {
  SPECIALISTS,
  MERCENARIES,
  abilityModifier,
  retainerCap,
  maxRetainerLevel,
  startingLoyalty,
  hireReaction,
  canHireRetainer,
  loyaltyCheck,
  specialistCost,
  mercenaryOffer,
};
