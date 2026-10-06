import assert from 'node:assert/strict';
import { armorClass, formatArmorClass } from './armorClass.mjs';

const plate = { id: 2, item_ac: 17, item_ac_melee: null, item_ac_ranged: null };
const leather = { id: 3, item_ac: 13 };
const barding = { id: 4, item_ac: 2 };
const medium = { id: 5, item_ac: null, item_ac_melee: 1, item_ac_ranged: 1 };
const tower = { id: 6, item_ac: null, item_ac_melee: 1, item_ac_ranged: 3 };
const buckler = { id: 7, item_ac: null, item_ac_melee: 1, item_ac_ranged: null };

assert.deepEqual(armorClass({ dex: 10, items: [] }), { melee: 11, ranged: 11 });
assert.deepEqual(armorClass({ dex: 3, items: [] }), { melee: 8, ranged: 8 });
assert.deepEqual(
  armorClass({ dex: 10, equipped_armor_id: 2, items: [plate] }),
  { melee: 17, ranged: 17 }
);
assert.deepEqual(
  armorClass({ dex: 16, equipped_armor_id: 3, equipped_shield_id: 5, items: [leather, medium] }),
  { melee: 16, ranged: 16 }
);
assert.deepEqual(
  armorClass({ dex: 10, equipped_armor_id: 2, equipped_shield_id: 6, items: [plate, tower] }),
  { melee: 18, ranged: 20 }
);
assert.deepEqual(
  armorClass({ dex: 10, equipped_armor_id: 2, equipped_shield_id: 7, items: [plate, buckler] }),
  { melee: 18, ranged: 17 }
);
assert.deepEqual(
  armorClass({ dex: 10, equipped_armor_id: 4, items: [barding] }),
  { melee: 13, ranged: 13 }
);
assert.deepEqual(
  armorClass({ dex: 10, equipped_armor_id: 5, equipped_shield_id: 5, items: [medium] }),
  { melee: 12, ranged: 12 }
);
assert.deepEqual(
  armorClass({ dex: 10, equipped_armor_id: 99, items: [plate] }),
  { melee: 11, ranged: 11 }
);

assert.equal(formatArmorClass({ melee: 18, ranged: 18 }), '18');
assert.equal(formatArmorClass({ melee: 18, ranged: 20 }), '18 (20 vs missiles)');

console.log('armorClass ok');
