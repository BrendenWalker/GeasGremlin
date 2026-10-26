import assert from 'node:assert/strict';
import { TAGLINES, documentTitle, taglineForDate } from './branding.mjs';

const morning = new Date(2026, 0, 15, 8, 0, 0);
const evening = new Date(2026, 0, 15, 23, 30, 0);
assert.equal(taglineForDate(morning), taglineForDate(evening));

const beforeMidnight = new Date(2026, 0, 15, 23, 59, 0);
const afterMidnight = new Date(2026, 0, 16, 0, 1, 0);
assert.notEqual(taglineForDate(beforeMidnight), taglineForDate(afterMidnight));

const seen = TAGLINES.map((_, offset) => taglineForDate(new Date(2026, 0, 15 + offset, 12, 0, 0)));
assert.equal(new Set(seen).size, TAGLINES.length);
for (let i = 1; i < seen.length; i += 1) {
  const prev = TAGLINES.indexOf(seen[i - 1]);
  assert.equal(TAGLINES.indexOf(seen[i]), (prev + 1) % TAGLINES.length);
}

assert.equal(documentTitle(morning), `GeasGremlin — ${taglineForDate(morning)}`);

console.log('branding ok');
