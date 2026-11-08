const assert = require('assert');
const fs = require('fs');
const path = require('path');
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

const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
assert.equal(schemaSql.includes('world_true boolean NOT NULL DEFAULT true'), true);
assert.equal(schemaSql.includes('ADD COLUMN IF NOT EXISTS world_true boolean'), true);

const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert.equal(serverSrc.includes('world_true'), true);
assert.equal(/discovered[\s\S]*world_true/.test(serverSrc), true);

const morgansfort = fs.readFileSync(path.join(__dirname, 'scripts', 'seed-morgansfort.js'), 'utf8');
assert.equal(morgansfort.includes('Treat as true for this campaign'), false);
assert.equal(morgansfort.includes('falseRumor ? \'False.\''), false);
assert.equal(morgansfort.includes('world_true'), true);
assert.equal(morgansfort.includes('!rumor.falseRumor'), true);

console.log('clue world_true ok');
