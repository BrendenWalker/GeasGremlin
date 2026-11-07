/**
 * Authored intro for one campaign. The screen is not a location.
 * Saving this row does not select a place and does not move the clock.
 */

const TEXT_MAX = 4000;

function storedError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function optionalText(value, name) {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (text.length > TEXT_MAX) throw storedError(`${name} exceeds ${TEXT_MAX} characters`, 400);
  return text;
}

function readFirstLocationId(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw storedError('first_location_id must be a location', 400);
  return n;
}

function readDetails(body) {
  return {
    intro: optionalText(body?.intro, 'intro'),
    gmNotes: optionalText(body?.gm_notes, 'gm_notes'),
    firstLocationId: readFirstLocationId(body?.first_location_id),
  };
}

function detailRow(row) {
  if (!row) return { intro: null, gm_notes: null, first_location_id: null };
  return {
    intro: row.intro,
    gm_notes: row.gm_notes,
    first_location_id: row.first_location_id == null ? null : Number(row.first_location_id),
  };
}

function showsIntro(locationId, details) {
  if (locationId != null) return false;
  if (!details) return false;
  return Boolean(details.intro || details.gm_notes || details.first_location_id != null);
}

async function saveCampaignDetails(client, campaignId, body) {
  const fields = readDetails(body);
  if (fields.firstLocationId != null) {
    const loc = await client.query(
      'SELECT id FROM campaign_location WHERE id = $1 AND campaign_id = $2',
      [fields.firstLocationId, campaignId]
    );
    if (loc.rows.length === 0) throw storedError('First location is not in this campaign', 400);
  }
  const saved = await client.query(
    `INSERT INTO campaign_details (campaign_id, intro, gm_notes, first_location_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (campaign_id) DO UPDATE
     SET intro = EXCLUDED.intro,
         gm_notes = EXCLUDED.gm_notes,
         first_location_id = EXCLUDED.first_location_id
     RETURNING intro, gm_notes, first_location_id`,
    [campaignId, fields.intro, fields.gmNotes, fields.firstLocationId]
  );
  return detailRow(saved.rows[0]);
}

module.exports = {
  TEXT_MAX,
  readDetails,
  showsIntro,
  saveCampaignDetails,
};
