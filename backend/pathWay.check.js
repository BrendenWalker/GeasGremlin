const assert = require('assert');
const { pathsAt, pathDestination } = require('./pathWay');

const stair = { id: 1, from_location_id: 10, to_location_id: 20, one_way: false };
const drop = { id: 2, from_location_id: 20, to_location_id: 30, one_way: true };
const loose = { id: 3, from_location_id: null, to_location_id: 20, one_way: false };
const rows = [stair, drop, loose];

assert.deepEqual(pathsAt(rows, 10).map((row) => row.id), [1]);
assert.deepEqual(pathsAt(rows, 20).map((row) => row.id), [1, 2]);
assert.deepEqual(pathsAt(rows, 30).map((row) => row.id), []);
assert.deepEqual(pathsAt(rows, null).map((row) => row.id), [3]);
assert.deepEqual(pathDestination(stair, true), { locationId: 10 });
assert.deepEqual(pathDestination(stair, false), { locationId: 20 });
assert.deepEqual(pathDestination(drop, true), { error: 'That path is one way' });
assert.deepEqual(pathDestination(loose, true), { error: 'That path has no way back' });

console.log('path way ok');
