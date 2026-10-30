/**
 * A path leaves from_location_id for to_location_id.
 * Unless it is one way, the destination also offers the walk back.
 */

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

module.exports = { pathsAt, pathDestination };
