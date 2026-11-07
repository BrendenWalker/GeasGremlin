const assert = require('assert');
const fs = require('fs');
const path = require('path');
const repoEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(repoEnv)) require('dotenv').config({ path: repoEnv });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { poolFromEnv } = require('./scripts/import-catalog');
const { START_SESSION_SQL, PRESERVED_TABLES, RESET_STEPS, concludeCampaignRun } = require('./campaignLifecycle');
const { TEXT_MAX, readDetails, showsIntro, saveCampaignDetails } = require('./campaignDetails');

const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
const tableAt = schema.indexOf('CREATE TABLE IF NOT EXISTS public.campaign_details');
const tableEnd = schema.indexOf('CREATE TABLE IF NOT EXISTS public.campaign_location_shops', tableAt);
assert.ok(tableAt > 0 && tableEnd > tableAt);
const tableSql = schema.slice(tableAt, tableEnd);
assert.equal(tableSql.includes('intro text NULL'), true);
assert.equal(tableSql.includes('gm_notes text NULL'), true);
assert.equal(tableSql.includes('first_location_id int4 NULL'), true);
assert.equal(tableSql.includes('ON DELETE CASCADE'), true);
assert.equal(tableSql.includes('ON DELETE SET NULL'), true);
assert.equal(tableSql.includes('char_length(intro) <= 4000'), true);
assert.equal(tableSql.includes('char_length(gm_notes) <= 4000'), true);
assert.equal(tableSql.includes('INTRO'), false);

assert.equal(PRESERVED_TABLES.includes('campaign_details'), true);
assert.equal(RESET_STEPS.some((step) => step.table === 'campaign_details'), false);
assert.equal(START_SESSION_SQL.includes('campaign_details'), false);
assert.equal(START_SESSION_SQL.includes('location_id'), false);

const detailsSource = fs.readFileSync(path.join(__dirname, 'campaignDetails.js'), 'utf8');
assert.equal(detailsSource.includes('campaign_board'), false);
assert.equal(detailsSource.includes('INTRO'), false);

const pageSource = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'AdventuringPage.jsx'), 'utf8');
assert.equal(pageSource.includes('board.location_id == null'), true);
assert.equal(pageSource.includes('board.intro || board.gm_notes || board.first_location_id != null'), true);
assert.equal(pageSource.includes('Begin Campaign'), true);
assert.equal(pageSource.includes('selectLocation(campaignId, board.first_location_id)'), true);
assert.equal(pageSource.includes('disabled={busy || board.first_location_id == null}'), true);
assert.equal(pageSource.includes('Choose a first location in Configuration.'), true);
assert.equal(pageSource.includes('/begin'), false);
assert.equal(pageSource.includes('!showingIntro'), true);

const hereSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const hereAt = hereSource.indexOf("app.get('/api/campaigns/:campaignId/here'");
const hereFn = hereSource.slice(hereAt, hereSource.indexOf('\napp.', hereAt + 10));
assert.ok(hereAt > 0 && hereFn.length > 0);
assert.equal(hereFn.includes('campaign_details'), false);
assert.equal(hereFn.includes('gm_notes'), false);
assert.equal(hereFn.includes('intro'), false);

assert.equal(showsIntro(null, null), false);
assert.equal(showsIntro(null, { intro: null, gm_notes: null, first_location_id: null }), false);
assert.equal(showsIntro(null, { intro: 'The road.', gm_notes: null, first_location_id: null }), true);
assert.equal(showsIntro(null, { intro: null, gm_notes: 'Secret.', first_location_id: null }), true);
assert.equal(showsIntro(null, { intro: null, gm_notes: null, first_location_id: 4 }), true);
assert.equal(showsIntro(4, { intro: 'The road.', gm_notes: 'Secret.', first_location_id: 4 }), false);

assert.throws(() => readDetails({ intro: 'x'.repeat(TEXT_MAX + 1) }), (error) => error.status === 400);
assert.deepEqual(readDetails({ intro: '  ', gm_notes: '', first_location_id: '' }), {
  intro: null,
  gmNotes: null,
  firstLocationId: null,
});

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
    const inserted = await client.query(
      `INSERT INTO campaign (name, ruleset_id, running, concluded)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`zz-intro-${stamp}`, rulesetId]
    );
    const id = Number(inserted.rows[0].id);
    const other = await client.query(
      `INSERT INTO campaign (name, ruleset_id, running, concluded)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`zz-intro-other-${stamp}`, rulesetId]
    );
    const otherId = Number(other.rows[0].id);
    const place = await client.query(
      `INSERT INTO campaign_location
         (campaign_id, name, environment, check_die, interval_seconds, encounter_table_id, ambient_light)
       VALUES ($1, 'Millbridge', 'inside', 6, 1800, $2, 0)
       RETURNING id`,
      [id, tableId]
    );
    const locationId = Number(place.rows[0].id);
    const elsewhere = await client.query(
      `INSERT INTO campaign_location
         (campaign_id, name, environment, check_die, interval_seconds, encounter_table_id)
       VALUES ($1, 'Other town', 'outside', 6, 14400, $2)
       RETURNING id`,
      [otherId, tableId]
    );
    const otherLocationId = Number(elsewhere.rows[0].id);

    const saved = await saveCampaignDetails(client, id, {
      intro: '  The road begins. ',
      gm_notes: 'They do not know the well.',
      first_location_id: locationId,
    });
    assert.deepEqual(saved, {
      intro: 'The road begins.',
      gm_notes: 'They do not know the well.',
      first_location_id: locationId,
    });
    const board = await client.query('SELECT location_id FROM campaign_board WHERE campaign_id = $1', [id]);
    assert.equal(board.rows.length, 0);
    const named = await client.query(
      `SELECT id FROM campaign_location WHERE campaign_id = $1 AND name = 'INTRO'`,
      [id]
    );
    assert.equal(named.rows.length, 0);

    await assert.rejects(
      () => saveCampaignDetails(client, id, {
        intro: 'The road begins.',
        gm_notes: 'They do not know the well.',
        first_location_id: otherLocationId,
      }),
      (error) => error.status === 400
    );
    const kept = await client.query(
      'SELECT intro, first_location_id FROM campaign_details WHERE campaign_id = $1',
      [id]
    );
    assert.equal(kept.rows[0].intro, 'The road begins.');
    assert.equal(Number(kept.rows[0].first_location_id), locationId);

    await client.query(
      `INSERT INTO campaign_board (campaign_id, game_seconds, environment, location_id)
       VALUES ($1, 600, 'inside', $2)`,
      [id, locationId]
    );
    await concludeCampaignRun(client, id);
    const after = await client.query(
      'SELECT intro, gm_notes, first_location_id FROM campaign_details WHERE campaign_id = $1',
      [id]
    );
    assert.equal(after.rows[0].intro, 'The road begins.');
    assert.equal(after.rows[0].gm_notes, 'They do not know the well.');
    assert.equal(Number(after.rows[0].first_location_id), locationId);
    const clock = await client.query(
      'SELECT location_id FROM campaign_board WHERE campaign_id = $1',
      [id]
    );
    assert.equal(clock.rows[0].location_id, null);
    assert.equal(showsIntro(null, {
      intro: after.rows[0].intro,
      gm_notes: after.rows[0].gm_notes,
      first_location_id: Number(after.rows[0].first_location_id),
    }), true);

    await client.query('DELETE FROM campaign_location WHERE id = $1 AND campaign_id = $2', [locationId, id]);
    const cleared = await client.query(
      'SELECT first_location_id FROM campaign_details WHERE campaign_id = $1',
      [id]
    );
    assert.equal(cleared.rows[0].first_location_id, null);
    const stillNamed = await client.query(
      `SELECT id FROM campaign_location WHERE campaign_id = $1 AND name = 'INTRO'`,
      [id]
    );
    assert.equal(stillNamed.rows.length, 0);
  });
  console.log('campaign details ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
