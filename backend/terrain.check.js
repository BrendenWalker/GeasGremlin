const assert = require('assert');
const { TERRAINS, locationTerrain } = require('./terrain');

assert.equal(TERRAINS.length, 8);
assert.equal(TERRAINS.find((row) => row.name === 'Road').movement_pct, 0);
assert.equal(TERRAINS.find((row) => row.name === 'Forest').movement_pct, -33);
assert.equal(TERRAINS.find((row) => row.name === 'Jungle').movement_pct, -50);

assert.equal(locationTerrain('outside', 'Forest', -33).movement_pct, -33);
assert.deepEqual(locationTerrain('outside', ' Forest ', 10), { terrain: 'Forest', movement_pct: 10 });
assert.equal(locationTerrain('outside', 'Road', 0).movement_pct, 0);
assert.equal(locationTerrain('outside', 'Mountains', '-50').movement_pct, -50);
assert.equal(locationTerrain('outside', 'Clear', -100).movement_pct, -100);
assert.equal(locationTerrain('outside', 'Clear', 200).movement_pct, 200);
assert.deepEqual(locationTerrain('outside', null, null), { terrain: null, movement_pct: null });
assert.deepEqual(locationTerrain('outside', '  ', ''), { terrain: null, movement_pct: null });
assert.deepEqual(locationTerrain('inside', 'Forest', -33), { terrain: null, movement_pct: null });

assert.equal(locationTerrain('outside', 'Forest', null).error, 'Outside terrain needs a name and a movement percent');
assert.equal(locationTerrain('outside', null, 10).error, 'Outside terrain needs a name and a movement percent');
assert.equal(locationTerrain('outside', 'City', 0).error, 'Unknown terrain');
assert.equal(locationTerrain('outside', 'Swamp', 201).error, 'Movement percent must be an integer from -100 to 200');
assert.equal(locationTerrain('outside', 'Swamp', -101).error, 'Movement percent must be an integer from -100 to 200');
assert.equal(locationTerrain('outside', 'Swamp', 1.5).error, 'Movement percent must be an integer from -100 to 200');
assert.equal(locationTerrain('up', 'Clear', 0).error, 'place must be outside or inside');

console.log('terrain ok');
