// Discovering a clue that names an objective marks that objective known.
// Hiding the discovery leaves a known objective known.

function objectiveKnownAfterClue(objective, clue) {
  if (!objective) return false;
  if (objective.known === true) return true;
  if (!clue || clue.discovered !== true) return false;
  if (clue.objective_id == null) return false;
  return Number(clue.objective_id) === Number(objective.id);
}

module.exports = { objectiveKnownAfterClue };
