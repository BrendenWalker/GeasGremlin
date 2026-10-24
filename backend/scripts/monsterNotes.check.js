/**
 * The r142 monster prose landed on every Core row.
 * No database. The file is the artifact.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '..', 'GameSystems', 'BasicFantasy_Core', 'MONSTERS.json');
const rows = JSON.parse(fs.readFileSync(file, 'utf8')).MONSTERS;
const notes = new Map(rows.map((row) => [row.NAME, row.NOTES || '']));

assert.equal(rows.length, 263);
for (const row of rows) {
  const text = notes.get(row.NAME);
  assert.ok(text.trim(), `${row.NAME} has no notes`);
  assert.ok(text.length <= 30000, `${row.NAME} notes are too long`);
  assert.ok(!text.includes('Armor Class:'), `${row.NAME} notes include a stat block`);
}

assert.match(notes.get('Camel'), /400 pounds/);
assert.match(notes.get('Basilisk'), /petrif/i);
assert.match(notes.get('Mule'), /longer-lived/);
assert.match(notes.get('Antelope'), /herd animals/i);
assert.match(notes.get('Dragon, Mountain (Red Dragon)'), /four legs/);
assert.match(notes.get('Dragon, Mountain (Red Dragon)'), /Dragon Breath/);
assert.match(notes.get('Dragon, Mountain (Red Dragon)'), /Age Category \| 1 \| 2 \| 3/);
assert.ok(!notes.get('Dragon Turtle').includes('four legs'));
assert.equal(notes.get('Hellhound, 3 HD'), notes.get('Hellhound, 7 HD'));
assert.equal(notes.get('Ant, Giant'), notes.get('Ant, Huge'));
assert.match(notes.get('Elemental, Air, Staff'), /Staff \| 8/);
assert.match(notes.get('Deceiver (Panther-Hydra), Greater'), /Greater Deceivers/);
assert.match(notes.get('Purple Worm'), /12 HD 1,975/);

console.log('monster notes ok');
