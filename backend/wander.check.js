const assert = require('assert');
const { INSIDE_INTERVAL, OUTSIDE_INTERVAL, checksDue, checkHit, matchingRow, acceptRoll } = require('./wander');

assert.equal(OUTSIDE_INTERVAL, 14400);
assert.equal(INSIDE_INTERVAL, 1800);
assert.equal(INSIDE_INTERVAL * 8, OUTSIDE_INTERVAL);

const day = checksDue(0, 86400, OUTSIDE_INTERVAL);
assert.equal(day.count, 6);
assert.deepEqual(day.at, [14400, 28800, 43200, 57600, 72000, 86400]);
assert.equal(day.nextMark, 86400);

const partial = checksDue(0, 87400, INSIDE_INTERVAL);
assert.equal(partial.count, 48);
assert.equal(partial.at[0], 1800);
assert.equal(partial.at[47], 86400);
assert.equal(partial.nextMark, 86400);

const waiting = checksDue(100, 700, OUTSIDE_INTERVAL);
assert.equal(waiting.count, 0);
assert.deepEqual(waiting.at, []);
assert.equal(waiting.nextMark, 100);

assert.equal(checksDue(-1, 10, 10), null);
assert.equal(checksDue(10, 0, 10), null);
assert.equal(checkHit(1), true);
assert.equal(checkHit(2), false);
assert.equal(matchingRow([{ face_lo: 1, face_hi: 2, label: 'A' }, { face_lo: 3, face_hi: 6, label: 'B' }], 2).label, 'A');
assert.equal(matchingRow([{ face_lo: 1, face_hi: 1, label: 'A' }], 4), null);

assert.equal(acceptRoll(null).error, 'No roll to accept');
assert.equal(acceptRoll({ table_roll: null, label: 'Wolves' }).error, 'The last check missed');
assert.equal(acceptRoll({ table_roll: 3, label: 'Wolves', accepted: true }).error, 'That roll is already accepted');
assert.equal(acceptRoll({ table_roll: 3, label: '  ' }).error, 'That roll has no name');
const accepted = acceptRoll({
  table_roll: 3,
  label: ' Wolves ',
  monster_id: 9,
  quantity: ' 2d4 ',
  treasure_type: ' B ',
});
assert.deepEqual(accepted.enemy, {
  name: 'Wolves',
  monster_id: 9,
  quantity: '2d4',
  treasure_type: 'B',
});

console.log('wander ok');
