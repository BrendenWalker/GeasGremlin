/**
 * Playthrough facts that do not fit the room-flag enum.
 * campaign_id is the only owner. There is no campaign_run_id.
 * The clock, clues, objectives, encounters, and room flags stay on their own tables.
 * Water flowing is derived from the wheel and the slab. It is not a row.
 * Opening Rising water is a preview over the existing encounter. It is not a row.
 */

const FACTS = [
  {
    subject_type: 'object',
    subject_key: 'waterwheel',
    state_key: 'blocked',
    location_name: 'Cistern Well',
    label: 'Waterwheel blocked',
    base: true,
  },
  {
    subject_type: 'object',
    subject_key: 'burial_slab',
    state_key: 'removed',
    location_name: 'Cistern Heart',
    label: 'Burial slab removed',
    base: false,
  },
];

const LIST_FACTS_SQL = `SELECT id, campaign_id, location_id, subject_type, subject_key, state_key,
            value_json, base_value_json, version
     FROM campaign_state_value
     WHERE campaign_id = $1
     ORDER BY subject_key, state_key, id`;

const SELECT_FACT_SQL = `SELECT id, campaign_id, location_id, subject_type, subject_key, state_key,
            value_json, base_value_json, version
     FROM campaign_state_value
     WHERE campaign_id = $1 AND subject_type = $2 AND subject_key = $3 AND state_key = $4
     FOR UPDATE`;

const SET_FACT_SQL = `UPDATE campaign_state_value
     SET value_json = to_jsonb($5::boolean), version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE campaign_id = $1 AND subject_type = $2 AND subject_key = $3 AND state_key = $4 AND version = $6
     RETURNING id, campaign_id, location_id, subject_type, subject_key, state_key,
               value_json, base_value_json, version`;

const LOG_FACT_SQL = `INSERT INTO campaign_log (campaign_id, location_id, at_seconds, kind, body)
     VALUES ($1, $2, $3, 'decision', $4)`;

const CLOCK_SQL = `SELECT COALESCE(game_seconds, 0) AS game_seconds
     FROM campaign_board WHERE campaign_id = $1`;

const ATTACH_FACT_SQL = `INSERT INTO campaign_state_value
       (campaign_id, location_id, subject_type, subject_key, state_key, value_json, base_value_json)
     SELECT l.campaign_id, l.id, $2::varchar, $3::varchar, $4::varchar, to_jsonb($5::boolean), to_jsonb($5::boolean)
     FROM campaign_location l
     WHERE l.campaign_id = $1 AND l.name = $6::varchar
       AND NOT EXISTS (
         SELECT 1 FROM campaign_state_value s
         WHERE s.campaign_id = l.campaign_id
           AND s.subject_type = $2::varchar
           AND s.subject_key = $3::varchar
           AND s.state_key = $4::varchar
       )
     RETURNING id`;

const RESTORE_FACTS_SQL = `UPDATE campaign_state_value
     SET value_json = base_value_json, version = 1, updated_at = CURRENT_TIMESTAMP
     WHERE campaign_id = $1`;

function findFact(row) {
  return FACTS.find((spec) => (
    spec.subject_type === row?.subject_type
    && spec.subject_key === row?.subject_key
    && spec.state_key === row?.state_key
  )) || null;
}

function readStateCommand(body) {
  const subject_type = String(body?.subject_type ?? '').trim();
  const subject_key = String(body?.subject_key ?? '').trim();
  const state_key = String(body?.state_key ?? '').trim();
  if (!findFact({ subject_type, subject_key, state_key })) return { error: 'Unknown fact' };
  if (typeof body?.value !== 'boolean') return { error: 'value must be true or false' };
  const version = Number(body?.version);
  if (!Number.isInteger(version) || version < 1) return { error: 'version must be a positive integer' };
  return { subject_type, subject_key, state_key, value: body.value, version };
}

function presentFact(row) {
  const spec = findFact(row);
  return {
    id: Number(row.id),
    campaign_id: Number(row.campaign_id),
    location_id: row.location_id == null ? null : Number(row.location_id),
    subject_type: row.subject_type,
    subject_key: row.subject_key,
    state_key: row.state_key,
    label: spec ? spec.label : `${row.subject_key} ${row.state_key}`,
    value: row.value_json === true,
    base: row.base_value_json === true,
    version: Number(row.version),
  };
}

function waterFlowing(facts) {
  const wheel = (facts || []).find((fact) => fact.subject_key === 'waterwheel' && fact.state_key === 'blocked');
  const slab = (facts || []).find((fact) => fact.subject_key === 'burial_slab' && fact.state_key === 'removed');
  if (!wheel || !slab) return null;
  return wheel.value === false && slab.value === true;
}

const RISING_WATER_TITLE = 'Rising water';

function memberCount(row) {
  if (Array.isArray(row?.members)) return row.members.length;
  if (row?.member_count == null) return 0;
  return Number(row.member_count);
}

function risingWaterPreview(facts, encounters) {
  const wheel = (facts || []).find((fact) => fact.subject_key === 'waterwheel' && fact.state_key === 'blocked');
  if (!wheel || wheel.value !== false) return null;
  const matches = (encounters || []).filter((row) => (
    row
    && row.title === RISING_WATER_TITLE
    && row.status === 'prepared'
    && row.kind === 'environment'
    && memberCount(row) === 0
  ));
  if (matches.length !== 1) return null;
  return {
    encounter_id: Number(matches[0].id),
    title: RISING_WATER_TITLE,
    why: 'The wheel is free. Open Rising water.',
    change: 'open',
  };
}

function readPreviewCommand(body) {
  const encounter_id = Number(body?.encounter_id);
  if (!Number.isInteger(encounter_id) || encounter_id < 1) return { error: 'encounter_id is required' };
  return { encounter_id };
}

function rejectRisingWater() {
  return { changed: false };
}

async function applyRisingWater(client, campaignId, encounterId, openEncounter) {
  const id = Number(encounterId);
  if (!Number.isInteger(id) || id < 1) throw storedError('encounter_id is required', 400);
  await client.query(SELECT_FACT_SQL, [campaignId, 'object', 'waterwheel', 'blocked']);
  const listed = await listFacts(client, campaignId);
  const encounters = await client.query(
    `SELECT e.id, e.title, e.kind, e.status,
            (SELECT count(*)::int FROM campaign_encounter_member m WHERE m.encounter_id = e.id) AS member_count
     FROM campaign_encounter e
     WHERE e.campaign_id = $1
     ORDER BY e.id`,
    [campaignId]
  );
  const preview = risingWaterPreview(listed.facts, encounters.rows);
  if (!preview || preview.encounter_id !== id) return { changed: false };
  const opened = await openEncounter(client, campaignId, id);
  return {
    changed: opened.changed === true,
    encounter_id: id,
    in_encounter: opened.in_encounter === true,
  };
}

function storedError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function listFacts(client, campaignId) {
  const result = await client.query(LIST_FACTS_SQL, [campaignId]);
  const facts = result.rows.filter((row) => findFact(row)).map(presentFact);
  return { facts, water_flowing: waterFlowing(facts) };
}

async function setFact(client, campaignId, command) {
  const spec = findFact(command);
  if (!spec) throw storedError('Unknown fact', 400);
  const locked = await client.query(SELECT_FACT_SQL, [
    campaignId, spec.subject_type, spec.subject_key, spec.state_key,
  ]);
  if (locked.rows.length === 0) throw storedError('Fact not found', 404);
  const current = presentFact(locked.rows[0]);
  if (current.value === command.value) return { changed: false, fact: current };
  if (current.version !== command.version) throw storedError('The fact changed. Reload and try again.', 409);
  const updated = await client.query(SET_FACT_SQL, [
    campaignId, spec.subject_type, spec.subject_key, spec.state_key, command.value, command.version,
  ]);
  if (updated.rows.length === 0) throw storedError('The fact changed. Reload and try again.', 409);
  const clock = await client.query(CLOCK_SQL, [campaignId]);
  const atSeconds = clock.rows.length === 0 ? 0 : Number(clock.rows[0].game_seconds);
  const fact = presentFact(updated.rows[0]);
  await client.query(LOG_FACT_SQL, [
    campaignId,
    fact.location_id,
    atSeconds,
    `${spec.label} is now ${fact.value ? 'yes' : 'no'}.`,
  ]);
  return { changed: true, fact };
}

async function attachAuthoredFacts(client, campaignId) {
  const inserted = [];
  for (const spec of FACTS) {
    const result = await client.query(ATTACH_FACT_SQL, [
      campaignId,
      spec.subject_type,
      spec.subject_key,
      spec.state_key,
      spec.base,
      spec.location_name,
    ]);
    if (result.rows[0]) inserted.push(Number(result.rows[0].id));
  }
  return inserted;
}

module.exports = {
  FACTS,
  LIST_FACTS_SQL,
  SELECT_FACT_SQL,
  SET_FACT_SQL,
  LOG_FACT_SQL,
  CLOCK_SQL,
  ATTACH_FACT_SQL,
  RESTORE_FACTS_SQL,
  findFact,
  readStateCommand,
  presentFact,
  waterFlowing,
  risingWaterPreview,
  readPreviewCommand,
  rejectRisingWater,
  applyRisingWater,
  listFacts,
  setFact,
  attachAuthoredFacts,
};
