import assert from 'node:assert/strict';
import {
  COPPER_MAX,
  addPurchase,
  addSale,
  canConfirm,
  checkoutBody,
  dropPurchase,
  dropSale,
  emptyVisit,
  formatNet,
  lineCopper,
  netCopper,
  remainingQuantity,
  stagedSaleQuantity,
} from './shopCart.mjs';

const rope = { item_id: 4, name: 'Rope', unit: 100 };
const torch = { item_id: 9, name: 'Torch', unit: 10 };
const heldRope = { character_item_id: 20, name: 'Rope', unit: 50, owned: 2 };

let visit = emptyVisit();
visit = addPurchase(visit, rope);
visit = addPurchase(visit, rope);
visit = addPurchase(visit, torch);
assert.deepEqual(visit.purchases.map((line) => [line.item_id, line.quantity]), [[4, 2], [9, 1]]);

visit = dropPurchase(visit, 4);
assert.equal(visit.purchases[0].quantity, 1);
visit = dropPurchase(visit, 4);
assert.equal(visit.purchases.some((line) => line.item_id === 4), false);
assert.equal(dropPurchase(visit, 4), visit);

visit = emptyVisit();
visit = addSale(visit, heldRope);
visit = addSale(visit, heldRope);
assert.equal(addSale(visit, heldRope), visit);
assert.equal(stagedSaleQuantity(visit, 20), 2);
assert.equal(remainingQuantity(2, stagedSaleQuantity(visit, 20)), 0);
assert.equal(remainingQuantity(5, 2), 3);
visit = dropSale(visit, 20);
assert.equal(visit.sales[0].quantity, 1);
assert.equal(remainingQuantity(2, stagedSaleQuantity(visit, 20)), 1);

const priced = addPurchase(addSale(emptyVisit(), heldRope), rope);
assert.equal(netCopper(priced), 50 - 100);
assert.equal(formatNet(0), 'Net 0 CP');
assert.equal(formatNet(100), 'Net +1 GP');
assert.equal(formatNet(-25), 'Net \u22122 SP, 5 CP');
assert.equal(formatNet(-200), 'Net \u22122 GP');
assert.equal(formatNet(1500), 'Net +1 PP, 5 GP');
assert.equal(formatNet(-107412), 'Net \u2212107 PP, 4 GP, 1 SP, 2 CP');
assert.equal(canConfirm(emptyVisit(), 500), false);
assert.equal(canConfirm(priced, 49), false);
assert.equal(canConfirm(priced, 50), true);
assert.equal(canConfirm(addSale(emptyVisit(), heldRope), COPPER_MAX), false);
assert.equal(canConfirm(addSale(emptyVisit(), { ...heldRope, owned: 1 }), COPPER_MAX - 50), true);

const capped = addPurchase(emptyVisit(), { item_id: 1, name: 'Vault', unit: COPPER_MAX });
assert.equal(addPurchase(capped, { item_id: 1, name: 'Vault', unit: COPPER_MAX }), capped);
assert.equal(lineCopper(COPPER_MAX, 2), null);
assert.equal(canConfirm({ purchases: [], sales: [{ ...heldRope, quantity: 3 }] }, 1000), false);

assert.deepEqual(checkoutBody(priced), {
  purchases: [{ item_id: 4, quantity: 1 }],
  sales: [{ character_item_id: 20, quantity: 1 }],
});

console.log('shop cart ok');
