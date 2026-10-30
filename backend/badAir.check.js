/**
 * One confirmed point of bad air on the stair. The database section rolls back.
 * It does not conclude a campaign and it does not commit.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const repoEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(repoEnv)) require('dotenv').config({ path: repoEnv });
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { poolFromEnv } = require('./scripts/import-catalog');
const { resetCampaignRun } = require('./campaignLifecycle');
const { openPreparedEncounter } = require('./preparedEncounter');
const { risingWaterPreview } = require('./playState');
const {
  BAD_AIR_LOG,
  badAirPreview,
  readBadAirCommand,
  rejectBadAir,
  badAirOnTurn,
  applyBadAir,
} = require('./playState');
const { writeCharacterHitPoints, pool: serverPool } = require('./server');

const opened = [{
  id: 4, title: 'Bad air', status: 'opened', kind: 'hazard', member_count: 0,
}];
const stair = {
  step: 'turn',
  in_encounter: false,
  location_name: 'Cistern Stair',
  game_seconds: 600,
  already: false,
  encounters: opened,
};

assert.equal(badAirPreview(stair).encounter_id, 4);
assert.equal(badAirPreview(stair).title, 'Bad air');
assert.equal(badAirPreview(stair).change, 'damage');
assert.equal(badAirPreview(stair).delta, -1);
assert.equal(badAirPreview(stair).game_seconds, 600);
assert.equal(badAirPreview(stair).why, 'A turn of searching costs 1 damage.');
assert.equal(badAirPreview({ ...stair, step: 'round' }), null);
assert.equal(badAirPreview({ ...stair, step: 'watch' }), null);
assert.equal(badAirPreview({ ...stair, step: 'day' }), null);
assert.equal(badAirPreview({ ...stair, in_encounter: true }), null);
assert.equal(badAirPreview({ ...stair, location_name: 'Millbridge' }), null);
assert.equal(badAirPreview({ ...stair, location_name: null }), null);
assert.equal(badAirPreview({ ...stair, already: true }), null);
assert.equal(badAirPreview({ ...stair, game_seconds: -1 }), null);
assert.equal(badAirPreview({ ...stair, game_seconds: 1.5 }), null);
assert.equal(badAirPreview({ ...stair, encounters: [{ ...opened[0], status: 'prepared' }] }), null);
assert.equal(badAirPreview({ ...stair, encounters: [{ ...opened[0], status: 'resolved' }] }), null);
assert.equal(badAirPreview({ ...stair, encounters: [{ ...opened[0], kind: 'environment' }] }), null);
assert.equal(badAirPreview({ ...stair, encounters: [{ ...opened[0], member_count: 1 }] }), null);
assert.equal(badAirPreview({ ...stair, encounters: [{ ...opened[0], members: [{ id: 9 }] }] }), null);
assert.equal(badAirPreview({
  ...stair,
  encounters: [opened[0], { ...opened[0], id: 5 }],
}), null);
assert.equal(badAirPreview({ ...stair, encounters: [] }), null);
assert.deepEqual(rejectBadAir(), { changed: false });
assert.equal(readBadAirCommand({}).error, 'game_seconds is required');
assert.equal(readBadAirCommand({ game_seconds: -1 }).error, 'game_seconds is required');
assert.equal(readBadAirCommand({ game_seconds: 1.5 }).error, 'game_seconds is required');
assert.equal(readBadAirCommand({ game_seconds: 600 }).game_seconds, 600);
assert.equal(risingWaterPreview(
  [{ subject_key: 'waterwheel', state_key: 'blocked', value: false }],
  [{ id: 7, title: 'Rising water', status: 'prepared', kind: 'environment', member_count: 0 }]
).change, 'open');
assert.equal(badAirPreview({
  ...stair,
  encounters: [{ id: 7, title: 'Rising water', status: 'opened', kind: 'environment', member_count: 0 }],
}), null);

const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
assert.equal(schema.includes('CREATE TABLE IF NOT EXISTS public.campaign_situation'), false);
assert.equal(schema.includes('campaign_automation_rule'), false);

const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const playSource = fs.readFileSync(path.join(__dirname, 'playState.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'AdventuringPage.jsx'), 'utf8');

const tickAt = serverSource.indexOf("app.post('/api/campaigns/:campaignId/adventuring/tick'");
const tickEnd = serverSource.indexOf('function rollDie', tickAt);
assert.ok(tickAt > 0 && tickEnd > tickAt);
const tickSource = serverSource.slice(tickAt, tickEnd);
assert.equal(tickSource.split('applyWander(').length - 1, 1);
assert.equal(tickSource.split('applyVisitCheck(').length - 1, 1);
assert.ok(tickSource.indexOf('applyWander(') < tickSource.indexOf('badAirOnTurn('));
assert.ok(tickSource.indexOf('applyVisitCheck(') < tickSource.indexOf('badAirOnTurn('));
assert.equal(tickSource.includes("req.body.step === 'turn'"), true);
assert.equal(tickSource.includes('bad_air: badAir'), true);

const loadAt = serverSource.indexOf('async function loadAdventuring');
const loadEnd = serverSource.indexOf('async function queueForParty', loadAt);
assert.ok(loadAt > 0 && loadEnd > loadAt);
const loadSource = serverSource.slice(loadAt, loadEnd);
assert.equal(loadSource.includes('bad_air'), false);
assert.equal(loadSource.includes('badAir'), false);
assert.equal(loadSource.includes('rising_water: risingWaterPreview'), true);

const hereAt = serverSource.indexOf("app.get('/api/campaigns/:campaignId/here'");
const hereEnd = serverSource.indexOf('// ==================== HEALTH', hereAt);
assert.ok(hereAt > 0 && hereEnd > hereAt);
const hereSource = serverSource.slice(hereAt, hereEnd);
assert.equal(hereSource.includes('bad_air'), false);
assert.equal(hereSource.includes('badAir'), false);

const badApply = serverSource.indexOf("app.post('/api/campaigns/:campaignId/adventuring/bad-air/apply'");
const badReject = serverSource.indexOf("app.post('/api/campaigns/:campaignId/adventuring/bad-air/reject'");
const badEnd = serverSource.indexOf("app.post('/api/campaigns/:campaignId/adventuring/creatures/take'", badReject);
assert.ok(badApply > 0 && badReject > badApply && badEnd > badReject);
const badRoutes = serverSource.slice(badApply, badEnd);
assert.equal((badRoutes.match(/requireCampaign\(req, res, req\.params\.campaignId, true\)/g) || []).length, 2);
assert.equal(badRoutes.includes('requireCampaign(req, res, req.params.campaignId, false)'), false);
assert.equal(badRoutes.includes('applyBadAir'), true);
assert.equal(badRoutes.includes('writeCharacterHitPoints'), true);
const rejectRoute = serverSource.slice(badReject, badEnd);
assert.equal(rejectRoute.includes('rejectBadAir()'), true);
assert.equal(rejectRoute.includes('INSERT'), false);
assert.equal(rejectRoute.includes('UPDATE'), false);
assert.equal(rejectRoute.includes('DELETE'), false);

const applyFn = playSource.slice(
  playSource.indexOf('async function applyBadAir'),
  playSource.indexOf('module.exports')
);
assert.equal(applyFn.includes("writeHitPoints(client, Number(person.id), -1, 'bad air')"), true);
assert.equal(applyFn.includes('campaign_creature'), false);
assert.equal(applyFn.includes('campaign_hireling'), false);
assert.equal(applyFn.includes('roll'), false);
const characterSql = playSource.slice(
  playSource.indexOf('const BAD_AIR_CHARACTERS_SQL'),
  playSource.indexOf('const BAD_AIR_MARK_SQL')
);
assert.equal(characterSql.includes('campaign_character'), true);
assert.equal(characterSql.includes('campaign_creature'), false);
assert.equal(characterSql.includes('campaign_hireling'), false);
assert.equal(BAD_AIR_LOG, 'Bad air costs 1 damage.');

assert.equal(pageSource.includes('board?.bad_air'), false);
assert.equal(pageSource.includes('res?.data?.bad_air'), true);
assert.equal(pageSource.includes('Apply 1 damage'), true);
assert.equal(pageSource.includes('game_seconds: badAirAsk.game_seconds'), true);

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
  try {
    await withRollback(async (client) => {
      const ruleset = await client.query('SELECT id FROM ruleset ORDER BY id LIMIT 1');
      assert.ok(ruleset.rows.length === 1, 'ruleset');
      const table = await client.query(
        'SELECT id FROM encounter_table WHERE ruleset_id IS NOT NULL ORDER BY id LIMIT 1'
      );
      assert.ok(table.rows.length === 1, 'encounter table');
      const hpStat = await client.query(`SELECT id FROM stat WHERE name = 'HP' ORDER BY id LIMIT 1`);
      assert.ok(hpStat.rows.length === 1, 'HP stat');
      const rulesetId = ruleset.rows[0].id;
      const tableId = table.rows[0].id;
      const stamp = Date.now();
      const situation = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'campaign_situation'`
      );
      assert.equal(situation.rows.length, 0);

      async function campaign(suffix) {
        const inserted = await client.query(
          `INSERT INTO campaign (name, ruleset_id, running, concluded)
           VALUES ($1, $2, false, false) RETURNING id`,
          [`zz-phase4-${suffix}-${stamp}`, rulesetId]
        );
        return inserted.rows[0].id;
      }

      async function place(campaignId, name) {
        const inserted = await client.query(
          `INSERT INTO campaign_location
             (campaign_id, name, place, check_die, interval_seconds, encounter_table_id, ambient_light)
           VALUES ($1, $2, 'inside', 6, 1800, $3, 0)
           RETURNING id`,
          [campaignId, name, tableId]
        );
        return Number(inserted.rows[0].id);
      }

      async function person(name, hp, campaignId) {
        const idRow = await client.query('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM characters');
        const inserted = await client.query(
          `INSERT INTO characters (id, name, "user", hp, ruleset_id)
           VALUES ($1, $2, 'zz', $3, $4)
           RETURNING id`,
          [idRow.rows[0].id, name, hp, rulesetId]
        );
        const id = Number(inserted.rows[0].id);
        if (campaignId != null) {
          await client.query(
            `INSERT INTO campaign_character (campaign_id, character_id)
             VALUES ($1, $2)`,
            [campaignId, id]
          );
        }
        return id;
      }

      async function wound(characterId) {
        const result = await client.query(
          `SELECT COALESCE(SUM(e.value), 0) AS wound, count(e.id)::int AS rows,
                  COALESCE(string_agg(trim(e.note), ',' ORDER BY e.id), '') AS notes
           FROM character_effects e
           JOIN stat s ON s.id = e.effect AND s.name = 'HP'
           WHERE e.character_id = $1`,
          [characterId]
        );
        return {
          wound: Number(result.rows[0].wound),
          rows: Number(result.rows[0].rows),
          notes: result.rows[0].notes,
        };
      }

      const id = await campaign('stair');
      const other = await campaign('other');
      const stairId = await place(id, 'Cistern Stair');
      const townId = await place(id, 'Millbridge');
      const alive = await person(`zz-air-a-${stamp}`, 4, id);
      const second = await person(`zz-air-b-${stamp}`, 2, id);
      const dead = await person(`zz-air-c-${stamp}`, 0, id);
      const unknown = await person(`zz-air-d-${stamp}`, null, id);
      const outsider = await person(`zz-air-e-${stamp}`, 9, other);
      const bystander = await person(`zz-air-f-${stamp}`, 8, null);
      await client.query(
        `INSERT INTO campaign_board (campaign_id, game_seconds, in_encounter, place, location_id)
         VALUES ($1, 600, false, 'inside', $2)`,
        [id, stairId]
      );
      const scene = await client.query(
        `INSERT INTO campaign_encounter
           (campaign_id, location_id, title, kind, purpose, status, base_status)
         VALUES ($1, $2, 'Bad air', 'hazard', 'A turn of searching costs 1 damage.', 'prepared', 'prepared')
         RETURNING id`,
        [id, stairId]
      );
      const encounterId = Number(scene.rows[0].id);
      const foe = await client.query(
        `INSERT INTO campaign_creature
           (campaign_id, location_id, name, hp, base_hp, disposition, base_disposition, in_fight)
         VALUES ($1, $2, 'Bat', 6, 6, 'present', 'present', false)
         RETURNING id`,
        [id, stairId]
      );
      await client.query(
        `INSERT INTO campaign_hireling (campaign_id, employer_id, kind, name, cost_gp)
         VALUES ($1, $2, 'specialist', 'Porter', 1)`,
        [id, alive]
      );

      assert.equal(await badAirOnTurn(client, id, 600), null);
      const prepared = await applyBadAir(client, id, 600, writeCharacterHitPoints);
      assert.equal(prepared.changed, false);
      assert.equal((await wound(alive)).rows, 0);
      const openedEncounter = await openPreparedEncounter(client, id, encounterId);
      assert.equal(openedEncounter.changed, true);
      assert.equal(openedEncounter.in_encounter, false);
      const afterOpen = await client.query(
        'SELECT status, in_encounter, game_seconds FROM campaign_encounter e, campaign_board b WHERE e.id = $1 AND b.campaign_id = $2',
        [encounterId, id]
      );
      assert.equal(afterOpen.rows[0].status, 'opened');
      assert.equal(afterOpen.rows[0].in_encounter, false);
      assert.equal(Number(afterOpen.rows[0].game_seconds), 600);
      assert.equal((await wound(alive)).rows, 0);
      const logsAfterOpen = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [id]);
      assert.equal(logsAfterOpen.rows.length, 0);

      const asked = await badAirOnTurn(client, id, 600);
      assert.equal(asked.encounter_id, encounterId);
      assert.equal(asked.delta, -1);
      assert.equal(asked.game_seconds, 600);
      assert.equal(await badAirOnTurn(client, id, 1200), null);
      const stale = await applyBadAir(client, id, 1200, writeCharacterHitPoints);
      assert.equal(stale.changed, false);
      assert.equal(rejectBadAir().changed, false);
      const before = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [id]);
      assert.equal(before.rows.length, 0);

      const applied = await applyBadAir(client, id, 600, writeCharacterHitPoints);
      assert.equal(applied.changed, true);
      assert.equal(applied.damaged, 2);
      assert.equal((await wound(alive)).wound, -1);
      assert.equal((await wound(alive)).notes, 'bad air');
      assert.equal((await wound(second)).wound, -1);
      assert.equal((await wound(second)).notes, 'bad air');
      assert.equal((await wound(dead)).rows, 0);
      assert.equal((await wound(unknown)).rows, 0);
      assert.equal((await wound(outsider)).rows, 0);
      assert.equal((await wound(bystander)).rows, 0);
      const maxima = await client.query(
        'SELECT id, hp FROM characters WHERE id = ANY($1::int[]) ORDER BY id',
        [[alive, second, dead, unknown]]
      );
      assert.deepEqual(maxima.rows.map((row) => row.hp == null ? null : Number(row.hp)), [4, 2, 0, null]);
      const foeHp = await client.query('SELECT hp FROM campaign_creature WHERE id = $1', [foe.rows[0].id]);
      assert.equal(Number(foeHp.rows[0].hp), 6);
      const porters = await client.query(
        'SELECT name, cost_gp FROM campaign_hireling WHERE campaign_id = $1',
        [id]
      );
      assert.equal(porters.rows.length, 1);
      assert.equal(porters.rows[0].name, 'Porter');
      const marked = await client.query(
        'SELECT kind, body, at_seconds, location_id FROM campaign_log WHERE campaign_id = $1',
        [id]
      );
      assert.equal(marked.rows.length, 1);
      assert.equal(marked.rows[0].kind, 'consequence');
      assert.equal(marked.rows[0].body, BAD_AIR_LOG);
      assert.equal(Number(marked.rows[0].at_seconds), 600);
      assert.equal(Number(marked.rows[0].location_id), stairId);
      const wanders = await client.query('SELECT id FROM campaign_wander WHERE campaign_id = $1', [id]);
      assert.equal(wanders.rows.length, 0);

      const again = await applyBadAir(client, id, 600, writeCharacterHitPoints);
      assert.equal(again.changed, false);
      assert.equal((await wound(alive)).rows, 1);
      assert.equal((await wound(second)).wound, -1);
      const stillOne = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [id]);
      assert.equal(stillOne.rows.length, 1);
      assert.equal(await badAirOnTurn(client, id, 600), null);

      await client.query(
        'UPDATE campaign_board SET in_encounter = true, game_seconds = 1200 WHERE campaign_id = $1',
        [id]
      );
      assert.equal(await badAirOnTurn(client, id, 1200), null);
      const fighting = await applyBadAir(client, id, 1200, writeCharacterHitPoints);
      assert.equal(fighting.changed, false);
      assert.equal((await wound(alive)).wound, -1);

      await client.query(
        'UPDATE campaign_board SET in_encounter = false, location_id = $2 WHERE campaign_id = $1',
        [id, townId]
      );
      assert.equal(await badAirOnTurn(client, id, 1200), null);
      const elsewhere = await applyBadAir(client, id, 1200, writeCharacterHitPoints);
      assert.equal(elsewhere.changed, false);

      await client.query(
        'UPDATE campaign_board SET location_id = $2 WHERE campaign_id = $1',
        [id, stairId]
      );
      await client.query(`UPDATE campaign_encounter SET status = 'resolved' WHERE id = $1`, [encounterId]);
      assert.equal(await badAirOnTurn(client, id, 1200), null);
      const resolved = await applyBadAir(client, id, 1200, writeCharacterHitPoints);
      assert.equal(resolved.changed, false);

      await client.query(`UPDATE campaign_encounter SET status = 'opened' WHERE id = $1`, [encounterId]);
      await client.query(
        'INSERT INTO campaign_encounter_member (encounter_id, creature_id) VALUES ($1, $2)',
        [encounterId, foe.rows[0].id]
      );
      assert.equal(await badAirOnTurn(client, id, 1200), null);
      await client.query('DELETE FROM campaign_encounter_member WHERE encounter_id = $1', [encounterId]);
      const later = await badAirOnTurn(client, id, 1200);
      assert.equal(later.game_seconds, 1200);
      const secondTurn = await applyBadAir(client, id, 1200, writeCharacterHitPoints);
      assert.equal(secondTurn.changed, true);
      assert.equal(secondTurn.damaged, 2);
      assert.equal((await wound(alive)).wound, -2);
      assert.equal((await wound(second)).wound, -2);
      assert.equal((await wound(dead)).rows, 0);
      const twoLogs = await client.query(
        'SELECT at_seconds FROM campaign_log WHERE campaign_id = $1 ORDER BY at_seconds',
        [id]
      );
      assert.deepEqual(twoLogs.rows.map((row) => Number(row.at_seconds)), [600, 1200]);
      const repeatLater = await applyBadAir(client, id, 1200, writeCharacterHitPoints);
      assert.equal(repeatLater.changed, false);
      assert.equal((await wound(alive)).rows, 2);

      await resetCampaignRun(client, id);
      const restored = await client.query('SELECT status FROM campaign_encounter WHERE id = $1', [encounterId]);
      assert.equal(restored.rows[0].status, 'prepared');
      const logGone = await client.query('SELECT id FROM campaign_log WHERE campaign_id = $1', [id]);
      assert.equal(logGone.rows.length, 0);
      assert.equal((await wound(alive)).wound, -2);
      assert.equal((await wound(alive)).notes, 'bad air,bad air');
      const foeRestored = await client.query('SELECT hp FROM campaign_creature WHERE id = $1', [foe.rows[0].id]);
      assert.equal(Number(foeRestored.rows[0].hp), 6);
    });
    console.log('bad air ok');
  } finally {
    await serverPool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
