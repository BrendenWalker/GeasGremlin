export const CATALOG_SECTIONS = [
  { path: 'races', label: 'Races' },
  { path: 'classes', label: 'Classes' },
  { path: 'spells', label: 'Spells' },
  { path: 'items', label: 'Items' },
];

export const RULESET_STORAGE_KEY = 'rpghub_ruleset_id';

/** Section segment of /rulesets/:id/:section/... — anything else is races. */
export function catalogSection(pathname) {
  const part = String(pathname || '').split('/')[3];
  return CATALOG_SECTIONS.some((item) => item.path === part) ? part : 'races';
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
