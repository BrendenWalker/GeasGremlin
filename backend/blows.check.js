const assert = require('assert');
const {
  armorClass,
  applyHitPoints,
  characterAttackBonus,
  characterDamageDice,
  monsterAttackBonus,
  resolveAttack,
  rollMonsterHitPoints,
  rollWeaponDamage,
} = require('./blows');

function scripted(faces) {
  const pending = faces.slice();
  return (sides) => {
    const face = pending.shift();
    assert.ok(face >= 1 && face <= sides, `rolled ${face} on d${sides}`);
    return face;
  };
}

const plate = { id: 2, item_ac: 17 };
const leather = { id: 3, item_ac: 13 };
const barding = { id: 4, item_ac: 2 };
const medium = { id: 5, item_ac_melee: 1, item_ac_ranged: 1 };
const tower = { id: 6, item_ac_melee: 1, item_ac_ranged: 3 };
const buckler = { id: 7, item_ac_melee: 1 };

assert.deepEqual(armorClass({ dex: 10, items: [] }), { melee: 11, ranged: 11 });
assert.deepEqual(armorClass({ dex: 3, items: [] }), { melee: 8, ranged: 8 });
assert.deepEqual(armorClass({ dex: 10, equipped_armor_id: 2, items: [plate] }), { melee: 17, ranged: 17 });
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
assert.deepEqual(armorClass({ dex: 10, equipped_armor_id: 4, items: [barding] }), { melee: 13, ranged: 13 });

const melee = characterAttackBonus({
  baseAb: 1, mode: 'melee', strength: 16, dexterity: 10, weaponBonus: 1,
});
assert.equal(melee.bonus, 4);
const missile = characterAttackBonus({
  baseAb: 1, mode: 'missile', strength: 16, dexterity: 16, weaponBonus: 0,
});
assert.equal(missile.bonus, 3);
const back = characterAttackBonus({
  baseAb: 1, mode: 'back', strength: 16, dexterity: 10, weaponBonus: 1,
});
assert.equal(back.bonus, 6);
const dual = characterAttackBonus({
  baseAb: 1, mode: 'melee', strength: 16, dexterity: 10, weaponBonus: 1, dualWielding: true,
});
assert.equal(dual.bonus, 2);
assert.equal(characterAttackBonus({ baseAb: null, mode: 'melee', strength: 10 }).error, 'no attack bonus');

assert.equal(monsterAttackBonus('1'), 1);
assert.equal(monsterAttackBonus('1*'), 1);
assert.equal(monsterAttackBonus('1-1'), 0);
assert.equal(monsterAttackBonus('1/2*'), 0);
assert.equal(monsterAttackBonus('3+2'), 3);
assert.equal(monsterAttackBonus('9'), 8);
assert.equal(monsterAttackBonus('32'), 16);
assert.equal(monsterAttackBonus('2* to 4*'), null);

const fumble = resolveAttack({ roll: 1, attackBonus: 20, adjustment: 0, armorClass: 1 });
assert.equal(fumble.hit, false);
assert.equal(fumble.natural, 'miss');
const crit = resolveAttack({ roll: 20, attackBonus: -5, adjustment: 0, armorClass: 30 });
assert.equal(crit.hit, true);
assert.equal(crit.natural, 'hit');
const miss = resolveAttack({ roll: 10, attackBonus: 3, adjustment: 0, armorClass: 14 });
assert.equal(miss.hit, false);
assert.equal(miss.total, 13);
const hit = resolveAttack({ roll: 11, attackBonus: 3, adjustment: 1, armorClass: 13 });
assert.equal(hit.hit, true);
assert.equal(hit.total, 15);

const sword = characterDamageDice({ mode: 'melee', damage: '1d8', damageBonus: 1, strength: 16 });
assert.deepEqual(sword, { dice: 1, faces: 8, flat: 3 });
const bow = characterDamageDice({ mode: 'missile', damage: '1d6', damageBonus: 0, strength: 16 });
assert.deepEqual(bow, { dice: 1, faces: 6, flat: 0 });
const plus = characterDamageDice({ mode: 'melee', damage: '1d6+1', damageBonus: 0, strength: 10 });
assert.deepEqual(plus, { dice: 1, faces: 6, flat: 1 });

const rolled = rollWeaponDamage({ dice: 1, faces: 8, flat: 3, rollDie: scripted([6]) });
assert.equal(rolled.amount, 9);
const floored = rollWeaponDamage({ dice: 1, faces: 4, flat: -5, rollDie: scripted([1]) });
assert.equal(floored.amount, 1);

const half = rollMonsterHitPoints('1/2', scripted([3]));
assert.equal(half.amount, 3);
assert.deepEqual(half.faces, [3]);
const ogre = rollMonsterHitPoints('4+1', scripted([2, 3, 4, 5]));
assert.equal(ogre.amount, 15);
assert.equal(rollMonsterHitPoints('2 to 4', scripted([1])).error, 'no hit dice');

const wounded = applyHitPoints(10, 8);
assert.equal(wounded.hp, 2);
assert.equal(wounded.down, false);
const down = applyHitPoints(8, 8);
assert.equal(down.hp, 0);
assert.equal(down.down, true);
assert.equal(applyHitPoints(null, 1).error, 'no hit points');
assert.equal(applyHitPoints(5, 0).error, 'a hit does at least 1 point of damage');

console.log('blows ok');
