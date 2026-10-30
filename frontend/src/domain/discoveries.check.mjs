import assert from 'node:assert/strict';
import { discoveriesByPlace } from './discoveries.mjs';

const locations = [
  { id: 2, name: 'Cistern' },
  { id: 1, name: 'Millbridge' },
];

const clues = [
  { id: 1, location_id: 1, body: 'chalk', discovered: true },
  { id: 2, location_id: 2, body: 'bone', discovered: false },
  { id: 3, location_id: 2, body: 'slab', discovered: true },
  { id: 4, location_id: null, body: 'rumor', discovered: true },
  { id: 5, location_id: 1, body: 'marks', discovered: true },
  { id: 6, location_id: 9, body: 'gone', discovered: true },
];

const groups = discoveriesByPlace(clues, locations);
assert.deepEqual(groups.map((group) => [group.name, group.rows.map((row) => row.id)]), [
  ['Cistern', [3]],
  ['Millbridge', [1, 5]],
  ['location', [6]],
  ['With the party', [4]],
]);
assert.deepEqual(discoveriesByPlace([], locations), []);
assert.deepEqual(discoveriesByPlace(null, null), []);
