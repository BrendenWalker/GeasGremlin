const assert = require('assert');
const { visitCheckDue, visitAlreadyFired, emptyCheckResult, currentVisitCheck } = require('./empty-check');

const inside = 1800;
const cave = 1200;

assert.equal(visitCheckDue(0, inside - 1, inside, false, false), false);
assert.equal(visitCheckDue(0, inside, inside, false, false), true);
assert.equal(visitCheckDue(0, cave, cave, false, false), true);
assert.equal(visitCheckDue(0, cave, cave, false, true), false);
assert.equal(visitCheckDue(null, inside, inside, false, false), false);
assert.equal(visitCheckDue(0, inside, inside, true, false), false);

const firstVisit = [{ kind: 'visit', at_seconds: inside, id: 4 }];
assert.equal(visitAlreadyFired(firstVisit, 0), true);
assert.equal(visitCheckDue(0, inside * 2, inside, visitAlreadyFired(firstVisit, 0), false), false);
assert.equal(visitAlreadyFired(firstVisit, null), false);
assert.equal(visitAlreadyFired(firstVisit, 4000), false);
assert.equal(visitCheckDue(4000, 4000 + cave, cave, visitAlreadyFired(firstVisit, 4000), false), true);
assert.equal(currentVisitCheck(firstVisit, 4000), null);

const pool = [
  { id: 2, name: 'Orc', hp: 3, disposition: 'fled', monster_id: null },
  { id: 1, name: 'Goblin', hp: 0, disposition: 'present', monster_id: 9 },
  { id: 3, name: 'Wolf', hp: 5, disposition: 'present', monster_id: 4 },
];
const before = JSON.stringify(pool);
const named = emptyCheckResult(pool, 1);
assert.equal(named.outcome, 'named');
assert.equal(named.name, 'Wolf');
assert.equal(named.monster_id, 4);
assert.equal(pool.length, 3);
assert.equal(JSON.stringify(pool), before);
assert.equal(Object.hasOwn(named, 'creatures'), false);

const deadOnly = [{ id: 1, name: 'Goblin', hp: 0, disposition: 'present', monster_id: 9 }];
const none = emptyCheckResult(deadOnly, 1);
assert.equal(none.outcome, 'none');
assert.equal(none.name, null);
assert.equal(deadOnly.length, 1);

const missed = emptyCheckResult(pool, 2);
assert.equal(missed.outcome, 'miss');
assert.equal(missed.name, null);
assert.equal(pool.length, 3);

const fled = [{ id: 8, name: 'Bat', hp: 1, disposition: 'fled', monster_id: null }];
assert.equal(emptyCheckResult(fled, 1).name, 'Bat');
assert.equal(fled.length, 1);
assert.equal(emptyCheckResult([], 1).outcome, 'none');

const shown = currentVisitCheck([
  { kind: 'wander', id: 9, at_seconds: 9000, check_die: 6, check_roll: 1, label: 'Wolves', location_name: 'Cave' },
  { kind: 'visit', id: 3, at_seconds: inside, check_die: 6, check_roll: 1, label: 'Wolf', location_name: 'Cave' },
], 0);
assert.equal(shown.outcome, 'named');
assert.equal(shown.name, 'Wolf');
const quiet = currentVisitCheck([
  { kind: 'visit', id: 5, at_seconds: inside, check_die: 6, check_roll: 1, label: null, location_name: 'Cave' },
], 0);
assert.equal(quiet.outcome, 'none');
const missRow = currentVisitCheck([
  { kind: 'visit', id: 6, at_seconds: inside, check_die: 6, check_roll: 4, label: null, location_name: 'Cave' },
], 0);
assert.equal(missRow.outcome, 'miss');

console.log('empty check ok');
