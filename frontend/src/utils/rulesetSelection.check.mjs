import { catalogBase, catalogSection, referenceTail, resolveRulesetId } from './rulesetSelection.mjs';
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
assert.equal(catalogSection('/play/8/reference/1/classes/4'), 'classes');
assert.equal(catalogSection('/play/8/reference'), 'races');

assert.equal(catalogBase('/rulesets/1/races', '1'), '/rulesets/1');
assert.equal(catalogBase('/play/8/reference/2/items', '2'), '/play/8/reference/2');

assert.equal(referenceTail('/play/8/reference'), 'races');
assert.equal(referenceTail('/play/8/reference/2/classes/9'), 'classes/9');

console.log('rulesetSelection ok');
