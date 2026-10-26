const assert = require('assert');
const { STAGES, stageById, suggestedNext, stageList } = require('./situation');

const ids = [
  'setup',
  'location_intro',
  'exploration',
  'encounter',
  'resolution',
  'transition',
  'rest_or_session_end',
  'conclusion',
];

assert.deepEqual(STAGES.map((stage) => stage.id), ids);

for (const stage of STAGES) {
  assert.equal(stage.prompt.length, 3, stage.id);
  for (const line of stage.prompt) {
    assert.equal(typeof line, 'string');
    assert.ok(line.length > 0, stage.id);
  }
  for (const next of stage.next) {
    assert.ok(stageById(next), `${stage.id} suggests ${next}`);
  }
}

assert.deepEqual(suggestedNext('exploration'), ['exploration', 'encounter', 'resolution', 'transition']);
assert.ok(suggestedNext('exploration').includes('exploration'));
assert.deepEqual(suggestedNext('conclusion'), []);
assert.equal(suggestedNext('nope'), null);
assert.equal(stageById('nope'), null);

const listed = stageList();
assert.equal(listed.length, ids.length);
assert.deepEqual(listed.map((stage) => stage.id), ids);
assert.notEqual(listed[2].prompt, STAGES[2].prompt);
listed[2].next.push('setup');
assert.deepEqual(suggestedNext('exploration'), ['exploration', 'encounter', 'resolution', 'transition']);

console.log('situation stages ok');
