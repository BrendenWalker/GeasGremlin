import assert from 'node:assert/strict';
import {
  DAY_SECONDS,
  ROUND_SECONDS,
  clockToSeconds,
  effectEndSeconds,
  formatGameTime,
  markStatus,
  splitGameTime,
} from './gameTime.mjs';

assert.equal(ROUND_SECONDS, 10);
assert.equal(DAY_SECONDS, 86400);
assert.equal(effectEndSeconds(70, 2), 70 + 2 * 60);
assert.equal(effectEndSeconds(0, 0), null);
assert.equal(formatGameTime(0), 'Day 1 00:00:00');
assert.equal(formatGameTime(ROUND_SECONDS), 'Day 1 00:00:10');
assert.equal(formatGameTime(DAY_SECONDS), 'Day 2 00:00:00');
assert.equal(clockToSeconds(1, 0, 0, 10), 10);
assert.equal(clockToSeconds(2, 0, 0, 0), DAY_SECONDS);
assert.deepEqual(splitGameTime(3661), { day: 1, hour: 1, minute: 1, second: 1 });
assert.equal(markStatus({ kind: 'event', at_seconds: 10 }, 10), 'due');
assert.equal(markStatus({ kind: 'event', at_seconds: 20 }, 10), 'upcoming');
assert.equal(markStatus({ kind: 'effect', at_seconds: 0, duration_minutes: 1 }, 0), 'active');
assert.equal(markStatus({ kind: 'effect', at_seconds: 0, duration_minutes: 1 }, 59), 'active');
assert.equal(markStatus({ kind: 'effect', at_seconds: 0, duration_minutes: 1 }, 60), 'due');
assert.equal(markStatus({ kind: 'effect', at_seconds: 100, duration_minutes: 1 }, 0), 'upcoming');
