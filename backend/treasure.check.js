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

const noted = rollTreasure(
  { cp: { percent: 100, dice: '1d6', multiplier: 100 }, magic: '30% any 3' },
  scripted([1, 4])
);
assert.deepEqual(noted.lines, [{ column: 'cp', amount: 400 }]);
assert.equal(noted.error, undefined);

const lookup = rollTreasure({ tables: { value: [] } }, () => {
  throw new Error('a note was rolled');
});
assert.deepEqual(lookup.lines, []);

assert.equal(
  rollTreasure({ magic: { percent: 30, dice: '1d6' } }, scripted([])).error,
  'treasure note magic must be text'
);

const fs = require('fs');
const path = require('path');
const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'GameSystems', 'BasicFantasy_Core', 'TREASURE_TYPES.json'), 'utf8')
);
const types = catalog.TREASURE_TYPES;
assert.equal(types.length, 30);
const alwaysOne = () => 1;
for (const type of types) {
  const rolled = rollTreasure(type.DEFINITION, alwaysOne);
  assert.equal(rolled.error, undefined, `${type.CODE} ${rolled.error}`);
}
const byCode = Object.fromEntries(types.map((type) => [type.CODE, type.DEFINITION]));
assert.equal(byCode.A.cp.multiplier, 100);
assert.equal(byCode.G.gp.multiplier, 1000);
assert.equal(byCode.G.gp.dice, '4d6');
assert.equal(byCode.P.cp.percent, 100);
assert.equal(byCode.P.cp.multiplier, undefined);
assert.deepEqual(rollTreasure(byCode.H, alwaysOne).lines, []);
assert.deepEqual(rollTreasure(byCode.GEMS, alwaysOne).lines, []);
assert.deepEqual(rollTreasure(byCode.MAGIC, alwaysOne).lines, []);
const typeA = rollTreasure(byCode.A, alwaysOne);
assert.deepEqual(
  typeA.lines.map((line) => line.column),
  ['cp', 'sp', 'ep', 'gp', 'pp', 'gems', 'jewelry']
);

console.log('treasure ok');
