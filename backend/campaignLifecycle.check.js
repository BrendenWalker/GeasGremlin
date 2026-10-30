const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  START_SESSION_SQL,
  END_SESSION_SQL,
  CONCLUDE_CAMPAIGN_SQL,
  RESET_STEPS,
  PRESERVED_TABLES,
  resetCampaignRun,
  endCampaignSession,
  concludeCampaignRun,
} = require('./campaignLifecycle');

const confirmPath = path.join(__dirname, '..', 'frontend', 'src', 'domain', 'concludeConfirm.mjs');
const pagePath = path.join(__dirname, '..', 'frontend', 'src', 'pages', 'AdventuringPage.jsx');
const confirmSource = fs.readFileSync(confirmPath, 'utf8');
const pageSource = fs.readFileSync(pagePath, 'utf8');

assert.equal(RESET_STEPS.length, 17);
assert.deepEqual(RESET_STEPS.map((step) => step.table), [
  'campaign_creature',
  'campaign_encounter',
  'campaign_clue',
  'campaign_objective',
  'campaign_board',
  'campaign_location',
  'campaign_state_value',
  'campaign_transition',
  'campaign_character',
  'campaign_wander',
  'campaign_log',
  'campaign_mark',
  'campaign_turn_block',
  'campaign_presence',
  'campaign_location_flag',
  'campaign_command',
  'campaign_hireling',
]);

for (const step of RESET_STEPS) {
  assert.ok(step.sql.includes(step.table), step.table);
  assert.ok(step.sql.includes('campaign_id = $1') || step.sql.includes('l.campaign_id = $1'), step.table);
  if (step.kind === 'delete') assert.match(step.sql, /^\s*DELETE\b/);
  else assert.match(step.sql, /^\s*UPDATE\b/);
  assert.equal(confirmSource.includes(step.phrase), true, step.phrase);
}

const deleted = RESET_STEPS.filter((step) => step.kind === 'delete').map((step) => step.table);
for (const table of PRESERVED_TABLES) {
  assert.equal(deleted.includes(table), false, table);
}
assert.equal(deleted.includes('characters'), false);
assert.equal(PRESERVED_TABLES.includes('campaign_transition'), true);

assert.match(END_SESSION_SQL, /running = false/);
assert.equal(/concluded\s*=/.test(END_SESSION_SQL), false);
assert.match(CONCLUDE_CAMPAIGN_SQL, /concluded = true/);
assert.match(CONCLUDE_CAMPAIGN_SQL, /running = false/);
assert.match(START_SESSION_SQL, /concluded = false/);
assert.match(START_SESSION_SQL, /running = true/);
assert.equal(START_SESSION_SQL.includes('DELETE'), false);
assert.equal(confirmSource.includes('Character sheets'), true);
assert.equal(confirmSource.includes('End session'), true);
assert.equal(pageSource.includes('window.confirm'), false);
assert.equal(pageSource.includes('setConcludeArmed(true)'), true);
assert.equal(pageSource.includes('{CONCLUDE_CONFIRM}'), true);
assert.equal(pageSource.includes('Wipe this playthrough'), true);
assert.equal(pageSource.includes('btn-danger'), true);
assert.equal(pageSource.includes('concludeCampaign(campaignId)'), true);

async function callsOf(run) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT')) return { rows: [{ id: 9, concluded: false, running: true }] };
      return { rows: [{ running: false, concluded: sql.includes('concluded = true') }] };
    },
  };
  const result = await run(client);
  return { calls, result };
}

(async () => {
  const wiped = await callsOf((client) => concludeCampaignRun(client, 9));
  assert.deepEqual(
    wiped.calls.map((call) => call.sql),
    ['SELECT id FROM campaign WHERE id = $1', ...RESET_STEPS.map((step) => step.sql), CONCLUDE_CAMPAIGN_SQL]
  );
  assert.ok(wiped.calls.every((call) => call.params.length === 1 && call.params[0] === 9));
  assert.deepEqual(wiped.result, { running: false, concluded: true });

  const paused = await callsOf((client) => endCampaignSession(client, 9));
  assert.deepEqual(paused.calls.map((call) => call.sql), [
    'SELECT id, concluded FROM campaign WHERE id = $1',
    END_SESSION_SQL,
  ]);
  assert.equal(paused.calls.some((call) => call.sql.includes('DELETE')), false);
  assert.deepEqual(paused.result, { running: false, concluded: false });

  const again = await callsOf((client) => resetCampaignRun(client, 4));
  assert.equal(again.calls.length, RESET_STEPS.length);
  assert.ok(again.calls.every((call) => call.params[0] === 4));

  const missing = {
    async query() {
      return { rows: [] };
    },
  };
  await assert.rejects(() => concludeCampaignRun(missing, 3), (error) => error.status === 404);
  await assert.rejects(() => endCampaignSession(missing, 3), (error) => error.status === 404);

  console.log('campaign lifecycle ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
