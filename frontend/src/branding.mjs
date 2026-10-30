export const PRODUCT_NAME = 'GeasGremlin';

export const TAGLINES = [
  'Keeping track of quests you never agreed to.',
  'Your adventures. Your obligations. His problem.',
  'Because somebody has to remember the geas.',
  'You accepted the quest. The gremlin remembers.',
];

export function taglineForDate(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const index = ((day % TAGLINES.length) + TAGLINES.length) % TAGLINES.length;
  return TAGLINES[index];
}

export function documentTitle(date = new Date()) {
  return `${PRODUCT_NAME} — ${taglineForDate(date)}`;
}
