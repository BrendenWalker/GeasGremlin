import { catalogSection, resolveRulesetId } from './rulesetSelection.mjs';
import assert from 'node:assert/strict';

const list = [{ id: 2, name: 'B' }, { id: 10, name: 'A' }];

assert.equal(resolveRulesetId(null, '2'), '');
assert.equal(resolveRulesetId([], '2'), '');
assert.equal(resolveRulesetId(list, '10'), '10');
assert.equal(resolveRulesetId(list, 2), '2');
assert.equal(resolveRulesetId(list, '9'), '2');
assert.equal(resolveRulesetId(list, ''), '2');

assert.equal(catalogSection('/rulesets/1/classes/4'), 'classes');
assert.equal(catalogSection('/rulesets/1/items'), 'items');
assert.equal(catalogSection('/rulesets/1'), 'races');
assert.equal(catalogSection('/rulesets/1/nope'), 'races');

console.log('rulesetSelection ok');
