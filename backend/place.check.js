const assert = require('assert');
const fs = require('fs');
const path = require('path');
const repoEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(repoEnv)) require('dotenv').config({ path: repoEnv });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { poolFromEnv } = require('./scripts/import-catalog');
const { readPlace, placeIdField } = require('./place');
const { locationTerrain } = require('./terrain');

const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
const placeAt = schema.indexOf('CREATE TABLE IF NOT EXISTS public.campaign_place');
assert.ok(placeAt > 0);
const placeSql = schema.slice(placeAt, schema.indexOf('CREATE TABLE IF NOT EXISTS public.campaign_location', placeAt));
assert.equal(placeSql.includes('UNIQUE (campaign_id, name)'), true);
assert.equal(placeSql.includes('UNIQUE (id, campaign_id)'), true);
assert.equal(schema.includes('ON DELETE SET NULL (place_id)'), true);
assert.equal(schema.includes('RENAME COLUMN place TO environment'), true);
const siteInsert = schema.indexOf('INSERT INTO public.campaign_place (campaign_id, name)');
const siteDrop = schema.indexOf('ALTER TABLE public.campaign_location DROP COLUMN site');
assert.ok(siteInsert > 0 && siteDrop > siteInsert);

assert.throws(() => readPlace({ name: '' }), (error) => error.status === 400);
assert.throws(() => readPlace({ name: 'x'.repeat(81) }), (error) => error.status === 400);
assert.throws(() => readPlace({ name: 'Fort', place_type: 'x'.repeat(31) }), (error) => error.status === 400);
assert.deepEqual(readPlace({ name: '  Fort  ', place_type: ' Dungeon ', description: '', gm_text: '  Note ' }), {
  name: 'Fort',
  description: null,
  placeType: 'Dungeon',
  gmText: 'Note',
});
assert.equal(placeIdField(null), null);
assert.equal(placeIdField(''), null);
assert.equal(placeIdField(4), 4);
assert.throws(() => placeIdField(0), (error) => error.status === 400);
assert.equal(locationTerrain('up', 'Clear', 0).error, 'environment must be outside or inside');

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

    const left = await client.query(
      `INSERT INTO campaign (name, ruleset_id, running, concluded)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`zz-place-${stamp}`, rulesetId]
    );
    const leftId = Number(left.rows[0].id);
    const right = await client.query(
      `INSERT INTO campaign (name, ruleset_id, running, concluded)
       VALUES ($1, $2, true, false) RETURNING id`,
      [`zz-place-other-${stamp}`, rulesetId]
    );
    const rightId = Number(right.rows[0].id);

    const fort = await client.query(
      `INSERT INTO campaign_place (campaign_id, name, place_type, description, gm_text)
       VALUES ($1, 'Morgansfort', 'Settlement', 'The fort.', 'Keep an eye on the gate.')
       RETURNING id, name, place_type`,
      [leftId]
    );
    const fortId = Number(fort.rows[0].id);
    assert.equal(fort.rows[0].name, 'Morgansfort');

    const renamed = await client.query(
      `UPDATE campaign_place
       SET name = 'Old Fort', place_type = 'Fortress', description = null, gm_text = null
       WHERE id = $1 AND campaign_id = $2
       RETURNING name, place_type, description, gm_text`,
      [fortId, leftId]
    );
    assert.equal(renamed.rows[0].name, 'Old Fort');
    assert.equal(renamed.rows[0].place_type, 'Fortress');

    const otherPlace = await client.query(
      `INSERT INTO campaign_place (campaign_id, name)
       VALUES ($1, 'Elsewhere') RETURNING id`,
      [rightId]
    );
    const otherPlaceId = Number(otherPlace.rows[0].id);

    const inn = await client.query(
      `INSERT INTO campaign_location
         (campaign_id, name, environment, place_id, check_die, interval_seconds, encounter_table_id, ambient_light)
       VALUES ($1, 'The Inn', 'inside', $2, 6, 1800, $3, 0)
       RETURNING id, place_id`,
      [leftId, fortId, tableId]
    );
    const innId = Number(inn.rows[0].id);
    assert.equal(Number(inn.rows[0].place_id), fortId);

    const store = await client.query(
      `INSERT INTO campaign_location
         (campaign_id, name, environment, place_id, check_die, interval_seconds, encounter_table_id)
       VALUES ($1, 'General Store', 'outside', $2, 6, 14400, $3)
       RETURNING id`,
      [leftId, fortId, tableId]
    );
    const storeId = Number(store.rows[0].id);

    const lonely = await client.query(
      `INSERT INTO campaign_location
         (campaign_id, name, environment, place_id, check_die, interval_seconds, encounter_table_id)
       VALUES ($1, 'Old Road', 'outside', NULL, 6, 14400, $2)
       RETURNING id, place_id`,
      [leftId, tableId]
    );
    assert.equal(lonely.rows[0].place_id, null);

    await client.query('SAVEPOINT cross_campaign');
    try {
      await client.query(
        `INSERT INTO campaign_location
           (campaign_id, name, environment, place_id, check_die, interval_seconds, encounter_table_id)
         VALUES ($1, 'Cross Camp', 'outside', $2, 6, 14400, $3)`,
        [leftId, otherPlaceId, tableId]
      );
      assert.fail('cross-campaign place should fail');
    } catch (error) {
      assert.equal(error.code, '23503');
      await client.query('ROLLBACK TO SAVEPOINT cross_campaign');
    }

    const dungeon = await client.query(
      `INSERT INTO campaign_place (campaign_id, name, place_type)
       VALUES ($1, 'Nameless Dungeon', 'Dungeon') RETURNING id`,
      [leftId]
    );
    const dungeonId = Number(dungeon.rows[0].id);
    await client.query(
      `UPDATE campaign_location SET place_id = $3
       WHERE id = $1 AND campaign_id = $2`,
      [innId, leftId, dungeonId]
    );
    const moved = await client.query(
      'SELECT place_id FROM campaign_location WHERE id = $1',
      [innId]
    );
    assert.equal(Number(moved.rows[0].place_id), dungeonId);

    await client.query(
      `UPDATE campaign_location SET place_id = NULL
       WHERE id = $1 AND campaign_id = $2`,
      [innId, leftId]
    );
    const cleared = await client.query(
      'SELECT place_id FROM campaign_location WHERE id = $1',
      [innId]
    );
    assert.equal(cleared.rows[0].place_id, null);

    await client.query(
      `UPDATE campaign_location SET place_id = $3
       WHERE id = ANY($1::int[]) AND campaign_id = $2`,
      [[innId, storeId], leftId, fortId]
    );
    await client.query('DELETE FROM campaign_place WHERE id = $1 AND campaign_id = $2', [fortId, leftId]);
    const afterDelete = await client.query(
      'SELECT id, place_id FROM campaign_location WHERE id = ANY($1::int[]) ORDER BY id',
      [[innId, storeId]]
    );
    assert.equal(afterDelete.rows.length, 2);
    assert.equal(afterDelete.rows[0].place_id, null);
    assert.equal(afterDelete.rows[1].place_id, null);

    await client.query('SAVEPOINT bad_light');
    try {
      await client.query(
        `INSERT INTO campaign_location
           (campaign_id, name, environment, check_die, interval_seconds, encounter_table_id, ambient_light)
         VALUES ($1, 'Bad Air', 'outside', 6, 14400, $2, 0)`,
        [leftId, tableId]
      );
      assert.fail('outside ambient light should fail');
    } catch (error) {
      assert.equal(error.code, '23514');
      await client.query('ROLLBACK TO SAVEPOINT bad_light');
    }
    await client.query('SAVEPOINT bad_terrain');
    try {
      await client.query(
        `INSERT INTO campaign_location
           (campaign_id, name, environment, check_die, interval_seconds, encounter_table_id, terrain, movement_pct)
         VALUES ($1, 'Bad Trail', 'inside', 6, 1800, $2, 'Forest', -33)`,
        [leftId, tableId]
      );
      assert.fail('inside terrain should fail');
    } catch (error) {
      assert.equal(error.code, '23514');
      await client.query('ROLLBACK TO SAVEPOINT bad_terrain');
    }
  });

  console.log('place ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
