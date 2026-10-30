// A shop visit is a list of purchases and a list of sales.
// Prices are copper. Net is what the purse gains when the visit is confirmed.

export const COPPER_MAX = 2147483647;

function whole(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export function lineCopper(unit, quantity) {
  const price = whole(unit);
  const count = whole(quantity);
  if (price == null || price < 0 || count == null || count < 1) return null;
  const total = price * count;
  if (!Number.isSafeInteger(total) || total > COPPER_MAX) return null;
  return total;
}

export function emptyVisit() {
  return { purchases: [], sales: [] };
}

function stackLine(lines, key, id, fields, cap) {
  const index = lines.findIndex((line) => String(line[key]) === String(id));
  const quantity = index === -1 ? 1 : lines[index].quantity + 1;
  if (cap != null && quantity > cap) return lines;
  if (lineCopper(fields.unit, quantity) == null) return lines;
  const line = { ...fields, [key]: id, quantity };
  if (index === -1) return [...lines, line];
  const next = lines.slice();
  next[index] = line;
  return next;
}

export function addPurchase(visit, item) {
  const itemId = whole(item?.item_id);
  const unit = whole(item?.unit);
  if (itemId == null || itemId < 1 || unit == null || unit < 0) return visit;
  const purchases = stackLine(visit.purchases, 'item_id', itemId, { name: item.name, unit }, null);
  if (purchases === visit.purchases) return visit;
  return { purchases, sales: visit.sales };
}

export function addSale(visit, item) {
  const id = whole(item?.character_item_id);
  const unit = whole(item?.unit);
  const owned = whole(item?.owned);
  if (id == null || id < 1 || unit == null || unit < 0 || owned == null || owned < 1) return visit;
  const sales = stackLine(
    visit.sales,
    'character_item_id',
    id,
    { name: item.name, unit, owned },
    owned
  );
  if (sales === visit.sales) return visit;
  return { purchases: visit.purchases, sales };
}

function dropOne(lines, key, id) {
  const index = lines.findIndex((line) => String(line[key]) === String(id));
  if (index === -1) return lines;
  if (lines[index].quantity <= 1) return lines.filter((_, i) => i !== index);
  const next = lines.slice();
  next[index] = { ...lines[index], quantity: lines[index].quantity - 1 };
  return next;
}

export function dropPurchase(visit, itemId) {
  const purchases = dropOne(visit.purchases, 'item_id', itemId);
  if (purchases === visit.purchases) return visit;
  return { purchases, sales: visit.sales };
}

export function dropSale(visit, characterItemId) {
  const sales = dropOne(visit.sales, 'character_item_id', characterItemId);
  if (sales === visit.sales) return visit;
  return { purchases: visit.purchases, sales };
}

export function stagedSaleQuantity(visit, characterItemId) {
  const line = (visit?.sales || []).find((row) => String(row.character_item_id) === String(characterItemId));
  return line ? line.quantity : 0;
}

export function remainingQuantity(owned, staged) {
  const have = whole(owned);
  const held = whole(staged);
  if (have == null || have < 0 || held == null || held < 0) return 0;
  return Math.max(0, have - held);
}

function sumLines(lines) {
  let total = 0;
  for (const line of lines) {
    const part = lineCopper(line.unit, line.quantity);
    if (part == null) return null;
    total += part;
    if (!Number.isSafeInteger(total) || total > COPPER_MAX) return null;
  }
  return total;
}

export function netCopper(visit) {
  const sales = sumLines(visit?.sales || []);
  const purchases = sumLines(visit?.purchases || []);
  if (sales == null || purchases == null) return null;
  const net = sales - purchases;
  if (!Number.isSafeInteger(net)) return null;
  return net;
}

function coinParts(copper) {
  const amount = Math.abs(copper);
  const pp = Math.floor(amount / 1000);
  const rest1 = amount % 1000;
  const gp = Math.floor(rest1 / 100);
  const rest2 = rest1 % 100;
  const sp = Math.floor(rest2 / 10);
  const cp = rest2 % 10;
  const parts = [];
  if (pp) parts.push(`${pp} PP`);
  if (gp) parts.push(`${gp} GP`);
  if (sp) parts.push(`${sp} SP`);
  if (cp) parts.push(`${cp} CP`);
  return parts.length ? parts.join(', ') : '0 CP';
}

export function formatNet(copper) {
  if (!Number.isInteger(copper)) return '';
  if (copper === 0) return 'Net 0 CP';
  const sign = copper > 0 ? '+' : '\u2212';
  return `Net ${sign}${coinParts(copper)}`;
}

function linesFit(visit) {
  for (const line of visit?.purchases || []) {
    if (lineCopper(line.unit, line.quantity) == null) return false;
  }
  for (const line of visit?.sales || []) {
    if (lineCopper(line.unit, line.quantity) == null) return false;
    if (line.owned != null && line.quantity > line.owned) return false;
  }
  return true;
}

export function purseAfter(money, net) {
  const purse = whole(money);
  if (purse == null || purse < 0 || !Number.isInteger(net)) return null;
  const next = purse + net;
  if (!Number.isSafeInteger(next) || next < 0 || next > COPPER_MAX) return null;
  return next;
}

export function canConfirm(visit, money) {
  const purchases = visit?.purchases || [];
  const sales = visit?.sales || [];
  if (purchases.length === 0 && sales.length === 0) return false;
  if (!linesFit(visit)) return false;
  const net = netCopper(visit);
  if (net == null) return false;
  return purseAfter(money, net) != null;
}

export function checkoutBody(visit) {
  return {
    purchases: (visit?.purchases || []).map((line) => ({ item_id: line.item_id, quantity: line.quantity })),
    sales: (visit?.sales || []).map((line) => ({
      character_item_id: line.character_item_id,
      quantity: line.quantity,
    })),
  };
}
