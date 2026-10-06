/** Basic Fantasy ability modifier. Score 3 is −3, 18 is +3. */
export function abilityModifier(score) {
  if (score == null || score === '') return 0;
  const n = Number(score);
  if (!Number.isInteger(n)) return 0;
  if (n <= 3) return -3;
  if (n <= 5) return -2;
  if (n <= 8) return -1;
  if (n <= 12) return 0;
  if (n <= 15) return 1;
  if (n <= 17) return 2;
  return 3;
}

export function formatModifier(n) {
  const value = Number(n) || 0;
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Level-1 hit points from one die roll plus Constitution.
 * A penalty cannot reduce the gain below 1.
 * Returns null when the roll is not a positive integer, or above the hit die.
 */
export function adjustedHitPoints(base, conScore, hitdie) {
  const roll = Number(base);
  if (!Number.isInteger(roll) || roll < 1) return null;
  if (hitdie != null && hitdie !== '') {
    const die = Number(hitdie);
    if (Number.isInteger(die) && die > 0 && roll > die) return null;
  }
  return Math.max(1, roll + abilityModifier(conScore));
}
