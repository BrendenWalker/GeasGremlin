const assert = require('assert');
const { assignmentError } = require('./classAssignment');

const fighter = { ruleset_id: 1, is_quasi: false };
const archer = { ruleset_id: 1, is_quasi: true };
const otherFighter = { ruleset_id: 2, is_quasi: false };

assert.equal(assignmentError(1, null, null), null);
assert.equal(assignmentError(1, fighter, null), null);
assert.equal(assignmentError(1, fighter, archer), null);
assert.equal(assignmentError(1, null, archer), 'A quasi-class needs a base class');
assert.equal(assignmentError(1, fighter, fighter), 'That class is not a quasi-class');
assert.equal(assignmentError(1, archer, null), 'Base class cannot be a quasi-class');
assert.equal(assignmentError(1, archer, archer), 'Base class cannot be a quasi-class');
assert.equal(assignmentError(1, otherFighter, archer), 'Base class is not in this ruleset');
assert.equal(assignmentError(1, fighter, { ruleset_id: 2, is_quasi: true }), 'Quasi-class is not in this ruleset');
assert.equal(assignmentError(2, fighter, null, 1), null);
assert.equal(assignmentError(2, { ruleset_id: 3, is_quasi: false }, null, 1), 'Base class is not in this ruleset');

console.log('classAssignment ok');
