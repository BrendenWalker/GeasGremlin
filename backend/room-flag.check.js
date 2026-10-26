const assert = require('assert');
const { FLAG_STATES, readFlag, playerHere, placeAfterFight } = require('./room-flag');

assert.deepEqual(FLAG_STATES, ['sprung', 'taken', 'found']);

const pit = readFlag('  pit  ', ' SPRUNG ');
assert.equal(pit.note, 'pit');
assert.equal(pit.state, 'sprung');
assert.equal(readFlag('chest', 'taken').state, 'taken');
assert.equal(readFlag('secret door', 'Found').state, 'found');

assert.equal(readFlag('', 'sprung').error != null, true);
assert.equal(readFlag('   ', 'taken').error != null, true);
assert.equal(readFlag('pit', 'open').error != null, true);
assert.equal(readFlag('pit', '').error != null, true);
assert.equal(readFlag('x'.repeat(81), 'found').error != null, true);
assert.equal(readFlag('x'.repeat(80), 'found').note.length, 80);

const shown = playerHere({
  location_name: 'Cave',
  objectives: [{ id: '3', body: 'Find the chest', status: 'open', known: true }],
  flags: [{ id: 1, note: 'pit', state: 'sprung' }],
  summary: 'A damp cave',
  site: 'Caves',
});
assert.deepEqual(Object.keys(shown).sort(), ['location_name', 'objectives']);
assert.equal(shown.location_name, 'Cave');
assert.equal(Object.hasOwn(shown, 'flags'), false);
assert.equal(Object.hasOwn(shown, 'summary'), false);
assert.deepEqual(shown.objectives, [{ id: 3, body: 'Find the chest', status: 'open' }]);
assert.equal(playerHere({}).location_name, null);
assert.deepEqual(playerHere({}).objectives, []);

const flags = [{ id: 1, note: 'pit', state: 'sprung' }, { id: 2, note: 'chest', state: 'taken' }];
const before = JSON.stringify(flags);
const after = placeAfterFight({
  in_encounter: true,
  enemies: [{ id: 9, name: 'Orc' }],
  flags,
});
assert.equal(after.in_encounter, false);
assert.deepEqual(after.enemies, []);
assert.deepEqual(after.flags, flags);
assert.equal(JSON.stringify(flags), before);
after.flags[0].state = 'found';
assert.equal(flags[0].state, 'sprung');

console.log('room flag ok');
