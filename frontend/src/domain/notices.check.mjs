import assert from 'node:assert/strict';
import {
  clearEphemeral,
  commandReceipt,
  dismissNotice,
  levelUpCommands,
  orderWaiting,
  pushNotice,
  sheetPath,
  transferText,
} from './notices.mjs';

const wander = { id: '1', source: 'wander', tone: 'info', text: 'Wandering monsters: 1 on 1d6. None.' };
const xp = { id: '2', source: 'command:2', tone: 'success', text: 'The GM gave Borin 500 XP.' };
const gold = { id: '3', source: 'command:3', tone: 'success', text: 'The GM gave Borin 200 cp.' };
const day = { id: '4', source: 'command:4', tone: 'success', text: 'The GM started a new day for Borin.' };
const rope = { id: '5', source: 'command:5', tone: 'success', text: 'The GM gave Borin Rope.' };

let stack = pushNotice([], wander);
stack = pushNotice(stack, xp);
assert.deepEqual(stack.map((row) => row.source), ['command:2', 'wander']);
stack = pushNotice(stack, { ...wander, id: '6', text: 'Wandering monsters: 5 on 1d6. Still none.' });
assert.equal(stack.filter((row) => row.source === 'wander').length, 1);
assert.equal(stack[0].text, 'Wandering monsters: 5 on 1d6. Still none.');
stack = pushNotice(stack, gold);
stack = pushNotice(stack, day);
stack = pushNotice(stack, rope);
assert.equal(stack.length, 4);
assert.equal(stack.some((row) => row.source === 'command:2'), false);
assert.equal(stack[3].source, 'wander');
assert.deepEqual(clearEphemeral(stack).map((row) => row.source), ['command:5', 'command:4', 'command:3']);
stack = pushNotice(clearEphemeral([wander, xp]), { source: 'wander', text: '' });
assert.deepEqual(stack.map((row) => row.source), ['command:2']);
assert.deepEqual(dismissNotice([xp, gold], '2').map((row) => row.id), ['3']);

assert.equal(commandReceipt('Borin', { type: 'give_xp', payload: { amount: 500 } }), 'The GM gave Borin 500 XP.');
assert.equal(commandReceipt('Borin', { type: 'give_gold', payload: { amount_cp: 200 } }), 'The GM gave Borin 200 cp.');
assert.equal(commandReceipt('Borin', { type: 'give_item', payload: { item_id: 9 } }, 'Rope'), 'The GM gave Borin Rope.');
assert.equal(commandReceipt('Borin', { type: 'give_item', payload: { item_id: 9 } }), 'The GM gave Borin an item.');
assert.equal(commandReceipt('Borin', { type: 'new_day' }), 'The GM started a new day for Borin.');
assert.equal(commandReceipt('Borin', { type: 'new_round' }), 'The GM started a new round for Borin.');
assert.equal(commandReceipt('Borin', { type: 'give_xp', payload: { amount: 'nope' } }), null);

const fighter = { id: 1, abilities: [], leveling: [{ level: 1, xp: 0 }, { level: 2, xp: 2000 }] };
const sheet = { name: 'Borin', xp: 0, level: 1, character_classes: [{ class_id: 1, class_level: 1, sort_order: 0 }] };
const leveling = levelUpCommands(sheet, [fighter], [
  { id: 7, type: 'give_xp', payload: { amount: 500 } },
  { id: 8, type: 'give_gold', payload: { amount_cp: 10 } },
  { id: 9, type: 'give_xp', payload: { amount: 2500 } },
]);
assert.deepEqual(leveling.map((row) => row.id), [9]);

assert.equal(transferText('Mira', 'Borin', { gold_cp: 200, payload: { items: [] } }), 'Mira sent Borin 200 cp');
assert.equal(
  transferText('Mira', 'Borin', { gold_cp: 200, payload: { items: [{ character_item_id: 1 }] } }),
  'Mira sent Borin 200 cp and 1 item'
);
assert.equal(transferText('Mira', 'Borin', { gold_cp: 0, payload: { items: [] } }), null);

assert.equal(sheetPath({ id: 4, campaign_ids: [2, 8] }, '/play/8/characters'), '/play/8/characters/4');
assert.equal(sheetPath({ id: 4, campaign_ids: [2] }, '/campaigns'), '/play/2/characters/4');
assert.equal(sheetPath({ id: 4, campaign_ids: [] }, '/'), '/characters/4');

assert.deepEqual(
  orderWaiting([
    { key: 'b', at: '2020-02-01' },
    { key: 'invite:1', at: '' },
    { key: 'a', at: '2020-01-01' },
  ]).map((row) => row.key),
  ['invite:1', 'a', 'b']
);
