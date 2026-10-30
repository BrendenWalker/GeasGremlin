/**
 * Session end pauses a campaign. Conclude copies the log into
 * campaign_log_archive, wipes the playthrough back to authored base lines, and
 * sets concluded. An empty log copies nothing. There is no separate replay
 * route: starting a session only clears that flag. The statements below are
 * the contract.
 */

const { RESTORE_FACTS_SQL } = require('./playState');

function missingCampaign() {
  const error = new Error('Campaign not found');
  error.status = 404;
  return error;
}

const START_SESSION_SQL = 'UPDATE campaign SET running = true, concluded = false, modified = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *';

const END_SESSION_SQL = 'UPDATE campaign SET running = false, modified = CURRENT_TIMESTAMP WHERE id = $1 RETURNING running, concluded';

const CONCLUDE_CAMPAIGN_SQL = `UPDATE campaign SET concluded = true, running = false, modified = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING running, concluded`;

const LOCK_CAMPAIGN_SQL = 'SELECT id FROM campaign WHERE id = $1 FOR UPDATE';

const ARCHIVE_LOG_SQL = `INSERT INTO campaign_log_archive
     (campaign_id, play_no, at_seconds, location_id, kind, body)
     SELECT campaign_id,
            (SELECT COALESCE(MAX(play_no), 0) + 1 FROM campaign_log_archive WHERE campaign_id = $1),
            at_seconds, location_id, kind, body
     FROM campaign_log
     WHERE campaign_id = $1`;

const RESET_STEPS = [
  {
    kind: 'restore',
    table: 'campaign_creature',
    phrase: 'creature hit points',
    sql: `UPDATE campaign_creature
     SET hp = base_hp, disposition = base_disposition, in_fight = false
     WHERE campaign_id = $1`,
  },
  {
    kind: 'restore',
    table: 'campaign_encounter',
    phrase: 'encounter status',
    sql: 'UPDATE campaign_encounter SET status = base_status WHERE campaign_id = $1',
  },
  {
    kind: 'restore',
    table: 'campaign_clue',
    phrase: 'clues',
    sql: 'UPDATE campaign_clue SET discovered = base_discovered WHERE campaign_id = $1',
  },
  {
    kind: 'restore',
    table: 'campaign_objective',
    phrase: 'objectives',
    sql: 'UPDATE campaign_objective SET known = base_known, status = base_status WHERE campaign_id = $1',
  },
  {
    kind: 'restore',
    table: 'campaign_board',
    phrase: 'the clock',
    sql: `UPDATE campaign_board
     SET game_seconds = 0, in_encounter = false, place = 'outside',
         location_id = NULL, check_seconds = NULL, visit_seconds = NULL
     WHERE campaign_id = $1`,
  },
  {
    kind: 'restore',
    table: 'campaign_location',
    phrase: 'arrived',
    sql: 'UPDATE campaign_location SET arrived_seconds = NULL WHERE campaign_id = $1',
  },
  {
    kind: 'restore',
    table: 'campaign_state_value',
    phrase: 'object facts',
    sql: RESTORE_FACTS_SQL,
  },
  {
    kind: 'restore',
    table: 'campaign_transition',
    phrase: 'path discovery',
    sql: `UPDATE campaign_transition
     SET discovered = base_discovered, blocked = base_blocked
     WHERE campaign_id = $1`,
  },
  {
    kind: 'restore',
    table: 'campaign_character',
    phrase: 'hunger',
    sql: `UPDATE campaign_character
     SET food_missed = 0, heal_food = false, heal_water = false,
         march_days = 0, march_failed = false, hire_penalty = 0
     WHERE campaign_id = $1`,
  },
  {
    kind: 'delete',
    table: 'campaign_wander',
    phrase: 'wander checks',
    sql: 'DELETE FROM campaign_wander WHERE campaign_id = $1',
  },
  {
    kind: 'delete',
    table: 'campaign_log',
    phrase: 'the log',
    sql: 'DELETE FROM campaign_log WHERE campaign_id = $1',
  },
  {
    kind: 'delete',
    table: 'campaign_mark',
    phrase: 'clock marks',
    sql: 'DELETE FROM campaign_mark WHERE campaign_id = $1',
  },
  {
    kind: 'delete',
    table: 'campaign_turn_block',
    phrase: 'turn blocks',
    sql: 'DELETE FROM campaign_turn_block WHERE campaign_id = $1',
  },
  {
    kind: 'delete',
    table: 'campaign_presence',
    phrase: 'presence',
    sql: 'DELETE FROM campaign_presence WHERE campaign_id = $1',
  },
  {
    kind: 'delete',
    table: 'campaign_location_flag',
    phrase: 'room flags',
    sql: `DELETE FROM campaign_location_flag f
     USING campaign_location l
     WHERE f.location_id = l.id AND l.campaign_id = $1`,
  },
  {
    kind: 'delete',
    table: 'campaign_command',
    phrase: 'pending commands',
    sql: 'DELETE FROM campaign_command WHERE campaign_id = $1',
  },
  {
    kind: 'delete',
    table: 'campaign_hireling',
    phrase: 'hirelings',
    sql: 'DELETE FROM campaign_hireling WHERE campaign_id = $1',
  },
];

const PRESERVED_TABLES = [
  'campaign',
  'campaign_member',
  'characters',
  'character_classes',
  'character_abilities',
  'character_effects',
  'character_items',
  'character_spells',
  'character_spells_cast',
  'character_transfer',
  'campaign_npc',
  'campaign_encounter_member',
  'campaign_transition',
  'campaign_state_value',
  'campaign_location_shops',
  'campaign_location_shop_item_categories',
  'campaign_log_archive',
  'encounter_table',
  'ruleset',
];

async function resetCampaignRun(client, campaignId) {
  for (const step of RESET_STEPS) {
    await client.query(step.sql, [campaignId]);
  }
}

async function endCampaignSession(client, campaignId) {
  const current = await client.query('SELECT id, concluded FROM campaign WHERE id = $1', [campaignId]);
  if (current.rows.length === 0) throw missingCampaign();
  const updated = await client.query(END_SESSION_SQL, [campaignId]);
  return {
    running: updated.rows[0].running === true,
    concluded: updated.rows[0].concluded === true,
  };
}

async function concludeCampaignRun(client, campaignId) {
  const current = await client.query(LOCK_CAMPAIGN_SQL, [campaignId]);
  if (current.rows.length === 0) throw missingCampaign();
  await client.query(ARCHIVE_LOG_SQL, [campaignId]);
  await resetCampaignRun(client, campaignId);
  const updated = await client.query(CONCLUDE_CAMPAIGN_SQL, [campaignId]);
  return {
    running: updated.rows[0].running === true,
    concluded: updated.rows[0].concluded === true,
  };
}

module.exports = {
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
};
