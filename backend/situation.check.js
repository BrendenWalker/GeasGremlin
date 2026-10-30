const assert = require('assert');
const { objectiveKnownAfterClue } = require('./reveal');

const goal = { id: 7, known: false };
const other = { id: 8, known: false };

assert.equal(objectiveKnownAfterClue(goal, { discovered: true, objective_id: 7 }), true);
assert.equal(objectiveKnownAfterClue(other, { discovered: true, objective_id: 7 }), false);
assert.equal(objectiveKnownAfterClue(goal, { discovered: true, objective_id: null }), false);
assert.equal(objectiveKnownAfterClue(goal, { discovered: false, objective_id: 7 }), false);
assert.equal(objectiveKnownAfterClue({ id: 7, known: true }, { discovered: false, objective_id: null }), true);
assert.equal(objectiveKnownAfterClue(null, { discovered: true, objective_id: 7 }), false);

console.log('clue reveal ok');
