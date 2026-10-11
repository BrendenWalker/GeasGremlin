const assert = require('assert');
const {
  adjustedMiles,
  forcedMiles,
  airMiles,
  stallFeet,
  marchDay,
  lostCheck,
  sailingDay,
} = require('./travel');

assert.equal(adjustedMiles(24, 0), 24);
assert.equal(adjustedMiles(24, 33), 32);
assert.equal(adjustedMiles(24, -33), 16);
assert.equal(adjustedMiles(24, -67), 8);
assert.equal(adjustedMiles(18, -33), 12);
assert.equal(forcedMiles(32), 48);
assert.equal(forcedMiles(16), 24);
assert.equal(airMiles(24), 48);
assert.equal(stallFeet(40), 14);
assert.equal(stallFeet(30), 10);
assert.equal(adjustedMiles(null, 0), null);

const first = marchDay({ days: 0, failed: false, constitution: 10, target: 12 }, () => 1, () => 6);
assert.equal(first.day, 1);
assert.equal(first.damage, 0);

const saved = marchDay({ days: 1, failed: false, constitution: 18, target: 12 }, () => 10, () => 6);
assert.equal(saved.saved, true);
assert.equal(saved.damage, 0);
assert.equal(saved.save.total, 13);

const failed = marchDay({ days: 1, failed: false, constitution: 10, target: 15 }, () => 10, () => 4);
assert.equal(failed.saved, false);
assert.equal(failed.failed, true);
assert.equal(failed.damage, 4);

const again = marchDay({ days: 2, failed: true, constitution: 18, target: 12 }, () => 20, () => 2);
assert.equal(again.saved, false);
assert.equal(again.damage, 2);
assert.equal(again.save, undefined);

const road = lostCheck({ following: true, wisdom: 3, target: 15 }, () => 1);
assert.equal(road.lost, false);
assert.equal(road.skipped, true);

const astray = lostCheck({ following: false, wisdom: 10, target: 12 }, () => 8);
assert.equal(astray.lost, true);
assert.equal(astray.save.total, 8);

const found = lostCheck({ following: false, wisdom: 18, target: 12 }, () => 10);
assert.equal(found.lost, false);
assert.equal(found.save.total, 13);

const calm = sailingDay(1, 1, false);
assert.equal(calm.direction, 'Northerly');
assert.equal(calm.condition, 'Becalmed');
assert.equal(calm.sailing, '×0');
assert.equal(calm.hours, 12);

const gale = sailingDay(12, 100, true);
assert.equal(gale.direction, 'Prevailing wind for this locale');
assert.equal(gale.condition, 'Gale');
assert.equal(gale.sailing, '×2');
assert.equal(gale.tacking, '×0');
assert.equal(gale.hours, 24);
assert.equal(gale.distance, '×2');

const average = sailingDay(3, 50, false);
assert.equal(average.direction, 'Easterly');
assert.equal(average.condition, 'Average Winds');
assert.equal(average.sailing, '×1');
assert.equal(average.tacking, '×1/2');

console.log('travel ok');
