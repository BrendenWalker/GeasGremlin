import assert from 'node:assert/strict';
import {
  abilityModifier,
  adjustedHitPoints,
  acceptTransfer,
  attackBonusString,
  commandWrite,
  damageString,
  finishLevelUp,
  levelForXp,
  meleeAttackBonus,
  newDayWrite,
  nextLevelXp,
  nextRoundWrite,
  abilitiesGranted,
  rangedAttackBonus,
  sheetCombat,
  overlaidExperience,
  statBounds,
  resolveMechanic,
  attributesMatch,
  openMechanic,
} from './character.mjs';

assert.equal(abilityModifier(16), 2);
const bfrpg = resolveMechanic('bfrpg');
assert.equal(bfrpg.abilityModifier(16), 2);
assert.equal(resolveMechanic(undefined).id, 'bfrpg');
assert.equal(resolveMechanic('').id, 'bfrpg');
assert.throws(() => resolveMechanic('nope'), /Unknown mechanic: nope/);
assert.equal(attributesMatch(bfrpg, ['CHR', 'STR', 'INT', 'WIS', 'DEX', 'CON']), true);
assert.equal(attributesMatch(bfrpg, ['STR', 'INT', 'WIS', 'DEX', 'CON', 'CHA']), false);
assert.equal(openMechanic({ mechanic: 'bfrpg', attribute_stats: ['STR', 'INT', 'WIS', 'DEX', 'CON', 'CHR'] }).id, 'bfrpg');
assert.throws(
  () => openMechanic({ mechanic: 'bfrpg', attribute_stats: ['STR', 'DEX'] }),
  /Attribute stats do not match mechanic bfrpg/
);
assert.equal(adjustedHitPoints(5, 16, 8), 7);

assert.equal(
  meleeAttackBonus({ baseAb: 1, weaponBonus: 1, strength: 16, dexterity: 10, dualWielding: false }),
  '+4 (+1 base, +1 weapon, +2 stat)'
);
assert.equal(
  meleeAttackBonus({ baseAb: 1, weaponBonus: 0, strength: 16, mainHand: true, dualWielding: true }),
  '+1 (-1 base, +2 stat)'
);
assert.equal(
  meleeAttackBonus({ baseAb: 1, weaponBonus: 0, strength: 10, dexterity: 16, mainHand: false, dualWielding: true }),
  '-2 (+1 base, -3 stat)'
);
assert.equal(
  rangedAttackBonus({ baseAb: 1, weaponBonus: 0, dexterity: 16, rangeMod: -2 }),
  '+3 (+1 base, +2 stat -2 range)'
);
assert.equal(attackBonusString({ base: 1, weaponBonus: 0, abilityBonus: 0 }), '+1 (+1 base)');
assert.equal(damageString({ base: '1d8', weaponBonus: 1, abilityBonus: 2 }), '1d8 +3 (+1 Weapon, +2 Stat)');
assert.equal(damageString({ base: '1d8', weaponBonus: 0, abilityBonus: 0 }), '1d8 0');

const leveling = [
  { level: 1, xp: 0, ab: 1 },
  { level: 2, xp: 1500, ab: 1 },
  { level: 3, xp: 3000, ab: 2 },
];
assert.equal(levelForXp(leveling, 0), 1);
assert.equal(levelForXp(leveling, 1499), 1);
assert.equal(levelForXp(leveling, 1500), 2);
assert.equal(nextLevelXp(leveling, 2), 3000);
assert.equal(nextLevelXp(leveling, 3), null);

const fighter = { id: 1, leveling };
const character = {
  xp: 1400,
  level: 1,
  str: 16,
  dex: 10,
  class: 1,
  character_classes: [{ class_id: 1, class_level: 1, sort_order: 0 }],
  items: [{ id: 9, item_attackbonus: 1, item_damage: '1d8', item_damagebonus: 1 }],
  equipped_melee_primary_id: 9,
};
const combat = sheetCombat(character, [fighter]);
assert.equal(combat.melee, '+4 (+1 base, +1 weapon, +2 stat)');
assert.equal(combat.damage, '1d8 +3 (+1 Weapon, +2 Stat)');
assert.equal(combat.nextLevelXp, 1500);

const archer = {
  id: 9,
  is_quasi: true,
  leveling: [
    { level: 1, xp: 0, ab: null },
    { level: 2, xp: 500, ab: null },
    { level: 3, xp: 1000, ab: null },
  ],
};
const quasiCharacter = { ...character, quasiclass: 9 };
const overlaid = overlaidExperience(leveling, archer.leveling);
assert.equal(nextLevelXp(overlaid, 1), 2000);
assert.equal(overlaid[1].ab, 1);
const quasiCombat = sheetCombat(quasiCharacter, [fighter, archer]);
assert.equal(quasiCombat.nextLevelXp, 2000);
assert.equal(quasiCombat.baseAttackBonus, 1);
const held = commandWrite(quasiCharacter, [fighter, archer], { type: 'give_xp', payload: { amount: 200 } });
assert.equal(held.character.xp, 1600);
assert.equal(held.character.level, 1);
assert.equal(sheetCombat({ ...character, quasiclass: 1 }, [fighter]).nextLevelXp, 1500);

const granted = commandWrite(character, [fighter], { type: 'give_xp', payload: { amount: 200 } });
assert.equal(granted.character.xp, 1600);
assert.equal(granted.character.level, 2);
assert.equal(granted.needsRolls.length, 1);
assert.equal(granted.needsRolls[0].level, 2);
const leveled = finishLevelUp(granted, { ...character, hp: 8, con: 16 }, [5]);
assert.equal(leveled.character.hp, 15);
assert.deepEqual(granted.primary_class, { class_id: 1, class_level: 2 });

const withAbilities = {
  id: 1,
  leveling,
  abilities: [
    { ability_id: 9, level: 1, int_param: 8, stat_name: 'Hit Die' },
    { ability_id: 4, level: 2, int_param: 3 },
    { ability_id: 4, level: 3, int_param: 5 },
  ],
};
assert.deepEqual(abilitiesGranted(withAbilities, 1, 2), [{ ability_id: 4, mod: 3 }]);
const rolled = commandWrite(
  { ...character, hp: 6, con: 10 },
  [withAbilities],
  { type: 'give_xp', payload: { amount: 200 } }
);
assert.equal(rolled.needsRolls[0].hitDie, 8);
const finished = finishLevelUp(rolled, { ...character, hp: 6, con: 10 }, [4]);
assert.equal(finished.character.hp, 10);
assert.deepEqual(finished.abilities, [{ ability_id: 4, mod: 3 }]);
assert.equal(finished.needsRolls, undefined);

assert.deepEqual(
  commandWrite({ money: 50 }, [], { type: 'give_gold', payload: { amount_cp: 25 } }),
  { character: { money: 75 } }
);
assert.deepEqual(newDayWrite({ spells_cast: [{ spell_level: 1, numcast: 2 }] }), {
  casts: [{ spell_level: 1, numcast: 0 }],
});
assert.deepEqual(
  nextRoundWrite({
    effects: [
      { id: 1, duration: 3 },
      { id: 2, duration: 1 },
      { id: 3, duration: -1 },
    ],
  }),
  { effects: [{ id: 1, duration: 2 }], delete_effects: [2] }
);
assert.equal(commandWrite({}, [], { type: 'give_xp', payload: { amount: 'nope' } }).error.includes('integer'), true);

const bounds = statBounds({ min_str: 8, max_str: 17 }, { min_str: 11 }, null);
assert.equal(bounds.mins.str, 11);
assert.equal(bounds.maxs.str, 17);
assert.equal(bounds.mins.dex, 3);
assert.equal(bounds.maxs.dex, 18);

const sender = { id: 1, money: 100, items: [{ id: 4, quantity: 2 }] };
const receiver = { id: 2, money: 10, items: [] };
assert.deepEqual(
  acceptTransfer(sender, receiver, { gold_cp: 40, payload: { items: [{ character_item_id: 4, quantity: 1 }] } }),
  {
    from: { id: 1, money: 60 },
    to: { id: 2, money: 50 },
    items: [{ character_item_id: 4, quantity: 1 }],
  }
);
assert.equal(acceptTransfer(sender, receiver, { gold_cp: 500, payload: { items: [] } }).error, 'Not enough money');

console.log('character domain ok');
