/**
 * Character sheet rules, assembled in the browser from hub rows.
 * Combat strings follow the Delphi TClassDetails helpers in ClassClasses.pas.
 */
import { armorClass, formatArmorClass } from '../utils/armorClass.mjs';
import { abilityModifier, adjustedHitPoints, classHitDie, formatModifier } from '../utils/hitPoints.mjs';

export { abilityModifier, adjustedHitPoints, classHitDie, formatModifier };

const BFRPG_ATTRIBUTES = [
  { name: 'STR', column: 'str' },
  { name: 'INT', column: 'int' },
  { name: 'WIS', column: 'wis' },
  { name: 'DEX', column: 'dex' },
  { name: 'CON', column: 'con' },
  { name: 'CHR', column: 'chr' },
];

export function formatAdjustment(value) {
  const n = Number(value) || 0;
  if (n > 0) return `+${n}`;
  if (n < 0) return String(n);
  return '0';
}

export function clampStat(value, min, max) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return min ?? 3;
  if (min != null && n < min) return min;
  if (max != null && max > 0 && n > max) return max;
  return n;
}

/** Tightest race and class minimums, and the race maximum (18 when unset). */
export function statBounds(race, cls, extraCls, attributes = BFRPG_ATTRIBUTES) {
  const mins = {};
  const maxs = {};
  attributes.forEach((attr) => {
    const key = attr.column;
    const column = `min_${key}`;
    const raceMin = race ? race[column] : null;
    const classMins = [cls, extraCls]
      .map((row) => (row ? row[column] : null))
      .filter((value) => value != null);
    const parts = [raceMin, ...classMins].filter((value) => value != null);
    mins[key] = parts.length ? Math.max(...parts) : 3;
    const raceMax = race ? race[`max_${key}`] : null;
    maxs[key] = raceMax != null && raceMax > 0 ? raceMax : 18;
  });
  return { mins, maxs };
}

/** "+4 (+1 base, +1 weapon, +2 stat)". Range appends inside the parens, as Delphi did. */
export function attackBonusString({ base, weaponBonus = 0, abilityBonus = 0, rangeMod = 0 }) {
  let bonus = base;
  let detail = `${formatAdjustment(base)} base`;
  if (weaponBonus !== 0) {
    bonus += weaponBonus;
    detail += `, ${formatAdjustment(weaponBonus)} weapon`;
  }
  if (abilityBonus !== 0) {
    bonus += abilityBonus;
    detail = `${detail}, ${formatAdjustment(abilityBonus)} stat`.trim();
  }
  let result = `${formatAdjustment(bonus)} (${detail})`;
  if (rangeMod !== 0) {
    result = `${result.slice(0, -1)} ${formatAdjustment(rangeMod)} range)`;
  }
  return result;
}

export function damageString({ base, weaponBonus = 0, abilityBonus = 0 }) {
  let bonus = 0;
  let detail = '';
  if (weaponBonus !== 0) {
    bonus += weaponBonus;
    detail = `${formatAdjustment(weaponBonus)} Weapon,`;
  }
  if (abilityBonus !== 0) {
    bonus += abilityBonus;
    detail = `${detail} ${formatAdjustment(abilityBonus)} Stat`.trim();
  }
  if (detail.endsWith(',')) detail = detail.slice(0, -1);
  if (!detail) return `${base} ${formatAdjustment(bonus)}`;
  return `${base} ${formatAdjustment(bonus)} (${detail})`;
}

export function meleeAttackBonus({
  baseAb,
  weaponBonus = 0,
  strength,
  dexterity,
  mainHand = true,
  dualWielding = false,
}) {
  const strengthMod = abilityModifier(strength);
  if (!dualWielding) {
    return attackBonusString({ base: baseAb, weaponBonus, abilityBonus: strengthMod });
  }
  if (mainHand) {
    return attackBonusString({ base: baseAb - 2, weaponBonus, abilityBonus: strengthMod });
  }
  const dexMod = abilityModifier(dexterity);
  return attackBonusString({
    base: baseAb,
    weaponBonus,
    abilityBonus: Math.min(-5 + dexMod, 0),
  });
}

export function rangedAttackBonus({ baseAb, weaponBonus = 0, dexterity, rangeMod = 0 }) {
  return attackBonusString({
    base: baseAb,
    weaponBonus,
    abilityBonus: abilityModifier(dexterity),
    rangeMod,
  });
}

export function levelForXp(leveling, xp) {
  const rows = [...(leveling || [])]
    .filter((row) => Number.isInteger(Number(row.level)) && Number.isInteger(Number(row.xp)))
    .sort((a, b) => Number(a.level) - Number(b.level));
  if (rows.length === 0) return null;
  let level = Number(rows[0].level);
  for (const row of rows) {
    if (Number(row.xp) <= xp) level = Number(row.level);
  }
  return level;
}

export function nextLevelXp(leveling, level) {
  const next = (leveling || []).find((row) => Number(row.level) === Number(level) + 1);
  if (!next || next.xp == null || next.xp === '') return null;
  const xp = Number(next.xp);
  return Number.isInteger(xp) ? xp : null;
}

export function baseAttackBonus(leveling, level) {
  const row = (leveling || []).find((entry) => Number(entry.level) === Number(level));
  if (!row || row.ab == null || row.ab === '') return null;
  const ab = Number(row.ab);
  return Number.isInteger(ab) ? ab : null;
}

export function primaryClass(character, classRows) {
  const links = Array.isArray(character?.character_classes) ? [...character.character_classes] : [];
  links.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.class_id) - Number(b.class_id));
  const link = links[0];
  const id = link?.class_id ?? character?.class ?? null;
  const row = (classRows || []).find((entry) => String(entry.id) === String(id)) || null;
  const level = link?.class_level ?? character?.level ?? 1;
  return { id, level: Number(level) || 1, row };
}

/**
 * Quasi-class experience is added to the base class row for the same level.
 * Hit dice and attack bonus stay on the base row.
 */
export function overlaidExperience(baseRows, quasiRows) {
  const extra = new Map();
  for (const row of quasiRows || []) {
    const level = Number(row.level);
    const xp = Number(row.xp);
    if (!Number.isInteger(level) || !Number.isInteger(xp)) continue;
    extra.set(level, xp);
  }
  if (extra.size === 0) return baseRows || [];
  return (baseRows || []).map((row) => {
    const add = extra.get(Number(row.level));
    const xp = Number(row.xp);
    if (!Number.isInteger(add) || add === 0 || !Number.isInteger(xp)) return row;
    return { ...row, xp: xp + add };
  });
}

function quasiClass(character, classRows) {
  const id = character?.quasiclass;
  if (id == null || id === '') return null;
  const row = (classRows || []).find((entry) => String(entry.id) === String(id));
  return row && row.is_quasi === true ? row : null;
}

function experienceFor(character, classRows, primary) {
  return overlaidExperience(primary.row?.leveling, quasiClass(character, classRows)?.leveling);
}

function equippedItem(character, id) {
  if (id == null || id === '') return null;
  return (character?.items || []).find((item) => String(item.id) === String(id)) || null;
}

function wholeBonus(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : 0;
}

/** Derived combat lines for the sheet. Null when the class has no attack-bonus row. */
export function sheetCombat(character, classRows) {
  const primary = primaryClass(character, classRows);
  const leveling = experienceFor(character, classRows, primary);
  const base = baseAttackBonus(leveling, primary.level);
  const meleeItem = equippedItem(character, character?.equipped_melee_primary_id);
  const offItem = equippedItem(character, character?.equipped_melee_secondary_id);
  const rangedItem = equippedItem(character, character?.equipped_ranged_id);
  const result = {
    nextLevelXp: nextLevelXp(leveling, primary.level),
    baseAttackBonus: base,
    melee: null,
    ranged: null,
    damage: null,
  };
  if (base == null) return result;
  const dual = Boolean(offItem);
  result.melee = meleeAttackBonus({
    baseAb: base,
    weaponBonus: wholeBonus(meleeItem?.item_attackbonus),
    strength: character?.str,
    dexterity: character?.dex,
    mainHand: true,
    dualWielding: dual,
  });
  result.ranged = rangedAttackBonus({
    baseAb: base,
    weaponBonus: wholeBonus(rangedItem?.item_attackbonus),
    dexterity: character?.dex,
    rangeMod: 0,
  });
  if (meleeItem?.item_damage) {
    result.damage = damageString({
      base: String(meleeItem.item_damage),
      weaponBonus: wholeBonus(meleeItem.item_damagebonus),
      abilityBonus: abilityModifier(character?.str),
    });
  }
  return result;
}

/** Class abilities gained strictly after oldLevel and at or before newLevel. Later rows replace the same ability. */
export function abilitiesGranted(classRow, oldLevel, newLevel) {
  const chosen = new Map();
  for (const row of classRow?.abilities || []) {
    const level = Number(row.level);
    const abilityId = Number(row.ability_id);
    if (!Number.isInteger(abilityId) || !Number.isInteger(level)) continue;
    if (level <= oldLevel || level > newLevel) continue;
    const prev = chosen.get(abilityId);
    if (prev && prev.level > level) continue;
    const mod = row.int_param == null || row.int_param === '' ? null : Number(row.int_param);
    chosen.set(abilityId, { ability_id: abilityId, mod: Number.isInteger(mod) ? mod : null, level });
  }
  return [...chosen.values()].map(({ ability_id, mod }) => ({ ability_id, mod }));
}

/** Spell slots of one circle at this class level. Uses the highest class_spells row at or below the level. */
export function spellSlots(classRow, charLevel, spellLevel) {
  const circle = Number(spellLevel);
  if (!Number.isInteger(circle) || circle < 1 || circle > 7) return 0;
  let best = null;
  for (const row of classRow?.spell_slots || []) {
    const level = Number(row.char_level);
    if (!Number.isInteger(level) || level > Number(charLevel)) continue;
    if (!best || level >= Number(best.char_level)) best = row;
  }
  if (!best) return 0;
  const slots = Number(best[`level${circle}`]);
  return Number.isInteger(slots) && slots > 0 ? slots : 0;
}

export function castsRemaining(classRow, charLevel, spellLevel, spellsCast) {
  const slots = spellSlots(classRow, charLevel, spellLevel);
  const usedRow = (spellsCast || []).find((row) => Number(row.spell_level) === Number(spellLevel));
  const used = Number(usedRow?.numcast) || 0;
  return Math.max(0, slots - used);
}

/** Daily cast counters back to zero. Memorized spells stay prepared. */
export function newDayWrite(character) {
  const casts = (character?.spells_cast || [])
    .map((row) => ({ spell_level: Number(row.spell_level), numcast: 0 }))
    .filter((row) => Number.isInteger(row.spell_level));
  return { casts };
}

/** Duration -1 is permanent. Other durations fall by one; zero is removed. */
export function nextRoundWrite(character) {
  const effects = [];
  const deleteEffects = [];
  for (const effect of character?.effects || []) {
    const id = Number(effect.id);
    const duration = Number(effect.duration);
    if (!Number.isInteger(id)) continue;
    if (!Number.isInteger(duration) || duration === -1) continue;
    if (duration <= 1) deleteEffects.push(id);
    else effects.push({ id, duration: duration - 1 });
  }
  return { effects, delete_effects: deleteEffects };
}

/**
 * Add one hit-die roll per new level, then attach the abilities to store.
 * Rolls are the raw die results, in level order.
 */
export function finishLevelUp(write, character, rolls) {
  const pending = write?.needsRolls;
  if (!pending || pending.length === 0) return write;
  if (!Array.isArray(rolls) || rolls.length !== pending.length) {
    return { error: 'Enter one roll per new level' };
  }
  let hp = Number(character?.hp) || 0;
  for (let i = 0; i < pending.length; i += 1) {
    const gain = adjustedHitPoints(rolls[i], character?.con, pending[i].hitDie);
    if (gain == null) return { error: 'Each roll must be from 1 through the hit die' };
    hp += gain;
  }
  return {
    character: { ...write.character, hp },
    primary_class: write.primary_class,
    abilities: write.pendingAbilities || [],
  };
}

/**
 * Absolute rows to store for one hub message.
 * needsRolls means do not stamp until finishLevelUp has the die results.
 */
export function commandWrite(character, classRows, command) {
  const type = command?.type;
  const payload = command?.payload || {};
  if (type === 'give_xp') {
    const amount = Number(payload.amount);
    if (!Number.isInteger(amount)) return { error: 'give_xp amount must be an integer' };
    const xp = (Number(character?.xp) || 0) + amount;
    const primary = primaryClass(character, classRows);
    const leveling = experienceFor(character, classRows, primary);
    const leveled = levelForXp(leveling, xp);
    const level = leveled == null ? (Number(primary.level) || Number(character?.level) || 1) : leveled;
    const oldLevel = Number(primary.level) || Number(character?.level) || 1;
    const write = { character: { xp, level } };
    if (primary.id != null) {
      write.primary_class = { class_id: Number(primary.id), class_level: level };
    }
    if (level > oldLevel) {
      const hitDie = classHitDie(primary.row?.abilities);
      const needsRolls = [];
      for (let step = oldLevel + 1; step <= level; step += 1) needsRolls.push({ level: step, hitDie });
      write.needsRolls = needsRolls;
      write.pendingAbilities = abilitiesGranted(primary.row, oldLevel, level);
    }
    return write;
  }
  if (type === 'new_day') return newDayWrite(character);
  if (type === 'new_round') return nextRoundWrite(character);
  if (type === 'give_gold') {
    const amount = Number(payload.amount_cp);
    if (!Number.isInteger(amount)) return { error: 'give_gold amount_cp must be an integer' };
    return { character: { money: (Number(character?.money) || 0) + amount } };
  }
  if (type === 'give_item') {
    const itemId = Number(payload.item_id);
    if (!Number.isInteger(itemId)) return { error: 'give_item item_id must be an integer' };
    const quantity = payload.quantity == null ? 1 : Number(payload.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) return { error: 'give_item quantity must be a positive integer' };
    const bonus = payload.bonus == null ? 0 : Number(payload.bonus);
    const value = payload.value == null ? 0 : Number(payload.value);
    if (!Number.isInteger(bonus) || !Number.isInteger(value)) {
      return { error: 'give_item bonus and value must be integers' };
    }
    return { item: { item_id: itemId, quantity, bonus, value } };
  }
  return {};
}

/** Absolute money and item quantities for an accepted transfer. */
export function acceptTransfer(fromChar, toChar, transfer) {
  const gold = Number(transfer?.gold_cp) || 0;
  if (!Number.isInteger(gold) || gold < 0) return { error: 'Transfer gold must be a non-negative integer' };
  const fromMoney = Number(fromChar?.money) || 0;
  const toMoney = Number(toChar?.money) || 0;
  if (gold > fromMoney) return { error: 'Not enough money' };
  const items = [];
  for (const it of transfer?.payload?.items || []) {
    const quantity = it.quantity == null ? 1 : Number(it.quantity);
    const itemId = Number(it.character_item_id);
    if (!Number.isInteger(itemId) || !Number.isInteger(quantity) || quantity < 1) {
      return { error: 'Transfer item is invalid' };
    }
    const owned = (fromChar?.items || []).find((row) => String(row.id) === String(itemId));
    if (!owned) return { error: 'Item is not on the sending character' };
    if (quantity > (Number(owned.quantity) || 0)) return { error: 'Not enough of that item' };
    items.push({ character_item_id: itemId, quantity });
  }
  return {
    from: { id: fromChar.id, money: fromMoney - gold },
    to: { id: toChar.id, money: toMoney + gold },
    items,
  };
}

const MECHANICS = {
  bfrpg: {
    id: 'bfrpg',
    attributes: BFRPG_ATTRIBUTES,
    abilityModifier,
    adjustedHitPoints,
    classHitDie,
    armorClass,
    formatArmorClass,
    sheetCombat,
  },
};

/** Missing id is bfrpg. Anything else outside the closed map throws. */
export function resolveMechanic(id) {
  const key = id == null || String(id).trim() === '' ? 'bfrpg' : String(id).trim();
  const mechanic = MECHANICS[key];
  if (!mechanic) throw new Error(`Unknown mechanic: ${key}`);
  return mechanic;
}

/**
 * Set compare of Attribute stat names against the mechanic's list.
 * ponytail: stat rows are global, not per ruleset. A second family with a different attribute list needs its own stat partition before this compare can pass.
 */
export function attributesMatch(mechanic, statNames) {
  const expected = mechanic.attributes.map((attr) => attr.name);
  const actual = Array.isArray(statNames) ? statNames.map((name) => String(name)) : [];
  if (expected.length !== actual.length) return false;
  const seen = new Set(actual);
  if (seen.size !== expected.length) return false;
  return expected.every((name) => seen.has(name));
}

/** Resolve the ruleset's mechanic. Refuse when its Attribute stats are a different set. */
export function openMechanic(ruleset) {
  const mechanic = resolveMechanic(ruleset?.mechanic);
  if (ruleset && Array.isArray(ruleset.attribute_stats) && !attributesMatch(mechanic, ruleset.attribute_stats)) {
    throw new Error(`Attribute stats do not match mechanic ${mechanic.id}`);
  }
  return mechanic;
}
