import assert from 'node:assert/strict';
import {
  DAY_SECONDS,
  ROUND_SECONDS,
  TURN_SECONDS,
  WATCH_SECONDS,
  clockToSeconds,
  effectEndSeconds,
  effectTurnsLeft,
  formatGameTime,
  markStatus,
  primaryStep,
  splitGameTime,
} from './gameTime.mjs';

assert.equal(ROUND_SECONDS, 10);
assert.equal(TURN_SECONDS, 60 * ROUND_SECONDS);
assert.equal(WATCH_SECONDS, 24 * TURN_SECONDS);
assert.equal(DAY_SECONDS, 6 * WATCH_SECONDS);
assert.equal(DAY_SECONDS, 86400);
assert.equal(primaryStep('outside', false), 'watch');
assert.equal(primaryStep('inside', false), 'turn');
assert.equal(primaryStep('outside', true), 'round');
assert.equal(primaryStep('inside', true), 'round');
assert.equal(primaryStep(undefined, false), 'watch');
assert.equal(effectEndSeconds(70, 2), 70 + 2 * 60);
assert.equal(effectEndSeconds(0, 0), null);
assert.equal(formatGameTime(0), 'Day 1 00:00:00');
assert.equal(formatGameTime(ROUND_SECONDS), 'Day 1 00:00:10');
assert.equal(formatGameTime(TURN_SECONDS), 'Day 1 00:10:00');
assert.equal(formatGameTime(WATCH_SECONDS), 'Day 1 04:00:00');
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
const torch = { kind: 'effect', at_seconds: 0, duration_minutes: 50 };
assert.equal(effectTurnsLeft(torch, 0), 5);
assert.equal(effectTurnsLeft(torch, TURN_SECONDS), 4);
assert.equal(effectTurnsLeft(torch, TURN_SECONDS + ROUND_SECONDS), 4);
assert.equal(effectTurnsLeft(torch, 5 * TURN_SECONDS - 1), 1);
assert.equal(effectTurnsLeft(torch, 5 * TURN_SECONDS), 0);
assert.equal(effectTurnsLeft(torch, -1), null);
assert.equal(effectTurnsLeft({ kind: 'effect', at_seconds: 100, duration_minutes: 10 }, 0), null);
assert.equal(effectTurnsLeft({ kind: 'event', at_seconds: 0 }, 0), null);
