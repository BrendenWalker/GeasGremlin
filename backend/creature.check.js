const assert = require('assert');
const { applyCreatureHitPoints, catalogTreasure, fightCreature, recoverCreature } = require('./creature');

const established = applyCreatureHitPoints(null, 9);
assert.equal(established.hp, 9);
assert.equal(established.baseHp, 9);

const down = applyCreatureHitPoints(null, 0);
assert.equal(down.hp, 0);
assert.equal(down.baseHp, null);

const capped = applyCreatureHitPoints(5, 9);
assert.equal(capped.hp, 5);
assert.equal(capped.baseHp, 5);

const wound = applyCreatureHitPoints(6, 3);
assert.equal(wound.hp, 3);
assert.equal(wound.baseHp, 6);

assert.equal(applyCreatureHitPoints(5, -1).error != null, true);
assert.equal(applyCreatureHitPoints(0, 1).error != null, true);

const full = recoverCreature({ hp: 5, baseHp: 5 });
assert.equal(full.changed, false);
assert.equal(full.hp, 5);

const wounded = recoverCreature({ hp: 2, baseHp: 5 });
assert.equal(wounded.changed, true);
assert.equal(wounded.hp, 3);

const dead = recoverCreature({ hp: 0, baseHp: 5 });
assert.equal(dead.changed, false);
assert.equal(dead.hp, 0);

const fled = recoverCreature({ hp: 4, baseHp: 6 });
assert.equal(fled.changed, true);
assert.equal(fled.hp, 5);

const several = recoverCreature({ hp: 2, baseHp: 5 }, 2);
assert.equal(several.changed, true);
assert.equal(several.hp, 4);

const cappedRest = recoverCreature({ hp: 4, baseHp: 6 }, 3);
assert.equal(cappedRest.changed, true);
assert.equal(cappedRest.hp, 6);

const none = recoverCreature({ hp: 2, baseHp: 5 }, 0);
assert.equal(none.changed, false);
assert.equal(none.hp, 2);

const unrolled = recoverCreature({ hp: null, baseHp: null });
assert.equal(unrolled.error != null, true);

const goblin = fightCreature({ id: 4, name: ' Goblin ', treasure_type: ' R each; C in lair ' }, 'ignored');
assert.equal(goblin.name, 'Goblin');
assert.equal(goblin.monster_id, 4);
assert.equal(goblin.treasure_type, 'R each; C in lair');

const bare = fightCreature({ id: 2, name: 'Bat', treasure_type: '  ' }, '');
assert.equal(bare.name, 'Bat');
assert.equal(bare.treasure_type, null);

const hermit = fightCreature(null, ' Well hermit ');
assert.equal(hermit.name, 'Well hermit');
assert.equal(hermit.monster_id, null);
assert.equal(hermit.treasure_type, null);

assert.equal(fightCreature(null, '   ').error != null, true);
assert.equal(catalogTreasure(null), null);
assert.equal(catalogTreasure({ treasure_type: ' A ' }), 'A');

console.log('creature ok');
