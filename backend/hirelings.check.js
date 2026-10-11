const assert = require('assert');
const {
  retainerCap,
  maxRetainerLevel,
  startingLoyalty,
  hireReaction,
  canHireRetainer,
  loyaltyCheck,
  specialistCost,
  mercenaryOffer,
} = require('./hirelings');

assert.equal(retainerCap(10), 4);
assert.equal(retainerCap(18), 7);
assert.equal(retainerCap(3), 1);
assert.equal(maxRetainerLevel(1), 0);
assert.equal(maxRetainerLevel(2), 1);
assert.equal(maxRetainerLevel(5), 2);
assert.equal(startingLoyalty(10, false), 7);
assert.equal(startingLoyalty(18, true), 11);
assert.equal(startingLoyalty(3, false), 4);

let faces = [1, 1];
const refusal = hireReaction({
  bonus: 0,
  penalty: 0,
  adjustment: 0,
  rollDie: () => faces.shift(),
});
assert.equal(refusal.total, 2);
assert.equal(refusal.result, 'Refusal');
assert.equal(refusal.further, -1);

faces = [6, 6];
const hired = hireReaction({
  bonus: 1,
  penalty: -1,
  adjustment: 1,
  rollDie: () => faces.shift(),
});
assert.equal(hired.total, 13);
assert.equal(hired.result, 'Acceptance');
assert.equal(hired.loyalty_bonus, 1);

faces = [3, 3];
const again = hireReaction({ bonus: 0, penalty: 0, adjustment: 0, rollDie: () => faces.shift() });
assert.equal(again.total, 6);
assert.equal(again.result, 'Try again');

assert.equal(canHireRetainer({ employerLevel: 1, retainerLevel: 1, charisma: 18, retained: 0 }).error != null, true);
assert.equal(canHireRetainer({ employerLevel: 4, retainerLevel: 3, charisma: 10, retained: 0 }).error != null, true);
assert.equal(canHireRetainer({ employerLevel: 4, retainerLevel: 2, charisma: 10, retained: 4 }).error != null, true);
assert.equal(canHireRetainer({ employerLevel: 4, retainerLevel: 2, charisma: 10, retained: 3 }).cap, 4);

faces = [1, 1];
const bumped = loyaltyCheck({ score: 7, adjustment: 0, combat: true, rollDie: () => faces.shift() });
assert.equal(bumped.roll, 2);
assert.equal(bumped.result, 'holds');
assert.equal(bumped.loyalty, 8);

faces = [6, 6];
const fanatic = loyaltyCheck({ score: 12, adjustment: -2, combat: false, rollDie: () => faces.shift() });
assert.equal(fanatic.target, 10);
assert.equal(fanatic.result, 'leaves');
assert.equal(fanatic.loyalty, 12);

assert.equal(specialistCost('Engineer').cost, 750);
assert.equal(specialistCost('Animal Trainer', 400).cost, 400);
assert.equal(specialistCost('Animal Trainer', 100).error != null, true);
assert.equal(mercenaryOffer('Heavy Foot, Dwarf', 2, 10).cost, 120);
assert.equal(mercenaryOffer('Heavy Foot, Dwarf', 2, 10).morale, 9);
assert.equal(mercenaryOffer('Captain', 1, 1).error != null, true);

console.log('hirelings ok');
