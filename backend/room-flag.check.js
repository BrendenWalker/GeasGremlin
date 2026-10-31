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
  gm_text: 'Secret pit',
});
assert.deepEqual(Object.keys(shown).sort(), ['exits', 'location_name', 'objectives']);
assert.deepEqual(shown.exits, []);
assert.equal(shown.location_name, 'Cave');
assert.equal(Object.hasOwn(shown, 'flags'), false);
assert.equal(Object.hasOwn(shown, 'summary'), false);
assert.equal(Object.hasOwn(shown, 'gm_text'), false);
assert.deepEqual(shown.objectives, [{ id: 3, body: 'Find the chest', status: 'open' }]);
const hiddenGoal = playerHere({
  location_name: 'Cistern Heart',
  objectives: [
    { id: 1, body: 'The cistern is a tomb', status: 'open', known: false },
    { id: 2, body: 'Get the mill turning', status: 'open', known: true },
  ],
  clues: [{ body: 'The slab is a burial.' }],
  thread: { title: 'Water crisis', premise: 'Neither step has to come first.' },
});
assert.equal(JSON.stringify(hiddenGoal).includes('tomb'), false);
assert.equal(JSON.stringify(hiddenGoal).includes('burial'), false);
assert.equal(JSON.stringify(hiddenGoal).includes('Water crisis'), false);
assert.deepEqual(hiddenGoal.objectives, [{ id: 2, body: 'Get the mill turning', status: 'open' }]);
assert.equal(playerHere({}).location_name, null);
assert.deepEqual(playerHere({}).objectives, []);
assert.deepEqual(playerHere({}).exits, []);

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
