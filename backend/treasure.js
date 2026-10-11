/**
 * Roll one treasure-type definition. The definition is stored as given:
 * each column is { percent, dice } and dice is NdS or NdSxM. An optional
 * multiplier field is the same xM. A d100 above the percent drops the column.
 * This returns a draft. It does not grant XP or items.
 *
 * ponytail: magic, note, and tables are stored and not rolled. Ceiling: the
 * draft never shows the phrase. Upgrade path: append those notes when a GM
 * view wants them.
 */

const NOTE_KEYS = new Set(['magic', 'note', 'tables']);

function parseDice(dice) {
  const match = String(dice ?? '').trim().match(/^(\d+)d(\d+)(?:\s*x\s*(\d+))?$/i);
  if (!match) return { error: 'dice must look like 2d6 or 2d6x100' };
  const count = Number(match[1]);
  const sides = Number(match[2]);
  const multiplier = match[3] == null ? null : Number(match[3]);
  if (count < 1 || count > 100) return { error: 'dice count must be from 1 to 100' };
  if (sides < 2 || sides > 100) return { error: 'dice sides must be from 2 to 100' };
  if (multiplier != null && (multiplier < 1 || multiplier > 1000000)) {
    return { error: 'dice multiplier must be from 1 to 1000000' };
  }
  return { count, sides, multiplier };
}

function parseColumn(column, spec) {
  if (!column || column.length > 40) return { error: 'treasure column name must be 1 to 40 characters' };
  if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) {
    return { error: `treasure column ${column} must be an object` };
  }
  const percent = spec.percent;
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    return { error: `treasure column ${column} percent must be an integer from 0 to 100` };
  }
  const dice = parseDice(spec.dice);
  if (dice.error) return { error: `treasure column ${column} ${dice.error}` };
  let multiplier = dice.multiplier == null ? 1 : dice.multiplier;
  if (spec.multiplier != null) {
    if (!Number.isInteger(spec.multiplier) || spec.multiplier < 1 || spec.multiplier > 1000000) {
      return { error: `treasure column ${column} multiplier must be an integer from 1 to 1000000` };
    }
    if (dice.multiplier != null) return { error: `treasure column ${column} has two multipliers` };
    multiplier = spec.multiplier;
  }
  return { percent, count: dice.count, sides: dice.sides, multiplier };
}

function noteProblem(column, spec) {
  if (column === 'magic' || column === 'note') {
    if (typeof spec !== 'string' || spec.trim() === '') return `treasure note ${column} must be text`;
    if (spec.length > 500) return `treasure note ${column} exceeds 500 characters`;
    return null;
  }
  if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) {
    return 'treasure note tables must be an object';
  }
  return null;
}

function rollTreasure(definition, rollDie) {
  if (definition == null || typeof definition !== 'object' || Array.isArray(definition)) {
    return { error: 'Treasure type definition must be an object' };
  }
  if (typeof rollDie !== 'function') return { error: 'Treasure roll needs a die' };
  const lines = [];
  for (const [column, spec] of Object.entries(definition)) {
    if (NOTE_KEYS.has(column)) {
      const problem = noteProblem(column, spec);
      if (problem) return { error: problem };
      continue;
    }
    const parsed = parseColumn(column, spec);
    if (parsed.error) return { error: parsed.error };
    const chance = rollDie(100);
    if (!Number.isInteger(chance) || chance < 1 || chance > 100) {
      return { error: 'percent roll must be from 1 to 100' };
    }
    if (chance > parsed.percent) continue;
    let total = 0;
    for (let i = 0; i < parsed.count; i += 1) {
      const face = rollDie(parsed.sides);
      if (!Number.isInteger(face) || face < 1 || face > parsed.sides) {
        return { error: 'die roll out of range' };
      }
      total += face;
    }
    lines.push({ column, amount: total * parsed.multiplier });
  }
  return { lines };
}

module.exports = { rollTreasure };
