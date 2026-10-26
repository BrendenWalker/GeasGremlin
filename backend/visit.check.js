const assert = require('assert');
const { nextVisitStamp, visitTurns, arrivedAfterSelect } = require('./visit');

assert.equal(visitTurns(0, 0), 0);
assert.equal(visitTurns(599, 0), 0);
assert.equal(visitTurns(600, 0), 1);
assert.equal(visitTurns(1800, 0), 3);
assert.equal(visitTurns(4 * 600, 0), 4);
assert.equal(visitTurns(18 * 600, 0), 18);
assert.equal(visitTurns(18 * 600 + 599, 0), 18);
assert.equal(visitTurns(19 * 600, 0), 19);
assert.equal(visitTurns(5000, null), null);
assert.equal(visitTurns(1000, 1000), 0);
assert.equal(visitTurns(1200, 0, 600), 2);

const kept = nextVisitStamp('Caves', 'Caves', 2400, 600);
assert.equal(kept, 600);
assert.equal(visitTurns(2400, kept), 3);
assert.equal(nextVisitStamp(' Caves ', 'Caves', 2400, 600), 600);

assert.equal(nextVisitStamp('Caves', null, 2400, 600), null);
assert.equal(nextVisitStamp('Caves', '   ', 2400, 600), null);
assert.equal(nextVisitStamp(null, null, 100, null), null);

const again = nextVisitStamp(null, 'Caves', 3000, null);
assert.equal(again, 3000);
assert.equal(visitTurns(3000, again), 0);
assert.equal(visitTurns(3600, again), 1);
assert.equal(nextVisitStamp('Caves', 'Fort', 2400, 600), 2400);
assert.equal(nextVisitStamp(null, 'Caves', 0, null), 0);

const firstArrival = arrivedAfterSelect(null, 0);
assert.equal(firstArrival, 0);
const left = nextVisitStamp('Caves', null, 2400, 0);
assert.equal(left, null);
assert.equal(arrivedAfterSelect(firstArrival, 2400), firstArrival);
const back = nextVisitStamp(null, 'Caves', 3000, left);
assert.equal(back, 3000);
assert.equal(visitTurns(3000, back), 0);
assert.equal(arrivedAfterSelect(firstArrival, 3000), firstArrival);

console.log('site visit ok');
