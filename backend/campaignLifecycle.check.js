const assert = require('assert');
const fs = require('fs');
const path = require('path');
const repoEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(repoEnv)) require('dotenv').config({ path: repoEnv });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { poolFromEnv } = require('./scripts/import-catalog');
const {
  START_SESSION_SQL,
  END_SESSION_SQL,
  CONCLUDE_CAMPAIGN_SQL,
  LOCK_CAMPAIGN_SQL,
  ARCHIVE_LOG_SQL,
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
assert.equal(PRESERVED_TABLES.includes('campaign_log_archive'), true);
assert.equal(deleted.includes('campaign_log_archive'), false);
assert.equal(ARCHIVE_LOG_SQL.includes('campaign_log_archive'), true);
assert.equal(ARCHIVE_LOG_SQL.includes('location_id'), true);
assert.equal(ARCHIVE_LOG_SQL.includes('FOREIGN KEY'), false);
assert.match(LOCK_CAMPAIGN_SQL, /FOR UPDATE/);

const lifecycleSource = fs.readFileSync(path.join(__dirname, 'campaignLifecycle.js'), 'utf8');
const concludeAt = lifecycleSource.indexOf('async function concludeCampaignRun');
const concludeFn = lifecycleSource.slice(concludeAt, lifecycleSource.indexOf('module.exports'));
assert.ok(concludeFn.indexOf('ARCHIVE_LOG_SQL') < concludeFn.indexOf('resetCampaignRun'));
assert.ok(concludeFn.indexOf('resetCampaignRun') < concludeFn.indexOf('CONCLUDE_CAMPAIGN_SQL'));

const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
const archiveAt = schema.indexOf('CREATE TABLE IF NOT EXISTS public.campaign_log_archive');
const archiveEnd = schema.indexOf('CREATE INDEX IF NOT EXISTS idx_campaign_log_archive_campaign', archiveAt);
assert.ok(archiveAt > 0 && archiveEnd > archiveAt);
const archiveSql = schema.slice(archiveAt, archiveEnd);
assert.equal(archiveSql.includes('campaign_run_id'), false);
assert.equal(archiveSql.includes('location_id int4 NULL'), true);
assert.equal(archiveSql.includes('REFERENCES public.campaign_location'), false);

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
  const wiped = await callsOf((client) => concludeCampaignRun(client, 9));
  assert.deepEqual(
    wiped.calls.map((call) => call.sql),
    [LOCK_CAMPAIGN_SQL, ARCHIVE_LOG_SQL, ...RESET_STEPS.map((step) => step.sql), CONCLUDE_CAMPAIGN_SQL]
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

  console.log('campaign lifecycle statements ok');

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

    const inserted = await client.query(
      `INSERT INTO campaign (name, ruleset_id, running, concluded)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`zz-phase5-${stamp}`, rulesetId]
    );
    const id = Number(inserted.rows[0].id);
    const other = await client.query(
      `INSERT INTO campaign (name, ruleset_id, running, concluded)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`zz-phase5-other-${stamp}`, rulesetId]
    );
    const otherId = Number(other.rows[0].id);
    const place = await client.query(
      `INSERT INTO campaign_location
         (campaign_id, name, place, check_die, interval_seconds, encounter_table_id, ambient_light)
       VALUES ($1, 'Stair', 'inside', 6, 1800, $2, 0)
       RETURNING id`,
      [id, tableId]
    );
    const locationId = Number(place.rows[0].id);
    await client.query(
      `INSERT INTO campaign_board (campaign_id, game_seconds, place, location_id)
       VALUES ($1, 2400, 'inside', $2)`,
      [id, locationId]
    );
    await client.query(
      `INSERT INTO campaign_log (campaign_id, location_id, at_seconds, kind, body)
       VALUES ($1, $2, 1200, 'consequence', 'Bad air costs 1 damage.')`,
      [id, locationId]
    );
    await client.query(
      `INSERT INTO campaign_log (campaign_id, at_seconds, kind, body)
       VALUES ($1, 100, 'decision', 'Leave this one.')`,
      [otherId]
    );

    const first = await concludeCampaignRun(client, id);
    assert.deepEqual(first, { running: false, concluded: true });
    const live = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [id]);
    assert.equal(live.rows.length, 0);
    const kept = await client.query('SELECT body FROM campaign_log WHERE campaign_id = $1', [otherId]);
    assert.deepEqual(kept.rows.map((row) => row.body), ['Leave this one.']);
    const archived = await client.query(
      `SELECT play_no, at_seconds, location_id, kind, body
       FROM campaign_log_archive WHERE campaign_id = $1 ORDER BY id`,
      [id]
    );
    assert.equal(archived.rows.length, 1);
    assert.equal(Number(archived.rows[0].play_no), 1);
    assert.equal(Number(archived.rows[0].at_seconds), 1200);
    assert.equal(Number(archived.rows[0].location_id), locationId);
    assert.equal(archived.rows[0].kind, 'consequence');
    assert.equal(archived.rows[0].body, 'Bad air costs 1 damage.');
    const clock = await client.query(
      'SELECT game_seconds, location_id FROM campaign_board WHERE campaign_id = $1',
      [id]
    );
    assert.equal(Number(clock.rows[0].game_seconds), 0);
    assert.equal(clock.rows[0].location_id, null);
    const otherArchive = await client.query(
      'SELECT id FROM campaign_log_archive WHERE campaign_id = $1',
      [otherId]
    );
    assert.equal(otherArchive.rows.length, 0);

    await client.query(
      `INSERT INTO campaign_log (campaign_id, at_seconds, kind, body)
       VALUES ($1, 600, 'discovery', 'The door was chalk.')`,
      [id]
    );
    await concludeCampaignRun(client, id);
    const plays = await client.query(
      `SELECT play_no, body FROM campaign_log_archive
       WHERE campaign_id = $1 ORDER BY play_no, id`,
      [id]
    );
    assert.deepEqual(plays.rows.map((row) => [Number(row.play_no), row.body]), [
      [1, 'Bad air costs 1 damage.'],
      [2, 'The door was chalk.'],
    ]);
    const gone = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [id]);
    assert.equal(gone.rows.length, 0);

    await concludeCampaignRun(client, id);
    const still = await client.query(
      'SELECT play_no FROM campaign_log_archive WHERE campaign_id = $1 ORDER BY play_no',
      [id]
    );
    assert.deepEqual(still.rows.map((row) => Number(row.play_no)), [1, 2]);
  });
  console.log('campaign lifecycle archive ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
