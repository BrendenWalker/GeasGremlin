// Stored item prices are copper pieces. 100 is 1 gp, 10 is 1 sp.

export function formatItemPrice(copper) {
  if (copper == null || copper === '') return '';
  const amount = Number(copper);
  if (!Number.isInteger(amount) || amount < 0) return String(copper);
  if (amount === 0) return '0 CP';
  const gp = Math.floor(amount / 100);
  const afterGold = amount % 100;
  const sp = Math.floor(afterGold / 10);
  const cp = afterGold % 10;
  const parts = [];
  if (gp) parts.push(`${gp} GP`);
  if (sp) parts.push(`${sp} SP`);
  if (cp) parts.push(`${cp} CP`);
  return parts.join(', ');
}
