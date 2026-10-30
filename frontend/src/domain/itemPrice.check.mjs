import assert from 'node:assert/strict';
import { formatItemPrice } from './itemPrice.mjs';

assert.equal(formatItemPrice(2000), '20 GP');
assert.equal(formatItemPrice(10), '1 SP');
assert.equal(formatItemPrice(150), '1 GP, 5 SP');
assert.equal(formatItemPrice(500), '5 GP');
assert.equal(formatItemPrice(6000), '60 GP');
assert.equal(formatItemPrice(40000), '400 GP');
assert.equal(formatItemPrice(1), '1 CP');
assert.equal(formatItemPrice(0), '0 CP');
assert.equal(formatItemPrice(null), '');
console.log('item price ok');
