import assert from 'node:assert/strict';
import { abilityModifier, adjustedHitPoints, formatModifier } from './hitPoints.mjs';

assert.equal(abilityModifier(3), -3);
assert.equal(abilityModifier(4), -2);
assert.equal(abilityModifier(6), -1);
assert.equal(abilityModifier(9), 0);
assert.equal(abilityModifier(12), 0);
assert.equal(abilityModifier(13), 1);
assert.equal(abilityModifier(16), 2);
assert.equal(abilityModifier(18), 3);
assert.equal(abilityModifier('10'), 0);
assert.equal(abilityModifier(null), 0);

assert.equal(formatModifier(2), '+2');
assert.equal(formatModifier(-1), '-1');
assert.equal(formatModifier(0), '0');

assert.equal(adjustedHitPoints(5, 16, 8), 7);
assert.equal(adjustedHitPoints(1, 3, 4), 1);
assert.equal(adjustedHitPoints(9, 10, 8), null);
assert.equal(adjustedHitPoints('', 10, 8), null);
assert.equal(adjustedHitPoints(4, 18, null), 7);

console.log('hitPoints ok');
