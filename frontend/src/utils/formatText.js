/**
 * Turn stored text into paragraph blocks.
 * Two or more newlines (CRLF or LF) start a new paragraph. A single newline is a line break inside one.
 * Empty blocks from stacked breaks are dropped.
 */
export function splitParagraphs(text) {
  if (text == null || text === '') return [];
  const normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.split('\n'))
    .filter((lines) => lines.some((line) => line.trim() !== ''));
}

/** Fill ability templates. %d uses int_param, %s uses str_param. */
export function formatAbilityText(description, intParam, strParam) {
  if (!description) return '';
  let text = String(description);
  if (intParam != null && intParam !== '') {
    text = text.replace('%d', String(intParam));
  }
  if (strParam != null && strParam !== '') {
    text = text.replace('%s', String(strParam));
  }
  return text.replace(/%%/g, '%');
}

const ABILITY_SCORES = [
  ['str', 'Strength'],
  ['int', 'Intelligence'],
  ['wis', 'Wisdom'],
  ['dex', 'Dexterity'],
  ['con', 'Constitution'],
  ['chr', 'Charisma'],
];

/** One line of populated ability minimums and maximums, or null. */
export function abilityRequirements(row) {
  const parts = [];
  for (const [key, label] of ABILITY_SCORES) {
    const min = row[`min_${key}`];
    const max = row[`max_${key}`];
    if (min == null && max == null) continue;
    if (min != null && max != null) parts.push(`${label} ${min}–${max}`);
    else if (min != null) parts.push(`${label} ${min}+`);
    else parts.push(`${label} max ${max}`);
  }
  return parts.length ? parts.join(', ') : null;
}
