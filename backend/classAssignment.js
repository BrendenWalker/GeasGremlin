/**
 * Pure check for a character's base class and quasi-class overlay.
 * base and quasi are class rows { ruleset_id, is_quasi } or null.
 * Returns an error string, or null when the pair is allowed.
 */
function assignmentError(rulesetId, base, quasi) {
  if (quasi && Number(quasi.ruleset_id) !== Number(rulesetId)) {
    return 'Quasi-class is not in this ruleset';
  }
  if (base && Number(base.ruleset_id) !== Number(rulesetId)) {
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

module.exports = { assignmentError };
