const assert = require('assert');
const {
  lightDuration,
  carryingCapacity,
  encumbrance,
  slowestMember,
  requiredSleep,
  settleBody,
  applyBodyHitPoints,
} = require('./body');

const torch = lightDuration('torch', 1);
assert.equal(torch.turns, 5);
assert.equal(torch.minutes, 50);
assert.equal(lightDuration('torch', 4).turns, 8);
assert.equal(lightDuration('lantern', 1).turns, 19);
assert.equal(lightDuration('lantern', 1).minutes, 190);
assert.equal(lightDuration('lantern', 6).turns, 24);
assert.equal(lightDuration('candle', 1).error != null, true);

const human = carryingCapacity('Human', 9);
assert.equal(human.light, 60);
assert.equal(human.heavy, 150);
assert.deepEqual(carryingCapacity('Elf', 18), { light: 80, heavy: 195 });
assert.deepEqual(carryingCapacity('Dwarf', 3), { light: 25, heavy: 60 });
assert.deepEqual(carryingCapacity('Human', 16), { light: 70, heavy: 180 });
assert.deepEqual(carryingCapacity('Halfling', 16), { light: 60, heavy: 120 });
assert.deepEqual(carryingCapacity('Halfling', 4), { light: 30, heavy: 60 });

const leather = encumbrance({ raceName: 'Human', strength: 10, ounces: 15 * 16, armorAc: 13, armorMagic: false });
assert.equal(leather.load, 'light');
assert.equal(leather.armor, 'leather');
assert.equal(leather.move, 30);
assert.equal(leather.turn_feet, 90);
assert.equal(leather.miles, 18);

const plate = encumbrance({ raceName: 'Human', strength: 10, ounces: 50 * 16, armorAc: 17, armorMagic: false });
assert.equal(plate.load, 'light');
assert.equal(plate.move, 20);
assert.equal(plate.miles, 12);

const magicPlate = encumbrance({ raceName: 'Human', strength: 10, ounces: 0, armorAc: 17, armorMagic: true });
assert.equal(magicPlate.armor, 'magic metal');
assert.equal(magicPlate.move, 30);

const magicLeather = encumbrance({ raceName: 'Human', strength: 10, ounces: 200 * 16, armorAc: 13, armorMagic: true });
assert.equal(magicLeather.load, 'over');
assert.equal(magicLeather.armor, 'magic leather');
assert.equal(magicLeather.move, 30);

const bare = encumbrance({ raceName: 'Human', strength: 10, ounces: 0, armorAc: null, armorMagic: false });
assert.equal(bare.move, 40);
assert.equal(bare.miles, 24);

const slow = slowestMember([
  { name: 'Ann', move: 40 },
  { name: 'Bob', move: 20 },
]);
assert.equal(slow.name, 'Bob');
assert.equal(slowestMember([]), null);

assert.equal(requiredSleep(18), 3);
assert.equal(requiredSleep(3), 9);
assert.equal(requiredSleep(10), 6);

const fed = { foodMissed: 0, healFood: false, healWater: false };
const day1 = settleBody(fed, { ate: false, drank: true, hours: 6, bedrest: false, constitution: 10 }, () => 1);
assert.equal(day1.foodDamage, 0);
assert.equal(day1.foodMissed, 1);
assert.equal(day1.healed, 1);

const day2 = settleBody({ foodMissed: 1, healFood: false, healWater: false }, { ate: false, drank: true, hours: 6, bedrest: false, constitution: 10 }, () => 1);
assert.equal(day2.foodDamage, 0);
assert.equal(day2.foodMissed, 2);

const day3 = settleBody({ foodMissed: 2, healFood: false, healWater: false }, { ate: false, drank: true, hours: 8, bedrest: true, constitution: 10 }, () => 1);
assert.equal(day3.foodDamage, 1);
assert.equal(day3.healFood, true);
assert.equal(day3.healed, 0);

const ate = settleBody({ foodMissed: 4, healFood: true, healWater: false }, { ate: true, drank: true, hours: 6, bedrest: true, constitution: 10 }, () => 1);
assert.equal(ate.foodMissed, 0);
assert.equal(ate.healFood, false);
assert.equal(ate.healed, 2);

const dry = settleBody(fed, { ate: true, drank: false, hours: 6, bedrest: false, constitution: 18 }, () => 3);
assert.equal(dry.waterDamage, 3);
assert.equal(dry.healWater, true);
assert.equal(dry.healed, 0);
assert.equal(dry.required, 3);

const short = settleBody(fed, { ate: true, drank: true, hours: 2, bedrest: true, constitution: 18 }, () => 1);
assert.equal(short.slept, false);
assert.equal(short.healed, 0);

const rested = settleBody(fed, { ate: true, drank: true, hours: 3, bedrest: false, constitution: 18 }, () => 1);
assert.equal(rested.healed, 1);

const hurt = applyBodyHitPoints(4, -3, 10);
assert.equal(hurt.hp, 1);
assert.equal(hurt.applied, -3);
assert.equal(hurt.full, false);
const down = applyBodyHitPoints(1, -4, 10);
assert.equal(down.hp, 0);
assert.equal(down.applied, -1);
assert.equal(down.down, true);
assert.equal(applyBodyHitPoints(null, -1, 10).error, 'set hit points first');
assert.equal(applyBodyHitPoints(4, 0, 10).changed, false);
assert.equal(applyBodyHitPoints(4, 0, null).error, 'set hit points first');

const over = applyBodyHitPoints(8, 5, 10);
assert.equal(over.hp, 10);
assert.equal(over.applied, 2);
assert.equal(over.full, true);
const landed = applyBodyHitPoints(9, 1, 10);
assert.equal(landed.hp, 10);
assert.equal(landed.applied, 1);
assert.equal(landed.full, true);
const wound = applyBodyHitPoints(10, -3, 10);
assert.equal(wound.hp, 7);
assert.equal(wound.applied, -3);
assert.equal(wound.full, false);
const stopped = applyBodyHitPoints(2, -5, 10);
assert.equal(stopped.hp, 0);
assert.equal(stopped.applied, -2);
assert.equal(stopped.down, true);

console.log('body ok');
