export const CATALOG_SECTIONS = [
  { path: 'races', label: 'Races' },
  { path: 'classes', label: 'Classes' },
  { path: 'spells', label: 'Spells' },
  { path: 'items', label: 'Items' },
];

export const RULESET_STORAGE_KEY = 'geasgremlin_ruleset_id';

/** Catalog section in a hub or campaign reference URL. Anything else is races. */
export function catalogSection(pathname) {
  const parts = String(pathname || '').split('/');
  const found = parts.find((part) => CATALOG_SECTIONS.some((item) => item.path === part));
  return found || 'races';
}

/** Hub catalog lives under /rulesets/:id. Campaign reference stays under /play/:campaignId/reference/:id. */
export function catalogBase(pathname, rulesetId) {
  const play = String(pathname || '').match(/^\/play\/(\d+)\/reference\//);
  if (play) return `/play/${play[1]}/reference/${rulesetId}`;
  return `/rulesets/${rulesetId}`;
}

/** Path after /reference, without a ruleset id, defaulting to races. */
export function referenceTail(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  const idx = parts.indexOf('reference');
  const after = idx >= 0 ? parts.slice(idx + 1) : [];
  const rest = /^\d+$/.test(after[0] || '') ? after.slice(1) : after;
  return rest.join('/') || 'races';
}

/**
 * Remembered id when it is still in the list; otherwise the first ruleset.
 * Empty when there is nothing to select.
 */
export function resolveRulesetId(rulesets, storedId) {
  if (!Array.isArray(rulesets) || rulesets.length === 0) return '';
  const stored = storedId == null ? '' : String(storedId);
  if (rulesets.some((row) => String(row.id) === stored)) return stored;
  return String(rulesets[0].id);
}
