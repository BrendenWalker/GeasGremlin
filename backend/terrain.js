/**
 * Outside locations may store a terrain and a signed movement percent together.
 * Inside locations store neither. The percent is not applied to travel.
 */

const TERRAINS = [
  { name: 'Clear', movement_pct: 0 },
  { name: 'Road', movement_pct: 0 },
  { name: 'Forest', movement_pct: -33 },
  { name: 'Hills', movement_pct: -33 },
  { name: 'Desert', movement_pct: -33 },
  { name: 'Jungle', movement_pct: -50 },
  { name: 'Swamp', movement_pct: -50 },
  { name: 'Mountains', movement_pct: -50 },
];

const TERRAIN_PERCENT = new Map(TERRAINS.map((row) => [row.name, row.movement_pct]));

function locationTerrain(place, terrain, movementPct) {
  if (place === 'inside') return { terrain: null, movement_pct: null };
  if (place !== 'outside') return { error: 'place must be outside or inside' };
  const name = terrain == null || String(terrain).trim() === '' ? null : String(terrain).trim();
  const hasPct = movementPct != null && movementPct !== '';
  if (name == null && !hasPct) return { terrain: null, movement_pct: null };
  if (name == null || !hasPct) return { error: 'Outside terrain needs a name and a movement percent' };
  if (!TERRAIN_PERCENT.has(name)) return { error: 'Unknown terrain' };
  const pct = typeof movementPct === 'number' ? movementPct : Number(movementPct);
  if (!Number.isInteger(pct) || pct < -100 || pct > 200) {
    return { error: 'Movement percent must be an integer from -100 to 200' };
  }
  return { terrain: name, movement_pct: pct };
}

module.exports = { TERRAINS, locationTerrain };
