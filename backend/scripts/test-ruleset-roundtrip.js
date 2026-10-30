/**
 * Import a GameSystems folder into Postgres, export it back, and semantically
 * compare source vs export (import/export fidelity check).
 *
 * Assumes schema.sql is already applied and DB_* points at that database.
 * Ignores: PENDING_CHANGES.json, gamesystem.json description, all modified fields.
 * Compares gamesystem.json name, mechanic, and parent_ruleset (missing mechanic counts as bfrpg).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { findRulesetDir } = require('../overlay');

const repoRoot = path.join(__dirname, '..', '..');
const repoEnv = path.join(repoRoot, '.env');
if (fs.existsSync(repoEnv)) {
  require('dotenv').config({ path: repoEnv });
}
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TABLE_FILES = [
  'ABILITY_CATEGORIES',
  'STATS',
  'ITEM_CATEGORIES',
  'ITEM_TYPES',
  'CLASSES',
  'RACES',
  'SPELLS',
  'ABILITIES',
  'ITEMS',
  'CLASS_ABILITIES',
  'CLASS_LEVELING',
  'CLASS_SPELLS',
  'RACE_ABILITIES',
  'SPELL_CLASS',
];

const ROW_SORT_KEYS = {
  ABILITY_CATEGORIES: ['id'],
  STATS: ['id'],
  ITEM_CATEGORIES: ['id'],
  ITEM_TYPES: ['id'],
  CLASSES: ['id'],
  RACES: ['id'],
  SPELLS: ['id'],
  ABILITIES: ['id'],
  ITEMS: ['id'],
  CLASS_ABILITIES: ['class_id', 'ability_id', 'level'],
  CLASS_LEVELING: ['class_id', 'level'],
  CLASS_SPELLS: ['class_id', 'char_level'],
  RACE_ABILITIES: ['race_id', 'ability_id'],
  SPELL_CLASS: ['class_id', 'spell_id'],
};

function parseArgs(argv) {
  let dir = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' && argv[i + 1]) {
      dir = argv[++i];
    } else if (a === '--help' || a === '-h') {
      console.log(`
Usage: node test-ruleset-roundtrip.js --dir <GameSystems/Folder>

  --dir <path>   Source GameSystems folder to import, then export, then compare

Requires DB_* env (same as import-ruleset / export-ruleset) and an applied schema.sql.
`);
      process.exit(0);
    }
  }
  if (!dir) {
    console.error('Missing required --dir <path>');
    process.exit(1);
  }
  return { dir: path.resolve(dir) };
}

function lowerKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function loadTableJson(dir, baseName) {
  const filePath = path.join(dir, `${baseName}.json`);
  if (!fs.existsSync(filePath)) {
    return { filePath, rows: [] };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const key = Object.keys(raw).find((k) => k.toUpperCase() === baseName.toUpperCase());
  if (!key || !Array.isArray(raw[key])) {
    throw new Error(`${filePath}: expected top-level array key ${baseName}`);
  }
  return { filePath, rows: raw[key].map(lowerKeys) };
}

function loadGamesystemMeta(dir) {
  const filePath = path.join(dir, 'gamesystem.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing gamesystem.json in ${dir}`);
  }
  const meta = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!meta.name || typeof meta.name !== 'string' || !meta.name.trim()) {
    throw new Error(`${filePath}: "name" is required`);
  }
  const mechanic = meta.mechanic == null || String(meta.mechanic).trim() === ''
    ? 'bfrpg'
    : String(meta.mechanic).trim();
  const parent = meta.parent_ruleset == null || String(meta.parent_ruleset).trim() === ''
    ? null
    : String(meta.parent_ruleset).trim();
  return { name: meta.name.trim(), mechanic, parent };
}

function normalizeValue(v) {
  if (v === undefined || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return v;
}

function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'modified') continue;
    out[k] = normalizeValue(v);
  }
  return out;
}

function rowKey(row, keys) {
  return keys.map((k) => String(normalizeValue(row[k]))).join('|');
}

function sortRows(rows, keys) {
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const av = normalizeValue(a[k]);
      const bv = normalizeValue(b[k]);
      if (av === bv) continue;
      if (av == null) return -1;
      if (bv == null) return 1;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv));
    }
    return 0;
  });
}

function compareTables(tableName, sourceRows, exportRows, errors) {
  const keys = ROW_SORT_KEYS[tableName];
  const src = sortRows(sourceRows.map(normalizeRow), keys);
  const exp = sortRows(exportRows.map(normalizeRow), keys);

  if (src.length !== exp.length) {
    errors.push(`${tableName}: row count source=${src.length} export=${exp.length}`);
  }

  const srcByKey = new Map();
  for (const row of src) {
    const k = rowKey(row, keys);
    if (srcByKey.has(k)) {
      errors.push(`${tableName}: duplicate source key ${k}`);
    }
    srcByKey.set(k, row);
  }

  const expByKey = new Map();
  for (const row of exp) {
    const k = rowKey(row, keys);
    if (expByKey.has(k)) {
      errors.push(`${tableName}: duplicate export key ${k}`);
    }
    expByKey.set(k, row);
  }

  for (const k of srcByKey.keys()) {
    if (!expByKey.has(k)) {
      errors.push(`${tableName}: missing in export: ${k}`);
    }
  }
  for (const k of expByKey.keys()) {
    if (!srcByKey.has(k)) {
      errors.push(`${tableName}: unexpected in export: ${k}`);
    }
  }

  for (const [k, srcRow] of srcByKey) {
    const expRow = expByKey.get(k);
    if (!expRow) continue;
    // Only fields the exporter writes are in the round-trip contract.
    // Source-only extras (e.g. ITEMS.DESCRIPTION in older dumps) are ignored.
    for (const field of Object.keys(expRow)) {
      const sv = srcRow[field] ?? null;
      const ev = expRow[field] ?? null;
      if (sv !== ev) {
        errors.push(
          `${tableName}[${k}].${field}: source=${JSON.stringify(sv)} export=${JSON.stringify(ev)}`
        );
      }
    }
  }
}

function runNodeScript(scriptName, args) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${scriptName} failed with exit ${result.status}`);
  }
}

function main() {
  const { dir } = parseArgs(process.argv);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(1);
  }

  const rulesetMeta = loadGamesystemMeta(dir);
  const rulesetName = rulesetMeta.name;
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geasgremlin-ruleset-export-'));

  console.log(`Round-trip: ${dir}`);
  console.log(`Ruleset name: ${JSON.stringify(rulesetName)}`);
  console.log(`Export dir: ${outDir}`);

  if (rulesetMeta.parent) {
    const parentDir = findRulesetDir(path.dirname(dir), rulesetMeta.parent);
    if (!parentDir) {
      throw new Error(`No GameSystems folder for parent_ruleset ${JSON.stringify(rulesetMeta.parent)}`);
    }
    console.log(`Importing parent first: ${parentDir}`);
    runNodeScript('import-ruleset.js', ['--dir', parentDir]);
  }
  runNodeScript('import-ruleset.js', ['--dir', dir]);
  runNodeScript('export-ruleset.js', [
    '--ruleset-name',
    rulesetName,
    '--output',
    outDir,
  ]);

  const errors = [];
  const srcMeta = loadGamesystemMeta(dir);
  const expMeta = loadGamesystemMeta(outDir);
  if (srcMeta.name !== expMeta.name) {
    errors.push(`gamesystem.json name: source=${JSON.stringify(srcMeta.name)} export=${JSON.stringify(expMeta.name)}`);
  }
  if (srcMeta.mechanic !== expMeta.mechanic) {
    errors.push(
      `gamesystem.json mechanic: source=${JSON.stringify(srcMeta.mechanic)} export=${JSON.stringify(expMeta.mechanic)}`
    );
  }
  if (srcMeta.parent !== expMeta.parent) {
    errors.push(
      `gamesystem.json parent_ruleset: source=${JSON.stringify(srcMeta.parent)} export=${JSON.stringify(expMeta.parent)}`
    );
  }

  for (const table of TABLE_FILES) {
    const src = loadTableJson(dir, table);
    const exp = loadTableJson(outDir, table);
    compareTables(table, src.rows, exp.rows, errors);
  }

  if (errors.length > 0) {
    console.error(`\nRound-trip FAILED (${errors.length} difference(s)):`);
    for (const err of errors.slice(0, 50)) {
      console.error(`  - ${err}`);
    }
    if (errors.length > 50) {
      console.error(`  ... and ${errors.length - 50} more`);
    }
    process.exit(1);
  }

  console.log('Round-trip OK — source and export match semantically.');
}

main();
