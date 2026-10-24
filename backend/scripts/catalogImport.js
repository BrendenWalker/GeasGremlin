/**
 * Shape checks for the play catalog (monsters, treasure types, encounter tables).
 * No database. import-catalog.js applies a file that passes these checks.
 *
 * A missing file is "leave that table alone". A present file, even [], replaces
 * that ruleset's rows. Stock encounter tables set ruleset_id. Custom tables set
 * campaign_id. Never both.
 */

const fs = require('fs');
const path = require('path');

const TABLE_FILES = {
  monsters: 'MONSTERS',
  treasures: 'TREASURE_TYPES',
  tables: 'ENCOUNTER_TABLES',
  rows: 'ENCOUNTER_TABLE_ROWS',
};

function ownerError(rulesetId, campaignId) {
  const stock = rulesetId != null && campaignId == null;
  const custom = rulesetId == null && campaignId != null;
  if (stock || custom) return null;
  return 'owner must set ruleset_id or campaign_id, never both and never neither';
}

function referenceBlockMessage(rulesetId, kind, samples) {
  if (!samples || samples.length === 0) return null;
  return (
    `Cannot replace monsters for ruleset_id=${rulesetId}: ` +
    `${kind} still points at one (${samples.join(', ')}).`
  );
}

function lowerKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function asInt(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function requiredText(value, label, max) {
  if (value == null || String(value).trim() === '') return `${label} is required`;
  if (String(value).length > max) return `${label} exceeds ${max} characters`;
  return null;
}

function optionalText(value, label, max) {
  if (value == null || value === '') return null;
  if (String(value).length > max) return `${label} exceeds ${max} characters`;
  return null;
}

function pushProblems(problems, where, checks) {
  for (const problem of checks) {
    if (problem) problems.push(`${where}: ${problem}`);
  }
}

function duplicateIds(rows, fileLabel, problems) {
  const seen = new Set();
  for (const row of rows) {
    const id = asInt(row.id);
    const where = `${fileLabel} id ${row.id ?? '?'}`;
    if (id == null) {
      problems.push(`${where}: ID is required`);
      continue;
    }
    if (seen.has(id)) problems.push(`${where}: duplicate ID`);
    seen.add(id);
  }
}

/**
 * @param {string} dir
 * @param {string} baseName
 * @returns {null | { filePath: string, rows: object[] }} null when the file is absent
 */
function loadTableFile(dir, baseName) {
  const filePath = path.join(dir, `${baseName}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const key = Object.keys(raw).find((k) => k.toUpperCase() === baseName.toUpperCase());
  if (!key || !Array.isArray(raw[key])) {
    throw new Error(`${filePath}: expected top-level array key ${baseName}`);
  }
  return { filePath, rows: raw[key].map(lowerKeys) };
}

function loadCatalog(dir) {
  return {
    monsters: loadTableFile(dir, TABLE_FILES.monsters),
    treasures: loadTableFile(dir, TABLE_FILES.treasures),
    tables: loadTableFile(dir, TABLE_FILES.tables),
    rows: loadTableFile(dir, TABLE_FILES.rows),
  };
}

function armorProblem(value, defenseNote) {
  const blank = value == null || value === '';
  if (blank) {
    const note = defenseNote == null ? '' : String(defenseNote).trim();
    return note ? null : 'armor class or defense note is required';
  }
  if (asInt(value) == null) return 'armor class must be an integer';
  return null;
}

function monsterProblems(row) {
  const where = `MONSTERS id ${row.id ?? '?'}`;
  const problems = [];
  pushProblems(problems, where, [
    requiredText(row.name, 'name', 80),
    requiredText(row.hit_dice, 'hit dice', 20),
    optionalText(row.hitdie_note, 'hit die note', 500),
    armorProblem(row.armor_class, row.defense_note),
    optionalText(row.defense_note, 'defense note', 500),
    optionalText(row.attack_note, 'attack note', 500),
    optionalText(row.notes, 'notes', 30000),
    moraleProblem(row.morale),
    moraleProblem(row.morale_engaged),
    optionalText(row.treasure_type, 'treasure type', 40),
    requiredText(row.movement, 'movement', 80),
    requiredText(row.number_appearing, 'number appearing', 80),
  ]);
  return problems;
}

function moraleProblem(value) {
  if (value == null || value === '') return null;
  const n = asInt(value);
  if (n == null || n < 2 || n > 12) return 'morale must be an integer from 2 to 12, or empty';
  return null;
}

function treasureProblems(row) {
  const where = `TREASURE_TYPES id ${row.id ?? '?'}`;
  const problems = [];
  pushProblems(problems, where, [
    requiredText(row.code, 'code', 8),
    row.definition == null || typeof row.definition !== 'object' || Array.isArray(row.definition)
      ? 'definition must be a JSON object'
      : null,
  ]);
  return problems;
}

function tableProblems(row) {
  const where = `ENCOUNTER_TABLES id ${row.id ?? '?'}`;
  const problems = [];
  const die = asInt(row.die);
  pushProblems(problems, where, [
    requiredText(row.name, 'name', 80),
    die == null || die < 2 || die > 100 ? 'die must be an integer from 2 to 100' : null,
  ]);
  return problems;
}

function rowProblems(row, dieByTableId, monsterIds) {
  const where = `ENCOUNTER_TABLE_ROWS id ${row.id ?? '?'}`;
  const problems = [];
  const tableId = asInt(row.encounter_table_id);
  const die = tableId == null ? null : dieByTableId.get(tableId);
  const lo = asInt(row.face_lo);
  const hi = asInt(row.face_hi);
  if (tableId == null || die == null) {
    problems.push(`${where}: ENCOUNTER_TABLE_ID does not match a table in this import`);
  }
  if (lo == null || lo < 1) problems.push(`${where}: face_lo must be an integer >= 1`);
  if (hi == null || (lo != null && hi < lo)) problems.push(`${where}: face_hi must be an integer >= face_lo`);
  if (die != null && hi != null && hi > die) {
    problems.push(`${where}: face_hi ${hi} is above the table die ${die}`);
  }
  const monsterId = row.monster_id == null || row.monster_id === '' ? null : asInt(row.monster_id);
  if (row.monster_id != null && row.monster_id !== '' && monsterId == null) {
    problems.push(`${where}: monster id must be an integer`);
  }
  const label = row.label == null ? '' : String(row.label).trim();
  if (monsterId == null && label === '') problems.push(`${where}: needs a monster id or a label`);
  if (label.length > 80) problems.push(`${where}: label exceeds 80 characters`);
  if (monsterIds && monsterId != null && !monsterIds.has(monsterId)) {
    problems.push(`${where}: monster id ${monsterId} is not in MONSTERS.json`);
  }
  const quantity = optionalText(row.quantity, 'quantity', 80);
  if (quantity) problems.push(`${where}: ${quantity}`);
  return problems;
}

/**
 * @param {{ monsters: { rows: object[] } | null, treasures: { rows: object[] } | null, tables: { rows: object[] } | null, rows: { rows: object[] } | null }} catalog
 * @returns {string[]}
 */
function validateCatalog(catalog) {
  const problems = [];
  if (catalog.rows && !catalog.tables) {
    problems.push('ENCOUNTER_TABLE_ROWS.json requires ENCOUNTER_TABLES.json');
  }

  const monsterRows = catalog.monsters ? catalog.monsters.rows : null;
  const treasureRows = catalog.treasures ? catalog.treasures.rows : null;
  const tableRows = catalog.tables ? catalog.tables.rows : null;
  const faceRows = catalog.rows ? catalog.rows.rows : [];

  if (monsterRows) {
    duplicateIds(monsterRows, 'MONSTERS', problems);
    const names = new Set();
    for (const row of monsterRows) {
      problems.push(...monsterProblems(row));
      const name = row.name == null ? '' : String(row.name).trim();
      if (name && names.has(name)) problems.push(`MONSTERS id ${row.id}: duplicate name ${JSON.stringify(name)}`);
      if (name) names.add(name);
    }
  }
  if (treasureRows) {
    duplicateIds(treasureRows, 'TREASURE_TYPES', problems);
    const codes = new Set();
    for (const row of treasureRows) {
      problems.push(...treasureProblems(row));
      const code = row.code == null ? '' : String(row.code).trim();
      if (code && codes.has(code)) problems.push(`TREASURE_TYPES id ${row.id}: duplicate code ${JSON.stringify(code)}`);
      if (code) codes.add(code);
    }
  }

  const dieByTableId = new Map();
  if (tableRows) {
    duplicateIds(tableRows, 'ENCOUNTER_TABLES', problems);
    const names = new Set();
    for (const row of tableRows) {
      problems.push(...tableProblems(row));
      const id = asInt(row.id);
      const die = asInt(row.die);
      if (id != null && die != null) dieByTableId.set(id, die);
      const name = row.name == null ? '' : String(row.name).trim();
      if (name && names.has(name)) problems.push(`ENCOUNTER_TABLES id ${row.id}: duplicate name ${JSON.stringify(name)}`);
      if (name) names.add(name);
    }
  }

  if (catalog.rows) {
    duplicateIds(faceRows, 'ENCOUNTER_TABLE_ROWS', problems);
    const monsterIds = monsterRows ? new Set(monsterRows.map((row) => asInt(row.id)).filter((id) => id != null)) : null;
    for (const row of faceRows) problems.push(...rowProblems(row, dieByTableId, monsterIds));
  }

  return problems;
}

module.exports = {
  TABLE_FILES,
  asInt,
  loadCatalog,
  ownerError,
  referenceBlockMessage,
  validateCatalog,
};
