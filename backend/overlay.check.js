/**
 * Enhanced is an overlay on Core: identical rows are gone, omissions inherit,
 * and the unused misspelled ability is gone from both catalogs.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  DROP_ABILITY_DESCRIPTIONS,
  norm,
  payload,
  planOverlay,
  pendingDrops,
  readGamesystem,
} = require('./overlay');

assert.equal(norm('a\r\n\r\n\r\nb', 'description'), 'a b');
assert.equal(norm(null, 'description'), null);
assert.equal(norm(undefined, 'perday'), 0);
assert.equal(norm(false, 'is_quasi'), false);
assert.equal(norm(undefined, 'is_quasi'), false);

const fields = ['name', 'description'];
const ignore = new Set(['id', 'modified']);
assert.equal(
  payload({ name: 'Fighter', description: 'a\r\n\r\nb', id: 1 }, ignore, fields),
  payload({ name: 'Fighter', description: 'a b' }, ignore, fields)
);
assert.notEqual(
  payload({ name: 'Fighter', description: 'different' }, ignore, fields),
  payload({ name: 'Fighter', description: 'a b' }, ignore, fields)
);

const coreDir = path.join(__dirname, '..', 'GameSystems', 'BasicFantasy_Core');
const childDir = path.join(__dirname, '..', 'GameSystems', 'BasicFantasy_Enhanced');
const plan = planOverlay(coreDir, childDir);

assert.equal(pendingDrops(plan), 0);
assert.equal(readGamesystem(childDir).parent_ruleset, 'Basic Fantasy Core');
assert.equal(readGamesystem(coreDir).parent_ruleset, undefined);
assert.ok(plan.keep.CLASSES.some((row) => row.name === 'Archer'));
assert.ok(!plan.keep.CLASSES.some((row) => row.name === 'Fighter'));
assert.ok(!plan.keep.CLASSES.some((row) => row.name === 'Cleric'));
assert.ok(!plan.keep.RACES.some((row) => row.name === 'Dwarf'));
assert.equal(plan.keep.SPELLS.length, 0);
assert.equal(plan.keep.ITEMS.length, 0);
assert.equal(plan.keep.ABILITIES.length, 0);
assert.ok(plan.keep.RACE_ABILITIES.some((row) => norm(row.race_id) === 1));
assert.ok(plan.keep.CLASS_ABILITIES.some((row) => norm(row.class_id) === 4));

function idSet(rows) {
  return new Set(rows.map((row) => norm(row.id)));
}
function assertResolvable(rows, field, childRows, coreRows, label) {
  const childIds = idSet(childRows);
  const coreIds = idSet(coreRows);
  for (const row of rows) {
    const id = norm(row[field]);
    assert.ok(childIds.has(id) || coreIds.has(id), `${label} ${id} is not in the child or the parent`);
  }
}
assertResolvable(plan.keep.CLASS_ABILITIES, 'class_id', plan.keep.CLASSES, plan.core.CLASSES, 'class');
assertResolvable(plan.keep.CLASS_ABILITIES, 'ability_id', plan.keep.ABILITIES, plan.core.ABILITIES, 'ability');
assertResolvable(plan.keep.CLASS_LEVELING, 'class_id', plan.keep.CLASSES, plan.core.CLASSES, 'class');
assertResolvable(plan.keep.CLASS_SPELLS, 'class_id', plan.keep.CLASSES, plan.core.CLASSES, 'class');
assertResolvable(plan.keep.RACE_ABILITIES, 'race_id', plan.keep.RACES, plan.core.RACES, 'race');
assertResolvable(plan.keep.RACE_ABILITIES, 'ability_id', plan.keep.ABILITIES, plan.core.ABILITIES, 'ability');
assertResolvable(plan.keep.SPELL_CLASS, 'class_id', plan.keep.CLASSES, plan.core.CLASSES, 'class');
assertResolvable(plan.keep.SPELL_CLASS, 'spell_id', plan.keep.SPELLS, plan.core.SPELLS, 'spell');

const coreAbilities = fs.readFileSync(path.join(coreDir, 'ABILITIES.json'), 'utf8');
const childTree = fs.readdirSync(childDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => fs.readFileSync(path.join(childDir, name), 'utf8'))
  .join('\n');
for (const text of DROP_ABILITY_DESCRIPTIONS) {
  assert.equal(coreAbilities.includes(text), false, text);
  assert.equal(childTree.includes(text), false, text);
}
assert.equal(childTree.includes('Turn undead - consult GM'), false);

console.log('overlay ok');
