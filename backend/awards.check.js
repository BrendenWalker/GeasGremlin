const assert = require('assert');
const { awardLine, cappedAward, splitAward } = require('./awards');

const twoStar = awardLine({ hitDice: '2**', count: 1 });
assert.equal(twoStar.each, 125);
assert.equal(twoStar.subtotal, 125);
assert.equal(twoStar.asterisks, 2);

assert.equal(awardLine({ hitDice: '1', count: 2 }).subtotal, 50);
assert.equal(awardLine({ hitDice: '1/2*', count: 1 }).each, 13);
assert.equal(awardLine({ hitDice: '1-1', count: 1 }).each, 10);
assert.equal(awardLine({ hitDice: '26', count: 1 }).each, 9750);
assert.equal(awardLine({ hitDice: '26*', count: 1 }).each, 9750 + 350);

const npc = awardLine({ level: 2, spells: true, count: 1 });
assert.equal(npc.hd, 2);
assert.equal(npc.each, 100);

const larger = awardLine({ hitDice: '2*', level: 4, count: 1 });
assert.equal(larger.hd, 4);
assert.equal(larger.each, 280);

assert.equal(awardLine({ hitDice: '2* to 4*', count: 1 }).error, 'hit dice are a range');
assert.equal(awardLine({ count: 1 }).error, 'no hit dice');

const split = splitAward(2000, [
  { id: 1 },
  { id: 2 },
  { id: 3 },
  { id: 4 },
  { id: 5, retainer: true },
]);
assert.equal(split.full, 444);
assert.equal(split.half, 222);
assert.equal(split.shares[0].amount, 444);
assert.equal(split.shares[4].amount, 222);
assert.equal(splitAward(10, []).error, 'no one to award');

const thief = [
  { level: 1, xp: 0 },
  { level: 2, xp: 1250 },
  { level: 3, xp: 2500 },
];
const barthal = cappedAward(1000, 0, thief, 2000);
assert.equal(barthal.amount, 1499);
assert.equal(barthal.capped, true);
assert.equal(barthal.ceiling, 2499);
assert.equal(cappedAward(1000, 0, thief, 400).amount, 400);
assert.equal(cappedAward(1000, 1499, thief, 500).amount, 0);
assert.equal(cappedAward(0, 0, [], 80).amount, 80);

console.log('awards ok');
