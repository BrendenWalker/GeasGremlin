// Discovered clues stay on the card. They are grouped by the place they were found.

function placeKey(id) {
  if (id == null || id === '') return '';
  return String(id);
}

function placeName(locations, id) {
  const found = (locations || []).find((loc) => String(loc.id) === String(id));
  return found ? found.name : 'location';
}

export function discoveriesByPlace(clues, locations) {
  const byPlace = new Map();
  for (const row of clues || []) {
    if (!row || row.discovered !== true) continue;
    const key = placeKey(row.location_id);
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key).push(row);
  }
  const groups = [];
  const used = new Set();
  for (const loc of locations || []) {
    const key = placeKey(loc.id);
    if (key === '' || !byPlace.has(key)) continue;
    used.add(key);
    groups.push({ key, name: loc.name, rows: byPlace.get(key) });
  }
  for (const [key, rows] of byPlace) {
    if (key === '' || used.has(key)) continue;
    groups.push({ key, name: placeName(locations, key), rows });
  }
  if (byPlace.has('')) {
    groups.push({ key: '', name: 'With the party', rows: byPlace.get('') });
  }
  return groups;
}
