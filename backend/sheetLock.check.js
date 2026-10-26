const assert = require('assert');
const { authoringRefused, sheetEditRefused } = require('./sheetLock');

assert.equal(authoringRefused(true, true), false);
assert.equal(authoringRefused(false, false), false);
assert.equal(authoringRefused(false, true), true);
assert.equal(authoringRefused(false, 't'), false);

assert.equal(sheetEditRefused(false, true, { hp: 3 }), true);
assert.equal(sheetEditRefused(false, true, { notes: 'found a door' }), false);
assert.equal(sheetEditRefused(false, true, { equipped_armor_id: 4 }), false);
assert.equal(sheetEditRefused(false, true, { level: 2 }), true);
assert.equal(sheetEditRefused(false, true, { hp: 3, name: 'Alden' }), true);
assert.equal(sheetEditRefused(false, true, { class: null }), true);
assert.equal(sheetEditRefused(false, true, { character_classes: [] }), true);
assert.equal(sheetEditRefused(false, true, { money: 0 }), true);
assert.equal(sheetEditRefused(true, true, { level: 2 }), false);
assert.equal(sheetEditRefused(false, false, { level: 2 }), false);
assert.equal(sheetEditRefused(false, true, null), false);

console.log('sheetLock ok');
