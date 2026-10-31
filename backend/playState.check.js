/**
 * Object facts for one playthrough. The database section rolls back.
 * It does not conclude a campaign and it does not commit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const repoEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(repoEnv)) require('dotenv').config({ path: repoEnv });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { playerHere } = require('./room-flag');
const { poolFromEnv } = require('./scripts/import-catalog');
const { resetCampaignRun } = require('./campaignLifecycle');
const {
  FACTS,
  LIST_FACTS_SQL,
  SET_FACT_SQL,
  RESTORE_FACTS_SQL,
  readStateCommand,
  waterFlowing,
  risingWaterPreview,
  readPreviewCommand,
  rejectRisingWater,
  applyRisingWater,
  waterStory,
  waterThread,
  listFacts,
  setFact,
  attachAuthoredFacts,
} = require('./playState');
const { openPreparedEncounter } = require('./preparedEncounter');

assert.deepEqual(FACTS.map((fact) => `${fact.subject_key}.${fact.state_key}`), [
  'waterwheel.blocked',
  'burial_slab.removed',
]);
assert.equal(FACTS.some((fact) => fact.state_key === 'water_flowing' || fact.subject_key === 'water_flowing'), false);
assert.equal(LIST_FACTS_SQL.includes('campaign_id = $1'), true);
assert.equal(LIST_FACTS_SQL.includes('campaign_run_id'), false);
assert.equal(SET_FACT_SQL.includes('campaign_id = $1'), true);
assert.equal(SET_FACT_SQL.includes('version = $6'), true);
assert.equal(SET_FACT_SQL.includes('campaign_run_id'), false);
assert.equal(RESTORE_FACTS_SQL.includes('value_json = base_value_json'), true);
assert.equal(RESTORE_FACTS_SQL.includes('DELETE'), false);

assert.equal(waterFlowing([]), null);
assert.equal(waterFlowing([
  { subject_key: 'waterwheel', state_key: 'blocked', value: true },
  { subject_key: 'burial_slab', state_key: 'removed', value: false },
]), false);
assert.equal(waterFlowing([
  { subject_key: 'waterwheel', state_key: 'blocked', value: false },
  { subject_key: 'burial_slab', state_key: 'removed', value: false },
]), false);
assert.equal(waterFlowing([
  { subject_key: 'waterwheel', state_key: 'blocked', value: false },
  { subject_key: 'burial_slab', state_key: 'removed', value: true },
]), true);
assert.equal(waterFlowing([
  { subject_key: 'waterwheel', state_key: 'blocked', value: true },
  { subject_key: 'burial_slab', state_key: 'removed', value: true },
]), false);

const risingPrepared = [{
  id: 7, title: 'Rising water', status: 'prepared', kind: 'environment', member_count: 0,
}];
const wheelBlocked = [
  { subject_key: 'waterwheel', state_key: 'blocked', value: true },
  { subject_key: 'burial_slab', state_key: 'removed', value: false },
];
const wheelFree = [
  { subject_key: 'waterwheel', state_key: 'blocked', value: false },
  { subject_key: 'burial_slab', state_key: 'removed', value: false },
];
const slabFirst = [
  { subject_key: 'waterwheel', state_key: 'blocked', value: false },
  { subject_key: 'burial_slab', state_key: 'removed', value: true },
];
assert.equal(risingWaterPreview(wheelBlocked, risingPrepared), null);
assert.equal(risingWaterPreview(wheelFree, risingPrepared).encounter_id, 7);
assert.equal(risingWaterPreview(wheelFree, risingPrepared).change, 'open');
assert.equal(risingWaterPreview(slabFirst, risingPrepared).encounter_id, 7);
assert.equal(waterFlowing(wheelFree), false);
assert.equal(waterFlowing(slabFirst), true);
assert.equal(risingWaterPreview(wheelFree, [{ ...risingPrepared[0], status: 'opened' }]), null);
assert.equal(risingWaterPreview(wheelFree, [{ ...risingPrepared[0], kind: 'combat' }]), null);
assert.equal(risingWaterPreview(wheelFree, [{ ...risingPrepared[0], member_count: 1 }]), null);
assert.equal(risingWaterPreview(wheelFree, [{ ...risingPrepared[0], members: [{ id: 1 }] }]), null);
assert.deepEqual(rejectRisingWater(), { changed: false });
assert.equal(readPreviewCommand({}).error, 'encounter_id is required');
assert.equal(readPreviewCommand({ encounter_id: 7 }).encounter_id, 7);

const storyPlaces = [
  { id: 1, name: 'Cistern Well' },
  { id: 2, name: 'Cistern Heart' },
  { id: 3, name: 'Cistern Deep' },
];
const storyFacts = [
  { subject_key: 'waterwheel', state_key: 'blocked', value: true, location_id: 1 },
  { subject_key: 'burial_slab', state_key: 'removed', value: false, location_id: 2 },
];
const risingAtDeep = [{
  id: 7, title: 'Rising water', status: 'prepared', kind: 'environment', member_count: 0, location_id: 3,
}];
assert.equal(waterStory(null, [], []), null);
assert.equal(waterStory([storyFacts[0]], risingAtDeep, storyPlaces), null);
const storyBefore = JSON.stringify(storyFacts);
const authoredStory = waterStory(storyFacts, risingAtDeep, storyPlaces);
assert.equal(JSON.stringify(storyFacts), storyBefore);
assert.equal(authoredStory.title, 'Water crisis');
assert.equal(authoredStory.now, 'Water is not flowing.');
assert.deepEqual(authoredStory.places.map((place) => [place.name, place.line]), [
  ['Cistern Well', 'The wheel is blocked.'],
  ['Cistern Heart', 'The slab is in place.'],
  ['Cistern Deep', 'Rising water is prepared.'],
]);
assert.deepEqual(authoredStory.links.map((link) => link.relation), ['requires', 'causes', 'relates to']);
assert.deepEqual(authoredStory.would, [
  'Clearing the wheel asks to open Rising water, and water stays still.',
  'Removing the slab does not ask to open Rising water, and water stays still.',
]);
const wheelFreeStory = waterStory([
  { subject_key: 'waterwheel', state_key: 'blocked', value: false, location_id: 1 },
  { subject_key: 'burial_slab', state_key: 'removed', value: false, location_id: 2 },
], risingAtDeep, storyPlaces);
assert.equal(wheelFreeStory.now, 'Water is not flowing. The wheel is free. Open Rising water.');
assert.deepEqual(wheelFreeStory.would, [
  'Blocking the wheel again drops the Rising water question, and water stays still.',
  'Removing the slab still asks to open Rising water, and water flows.',
]);
const flowingStory = waterStory([
  { subject_key: 'waterwheel', state_key: 'blocked', value: false, location_id: 1 },
  { subject_key: 'burial_slab', state_key: 'removed', value: true, location_id: 2 },
], risingAtDeep, storyPlaces);
assert.equal(flowingStory.now, 'Water is flowing. The wheel is free. Open Rising water.');
assert.deepEqual(flowingStory.would, [
  'Blocking the wheel again drops the Rising water question, and water stops.',
  'Putting the slab back leaves Rising water as it is, and water stops.',
]);
const openedStory = waterStory([
  { subject_key: 'waterwheel', state_key: 'blocked', value: false, location_id: 1 },
  { subject_key: 'burial_slab', state_key: 'removed', value: true, location_id: 2 },
], [{ ...risingAtDeep[0], status: 'opened' }], storyPlaces);
assert.equal(openedStory.now, 'Water is flowing.');
assert.equal(openedStory.places[2].line, 'Rising water is opened.');
assert.deepEqual(openedStory.would, [
  'Blocking the wheel again leaves Rising water as it is, and water stops.',
  'Putting the slab back leaves Rising water as it is, and water stops.',
]);
const slabFirstStory = waterStory([
  { subject_key: 'waterwheel', state_key: 'blocked', value: true, location_id: 1 },
  { subject_key: 'burial_slab', state_key: 'removed', value: true, location_id: 2 },
], risingAtDeep, storyPlaces);
assert.deepEqual(slabFirstStory.would, [
  'Clearing the wheel asks to open Rising water, and water flows.',
  'Putting the slab back leaves Rising water as it is, and water stays still.',
]);
const missingStory = waterStory(storyFacts, [], storyPlaces);
assert.equal(missingStory.places[2].line, 'That encounter is not on this campaign.');
assert.equal(missingStory.would[0], 'Clearing the wheel does not ask to open Rising water, and water stays still.');
const twoStory = waterStory(storyFacts, [
  risingAtDeep[0],
  { ...risingAtDeep[0], id: 8, location_id: 1 },
], storyPlaces);
assert.equal(twoStory.places.length, 4);
assert.equal(twoStory.would[0], 'Clearing the wheel does not ask to open Rising water, and water stays still.');
const namelessStory = waterStory([
  { subject_key: 'waterwheel', state_key: 'blocked', value: true },
  { subject_key: 'burial_slab', state_key: 'removed', value: false },
], [{ id: 7, title: 'Rising water', status: 'prepared', kind: 'environment', members: [] }], []);
assert.deepEqual(namelessStory.places.map((place) => place.name), ['Cistern Well', 'Cistern Heart', 'Rising water']);
assert.equal(namelessStory.would[0], 'Clearing the wheel asks to open Rising water, and water stays still.');

const burialClue = {
  id: 4, location_id: 2, body: 'The slab is a burial.', discovered: false, objective_id: 9,
};
const boneClue = {
  id: 5, location_id: 1, body: 'A thigh bone is jammed in the wheel.', discovered: false, objective_id: null,
};
const chalkClue = {
  id: 6, location_id: 8, body: 'Chalk marks a secret door on the landing.', discovered: false,
};
const tombGoal = { id: 9, location_id: 2, body: 'The cistern is a tomb', known: false, status: 'open' };
const millGoal = { id: 10, location_id: 1, body: 'Get the mill turning', known: true, status: 'open' };
const threadBefore = JSON.stringify([storyFacts, burialClue, tombGoal]);
const hiddenThread = waterThread(storyFacts, risingAtDeep, storyPlaces, [burialClue, boneClue, chalkClue], [tombGoal, millGoal]);
assert.equal(JSON.stringify([storyFacts, burialClue, tombGoal]), threadBefore);
assert.equal(hiddenThread.title, 'Water crisis');
assert.match(hiddenThread.premise, /Neither step has to come first/);
assert.equal(Object.hasOwn(hiddenThread, 'next'), false);
assert.equal(Object.hasOwn(hiddenThread, 'steps'), false);
assert.equal(Object.hasOwn(hiddenThread, 'faction'), false);
assert.deepEqual(hiddenThread.resources.map((place) => place.name), ['Cistern Well', 'Cistern Heart', 'Cistern Deep']);
assert.deepEqual(hiddenThread.outcomes, authoredStory.would);
assert.deepEqual(hiddenThread.knowledge.map((item) => [item.kind, item.text, item.party_known]), [
  ['clue', 'The slab is a burial.', false],
  ['clue', 'A thigh bone is jammed in the wheel.', false],
  ['objective', 'The cistern is a tomb', false],
]);
assert.equal(JSON.stringify(hiddenThread).includes('Chalk marks'), false);
assert.equal(JSON.stringify(hiddenThread).includes('Get the mill turning'), false);
assert.deepEqual(hiddenThread.questions, [
  'Has the wheel been cleared?',
  'Has the slab been removed?',
  'Has Rising water been opened?',
  'Has the party learned: The slab is a burial.?',
  'Has the party learned: A thigh bone is jammed in the wheel.?',
  'Does the party know: The cistern is a tomb?',
]);
const learnedThread = waterThread([
  { subject_key: 'waterwheel', state_key: 'blocked', value: false, location_id: 1 },
  { subject_key: 'burial_slab', state_key: 'removed', value: true, location_id: 2 },
], [{ ...risingAtDeep[0], status: 'opened' }], storyPlaces, [
  { ...boneClue, discovered: true },
  { ...burialClue, discovered: true },
], [{ ...tombGoal, known: true }]);
assert.deepEqual(learnedThread.questions, []);
assert.equal(learnedThread.knowledge[1].line, 'The party has learned it.');
assert.equal(learnedThread.knowledge[2].line, 'The party knows this goal.');
assert.deepEqual(learnedThread.outcomes, openedStory.would);
const quietThread = waterThread(storyFacts, [], storyPlaces, [], []);
assert.equal(quietThread.knowledge[0].line, 'No clue is recorded at the wheel or the slab.');
assert.equal(quietThread.questions.includes('Has Rising water been opened?'), false);
assert.equal(waterThread([storyFacts[0]], risingAtDeep, storyPlaces, [burialClue], [tombGoal]), null);
const knownGoalHiddenClue = waterThread(storyFacts, risingAtDeep, storyPlaces, [burialClue], [{ ...tombGoal, known: true }]);
assert.equal(knownGoalHiddenClue.questions.includes('Does the party know: The cistern is a tomb?'), false);
assert.equal(knownGoalHiddenClue.questions.includes('Has the party learned: The slab is a burial.?'), true);

const wheel = readStateCommand({
  subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: false, version: 1,
});
assert.equal(wheel.value, false);
assert.equal(wheel.version, 1);
assert.equal(readStateCommand({
  subject_type: 'object', subject_key: 'waterwheel', state_key: 'water_flowing', value: true, version: 1,
}).error, 'Unknown fact');
assert.equal(readStateCommand({
  subject_type: 'clue', subject_key: 'waterwheel', state_key: 'blocked', value: true, version: 1,
}).error, 'Unknown fact');
assert.equal(readStateCommand({
  subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: 'no', version: 1,
}).error, 'value must be true or false');
assert.equal(readStateCommand({
  subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: false, version: 0,
}).error, 'version must be a positive integer');

const shown = playerHere({
  location_name: 'Cistern Well',
  objectives: [],
  facts: [{ subject_key: 'waterwheel', value: true }],
  water_flowing: true,
  flags: [{ note: 'pit', state: 'sprung' }],
});
assert.equal(Object.hasOwn(shown, 'facts'), false);
assert.equal(Object.hasOwn(shown, 'water_flowing'), false);
assert.equal(Object.hasOwn(shown, 'flags'), false);

const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const hereAt = serverSource.indexOf("app.get('/api/campaigns/:campaignId/here'");
const hereEnd = serverSource.indexOf('// ==================== HEALTH', hereAt);
assert.ok(hereAt > 0 && hereEnd > hereAt);
const hereSource = serverSource.slice(hereAt, hereEnd);
assert.equal(hereSource.includes('campaign_state_value'), false);
assert.equal(hereSource.includes('playerHere'), true);
const stateGet = serverSource.indexOf("app.get('/api/campaigns/:campaignId/adventuring/state'");
const statePost = serverSource.indexOf("app.post('/api/campaigns/:campaignId/adventuring/state'");
const stateEnd = serverSource.indexOf("app.post('/api/campaigns/:campaignId/adventuring/preview/apply'", statePost);
assert.ok(stateGet > 0 && statePost > stateGet && stateEnd > statePost);
const stateRoutes = serverSource.slice(stateGet, stateEnd);
assert.equal((stateRoutes.match(/requireCampaign\(req, res, req\.params\.campaignId, true\)/g) || []).length, 2);
assert.equal(stateRoutes.includes('requireCampaign(req, res, req.params.campaignId, false)'), false);
const previewApply = serverSource.indexOf("app.post('/api/campaigns/:campaignId/adventuring/preview/apply'");
const previewReject = serverSource.indexOf("app.post('/api/campaigns/:campaignId/adventuring/preview/reject'");
const previewEnd = serverSource.indexOf("app.post('/api/campaigns/:campaignId/adventuring/bad-air/apply'", previewReject);
assert.ok(previewApply > 0 && previewReject > previewApply && previewEnd > previewReject);
const previewRoutes = serverSource.slice(previewApply, previewEnd);
assert.equal((previewRoutes.match(/requireCampaign\(req, res, req\.params\.campaignId, true\)/g) || []).length, 2);
assert.equal(previewRoutes.includes('applyRisingWater'), true);
assert.equal(previewRoutes.includes('openPreparedEncounter'), true);
const rejectRoute = serverSource.slice(previewReject, previewEnd);
assert.equal(rejectRoute.includes('rejectRisingWater()'), true);
assert.equal(rejectRoute.includes('INSERT'), false);
assert.equal(rejectRoute.includes('UPDATE'), false);
assert.equal(rejectRoute.includes('DELETE'), false);
assert.equal(hereSource.includes('rising_water'), false);
assert.equal(hereSource.includes('water_story'), false);
assert.equal(serverSource.includes('rising_water: risingWaterPreview'), true);
assert.equal(serverSource.includes('water_story: waterStory'), true);
const pageSource = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'AdventuringPage.jsx'), 'utf8');
assert.equal(pageSource.includes('board?.water_story'), true);
assert.equal(pageSource.includes('What would change'), true);
const storyFn = fs.readFileSync(path.join(__dirname, 'playState.js'), 'utf8');
const storyBody = storyFn.slice(storyFn.indexOf('function waterStory'), storyFn.indexOf('async function applyBadAir'));
assert.equal(storyBody.includes('INSERT'), false);
assert.equal(storyBody.includes('UPDATE'), false);
assert.equal(storyBody.includes('DELETE'), false);
assert.equal(storyFn.includes('campaign_thread'), false);
const threadBody = storyFn.slice(storyFn.indexOf('function waterThread'), storyFn.indexOf('async function applyBadAir'));
assert.equal(threadBody.includes('INSERT'), false);
assert.equal(threadBody.includes('UPDATE'), false);
assert.equal(threadBody.includes('DELETE'), false);
assert.equal((serverSource.match(/waterThread/g) || []).length, 2);
assert.equal(serverSource.includes('thread: waterThread'), true);
const playerMarkers = [
  "app.get('/api/campaigns/:campaignId/characters'",
  "app.delete('/api/campaigns/:campaignId/characters/:characterId'",
  "app.get('/api/campaigns/:campaignId/party'",
  "app.post('/api/campaigns/:campaignId/presence'",
  "app.get('/api/campaigns/:campaignId/here'",
  "app.get('/api/characters/:id'",
  "app.get('/api/characters/:characterId/transfers'",
];
for (const marker of playerMarkers) {
  const at = serverSource.indexOf(marker);
  assert.ok(at > 0, marker);
  const rest = serverSource.slice(at + marker.length);
  const end = rest.search(/\n(?:app\.|function |async function |const )/);
  assert.ok(end > 0, marker);
  const body = serverSource.slice(at, at + marker.length + end);
  for (const banned of ['campaign_clue', 'campaign_npc', 'campaign_state_value', 'water_story', 'waterThread', 'gm_text']) {
    assert.equal(body.includes(banned), false, `${marker} ${banned}`);
  }
}
assert.equal(hereSource.includes('known = true'), true);
assert.equal(hereSource.includes('thread'), false);
assert.equal(pageSource.includes('board.thread'), true);
assert.equal(pageSource.includes('What the party knows'), true);
assert.equal(pageSource.includes('does not require an order'), true);
const sheetSource = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'CharacterDetailPage.jsx'), 'utf8');
assert.equal(sheetSource.includes('water_story'), false);
assert.equal(sheetSource.includes('board?.thread'), false);
const playSource = fs.readFileSync(path.join(__dirname, 'playState.js'), 'utf8');
const previewFn = playSource.slice(
  playSource.indexOf('function risingWaterPreview'),
  playSource.indexOf('function readPreviewCommand')
);
assert.equal(previewFn.includes('burial_slab'), false);
assert.equal(previewFn.includes('water_flowing'), false);
const applyFn = playSource.slice(
  playSource.indexOf('async function applyRisingWater'),
  playSource.indexOf('function storedError')
);
assert.equal(applyFn.includes('campaign_log'), false);
assert.equal(applyFn.includes('game_seconds'), false);
assert.equal(applyFn.includes('openEncounter(client, campaignId, id)'), true);

const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
const tableAt = schema.indexOf('CREATE TABLE IF NOT EXISTS public.campaign_state_value');
assert.ok(tableAt > 0);
const tableSql = schema.slice(tableAt, schema.indexOf('CREATE INDEX IF NOT EXISTS idx_campaign_state_value_campaign', tableAt));
assert.equal(tableSql.includes('campaign_run_id'), false);
assert.equal(tableSql.includes('game_seconds'), false);
assert.equal(tableSql.includes('discovered'), false);
assert.equal(tableSql.includes('UNIQUE (campaign_id, subject_type, subject_key, state_key)'), true);
assert.equal(tableSql.includes('waterwheel'), true);
assert.equal(tableSql.includes('burial_slab'), true);
assert.equal(tableSql.includes('water_flowing'), false);
assert.equal(schema.includes('CREATE TABLE IF NOT EXISTS public.campaign_automation_rule'), false);
assert.equal(schema.includes('campaign_thread'), false);

async function withRollback(run) {
  const pool = poolFromEnv();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await run(client);
  } finally {
    try { await client.query('ROLLBACK'); } catch (_) { /* already closed */ }
    client.release();
    await pool.end();
  }
}

(async () => {
  await withRollback(async (client) => {
    const ruleset = await client.query('SELECT id FROM ruleset ORDER BY id LIMIT 1');
    assert.ok(ruleset.rows.length === 1, 'ruleset');
    const table = await client.query(
      'SELECT id FROM encounter_table WHERE ruleset_id IS NOT NULL ORDER BY id LIMIT 1'
    );
    assert.ok(table.rows.length === 1, 'encounter table');
    const rulesetId = ruleset.rows[0].id;
    const tableId = table.rows[0].id;
    const stamp = Date.now();

    async function campaign(suffix) {
      const inserted = await client.query(
        `INSERT INTO campaign (name, ruleset_id, running, concluded)
         VALUES ($1, $2, false, false) RETURNING id`,
        [`zz-phase1-${suffix}-${stamp}`, rulesetId]
      );
      return inserted.rows[0].id;
    }

    async function place(campaignId, name) {
      await client.query(
        `INSERT INTO campaign_location
           (campaign_id, name, place, check_die, interval_seconds, encounter_table_id, ambient_light)
         VALUES ($1, $2, 'inside', 6, 1800, $3, 0)`,
        [campaignId, name, tableId]
      );
    }

    const left = await campaign('a');
    const right = await campaign('b');
    await place(left, 'Cistern Well');
    await place(left, 'Cistern Heart');
    await place(right, 'Cistern Well');
    await place(right, 'Cistern Heart');
    await place(left, 'Millbridge');

    const attached = await attachAuthoredFacts(client, left);
    assert.equal(attached.length, 2);
    const again = await attachAuthoredFacts(client, left);
    assert.equal(again.length, 0);
    const other = await attachAuthoredFacts(client, right);
    assert.equal(other.length, 2);

    await client.query(
      `INSERT INTO campaign_board (campaign_id, game_seconds, in_encounter, place)
       VALUES ($1, 28800, false, 'outside')`,
      [left]
    );

    const before = await listFacts(client, left);
    assert.equal(before.water_flowing, false);
    assert.equal(before.facts.length, 2);
    const wheelRow = before.facts.find((fact) => fact.subject_key === 'waterwheel');
    const slabRow = before.facts.find((fact) => fact.subject_key === 'burial_slab');
    assert.equal(wheelRow.value, true);
    assert.equal(wheelRow.base, true);
    assert.equal(wheelRow.version, 1);
    assert.equal(slabRow.value, false);
    assert.notEqual(wheelRow.campaign_id, right);

    const cleared = await setFact(client, left, {
      subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: false, version: 1,
    });
    assert.equal(cleared.changed, true);
    assert.equal(cleared.fact.value, false);
    assert.equal(cleared.fact.version, 2);
    assert.equal(cleared.fact.campaign_id, left);

    const clock = await client.query('SELECT game_seconds FROM campaign_board WHERE campaign_id = $1', [left]);
    assert.equal(Number(clock.rows[0].game_seconds), 28800);
    const logs = await client.query(
      `SELECT body, at_seconds FROM campaign_log WHERE campaign_id = $1 ORDER BY id`,
      [left]
    );
    assert.equal(logs.rows.length, 1);
    assert.equal(logs.rows[0].body, 'Waterwheel blocked is now no.');
    assert.equal(Number(logs.rows[0].at_seconds), 28800);

    const repeat = await setFact(client, left, {
      subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: false, version: 2,
    });
    assert.equal(repeat.changed, false);
    assert.equal(repeat.fact.version, 2);
    const logsAfterRepeat = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [left]);
    assert.equal(logsAfterRepeat.rows.length, 1);

    await assert.rejects(
      () => setFact(client, left, {
        subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: true, version: 1,
      }),
      (error) => error.status === 409
    );
    await assert.rejects(
      () => setFact(client, left, {
        subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: true, version: 1,
      }),
      (error) => error.status === 409
    );

    const rightBefore = await listFacts(client, right);
    assert.equal(rightBefore.facts.every((fact) => fact.value === fact.base && fact.version === 1), true);
    assert.equal(rightBefore.facts.every((fact) => fact.campaign_id === right), true);

    await setFact(client, left, {
      subject_type: 'object', subject_key: 'burial_slab', state_key: 'removed', value: true, version: 1,
    });
    const flowing = await listFacts(client, left);
    assert.equal(flowing.water_flowing, true);
    const storedFlow = await client.query(
      `SELECT id FROM campaign_state_value
       WHERE campaign_id = $1 AND state_key = 'water_flowing'`,
      [left]
    );
    assert.equal(storedFlow.rows.length, 0);

    await assert.rejects(
      () => setFact(client, left, {
        subject_type: 'object', subject_key: 'waterwheel', state_key: 'missing', value: true, version: 1,
      }),
      (error) => error.status === 400
    );

    const flags = await client.query(
      `SELECT f.id FROM campaign_location_flag f
       JOIN campaign_location l ON l.id = f.location_id
       WHERE l.campaign_id = $1`,
      [left]
    );
    assert.equal(flags.rows.length, 0);

    await resetCampaignRun(client, left);
    const restored = await listFacts(client, left);
    assert.equal(restored.facts.find((fact) => fact.subject_key === 'waterwheel').value, true);
    assert.equal(restored.facts.find((fact) => fact.subject_key === 'waterwheel').version, 1);
    assert.equal(restored.facts.find((fact) => fact.subject_key === 'burial_slab').value, false);
    assert.equal(restored.water_flowing, false);
    const logGone = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [left]);
    assert.equal(logGone.rows.length, 0);
    const rightAfter = await listFacts(client, right);
    assert.equal(rightAfter.facts.every((fact) => fact.version === 1 && fact.value === fact.base), true);

    const water = await campaign('water');
    await place(water, 'Cistern Well');
    await place(water, 'Cistern Heart');
    await place(water, 'Cistern Deep');
    await attachAuthoredFacts(client, water);
    await client.query(
      `INSERT INTO campaign_board (campaign_id, game_seconds, in_encounter, place)
       VALUES ($1, 28800, false, 'inside')`,
      [water]
    );
    const deep = await client.query(
      `SELECT id FROM campaign_location WHERE campaign_id = $1 AND name = 'Cistern Deep'`,
      [water]
    );
    const scene = await client.query(
      `INSERT INTO campaign_encounter
         (campaign_id, location_id, title, kind, purpose, status, base_status)
       VALUES ($1, $2, 'Rising water', 'environment', 'The pool rises if the wheel is free.', 'prepared', 'prepared')
       RETURNING id`,
      [water, deep.rows[0].id]
    );
    const encounterId = Number(scene.rows[0].id);
    const blockedApply = await applyRisingWater(client, water, encounterId, openPreparedEncounter);
    assert.equal(blockedApply.changed, false);
    assert.equal(rejectRisingWater().changed, false);
    const preparedRow = await client.query('SELECT status FROM campaign_encounter WHERE id = $1', [encounterId]);
    assert.equal(preparedRow.rows[0].status, 'prepared');
    const logsBefore = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [water]);

    await setFact(client, water, {
      subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: false, version: 1,
    });
    const asked = await listFacts(client, water);
    const askedRows = await client.query(
      `SELECT e.id, e.title, e.kind, e.status,
              (SELECT count(*)::int FROM campaign_encounter_member m WHERE m.encounter_id = e.id) AS member_count
       FROM campaign_encounter e WHERE e.campaign_id = $1`,
      [water]
    );
    assert.equal(asked.water_flowing, false);
    assert.equal(risingWaterPreview(asked.facts, askedRows.rows).encounter_id, encounterId);
    const wrong = await applyRisingWater(client, water, encounterId + 1, openPreparedEncounter);
    assert.equal(wrong.changed, false);
    const opened = await applyRisingWater(client, water, encounterId, openPreparedEncounter);
    assert.equal(opened.changed, true);
    assert.equal(opened.in_encounter, false);
    const openedRow = await client.query('SELECT status FROM campaign_encounter WHERE id = $1', [encounterId]);
    assert.equal(openedRow.rows[0].status, 'opened');
    const fight = await client.query(
      'SELECT in_encounter, game_seconds FROM campaign_board WHERE campaign_id = $1',
      [water]
    );
    assert.equal(fight.rows[0].in_encounter, false);
    assert.equal(Number(fight.rows[0].game_seconds), 28800);
    const logsAfter = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [water]);
    assert.equal(logsAfter.rows.length, logsBefore.rows.length + 1);
    const waterFlowRow = await client.query(
      `SELECT id FROM campaign_state_value WHERE campaign_id = $1 AND state_key = 'water_flowing'`,
      [water]
    );
    assert.equal(waterFlowRow.rows.length, 0);
    const secondApply = await applyRisingWater(client, water, encounterId, openPreparedEncounter);
    assert.equal(secondApply.changed, false);
    await setFact(client, water, {
      subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: true, version: 2,
    });
    const reblocked = await client.query('SELECT status FROM campaign_encounter WHERE id = $1', [encounterId]);
    assert.equal(reblocked.rows[0].status, 'opened');

    const slabCampaign = await campaign('slab');
    await place(slabCampaign, 'Cistern Well');
    await place(slabCampaign, 'Cistern Heart');
    await place(slabCampaign, 'Cistern Deep');
    await attachAuthoredFacts(client, slabCampaign);
    const deepSlab = await client.query(
      `SELECT id FROM campaign_location WHERE campaign_id = $1 AND name = 'Cistern Deep'`,
      [slabCampaign]
    );
    const slabScene = await client.query(
      `INSERT INTO campaign_encounter (campaign_id, location_id, title, kind, status, base_status)
       VALUES ($1, $2, 'Rising water', 'environment', 'prepared', 'prepared') RETURNING id`,
      [slabCampaign, deepSlab.rows[0].id]
    );
    const slabEncounterId = Number(slabScene.rows[0].id);
    const slabEncounter = [{
      id: slabEncounterId, title: 'Rising water', status: 'prepared', kind: 'environment', member_count: 0,
    }];
    await setFact(client, slabCampaign, {
      subject_type: 'object', subject_key: 'burial_slab', state_key: 'removed', value: true, version: 1,
    });
    const slabOnly = await listFacts(client, slabCampaign);
    assert.equal(slabOnly.water_flowing, false);
    assert.equal(risingWaterPreview(slabOnly.facts, slabEncounter), null);
    await setFact(client, slabCampaign, {
      subject_type: 'object', subject_key: 'waterwheel', state_key: 'blocked', value: false, version: 1,
    });
    const both = await listFacts(client, slabCampaign);
    assert.equal(both.water_flowing, true);
    assert.equal(risingWaterPreview(both.facts, slabEncounter).encounter_id, slabEncounterId);
    const slabFlow = await client.query(
      `SELECT id FROM campaign_state_value WHERE campaign_id = $1 AND state_key = 'water_flowing'`,
      [slabCampaign]
    );
    assert.equal(slabFlow.rows.length, 0);

    const foe = await client.query(
      `INSERT INTO campaign_creature (campaign_id, name, disposition, base_disposition, in_fight)
       VALUES ($1, 'Skeleton', 'present', 'present', false) RETURNING id`,
      [water]
    );
    const combat = await client.query(
      `INSERT INTO campaign_encounter (campaign_id, title, kind, status, base_status)
       VALUES ($1, 'Niche skeleton', 'combat', 'prepared', 'prepared') RETURNING id`,
      [water]
    );
    await client.query(
      'INSERT INTO campaign_encounter_member (encounter_id, creature_id) VALUES ($1, $2)',
      [combat.rows[0].id, foe.rows[0].id]
    );
    const started = await openPreparedEncounter(client, water, combat.rows[0].id);
    assert.equal(started.in_encounter, true);
    assert.equal(started.changed, true);
    const marked = await client.query('SELECT in_fight FROM campaign_creature WHERE id = $1', [foe.rows[0].id]);
    assert.equal(marked.rows[0].in_fight, true);
    const stillOpen = await client.query('SELECT status FROM campaign_encounter WHERE id = $1', [encounterId]);
    assert.equal(stillOpen.rows[0].status, 'opened');
  });
  console.log('play state ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
