const assert = require('assert');
const { MIN_DELTA, MAX_DELTA, adjustedCopper } = require('./shopPrice');

assert.equal(MIN_DELTA, -100);
assert.equal(MAX_DELTA, 1000);
assert.equal(adjustedCopper(2000, 0), 2000);
assert.equal(adjustedCopper(2000, 20), 2400);
assert.equal(adjustedCopper(2000, -50), 1000);
assert.equal(adjustedCopper(700, 10), 770);
assert.equal(adjustedCopper(1, 50), 2);
assert.equal(adjustedCopper(1, -50), 1);
assert.equal(adjustedCopper(2000, -100), 0);
assert.equal(adjustedCopper(null, 0), null);
assert.equal(adjustedCopper(1.5, 0), null);
assert.equal(adjustedCopper(-1, 0), null);
assert.equal(adjustedCopper(100, -101), null);
assert.equal(adjustedCopper(100, 1001), null);

console.log('shop price ok');
