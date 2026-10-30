/**
 * Plain character sheet for the print page.
 * Numbers come from the same helpers the character screen uses.
 */
import {
  abilityModifier,
  damageString,
  formatModifier,
  meleeAttackBonus,
  openMechanic,
  primaryClass,
  savingThrowTargets,
  castTabs,
  circleSpellList,
} from './character.mjs';

export const PRINT_STYLES = [
  { id: 'classic', label: 'Classic' },
  { id: 'simple', label: 'Simple' },
  { id: 'accessible', label: 'Accessible' },
  { id: 'record', label: 'Record' },
  { id: 'parchment', label: 'Parchment' },
  { id: 'spells', label: 'Spells' },
];

const ABILITY_NAMES = {
  str: 'Strength',
  int: 'Intelligence',
  wis: 'Wisdom',
  dex: 'Dexterity',
  con: 'Constitution',
  chr: 'Charisma',
};

const SAVE_ROWS = [
  { stat: 'Death Ray or Poison', label: 'Death Ray or Poison' },
  { stat: 'Magic Wands', label: 'Magic Wands' },
  { stat: 'Paralysis or Petrify', label: 'Paralysis or Turn to Stone' },
  { stat: 'Dragon Breath', label: 'Dragon Breath' },
  { stat: 'Spells', label: 'Rods, Staves, and Spells' },
];

const SAVE_STATS = new Set(SAVE_ROWS.map((row) => row.stat));

export function resolvePrintStyle(queryValue, storedValue) {
  const allowed = new Set(PRINT_STYLES.map((style) => style.id));
  if (allowed.has(queryValue)) return queryValue;
  if (allowed.has(storedValue)) return storedValue;
  return 'classic';
}

/** Copper pieces to PP / GP / SP / CP. Blank when the purse is missing. */
export function moneyToCoins(cp) {
  if (cp == null || cp === '') return { pp: '', gp: '', sp: '', cp: '' };
  const c = Number(cp);
  if (!Number.isInteger(c) || c < 0) return { pp: '', gp: '', sp: '', cp: '' };
  const pp = Math.floor(c / 1000);
  const rest1 = c % 1000;
  const gp = Math.floor(rest1 / 100);
  const rest2 = rest1 % 100;
  const sp = Math.floor(rest2 / 10);
  return { pp, gp, sp, cp: rest2 % 10 };
}

function blankNumber(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : '';
}

function wholeBonus(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : 0;
}

function held(items, id) {
  if (id == null || id === '') return null;
  return (items || []).find((item) => String(item.id) === String(id)) || null;
}

function itemLabel(item) {
  if (!item) return '';
  const name = item.name || item.item_name || '';
  const qty = Number(item.quantity);
  if (name && Number.isInteger(qty) && qty > 1) return `${name} × ${qty}`;
  return name;
}

function damageLine(item, abilityBonus) {
  if (!item?.item_damage) return '';
  const weaponBonus = wholeBonus(item.item_damagebonus);
  if (weaponBonus === 0 && abilityBonus === 0) return String(item.item_damage);
  return damageString({
    base: String(item.item_damage),
    weaponBonus,
    abilityBonus,
  });
}

function knownSpells(character, classes, catalog) {
  const known = (character?.spells || []).filter((row) => Number(row.known));
  const placed = new Set();
  const out = [];
  const tabs = castTabs(character?.character_classes, classes);
  for (const tab of tabs) {
    const rows = circleSpellList(
      catalog,
      character?.spells,
      character?.character_classes,
      classes,
      tab.circle,
    );
    for (const row of rows) {
      const learned = known.find((spell) => Number(spell.spell_id) === Number(row.id));
      if (!learned) continue;
      placed.add(Number(row.id));
      out.push({
        circle: tab.circle,
        name: row.name,
        memorized: Number(learned.memorized) || 0,
      });
    }
  }
  for (const row of known) {
    const id = Number(row.spell_id);
    if (placed.has(id)) continue;
    const circle = Number(row.spell_level);
    out.push({
      circle: Number.isInteger(circle) && circle > 0 ? circle : 0,
      name: row.spell_name || 'Spell',
      memorized: Number(row.memorized) || 0,
    });
  }
  out.sort((a, b) => a.circle - b.circle || String(a.name).localeCompare(String(b.name)));
  return out;
}

/**
 * @param {object} character
 * @param {{ ruleset?: object, races?: object[], classes?: object[], spells?: object[] }} [context]
 */
export function printSheet(character, context = {}) {
  const sheet = character || {};
  const classes = context.classes || [];
  const races = context.races || [];
  const mechanic = openMechanic(context.ruleset);
  const primary = primaryClass(sheet, classes);
  const combat = mechanic.sheetCombat(sheet, classes);
  const race = races.find((row) => String(row.id) === String(sheet.race));
  const targets = savingThrowTargets(primary.row?.abilities, race?.abilities, primary.level);
  const items = sheet.items || [];
  const primaryItem = held(items, sheet.equipped_melee_primary_id);
  const off = held(items, sheet.equipped_melee_secondary_id);
  const ranged = held(items, sheet.equipped_ranged_id);
  const armor = held(items, sheet.equipped_armor_id);
  const shield = held(items, sheet.equipped_shield_id);
  const base = combat.baseAttackBonus;

  let offAttack = '';
  if (off && base != null) {
    offAttack = meleeAttackBonus({
      baseAb: base,
      weaponBonus: wholeBonus(off.item_attackbonus),
      strength: sheet.str,
      dexterity: sheet.dex,
      mainHand: false,
      dualWielding: true,
    });
  }

  const abilities = (sheet.abilities || [])
    .filter((ability) => !SAVE_STATS.has(ability?.stat_name))
    .map((ability) => {
      const text = ability.ability_description || ability.stat_name || '';
      if (!text) return '';
      if (ability.mod == null || ability.mod === '') return text;
      return `${text} (${ability.mod})`;
    })
    .filter(Boolean);

  return {
    name: sheet.name || '',
    player: sheet.user || '',
    race: sheet.race_name || race?.name || '',
    className: sheet.class_name || primary.row?.name || '',
    level: blankNumber(sheet.level ?? primary.level),
    xp: blankNumber(sheet.xp),
    nextLevelXp: blankNumber(combat.nextLevelXp ?? sheet.next_level_xp),
    abilities: mechanic.attributes.map((attr) => {
      const raw = sheet[attr.column];
      const score = blankNumber(raw);
      return {
        key: attr.column,
        label: ABILITY_NAMES[attr.column] || attr.name,
        score,
        mod: score === '' ? '' : formatModifier(mechanic.abilityModifier(raw)),
      };
    }),
    saves: SAVE_ROWS.map((row) => ({
      stat: row.stat,
      label: row.label,
      target: targets[row.stat] == null ? '' : String(targets[row.stat]),
    })),
    armorClass: mechanic.formatArmorClass(mechanic.armorClass(sheet)),
    hpCurrent: blankNumber(sheet.current_hp),
    hpMax: blankNumber(sheet.hp),
    attackBonus: base == null ? '' : formatModifier(base),
    armor: [itemLabel(armor), itemLabel(shield)].filter(Boolean).join(', '),
    weapons: [
      {
        slot: 'Primary',
        name: itemLabel(primaryItem),
        attack: primaryItem ? (combat.melee || '') : '',
        damage: primaryItem ? (combat.damage || '') : '',
      },
      {
        slot: 'Off hand',
        name: itemLabel(off),
        attack: offAttack,
        damage: damageLine(off, abilityModifier(sheet.str)),
      },
      {
        slot: 'Ranged',
        name: itemLabel(ranged),
        attack: ranged ? (combat.ranged || '') : '',
        damage: damageLine(ranged, 0),
      },
    ],
    coins: moneyToCoins(sheet.money),
    gear: items.map(itemLabel).filter(Boolean),
    languages: sheet.languages || '',
    abilitiesText: abilities,
    notes: sheet.notes || '',
    spells: knownSpells(sheet, classes, context.spells || []),
  };
}
