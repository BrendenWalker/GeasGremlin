const assert = require('assert');
const {
  VEHICLE_AC,
  TRAPS,
  VEHICLES,
  stockRoom,
  vehicleDamage,
  fieldRepair,
} = require('./prep');

assert.equal(VEHICLE_AC, 11);
assert.equal(stockRoom(1).contents, 'Empty');
assert.equal(stockRoom(16).contents, 'Empty');
assert.equal(stockRoom(17).contents, 'Unguarded Treasure');
assert.equal(stockRoom(21).contents, 'Monster');
assert.equal(stockRoom(61).contents, 'Monster with Treasure');
assert.equal(stockRoom(85).contents, 'Special');
assert.equal(stockRoom(89).contents, 'Trap');
assert.equal(stockRoom(97).contents, 'Trap with Treasure');
assert.equal(stockRoom(100).contents, 'Trap with Treasure');
assert.equal(stockRoom(0).error != null, true);
assert.equal(TRAPS.some((trap) => trap.name === 'Pit Trap'), true);
assert.equal(TRAPS.some((trap) => trap.name === 'Poison Gas'), true);

const wagon = VEHICLES.find((row) => row.name === 'Wagon');
assert.equal(wagon.hardness, 6);
assert.equal(wagon.hp, 16);
assert.equal(VEHICLES.find((row) => row.name === 'Galley, Large').crew, 160);

const glance = vehicleDamage({ listed: 10, hardness: 10, taken: 0, amount: 8, water: false });
assert.equal(glance.excess, 0);
assert.equal(glance.taken, 0);
assert.equal(glance.condition, 'sound');

const side = vehicleDamage({ listed: 10, hardness: 4, taken: 0, amount: 14, water: false });
assert.equal(side.excess, 10);
assert.equal(side.remaining, 0);
assert.equal(side.condition, 'half speed');

const wreck = vehicleDamage({ listed: 10, hardness: 0, taken: 10, amount: 10, water: false });
assert.equal(wreck.taken, 20);
assert.equal(wreck.condition, 'immobilized');

const sunk = vehicleDamage({ listed: 10, hardness: 0, taken: 10, amount: 10, water: true });
assert.equal(sunk.condition, 'sunk');

const repaired = fieldRepair({ listed: 10, taken: 5, crew: 1, water: false, rollDie: () => 4 });
assert.equal(repaired.cap, 9);
assert.equal(repaired.restored, 4);
assert.equal(repaired.taken, 1);
assert.equal(repaired.remaining, 9);

const full = fieldRepair({ listed: 10, taken: 0, crew: 2, water: false, rollDie: () => 4 });
assert.equal(full.restored, 0);
assert.equal(full.taken, 0);

const capped = fieldRepair({ listed: 10, taken: 1, crew: 1, water: true, rollDie: () => 3 });
assert.equal(capped.restored, 0);
assert.equal(fieldRepair({ listed: 10, taken: 2, crew: 0, water: false, rollDie: () => 1 }).error != null, true);

console.log('prep ok');
