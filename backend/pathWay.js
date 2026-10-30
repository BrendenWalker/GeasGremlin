/**
 * A path leaves from_location_id for to_location_id.
 * Unless it is one way, the destination also offers the walk back.
 * The row is the path. discovered is whether the party knows it.
 * blocked is whether they can walk it. Finding it does not change that.
 */

function storedError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function samePlace(left, right) {
  if (left == null || left === '') return right == null || right === '';
  return String(left) === String(right);
}

function pathsAt(rows, hereId) {
  const here = hereId == null || hereId === '' ? null : String(hereId);
  return (rows || []).filter((row) => {
    const from = row.from_location_id == null || row.from_location_id === '' ? null : String(row.from_location_id);
    const to = row.to_location_id == null ? null : String(row.to_location_id);
    if (here == null) return from == null;
    if (from === here) return true;
    return row.one_way !== true && from != null && to === here && from !== to;
  });
}

function pathDestination(row, reverse) {
  if (reverse === true) {
    if (row.one_way === true) return { error: 'That path is one way' };
    if (row.from_location_id == null) return { error: 'That path has no way back' };
    return { locationId: row.from_location_id };
  }
  return { locationId: row.to_location_id };
}

function pathLabel(row) {
  const text = String(row?.reason || '').trim();
  return text || 'That path';
}

function pathTravel(row, reverse, override) {
  const way = pathDestination(row, reverse);
  if (way.error) return way;
  const hidden = row.discovered === false;
  const blocked = row.blocked === true;
  if (override === true) {
    if (!hidden && !blocked) return { locationId: way.locationId };
    const why = hidden && blocked
      ? 'before it was found, while it was blocked'
      : hidden
        ? 'before it was found'
        : 'while it was blocked';
    return {
      locationId: way.locationId,
      log: { kind: 'decision', body: `Took ${pathLabel(row)} ${why}.` },
    };
  }
  if (hidden) return { error: 'That path is not found' };
  if (blocked) return { error: 'That path is blocked' };
  return { locationId: way.locationId };
}

function playerExits(rows, hereId) {
  return pathsAt(rows, hereId)
    .filter((row) => row.discovered !== false)
    .map((row) => {
      const back = !samePlace(row.from_location_id, hereId);
      return {
        destination_name: back ? (row.from_name || 'location') : (row.to_name || 'location'),
        reason: row.reason || null,
        blocked: row.blocked === true,
      };
    });
}

const PATH_LOG_SQL = `INSERT INTO campaign_log (campaign_id, location_id, at_seconds, kind, body)
VALUES (
  $1,
  (SELECT location_id FROM campaign_board WHERE campaign_id = $1),
  COALESCE((SELECT game_seconds FROM campaign_board WHERE campaign_id = $1), 0),
  $2,
  $3
)`;

async function loadPath(client, campaignId, transitionId) {
  const id = Number(transitionId);
  if (!Number.isInteger(id) || id < 1) throw storedError('transition_id is required', 400);
  const found = await client.query(
    `SELECT id, reason, discovered, blocked
     FROM campaign_transition
     WHERE id = $1 AND campaign_id = $2
     FOR UPDATE`,
    [id, campaignId]
  );
  if (found.rows.length === 0) throw storedError('Lead not found', 404);
  return found.rows[0];
}

async function markPathFound(client, campaignId, transitionId) {
  const row = await loadPath(client, campaignId, transitionId);
  if (row.discovered === true) {
    return { changed: false, discovered: true, blocked: row.blocked === true };
  }
  await client.query(
    'UPDATE campaign_transition SET discovered = true WHERE id = $1 AND campaign_id = $2',
    [row.id, campaignId]
  );
  await client.query(PATH_LOG_SQL, [campaignId, 'discovery', `Found: ${pathLabel(row)}`]);
  return { changed: true, discovered: true, blocked: row.blocked === true };
}

async function setPathAccess(client, campaignId, transitionId, blocked) {
  if (typeof blocked !== 'boolean') throw storedError('blocked must be true or false', 400);
  const row = await loadPath(client, campaignId, transitionId);
  if (row.blocked === blocked) {
    return { changed: false, discovered: row.discovered !== false, blocked };
  }
  await client.query(
    'UPDATE campaign_transition SET blocked = $3 WHERE id = $1 AND campaign_id = $2',
    [row.id, campaignId, blocked]
  );
  const body = blocked ? `Blocked: ${pathLabel(row)}` : `Open: ${pathLabel(row)}`;
  await client.query(PATH_LOG_SQL, [campaignId, 'decision', body]);
  return { changed: true, discovered: row.discovered !== false, blocked };
}

module.exports = {
  pathsAt,
  pathDestination,
  pathTravel,
  playerExits,
  markPathFound,
  setPathAccess,
};
