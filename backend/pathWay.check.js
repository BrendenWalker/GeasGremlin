/**
 * Paths. Discovery and access are columns on the path, not a second table.
 * The database section rolls back. It does not conclude a live campaign.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const repoEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(repoEnv)) require('dotenv').config({ path: repoEnv });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { poolFromEnv } = require('./scripts/import-catalog');
const { resetCampaignRun } = require('./campaignLifecycle');
const { playerHere } = require('./room-flag');
const {
  pathsAt,
  pathDestination,
  pathTravel,
  playerExits,
  markPathFound,
  setPathAccess,
} = require('./pathWay');

const stair = { id: 1, from_location_id: 10, to_location_id: 20, one_way: false, reason: 'The stair.' };
const drop = { id: 2, from_location_id: 20, to_location_id: 30, one_way: true, reason: 'The drop.' };
const loose = { id: 3, from_location_id: null, to_location_id: 20, one_way: false };
const chalk = {
  id: 4,
  from_location_id: 5,
  to_location_id: 9,
  one_way: true,
  discovered: false,
  blocked: false,
  reason: 'The chalk door. It shortens the way back.',
  from_name: 'Cistern Heart',
  to_name: 'Cistern Gate',
};
const passage = {
  id: 5,
  from_location_id: 4,
  to_location_id: 5,
  one_way: false,
  discovered: true,
  blocked: false,
  reason: 'The passage on.',
  from_name: 'Cistern Deep',
  to_name: 'Cistern Heart',
};
const rows = [stair, drop, loose];

assert.deepEqual(pathsAt(rows, 10).map((row) => row.id), [1]);
assert.deepEqual(pathsAt(rows, 20).map((row) => row.id), [1, 2]);
assert.deepEqual(pathsAt(rows, 30).map((row) => row.id), []);
assert.deepEqual(pathsAt(rows, null).map((row) => row.id), [3]);
assert.deepEqual(pathDestination(stair, true), { locationId: 10 });
assert.deepEqual(pathDestination(stair, false), { locationId: 20 });
assert.deepEqual(pathDestination(drop, true), { error: 'That path is one way' });
assert.deepEqual(pathDestination(loose, true), { error: 'That path has no way back' });

const heart = [chalk, passage];
assert.deepEqual(pathsAt(heart, 5).map((row) => row.id), [4, 5]);
assert.deepEqual(pathsAt(heart, 9).map((row) => row.id), []);
assert.equal(JSON.stringify(playerExits(heart, 5)).includes('Cistern Gate'), false);
assert.equal(JSON.stringify(playerExits(heart, 5)).includes('chalk'), false);
assert.deepEqual(playerExits(heart, 5), [{
  destination_name: 'Cistern Deep',
  reason: 'The passage on.',
  blocked: false,
}]);
assert.deepEqual(playerExits(heart, 9), []);

const found = { ...chalk, discovered: true };
assert.deepEqual(playerExits([found], 5), [{
  destination_name: 'Cistern Gate',
  reason: chalk.reason,
  blocked: false,
}]);
const shut = { ...found, blocked: true };
assert.equal(playerExits([shut], 5)[0].blocked, true);
assert.equal(playerExits([shut], 5)[0].destination_name, 'Cistern Gate');
assert.deepEqual(playerExits([shut], 9), []);

const both = {
  id: 6,
  from_location_id: 5,
  to_location_id: 9,
  one_way: false,
  discovered: false,
  blocked: true,
  reason: 'A secret both ways.',
  from_name: 'Cistern Heart',
  to_name: 'Cistern Gate',
};
assert.deepEqual(playerExits([both], 5), []);
assert.deepEqual(playerExits([both], 9), []);
assert.equal(pathsAt([both], 5).length, 1);
assert.equal(pathsAt([both], 9).length, 1);

assert.equal(pathTravel(chalk, false, false).error, 'That path is not found');
assert.equal(pathTravel(shut, false, false).error, 'That path is blocked');
assert.equal(pathTravel(found, false, false).log, undefined);
assert.equal(pathTravel(found, false, false).locationId, 9);
assert.match(pathTravel(chalk, false, true).log.body, /before it was found/);
assert.equal(pathTravel(chalk, false, true).log.kind, 'decision');
assert.match(pathTravel(shut, false, true).log.body, /while it was blocked/);
assert.equal(pathTravel(chalk, true, true).error, 'That path is one way');
assert.equal(pathTravel(stair, false, false).log, undefined);

const leaked = playerHere({
  location_name: 'Cistern Heart',
  location_id: 5,
  objectives: [],
  paths: heart,
  facts: [{ subject_key: 'waterwheel' }],
});
assert.equal(JSON.stringify(leaked).includes('chalk'), false);
assert.equal(JSON.stringify(leaked).includes('Cistern Gate'), false);
assert.equal(Object.hasOwn(leaked, 'paths'), false);
assert.equal(Object.hasOwn(leaked, 'facts'), false);
assert.equal(leaked.exits.length, 1);

const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const hereAt = serverSource.indexOf("app.get('/api/campaigns/:campaignId/here'");
const hereEnd = serverSource.indexOf('// ==================== HEALTH', hereAt);
const hereSource = serverSource.slice(hereAt, hereEnd);
assert.equal(hereSource.includes('playerHere'), true);
assert.equal(hereSource.includes('to_name'), true);
const arriveAt = serverSource.indexOf("app.post('/api/campaigns/:campaignId/situation/transitions/:transitionId/arrive'");
const foundAt = serverSource.indexOf("app.post('/api/campaigns/:campaignId/situation/transitions/:transitionId/found'");
const accessAt = serverSource.indexOf("app.post('/api/campaigns/:campaignId/situation/transitions/:transitionId/access'");
assert.ok(arriveAt > 0 && foundAt > arriveAt && accessAt > foundAt);
assert.equal(serverSource.slice(arriveAt, foundAt).includes('pathTravel'), true);
assert.equal(serverSource.slice(arriveAt, foundAt).includes('requireCampaign(req, res, req.params.campaignId, false)'), false);
assert.equal(serverSource.slice(foundAt, accessAt).includes('markPathFound'), true);
assert.equal(serverSource.slice(accessAt, accessAt + 700).includes('setPathAccess'), true);

const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
const tableAt = schema.indexOf('CREATE TABLE IF NOT EXISTS public.campaign_transition');
const tableSql = schema.slice(tableAt, schema.indexOf('CREATE INDEX IF NOT EXISTS idx_campaign_transition_campaign', tableAt));
assert.equal(tableSql.includes('discovered boolean NOT NULL DEFAULT true'), true);
assert.equal(tableSql.includes('base_discovered boolean NOT NULL DEFAULT true'), true);
assert.equal(tableSql.includes('blocked boolean NOT NULL DEFAULT false'), true);
assert.equal(tableSql.includes('base_blocked boolean NOT NULL DEFAULT false'), true);
assert.equal(schema.includes('CREATE TABLE IF NOT EXISTS public.campaign_path'), false);

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
    const table = await client.query(
      'SELECT id FROM encounter_table WHERE ruleset_id IS NOT NULL ORDER BY id LIMIT 1'
    );
    const rulesetId = ruleset.rows[0].id;
    const tableId = table.rows[0].id;
    const stamp = Date.now();
    const campaign = await client.query(
      `INSERT INTO campaign (name, ruleset_id, running, concluded)
       VALUES ($1, $2, false, false) RETURNING id`,
      [`zz-phase3-path-${stamp}`, rulesetId]
    );
    const campaignId = campaign.rows[0].id;
    async function place(name) {
      const inserted = await client.query(
        `INSERT INTO campaign_location
           (campaign_id, name, place, check_die, interval_seconds, encounter_table_id, ambient_light)
         VALUES ($1, $2, 'inside', 6, 1800, $3, 0)
         RETURNING id`,
        [campaignId, name, tableId]
      );
      return inserted.rows[0].id;
    }
    const heartId = await place('Cistern Heart');
    const gateId = await place('Cistern Gate');
    const deepId = await place('Cistern Deep');
    await client.query(
      `INSERT INTO campaign_board (campaign_id, game_seconds, location_id, place)
       VALUES ($1, 0, $2, 'inside')`,
      [campaignId, heartId]
    );
    const secret = await client.query(
      `INSERT INTO campaign_transition
         (campaign_id, from_location_id, to_location_id, reason, one_way, discovered, base_discovered, blocked, base_blocked)
       VALUES ($1, $2, $3, 'The chalk door. It shortens the way back.', true, false, false, false, false)
       RETURNING id`,
      [campaignId, heartId, gateId]
    );
    const secretId = secret.rows[0].id;
    await client.query(
      `INSERT INTO campaign_transition
         (campaign_id, from_location_id, to_location_id, reason, one_way, discovered, base_discovered, blocked, base_blocked)
       VALUES ($1, $2, $3, 'The passage on.', false, true, true, false, false)`,
      [campaignId, deepId, heartId]
    );
    const listed = await client.query(
      `SELECT t.from_location_id, t.to_location_id, t.reason, t.one_way, t.discovered, t.blocked,
              f.name AS from_name, d.name AS to_name
       FROM campaign_transition t
       LEFT JOIN campaign_location f ON f.id = t.from_location_id
       JOIN campaign_location d ON d.id = t.to_location_id
       WHERE t.campaign_id = $1`,
      [campaignId]
    );
    const hidden = playerHere({
      location_name: 'Cistern Heart',
      location_id: heartId,
      paths: listed.rows,
    });
    assert.equal(JSON.stringify(hidden).includes('chalk'), false);
    assert.equal(JSON.stringify(hidden).includes('Cistern Gate'), false);

    const opened = await markPathFound(client, campaignId, secretId);
    assert.equal(opened.changed, true);
    assert.equal(opened.blocked, false);
    const again = await markPathFound(client, campaignId, secretId);
    assert.equal(again.changed, false);
    const logs = await client.query(
      'SELECT kind, body FROM campaign_log WHERE campaign_id = $1 ORDER BY id',
      [campaignId]
    );
    assert.equal(logs.rows.length, 1);
    assert.equal(logs.rows[0].kind, 'discovery');
    const afterFound = await client.query(
      'SELECT discovered, blocked, base_discovered, base_blocked FROM campaign_transition WHERE id = $1',
      [secretId]
    );
    assert.equal(afterFound.rows[0].discovered, true);
    assert.equal(afterFound.rows[0].blocked, false);
    assert.equal(afterFound.rows[0].base_discovered, false);

    const blocked = await setPathAccess(client, campaignId, secretId, true);
    assert.equal(blocked.changed, true);
    assert.equal(blocked.discovered, true);
    const sameBlock = await setPathAccess(client, campaignId, secretId, true);
    assert.equal(sameBlock.changed, false);
    const stillFound = await client.query(
      'SELECT discovered, blocked FROM campaign_transition WHERE id = $1',
      [secretId]
    );
    assert.equal(stillFound.rows[0].discovered, true);
    assert.equal(stillFound.rows[0].blocked, true);
    const logCount = await client.query(
      'SELECT count(*)::int AS n FROM campaign_log WHERE campaign_id = $1',
      [campaignId]
    );
    assert.equal(logCount.rows[0].n, 2);

    await resetCampaignRun(client, campaignId);
    const restored = await client.query(
      'SELECT discovered, blocked FROM campaign_transition WHERE id = $1',
      [secretId]
    );
    assert.equal(restored.rows[0].discovered, false);
    assert.equal(restored.rows[0].blocked, false);
    const wiped = await client.query(
      'SELECT count(*)::int AS n FROM campaign_log WHERE campaign_id = $1',
      [campaignId]
    );
    assert.equal(wiped.rows[0].n, 0);
  });
  console.log('path way ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
