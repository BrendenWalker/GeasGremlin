/**
 * Playthrough facts that do not fit the room-flag enum.
 * campaign_id is the only owner. There is no campaign_run_id.
 * The clock, clues, objectives, encounters, and room flags stay on their own tables.
 * Water flowing is derived from the wheel and the slab. It is not a row.
 * Opening Rising water is a preview over the existing encounter. It is not a row.
 * Bad air damage is a second preview over that encounter and the hit-point write.
 * The water crisis is a read of those facts. It is not a row.
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

const BAD_AIR_TITLE = 'Bad air';
const BAD_AIR_PLACE = 'Cistern Stair';
const BAD_AIR_LOG = 'Bad air costs 1 damage.';

const BAD_AIR_BOARD_SQL = `SELECT b.game_seconds, b.in_encounter, b.location_id, l.name AS location_name
     FROM campaign_board b
     LEFT JOIN campaign_location l ON l.id = b.location_id AND l.campaign_id = b.campaign_id
     WHERE b.campaign_id = $1`;

const BAD_AIR_ENCOUNTERS_SQL = `SELECT e.id, e.title, e.kind, e.status,
            (SELECT count(*)::int FROM campaign_encounter_member m WHERE m.encounter_id = e.id) AS member_count
     FROM campaign_encounter e
     WHERE e.campaign_id = $1 AND e.title = $2
     ORDER BY e.id`;

const BAD_AIR_LOG_SQL = `SELECT id FROM campaign_log
     WHERE campaign_id = $1 AND at_seconds = $2 AND body = $3
     LIMIT 1`;

const BAD_AIR_CHARACTERS_SQL = `SELECT c.id,
            CASE WHEN c.hp IS NULL THEN NULL
            ELSE LEAST(GREATEST(c.hp + COALESCE((
              SELECT SUM(e.value)
              FROM character_effects e
              JOIN stat s ON s.id = e.effect AND s.name = 'HP'
              WHERE e.character_id = c.id
            ), 0), 0), c.hp)
            END AS current_hp
     FROM characters c
     INNER JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
     ORDER BY c.id`;

const BAD_AIR_MARK_SQL = `INSERT INTO campaign_log (campaign_id, location_id, at_seconds, kind, body)
     VALUES ($1, $2, $3, 'consequence', $4)`;

function badAirPreview(turn) {
  if (!turn || turn.step !== 'turn' || turn.in_encounter === true || turn.already === true) return null;
  if (turn.location_name !== BAD_AIR_PLACE) return null;
  const game_seconds = Number(turn.game_seconds);
  if (!Number.isInteger(game_seconds) || game_seconds < 0) return null;
  const matches = (turn.encounters || []).filter((row) => (
    row
    && row.title === BAD_AIR_TITLE
    && row.status === 'opened'
    && row.kind === 'hazard'
    && memberCount(row) === 0
  ));
  if (matches.length !== 1) return null;
  return {
    encounter_id: Number(matches[0].id),
    title: BAD_AIR_TITLE,
    why: 'A turn of searching costs 1 damage.',
    change: 'damage',
    delta: -1,
    game_seconds,
  };
}

function readBadAirCommand(body) {
  const game_seconds = Number(body?.game_seconds);
  if (!Number.isInteger(game_seconds) || game_seconds < 0) return { error: 'game_seconds is required' };
  return { game_seconds };
}

function rejectBadAir() {
  return { changed: false };
}

async function readBadAirTurn(client, campaignId, lock) {
  const board = await client.query(
    `${BAD_AIR_BOARD_SQL}${lock ? ' FOR UPDATE OF b' : ''}`,
    [campaignId]
  );
  if (board.rows.length === 0) return null;
  const row = board.rows[0];
  const seconds = Number(row.game_seconds);
  const encounters = await client.query(BAD_AIR_ENCOUNTERS_SQL, [campaignId, BAD_AIR_TITLE]);
  const logged = await client.query(BAD_AIR_LOG_SQL, [campaignId, seconds, BAD_AIR_LOG]);
  return {
    in_encounter: row.in_encounter === true,
    location_name: row.location_name,
    location_id: row.location_id == null ? null : Number(row.location_id),
    game_seconds: seconds,
    already: logged.rows.length > 0,
    encounters: encounters.rows,
  };
}

async function badAirOnTurn(client, campaignId, gameSeconds) {
  const turn = await readBadAirTurn(client, campaignId, false);
  if (!turn || Number(turn.game_seconds) !== Number(gameSeconds)) return null;
  return badAirPreview({ ...turn, step: 'turn' });
}

function namedPlace(locations, id, fallback) {
  const found = (locations || []).find((loc) => loc && String(loc.id) === String(id));
  return found && found.name ? found.name : fallback;
}

function oneFact(facts, subject, state) {
  return (facts || []).find((fact) => fact && fact.subject_key === subject && fact.state_key === state) || null;
}

function factsWith(facts, subject, state, value) {
  return (facts || []).map((fact) => (
    fact && fact.subject_key === subject && fact.state_key === state ? { ...fact, value } : fact
  ));
}

function asksRising(facts, encounters) {
  return risingWaterPreview(facts, encounters) != null;
}

function waterWords(before, after, clearing) {
  if (clearing) return after ? 'and water flows' : 'and water stays still';
  if (before && !after) return 'and water stops';
  if (after) return 'and water keeps flowing';
  return 'and water stays still';
}

function wheelWould(facts, encounters, wheel) {
  const nowFlow = waterFlowing(facts) === true;
  const nowAsk = asksRising(facts, encounters);
  const clearing = wheel.value === true;
  const afterFacts = factsWith(facts, 'waterwheel', 'blocked', !clearing);
  const afterFlow = waterFlowing(afterFacts) === true;
  const afterAsk = asksRising(afterFacts, encounters);
  const water = waterWords(nowFlow, afterFlow, clearing);
  if (clearing) {
    const ask = afterAsk ? 'asks to open Rising water' : 'does not ask to open Rising water';
    return `Clearing the wheel ${ask}, ${water}.`;
  }
  const ask = nowAsk && !afterAsk ? 'drops the Rising water question' : 'leaves Rising water as it is';
  return `Blocking the wheel again ${ask}, ${water}.`;
}

function slabWould(facts, encounters, slab) {
  const nowFlow = waterFlowing(facts) === true;
  const nowAsk = asksRising(facts, encounters);
  const removing = slab.value !== true;
  const afterFacts = factsWith(facts, 'burial_slab', 'removed', removing);
  const afterFlow = waterFlowing(afterFacts) === true;
  const afterAsk = asksRising(afterFacts, encounters);
  const water = waterWords(nowFlow, afterFlow, removing);
  if (removing) {
    const ask = afterAsk ? 'still asks to open Rising water' : 'does not ask to open Rising water';
    return `Removing the slab ${ask}, ${water}.`;
  }
  const ask = nowAsk && !afterAsk ? 'drops the Rising water question' : 'leaves Rising water as it is';
  return `Putting the slab back ${ask}, ${water}.`;
}

function storyNow(facts, encounters) {
  const flowing = waterFlowing(facts) === true ? 'Water is flowing.' : 'Water is not flowing.';
  const preview = risingWaterPreview(facts, encounters);
  if (!preview) return flowing;
  return `${flowing} ${preview.why}`;
}

function waterStory(facts, encounters, locations) {
  const wheel = oneFact(facts, 'waterwheel', 'blocked');
  const slab = oneFact(facts, 'burial_slab', 'removed');
  if (!wheel || !slab) return null;
  const rising = (encounters || []).filter((row) => row && row.title === RISING_WATER_TITLE);
  const places = [
    {
      name: namedPlace(locations, wheel.location_id, 'Cistern Well'),
      line: wheel.value === true ? 'The wheel is blocked.' : 'The wheel is free.',
    },
    {
      name: namedPlace(locations, slab.location_id, 'Cistern Heart'),
      line: slab.value === true ? 'The slab is removed.' : 'The slab is in place.',
    },
  ];
  if (rising.length === 0) {
    places.push({ name: 'Rising water', line: 'That encounter is not on this campaign.' });
  } else {
    for (const row of rising) {
      places.push({
        name: namedPlace(locations, row.location_id, 'Rising water'),
        line: `${RISING_WATER_TITLE} is ${row.status}.`,
      });
    }
  }
  return {
    title: 'Water crisis',
    now: storyNow(facts, encounters),
    places,
    links: [
      { relation: 'requires', text: 'Water flowing requires the wheel free and the slab removed.' },
      { relation: 'causes', text: 'A free wheel asks to open Rising water while that encounter is still a prepared environment with no members.' },
      { relation: 'relates to', text: 'The slab does not gate that question. Opening it does not start a fight.' },
    ],
    would: [
      wheelWould(facts, encounters, wheel),
      slabWould(facts, encounters, slab),
    ],
  };
}

function sameId(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

function cluesAtFacts(facts, clues) {
  const places = [];
  for (const fact of [oneFact(facts, 'waterwheel', 'blocked'), oneFact(facts, 'burial_slab', 'removed')]) {
    if (fact && fact.location_id != null && !places.some((id) => sameId(id, fact.location_id))) {
      places.push(fact.location_id);
    }
  }
  return (clues || []).filter((clue) => clue && places.some((id) => sameId(id, clue.location_id)));
}

function goalsNamedBy(clues, objectives) {
  const ids = [];
  for (const clue of clues) {
    if (clue.objective_id != null && !ids.some((id) => sameId(id, clue.objective_id))) ids.push(clue.objective_id);
  }
  return (objectives || []).filter((goal) => goal && ids.some((id) => sameId(id, goal.id)));
}

function waterThread(facts, encounters, locations, clues, objectives) {
  const story = waterStory(facts, encounters, locations);
  if (!story) return null;
  const wheel = oneFact(facts, 'waterwheel', 'blocked');
  const slab = oneFact(facts, 'burial_slab', 'removed');
  const atFacts = cluesAtFacts(facts, clues);
  const goals = goalsNamedBy(atFacts, objectives);
  const knowledge = [];
  if (atFacts.length === 0) {
    knowledge.push({
      kind: 'clue',
      text: null,
      party_known: false,
      line: 'No clue is recorded at the wheel or the slab.',
    });
  }
  for (const clue of atFacts) {
    const learned = clue.discovered === true;
    knowledge.push({
      kind: 'clue',
      text: clue.body,
      party_known: learned,
      line: learned ? 'The party has learned it.' : 'The party has not learned it.',
    });
  }
  for (const goal of goals) {
    const known = goal.known === true;
    knowledge.push({
      kind: 'objective',
      text: goal.body,
      party_known: known,
      line: known ? 'The party knows this goal.' : 'The party does not know this goal.',
    });
  }
  const questions = [];
  if (wheel.value === true) questions.push('Has the wheel been cleared?');
  if (slab.value !== true) questions.push('Has the slab been removed?');
  if ((encounters || []).some((row) => row && row.title === RISING_WATER_TITLE && row.status === 'prepared')) {
    questions.push('Has Rising water been opened?');
  }
  for (const item of knowledge) {
    if (!item.text || item.party_known === true) continue;
    questions.push(item.kind === 'clue'
      ? `Has the party learned: ${item.text}?`
      : `Does the party know: ${item.text}?`);
  }
  return {
    title: story.title,
    premise: 'Water reaches the town only after the wheel is free and the slab is removed. Neither step has to come first.',
    resources: story.places,
    knowledge,
    questions,
    outcomes: story.would,
  };
}

async function applyBadAir(client, campaignId, gameSeconds, writeHitPoints) {
  const seconds = Number(gameSeconds);
  if (!Number.isInteger(seconds) || seconds < 0) throw storedError('game_seconds is required', 400);
  const turn = await readBadAirTurn(client, campaignId, true);
  if (!turn || turn.game_seconds !== seconds) return { changed: false };
  const preview = badAirPreview({ ...turn, step: 'turn' });
  if (!preview) return { changed: false };
  const people = await client.query(BAD_AIR_CHARACTERS_SQL, [campaignId]);
  let damaged = 0;
  for (const person of people.rows) {
    if (person.current_hp == null) continue;
    const current = Number(person.current_hp);
    if (!Number.isInteger(current) || current <= 0) continue;
    await writeHitPoints(client, Number(person.id), -1, 'bad air');
    damaged += 1;
  }
  await client.query(BAD_AIR_MARK_SQL, [campaignId, turn.location_id, seconds, BAD_AIR_LOG]);
  return { changed: true, damaged, game_seconds: seconds };
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
  BAD_AIR_LOG,
  badAirPreview,
  readBadAirCommand,
  rejectBadAir,
  badAirOnTurn,
  applyBadAir,
  waterStory,
  waterThread,
  listFacts,
  setFact,
  attachAuthoredFacts,
};
