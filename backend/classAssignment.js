/**
 * Pure check for a character's base class and quasi-class overlay.
 * base and quasi are class rows { ruleset_id, is_quasi } or null.
 * Returns an error string, or null when the pair is allowed.
 */
function inCatalog(row, rulesetId, parentRulesetId) {
  if (!row) return true;
  const id = Number(row.ruleset_id);
  if (id === Number(rulesetId)) return true;
  return parentRulesetId != null && id === Number(parentRulesetId);
}

function assignmentError(rulesetId, base, quasi, parentRulesetId) {
  if (quasi && !inCatalog(quasi, rulesetId, parentRulesetId)) {
    return 'Quasi-class is not in this ruleset';
  }
  if (base && !inCatalog(base, rulesetId, parentRulesetId)) {
    return 'Base class is not in this ruleset';
  }
  if (quasi && !quasi.is_quasi) {
    return 'That class is not a quasi-class';
  }
  if (base && base.is_quasi) {
    return 'Base class cannot be a quasi-class';
  }
  if (quasi && !base) {
    return 'A quasi-class needs a base class';
  }
  return null;
}

module.exports = { assignmentError, inCatalog };
