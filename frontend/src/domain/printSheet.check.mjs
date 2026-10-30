import assert from 'node:assert/strict';
import { moneyToCoins, printSheet, resolvePrintStyle } from './printSheet.mjs';

assert.deepEqual(moneyToCoins(1250), { pp: 1, gp: 2, sp: 5, cp: 0 });
assert.deepEqual(moneyToCoins(null), { pp: '', gp: '', sp: '', cp: '' });
assert.equal(resolvePrintStyle('nope', 'record'), 'record');
assert.equal(resolvePrintStyle('spells', 'classic'), 'spells');
assert.equal(resolvePrintStyle('', ''), 'classic');

const magicUser = {
  id: 3,
  name: 'Magic-User',
  has_spellbook: true,
  abilities: [
    { stat_name: 'Death Ray or Poison', level: 1, int_param: 13 },
    { stat_name: 'Magic Wands', level: 1, int_param: 14 },
    { stat_name: 'Paralysis or Petrify', level: 1, int_param: 13 },
    { stat_name: 'Dragon Breath', level: 1, int_param: 16 },
    { stat_name: 'Spells', level: 1, int_param: 15 },
  ],
  leveling: [
    { level: 1, xp: 0, ab: 1 },
    { level: 2, xp: 2500, ab: 1 },
  ],
  spell_slots: [{ char_level: 1, level1: 1 }],
};

const catalog = [
  { id: 1, name: 'Magic Missile', classes: [{ class_id: 3, level: 1 }] },
  { id: 2, name: 'Sleep', classes: [{ class_id: 3, level: 1 }] },
  { id: 3, name: 'Light', classes: [{ class_id: 3, level: 1 }] },
];

const character = {
  name: 'Mira',
  user: 'ada',
  level: 1,
  xp: 0,
  hp: 6,
  current_hp: 4,
  str: 16,
  int: null,
  dex: 13,
  money: 1250,
  class: 3,
  character_classes: [{ class_id: 3, class_level: 1, sort_order: 0 }],
  equipped_melee_primary_id: 3,
  items: [{ id: 3, name: 'Dagger', item_damage: '1d4', quantity: 1 }],
  spells: [
    { spell_id: 2, known: 1, memorized: 2, spell_name: 'Sleep', spell_level: 1 },
    { spell_id: 3, known: 1, memorized: 0, spell_name: 'Light', spell_level: 1 },
  ],
};

const sheet = printSheet(character, {
  ruleset: { mechanic: 'bfrpg' },
  classes: [magicUser],
  spells: catalog,
});

assert.deepEqual(sheet.coins, { pp: 1, gp: 2, sp: 5, cp: 0 });
assert.equal(sheet.saves.find((row) => row.stat === 'Death Ray or Poison').target, '13');
assert.equal(sheet.weapons.find((row) => row.slot === 'Primary').name, 'Dagger');
assert.equal(sheet.weapons.find((row) => row.slot === 'Primary').attack, '+3 (+1 base, +2 stat)');
assert.deepEqual(
  sheet.spells.map((spell) => [spell.name, spell.memorized]),
  [['Light', 0], ['Sleep', 2]],
);
assert.equal(sheet.abilities.find((row) => row.key === 'int').score, '');
assert.equal(sheet.abilities.find((row) => row.key === 'int').mod, '');

const bare = printSheet({
  level: 1,
  character_classes: [{ class_id: 3, class_level: 1, sort_order: 0 }],
  str: 10,
  dex: 10,
}, { ruleset: { mechanic: 'bfrpg' }, classes: [magicUser] });
assert.equal(bare.weapons.find((row) => row.slot === 'Primary').attack, '');
assert.equal(bare.weapons.find((row) => row.slot === 'Ranged').attack, '');

const empty = printSheet({}, { ruleset: { mechanic: 'bfrpg' } });
assert.deepEqual(empty.gear, []);
assert.deepEqual(empty.spells, []);
assert.equal(empty.weapons.length, 3);

console.log('printSheet ok');
