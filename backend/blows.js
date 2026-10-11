/**
 * Attack and damage from Basic Fantasy RPG r142, printed pages 52–55.
 * A roll returns a result. Applying damage writes the character sheet or the
 * enemy row. It does not move the clock or open an encounter.
 *
 * Armor class matches frontend/src/utils/armorClass.mjs.
 * The attack bonus matches sheetCombat in frontend/src/domain/character.mjs.
 * Back attack adds 2 to the melee bonus. Sneak attack is class text, not a
 * sheet number, so this roll does not apply it.
 */

const { abilityModifier } = require('./encounterDice');

const UNARMORED_AC = 11;

const MONSTER_ATTACK = [
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [5, 5],
  [6, 6],
  [7, 7],
  [9, 8],
  [11, 9],
  [13, 10],
  [15, 11],
  [19, 12],
  [23, 13],
  [27, 14],
  [31, 15],
];

function whole(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function wholeBonus(value) {
  return whole(value) ?? 0;
}

function findItem(items, id) {
  if (id == null || id === '') return null;
  return items.find((item) => String(item.id) === String(id)) || null;
}

function piece(item) {
  const ac = whole(item.item_ac ?? item.ac);
  const melee = whole(item.item_ac_melee ?? item.ac_melee) ?? 0;
  const ranged = whole(item.item_ac_ranged ?? item.ac_ranged);
  if (ac != null && ac >= UNARMORED_AC) return { base: ac, melee: 0, ranged: 0 };
  const flat = ac ?? 0;
  return { base: null, melee: flat + melee, ranged: flat + (ranged ?? 0) };
}

/** Melee and ranged AC from equipped armor, shield, and Dexterity. */
function armorClass(character) {
  const items = character?.items || [];
  const armor = findItem(items, character?.equipped_armor_id);
  const shield = findItem(items, character?.equipped_shield_id);
  const worn = piece(armor || {});
  const guard = shield && String(shield.id) !== String(armor?.id) ? piece(shield) : { base: null, melee: 0, ranged: 0 };
  const dex = abilityModifier(character?.dex);
  const base = worn.base ?? UNARMORED_AC;
  return {
    melee: base + dex + worn.melee + guard.melee,
    ranged: base + dex + worn.ranged + guard.ranged,
  };
}

/**
 * Numeric attack bonus for one mode.
 * Melee is the class attack bonus, plus the weapon, plus Strength.
 * A second melee weapon subtracts 2.
 * Missile uses Dexterity instead of Strength.
 * Back uses the melee bonus and adds 2.
 */
function characterAttackBonus({
  baseAb,
  mode,
  strength,
  dexterity,
  weaponBonus = 0,
  dualWielding = false,
}) {
  if (!Number.isInteger(baseAb)) return { error: 'no attack bonus' };
  if (mode !== 'melee' && mode !== 'missile' && mode !== 'back') {
    return { error: 'mode must be melee, missile, or back' };
  }
  const weapon = wholeBonus(weaponBonus);
  if (mode === 'missile') {
    return { bonus: baseAb + weapon + abilityModifier(dexterity) };
  }
  const base = dualWielding ? baseAb - 2 : baseAb;
  let bonus = base + weapon + abilityModifier(strength);
  if (mode === 'back') bonus += 2;
  return { bonus };
}

/**
 * Monster attack bonus from hit dice. Asterisks are ignored.
 * A plus or minus after the dice does not change the bonus.
 * 1−1 and fractions are less than 1 HD and the bonus is +0.
 * A range such as "2 to 4" has no single bonus.
 */
function monsterHitDice(hitDiceText) {
  const source = String(hitDiceText || '').trim();
  if (!source || /\bto\b/i.test(source)) return null;
  if (/^1\s*-\s*1(?!\d)/.test(source) || /^\d+\s*\/\s*\d+/.test(source)) {
    return { hd: 0, dice: 1, faces: 4, flat: 0 };
  }
  const match = source.match(/^(\d+)(?:\s*([+-])\s*(\d+))?/);
  if (!match) return null;
  const hd = Number(match[1]);
  if (hd < 1) return null;
  let flat = 0;
  if (match[2]) flat = Number(match[3]) * (match[2] === '-' ? -1 : 1);
  return { hd, dice: hd, faces: 8, flat };
}

function monsterAttackBonus(hitDiceText) {
  const parsed = monsterHitDice(hitDiceText);
  if (!parsed) return null;
  if (parsed.hd < 1) return 0;
  for (const [max, bonus] of MONSTER_ATTACK) {
    if (parsed.hd <= max) return bonus;
  }
  return 16;
}

function takeDie(rollDie, sides) {
  if (typeof rollDie !== 'function') return { error: 'Roll needs a die' };
  const face = rollDie(sides);
  if (!Number.isInteger(face) || face < 1 || face > sides) {
    return { error: `die roll must be from 1 to ${sides}` };
  }
  return { face };
}

/**
 * Natural 1 misses. Natural 20 hits. Any other total hits on armor class or higher.
 */
function resolveAttack({ roll, attackBonus, adjustment, armorClass: defenderAc }) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) return { error: 'attack roll must be from 1 to 20' };
  if (!Number.isInteger(attackBonus)) return { error: 'attack bonus must be an integer' };
  if (!Number.isInteger(adjustment)) return { error: 'adjustment must be an integer' };
  if (!Number.isInteger(defenderAc)) return { error: 'armor class must be an integer' };
  const bonus = attackBonus + adjustment;
  const total = roll + bonus;
  let hit = total >= defenderAc;
  let natural = null;
  if (roll === 1) {
    hit = false;
    natural = 'miss';
  } else if (roll === 20) {
    hit = true;
    natural = 'hit';
  }
  return {
    roll,
    attackBonus,
    adjustment,
    bonus,
    total,
    armorClass: defenderAc,
    hit,
    natural,
  };
}

function rollAttack({ attackBonus, adjustment, armorClass: defenderAc, rollDie }) {
  const face = takeDie(rollDie, 20);
  if (face.error) return face;
  return resolveAttack({
    roll: face.face,
    attackBonus,
    adjustment,
    armorClass: defenderAc,
  });
}

/** First NdS in a weapon string, plus a modifier written on that expression. */
function parseDamageDice(text) {
  const source = String(text || '');
  const match = source.match(/(\d+)\s*d\s*(\d+)/i);
  if (!match) return null;
  const dice = Number(match[1]);
  const faces = Number(match[2]);
  if (dice < 1 || dice > 40 || faces < 2 || faces > 100) return null;
  const rest = source.slice(match.index + match[0].length);
  const mod = rest.match(/^\s*([+-])\s*(\d+)/);
  let flat = 0;
  if (mod) flat = Number(mod[2]) * (mod[1] === '-' ? -1 : 1);
  return { dice, faces, flat };
}

/**
 * Melee and back add Strength. Missile does not.
 * The weapon's own +1 stays in either mode.
 */
function characterDamageDice({ mode, damage, damageBonus, strength }) {
  if (mode !== 'melee' && mode !== 'missile' && mode !== 'back') return null;
  const parsed = parseDamageDice(damage);
  if (!parsed) return null;
  let flat = parsed.flat + wholeBonus(damageBonus);
  if (mode !== 'missile') flat += abilityModifier(strength);
  return { dice: parsed.dice, faces: parsed.faces, flat };
}

function sumDice({ dice, faces, flat, rollDie, floorAt }) {
  if (!Number.isInteger(dice) || dice < 1) return { error: 'no damage dice' };
  if (!Number.isInteger(faces) || faces < 2) return { error: 'no damage dice' };
  if (!Number.isInteger(flat)) return { error: 'damage bonus must be an integer' };
  let total = flat;
  const rolled = [];
  for (let i = 0; i < dice; i += 1) {
    const face = takeDie(rollDie, faces);
    if (face.error) return face;
    rolled.push(face.face);
    total += face.face;
  }
  if (Number.isInteger(floorAt) && total < floorAt) total = floorAt;
  return { amount: total, faces: rolled, flat };
}

/** A successful hit does at least 1 point of damage. */
function rollWeaponDamage({ dice, faces, flat, rollDie }) {
  return sumDice({ dice, faces, flat, rollDie, floorAt: 1 });
}

/** Hit dice are d8. Less than 1 HD, including 1−1 and 1/2, is 1d4. */
function rollMonsterHitPoints(hitDiceText, rollDie) {
  const parsed = monsterHitDice(hitDiceText);
  if (!parsed) return { error: 'no hit dice' };
  return sumDice({
    dice: parsed.dice,
    faces: parsed.faces,
    flat: parsed.flat,
    rollDie,
    floorAt: 1,
  });
}

function applyHitPoints(current, amount) {
  if (!Number.isInteger(current) || current < 0) return { error: 'no hit points' };
  if (!Number.isInteger(amount) || amount < 1) return { error: 'a hit does at least 1 point of damage' };
  const hp = Math.max(0, current - amount);
  return { hp, down: hp === 0, previous: current };
}

module.exports = {
  abilityModifier,
  armorClass,
  characterAttackBonus,
  monsterAttackBonus,
  monsterHitDice,
  resolveAttack,
  rollAttack,
  parseDamageDice,
  characterDamageDice,
  rollWeaponDamage,
  rollMonsterHitPoints,
  applyHitPoints,
};
