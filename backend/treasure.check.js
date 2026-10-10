const assert = require('assert');
const { rollTreasure } = require('./treasure');

function scripted(faces) {
  const pending = faces.slice();
  return (sides) => {
    const face = pending.shift();
    assert.ok(face >= 1 && face <= sides, `rolled ${face} on d${sides}`);
    return face;
  };
}

const miss = rollTreasure({ gp: { percent: 50, dice: '1d6' } }, scripted([51]));
assert.deepEqual(miss.lines, []);

const hit = rollTreasure({ gp: { percent: 50, dice: '1d6' } }, scripted([50, 4]));
assert.deepEqual(hit.lines, [{ column: 'gp', amount: 4 }]);

const multiplied = rollTreasure(
  { cp: { percent: 100, dice: '2d6', multiplier: 10 } },
  scripted([100, 2, 3])
);
assert.deepEqual(multiplied.lines, [{ column: 'cp', amount: 50 }]);

const suffix = rollTreasure({ sp: { percent: 100, dice: '1d6x100' } }, scripted([1, 6]));
assert.deepEqual(suffix.lines, [{ column: 'sp', amount: 600 }]);

const empty = rollTreasure({}, scripted([]));
assert.deepEqual(empty.lines, []);

assert.equal(
  rollTreasure({ gp: { percent: 100, dice: '1d6x10', multiplier: 10 } }, scripted([])).error,
  'treasure column gp has two multipliers'
);
assert.equal(rollTreasure([], scripted([])).error, 'Treasure type definition must be an object');
assert.equal(
  rollTreasure({ gp: { percent: 100, dice: '1d1' } }, scripted([])).error,
  'treasure column gp dice sides must be from 2 to 100'
);

console.log('treasure ok');
