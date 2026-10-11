const assert = require('assert');
const {
  abilityModifier,
  hitDiceCount,
  resolveUndead,
  rollInitiative,
  rollMorale,
  rollReaction,
  rollSurprise,
  rollTurn,
  surpriseRange,
  turnTarget,
} = require('./encounterDice');

function scripted(faces) {
  const pending = faces.slice();
  return (sides) => {
    const face = pending.shift();
    assert.ok(face >= 1 && face <= sides, `rolled ${face} on d${sides}`);
    return face;
  };
}

assert.equal(abilityModifier(3), -3);
assert.equal(abilityModifier(9), 0);
assert.equal(abilityModifier(16), 2);
assert.equal(abilityModifier(18), 3);
assert.equal(abilityModifier(null), 0);

assert.equal(surpriseRange(false, false), 2);
assert.equal(surpriseRange(true, false), 4);
assert.equal(surpriseRange(true, true), 3);
assert.equal(surpriseRange(false, true), 1);

const door = rollSurprise({
  party: [
    { id: 1, name: 'Darion', lessLikely: false },
    { id: 2, name: 'Morningstar', lessLikely: true },
  ],
  enemies: [{ id: 9, name: 'Goblins', lessLikely: false }],
  partyAmbushed: false,
  enemiesAmbushed: false,
  rollDie: scripted([2, 1]),
});
assert.equal(door.party.roll, 2);
assert.equal(door.party.actors[0].surprised, true);
assert.equal(door.party.actors[1].surprised, false);
assert.equal(door.party.skips, false);
assert.equal(door.enemies.skips, true);

const ambush = rollSurprise({
  party: [
    { id: 1, name: 'Darion', lessLikely: false },
    { id: 2, name: 'Morningstar', lessLikely: true },
  ],
  enemies: [],
  partyAmbushed: true,
  enemiesAmbushed: false,
  rollDie: scripted([4]),
});
assert.equal(ambush.party.actors[0].surprised, true);
assert.equal(ambush.party.actors[0].range, 4);
assert.equal(ambush.party.actors[1].surprised, false);
assert.equal(ambush.party.actors[1].range, 3);
assert.equal(ambush.enemies.roll, null);

assert.equal(rollSurprise({ party: [], enemies: [], rollDie: scripted([]) }).error, 'nobody to surprise');

assert.equal(rollReaction({ bonus: 1, adjustment: 0, rollDie: scripted([6, 6]) }).result, 'Very Favorable');
assert.equal(rollReaction({ bonus: -1, adjustment: 0, rollDie: scripted([1, 1]) }).total, 1);
assert.equal(rollReaction({ bonus: -1, adjustment: 0, rollDie: scripted([1, 1]) }).result, 'Immediate Attack');
assert.equal(rollReaction({ bonus: 0, adjustment: 0, rollDie: scripted([3, 3]) }).result, 'Unfavorable');
assert.equal(rollReaction({ bonus: 0, adjustment: 0, rollDie: scripted([4, 4]) }).result, 'Favorable');
assert.equal(rollReaction({ bonus: 0, adjustment: 0, rollDie: scripted([6, 5]) }).result, 'Favorable');
assert.equal(rollReaction({ bonus: 0, adjustment: 0, rollDie: scripted([6, 6]) }).result, 'Very Favorable');
assert.equal(rollReaction({ bonus: 0, adjustment: 11, rollDie: scripted([]) }).error, 'reaction adjustment must be from -10 to 10');

const order = rollInitiative({
  actors: [
    { id: 1, name: 'Halfling', side: 'party', bonus: 3 },
    { id: 9, name: 'Goblins', side: 'enemy', bonus: 0 },
  ],
  rollDie: scripted([4, 6]),
});
assert.equal(order.order[0].actors[0].name, 'Halfling');
assert.equal(order.order[0].total, 7);
assert.equal(order.order[0].together, false);
assert.equal(order.order[1].actors[0].name, 'Goblins');

const tied = rollInitiative({
  actors: [
    { id: 1, name: 'Ada', side: 'party', bonus: 0 },
    { id: 2, name: 'Bo', side: 'party', bonus: 1 },
  ],
  rollDie: scripted([4, 3]),
});
assert.equal(tied.order.length, 1);
assert.equal(tied.order[0].together, true);
assert.equal(tied.order[0].total, 4);

const fearless = rollMorale({ score: 12, adjustment: 2, rollDie: scripted([6, 6]) });
assert.equal(fearless.adjustment, 0);
assert.equal(fearless.target, 12);
assert.equal(fearless.result, 'holds');

const shaken = rollMorale({ score: 9, adjustment: -2, rollDie: scripted([4, 4]) });
assert.equal(shaken.target, 7);
assert.equal(shaken.result, 'flees');
assert.equal(rollMorale({ score: 9, adjustment: -2, rollDie: scripted([3, 4]) }).result, 'holds');
assert.equal(rollMorale({ score: 9, adjustment: 3, rollDie: scripted([]) }).error, 'morale adjustment must be from -2 to 2');
assert.equal(rollMorale({ score: null, adjustment: 0, rollDie: scripted([]) }).error, 'morale must be from 2 to 12');

assert.equal(hitDiceCount('3*'), 3);
assert.equal(hitDiceCount('1/2*'), 1);
assert.equal(hitDiceCount('7+1**'), 7);
assert.equal(hitDiceCount('2* to 4*'), null);

const ghoul = resolveUndead('Ghoul', '2*');
assert.equal(ghoul.column, 2);
assert.equal(ghoul.hitDice, 2);
assert.equal(ghoul.label, 'Ghoul');
const zombraire = resolveUndead('Zombraire', '2*');
assert.equal(zombraire.column, 1);
assert.equal(zombraire.label, '2 Hit Dice');
assert.equal(resolveUndead('Bones', null).error, 'hit dice must be from 1 to 100');
assert.equal(resolveUndead('Bones', null, 4).column, 3);

assert.equal(turnTarget(1, 0), 13);
assert.equal(turnTarget(2, 1), 15);
assert.equal(turnTarget(2, 3), 20);
assert.equal(turnTarget(8, 0), 'T');
assert.equal(turnTarget(11, 0), 'D');
assert.equal(turnTarget(1, 8), 'No');
assert.equal(turnTarget(10, 7), 20);
assert.equal(turnTarget(20, 8), 7);

const pair = rollTurn({
  level: 2,
  groups: [
    { id: 1, name: 'Zombie', column: 1, label: 'Zombie', count: 2, hitDice: 2 },
    { id: 2, name: 'Wight', column: 3, label: 'Wight', count: 1, hitDice: 3 },
  ],
  rollDie: scripted([20, 3, 4]),
});
assert.equal(pair.roll, 20);
assert.equal(pair.hd.total, 7);
assert.equal(pair.groups[0].turned, 2);
assert.equal(pair.groups[1].turned, 1);
assert.equal(pair.block, false);
assert.equal(pair.retry, false);

const partial = rollTurn({
  level: 2,
  groups: [
    { id: 1, name: 'Zombie', column: 1, label: 'Zombie', count: 2, hitDice: 2 },
    { id: 2, name: 'Wight', column: 3, label: 'Wight', count: 1, hitDice: 3 },
  ],
  rollDie: scripted([15, 3, 4]),
});
assert.equal(partial.groups[0].passed, true);
assert.equal(partial.groups[0].turned, 2);
assert.equal(partial.groups[1].passed, false);
assert.equal(partial.groups[1].checked, true);
assert.equal(partial.block, true);
assert.equal(partial.retry, false);

const miss = rollTurn({
  level: 2,
  groups: [{ id: 1, name: 'Zombie', column: 1, label: 'Zombie', count: 2, hitDice: 2 }],
  rollDie: scripted([14]),
});
assert.equal(miss.hd, null);
assert.equal(miss.block, true);
assert.equal(miss.groups[0].turned, 0);

const one = rollTurn({
  level: 2,
  groups: [{ id: 2, name: 'Wight', column: 3, label: 'Wight', count: 2, hitDice: 3 }],
  rollDie: scripted([20, 1, 1]),
});
assert.equal(one.groups[0].turned, 1);
assert.equal(one.retry, true);
assert.equal(one.block, false);

const blasted = rollTurn({
  level: 11,
  groups: [{ id: 1, name: 'Skeleton', column: 0, label: 'Skeleton', count: 1, hitDice: 1 }],
  rollDie: scripted([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
});
assert.equal(blasted.groups[0].target, 'D');
assert.equal(blasted.groups[0].turned, 1);
assert.equal(blasted.damage.total, 11);
assert.equal(blasted.block, false);

const impossible = rollTurn({
  level: 1,
  groups: [{ id: 1, name: 'Ghost', column: 8, label: 'Ghost', count: 1, hitDice: 10 }],
  rollDie: scripted([20]),
});
assert.equal(impossible.groups[0].target, 'No');
assert.equal(impossible.hd, null);
assert.equal(impossible.block, true);
