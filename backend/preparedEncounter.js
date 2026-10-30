/**
 * The status change behind POST /situation/encounters/:id/open.
 * A combat scene, or any scene with members, opens the fight.
 * An environment with no members does not. The clock does not move.
 */

function storedError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function openPreparedEncounter(client, campaignId, encounterId) {
  const id = Number(encounterId);
  if (!Number.isInteger(id) || id < 1) throw storedError('encounter_id is required', 400);
  const encounter = await client.query(
    `SELECT id, kind, status FROM campaign_encounter
     WHERE id = $1 AND campaign_id = $2
     FOR UPDATE`,
    [id, campaignId]
  );
  if (encounter.rows.length === 0) throw storedError('Encounter not found', 404);
  const row = encounter.rows[0];
  if (row.status !== 'prepared' && row.status !== 'opened') {
    throw storedError('That encounter is not prepared', 400);
  }
  const members = await client.query(
    'SELECT creature_id FROM campaign_encounter_member WHERE encounter_id = $1',
    [row.id]
  );
  const openFight = row.kind === 'combat' || members.rows.length > 0;
  if (openFight) {
    await client.query(
      `INSERT INTO campaign_board (campaign_id, in_encounter)
       VALUES ($1, true)
       ON CONFLICT (campaign_id) DO UPDATE SET in_encounter = true`,
      [campaignId]
    );
    await client.query(
      `UPDATE campaign_creature c
       SET in_fight = true
       FROM campaign_encounter_member m
       WHERE m.encounter_id = $1 AND m.creature_id = c.id`,
      [row.id]
    );
  }
  if (row.status === 'prepared') {
    await client.query(
      `UPDATE campaign_encounter SET status = 'opened' WHERE id = $1`,
      [row.id]
    );
  }
  return {
    id: Number(row.id),
    in_encounter: openFight,
    changed: row.status === 'prepared',
  };
}

module.exports = {
  openPreparedEncounter,
};
