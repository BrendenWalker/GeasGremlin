/**
 * Import a GameSystems JSON catalog into PostgreSQL (replace, not upsert).
 * Deletes the target ruleset's catalog, then inserts fresh rows.
 * Firebird/source IDs only remap FKs within this transaction.
 *
 * Loads repo-root .env then backend/.env — same as export-ruleset.js / server.js.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const repoRoot = path.join(__dirname, '..', '..');
const repoEnv = path.join(repoRoot, '.env');
if (fs.existsSync(repoEnv)) {
  require('dotenv').config({ path: repoEnv });
}
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SKIP_FILES = new Set(['gamesystem.json', 'pending_changes.json']);

function parseArgs(argv) {
  let dir = null;
  let dryRun = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' && argv[i + 1]) {
      dir = argv[++i];
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--help' || a === '-h') {
      console.log(`
Usage: node import-ruleset.js --dir <GameSystems/Folder> [--dry-run]

  --dir <path>   Folder containing gamesystem.json and catalog *.json files
  --dry-run      Run the full import inside a transaction, then ROLLBACK

Reads DB_* from repo-root .env (see env.example).

REPLACE semantics: deletes that ruleset's catalog, then inserts from JSON.
Shared category/type/stat tables are matched by name (not wiped).
JSON IDs only remap references; destination PKs are newly allocated
(preferring a free source id when available).
Fails if any characters belong to the target ruleset.
`);
      process.exit(0);
    }
  }
  if (!dir) {
    console.error('Missing required --dir <path>');
    process.exit(1);
  }
  dir = path.resolve(dir);
  return { dir, dryRun };
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

function loadGamesystem(dir) {
  const filePath = path.join(dir, 'gamesystem.json');
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing gamesystem.json in ${dir}`);
  }
  const meta = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!meta.name || typeof meta.name !== 'string' || !meta.name.trim()) {
    throw new Error(`${filePath}: "name" is required`);
  }
  if (meta.name.length > 40) {
    throw new Error(`${filePath}: "name" exceeds ruleset.name varchar(40)`);
  }
  return {
    name: meta.name.trim(),
    description: typeof meta.description === 'string' ? meta.description : null,
  };
}

function emptyToNull(v) {
  if (v === undefined) return null;
  if (v === '') return null;
  return v;
}

function asIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function asTimestampOrNow(v) {
  if (v === null || v === undefined || v === '') return new Date();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

async function nextId(client, table) {
  const res = await client.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM public.${table}`);
  const maxId = Number(res.rows[0].max_id);
  return maxId >= 0 ? maxId + 1 : 1;
}

/**
 * Allocate a destination PK. Prefers sourceId when free (and not already reserved
 * in this import); otherwise max(id)+1, skipping reserved ids.
 */
async function allocDestId(client, table, sourceId, reserved) {
  if (sourceId != null && !reserved.has(sourceId)) {
    const free = await client.query(`SELECT 1 FROM public.${table} WHERE id = $1`, [sourceId]);
    if (free.rows.length === 0) {
      reserved.add(sourceId);
      return sourceId;
    }
  }
  let id = await nextId(client, table);
  while (reserved.has(id)) {
    id += 1;
  }
  reserved.add(id);
  return id;
}

async function ensureRuleset(client, name) {
  const existing = await client.query('SELECT id, name FROM public.ruleset WHERE name = $1', [name]);
  if (existing.rows.length > 0) {
    await client.query('UPDATE public.ruleset SET modified = NOW() WHERE id = $1', [existing.rows[0].id]);
    return existing.rows[0].id;
  }
  const id = await nextId(client, 'ruleset');
  await client.query('INSERT INTO public.ruleset (id, name, modified) VALUES ($1, $2, NOW())', [
    id,
    name,
  ]);
  return id;
}

/**
 * Block replace when instance data still points at this ruleset's catalog.
 */
async function assertReplaceAllowed(client, rulesetId) {
  const chars = await client.query(
    `SELECT id, name FROM public."characters" WHERE ruleset_id = $1 ORDER BY id LIMIT 10`,
    [rulesetId]
  );
  if (chars.rows.length > 0) {
    const sample = chars.rows.map((r) => `${r.id}:${r.name}`).join(', ');
    const total = await client.query(
      `SELECT COUNT(*)::int AS n FROM public."characters" WHERE ruleset_id = $1`,
      [rulesetId]
    );
    throw new Error(
      `Cannot replace ruleset_id=${rulesetId}: ${total.rows[0].n} character(s) still belong to it ` +
        `(e.g. ${sample}). Remove or reassign them first.`
    );
  }
}

/**
 * Wipe catalog (+ junctions) for one ruleset. Shared lookups are left alone.
 */
async function deleteRulesetCatalog(client, rulesetId) {
  await client.query(
    `DELETE FROM public.spell_class
     WHERE class_id IN (SELECT id FROM public.classes WHERE ruleset_id = $1)
        OR spell_id IN (SELECT id FROM public.spells WHERE ruleset_id = $1)`,
    [rulesetId]
  );
  await client.query(`DELETE FROM public.class_abilities WHERE ruleset_id = $1`, [rulesetId]);
  await client.query(`DELETE FROM public.class_leveling WHERE ruleset_id = $1`, [rulesetId]);
  await client.query(`DELETE FROM public.class_spells WHERE ruleset_id = $1`, [rulesetId]);
  await client.query(`DELETE FROM public.race_abilities WHERE ruleset_id = $1`, [rulesetId]);

  await client.query(`DELETE FROM public.items WHERE ruleset_id = $1`, [rulesetId]);
  await client.query(`DELETE FROM public.abilities WHERE ruleset_id = $1`, [rulesetId]);
  await client.query(`DELETE FROM public.spells WHERE ruleset_id = $1`, [rulesetId]);
  await client.query(`DELETE FROM public.races WHERE ruleset_id = $1`, [rulesetId]);

  // Clear self-FK before deleting classes (subclass_of ON DELETE RESTRICT).
  await client.query(`UPDATE public.classes SET subclass_of = NULL WHERE ruleset_id = $1`, [rulesetId]);
  await client.query(`DELETE FROM public.classes WHERE ruleset_id = $1`, [rulesetId]);
}

async function importSharedLookup(client, { filePath, rows }, table) {
  const map = new Map();
  const seenSource = new Set();
  const reserved = new Set();
  for (const row of rows) {
    const sourceId = asIntOrNull(row.id);
    const name = row.name;
    if (sourceId == null) throw new Error(`${filePath}: row missing ID`);
    if (!name || typeof name !== 'string') {
      throw new Error(`${filePath}: id ${sourceId} missing NAME`);
    }
    if (seenSource.has(sourceId)) {
      throw new Error(`${filePath}: duplicate source ID ${sourceId}`);
    }
    seenSource.add(sourceId);

    const found = await client.query(`SELECT id FROM public.${table} WHERE name = $1`, [name]);
    let destId;
    if (found.rows.length > 0) {
      destId = found.rows[0].id;
      await client.query(`UPDATE public.${table} SET modified = $1 WHERE id = $2`, [
        asTimestampOrNow(row.modified),
        destId,
      ]);
    } else {
      destId = await allocDestId(client, table, sourceId, reserved);
      await client.query(`INSERT INTO public.${table} (id, name, modified) VALUES ($1, $2, $3)`, [
        destId,
        name,
        asTimestampOrNow(row.modified),
      ]);
    }
    map.set(sourceId, destId);
  }
  return map;
}

async function insertRow(client, table, cols, vals) {
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(`INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${placeholders})`, vals);
}

async function importClasses(client, { filePath, rows }, rulesetId) {
  const map = new Map();
  const seen = new Set();
  const reserved = new Set();
  for (const row of rows) {
    const sourceId = asIntOrNull(row.id);
    if (sourceId == null) throw new Error(`${filePath}: row missing ID`);
    if (seen.has(sourceId)) throw new Error(`${filePath}: duplicate source ID ${sourceId}`);
    seen.add(sourceId);
    if (!row.name) throw new Error(`${filePath}: id ${sourceId} missing NAME`);

    const destId = await allocDestId(client, 'classes', sourceId, reserved);
    await insertRow(
      client,
      'classes',
      [
        'id',
        'name',
        'min_str',
        'min_int',
        'min_wis',
        'min_dex',
        'min_con',
        'min_chr',
        'armor',
        'weapons',
        'is_quasi',
        'description',
        'modified',
        'ruleset_id',
      ],
      [
        destId,
        row.name,
        asIntOrNull(row.min_str),
        asIntOrNull(row.min_int),
        asIntOrNull(row.min_wis),
        asIntOrNull(row.min_dex),
        asIntOrNull(row.min_con),
        asIntOrNull(row.min_chr),
        emptyToNull(row.armor),
        emptyToNull(row.weapons),
        row.is_quasi === true,
        emptyToNull(row.description),
        asTimestampOrNow(row.modified),
        rulesetId,
      ]
    );
    map.set(sourceId, destId);
  }
  return map;
}

async function importRaces(client, { filePath, rows }, rulesetId) {
  const map = new Map();
  const seen = new Set();
  const reserved = new Set();
  for (const row of rows) {
    const sourceId = asIntOrNull(row.id);
    if (sourceId == null) throw new Error(`${filePath}: row missing ID`);
    if (seen.has(sourceId)) throw new Error(`${filePath}: duplicate source ID ${sourceId}`);
    seen.add(sourceId);
    if (!row.name) throw new Error(`${filePath}: id ${sourceId} missing NAME`);

    const destId = await allocDestId(client, 'races', sourceId, reserved);
    await insertRow(
      client,
      'races',
      [
        'id',
        'name',
        'avgweight',
        'avgheight',
        'min_str',
        'min_int',
        'min_wis',
        'min_dex',
        'min_con',
        'min_chr',
        'max_str',
        'max_int',
        'max_wis',
        'max_dex',
        'max_con',
        'max_chr',
        'armor',
        'weapons',
        'description',
        'max_hd',
        'modified',
        'hd_mod',
        'ruleset_id',
      ],
      [
        destId,
        row.name,
        asIntOrNull(row.avgweight) ?? 0,
        asIntOrNull(row.avgheight) ?? 0,
        asIntOrNull(row.min_str),
        asIntOrNull(row.min_int),
        asIntOrNull(row.min_wis),
        asIntOrNull(row.min_dex),
        asIntOrNull(row.min_con),
        asIntOrNull(row.min_chr),
        asIntOrNull(row.max_str),
        asIntOrNull(row.max_int),
        asIntOrNull(row.max_wis),
        asIntOrNull(row.max_dex),
        asIntOrNull(row.max_con),
        asIntOrNull(row.max_chr),
        emptyToNull(row.armor),
        emptyToNull(row.weapons),
        emptyToNull(row.description),
        asIntOrNull(row.max_hd),
        asTimestampOrNow(row.modified),
        asIntOrNull(row.hd_mod),
        rulesetId,
      ]
    );
    map.set(sourceId, destId);
  }
  return map;
}

async function importSpells(client, { filePath, rows }, rulesetId) {
  const map = new Map();
  const seen = new Set();
  const reserved = new Set();
  for (const row of rows) {
    const sourceId = asIntOrNull(row.id);
    if (sourceId == null) throw new Error(`${filePath}: row missing ID`);
    if (seen.has(sourceId)) throw new Error(`${filePath}: duplicate source ID ${sourceId}`);
    seen.add(sourceId);
    const name = row.name;
    if (!name) throw new Error(`${filePath}: id ${sourceId} missing Name`);

    const destId = await allocDestId(client, 'spells', sourceId, reserved);
    await insertRow(
      client,
      'spells',
      ['id', 'name', '"range"', 'duration', 'description', 'modified', 'ruleset_id'],
      [
        destId,
        name,
        emptyToNull(row.range),
        emptyToNull(row.duration),
        emptyToNull(row.description),
        asTimestampOrNow(row.modified),
        rulesetId,
      ]
    );
    map.set(sourceId, destId);
  }
  return map;
}

async function importStats(client, { filePath, rows }, categoryMap) {
  const map = new Map();
  const seenSource = new Set();
  const reserved = new Set();
  for (const row of rows) {
    const sourceId = asIntOrNull(row.id);
    const name = row.name;
    if (sourceId == null) throw new Error(`${filePath}: row missing ID`);
    if (!name || typeof name !== 'string') {
      throw new Error(`${filePath}: id ${sourceId} missing NAME`);
    }
    if (seenSource.has(sourceId)) {
      throw new Error(`${filePath}: duplicate source ID ${sourceId}`);
    }
    seenSource.add(sourceId);

    let category = asIntOrNull(row.category);
    if (category == null) {
      throw new Error(`${filePath}: id ${sourceId} missing CATEGORY`);
    }
    if (!categoryMap.has(category)) {
      throw new Error(`${filePath}: id ${sourceId} category ${category} not in ABILITY_CATEGORIES`);
    }
    category = categoryMap.get(category);

    const found = await client.query(`SELECT id FROM public.stat WHERE name = $1`, [name]);
    let destId;
    if (found.rows.length > 0) {
      destId = found.rows[0].id;
      await client.query(`UPDATE public.stat SET category = $1, modified = $2 WHERE id = $3`, [
        category,
        asTimestampOrNow(row.modified),
        destId,
      ]);
    } else {
      destId = await allocDestId(client, 'stat', sourceId, reserved);
      await client.query(
        `INSERT INTO public.stat (id, name, category, modified) VALUES ($1, $2, $3, $4)`,
        [destId, name, category, asTimestampOrNow(row.modified)]
      );
    }
    map.set(sourceId, destId);
  }
  return map;
}

async function importAbilities(client, { filePath, rows }, rulesetId, statMap) {
  const map = new Map();
  const seen = new Set();
  const reserved = new Set();
  for (const row of rows) {
    const sourceId = asIntOrNull(row.id);
    if (sourceId == null) throw new Error(`${filePath}: row missing ID`);
    if (seen.has(sourceId)) throw new Error(`${filePath}: duplicate source ID ${sourceId}`);
    seen.add(sourceId);
    const description = row.description;
    if (!description || typeof description !== 'string') {
      throw new Error(`${filePath}: id ${sourceId} missing DESCRIPTION`);
    }
    if (description.length > 200) {
      throw new Error(
        `${filePath}: id ${sourceId} DESCRIPTION length ${description.length} exceeds varchar(200)`
      );
    }

    let statId = asIntOrNull(row.stat_id);
    if (statId != null) {
      if (!statMap.has(statId)) {
        throw new Error(`${filePath}: id ${sourceId} stat_id ${statId} not in STATS`);
      }
      statId = statMap.get(statId);
    }
    const statModifier = asIntOrNull(row.stat_modifier);
    if (statModifier != null && statId == null) {
      throw new Error(`${filePath}: id ${sourceId} STAT_MODIFIER requires STAT_ID`);
    }

    const destId = await allocDestId(client, 'abilities', sourceId, reserved);
    await insertRow(client, 'abilities', ['id', 'description', 'modified', 'stat_id', 'stat_modifier', 'ruleset_id'], [
      destId,
      description,
      asTimestampOrNow(row.modified),
      statId,
      statModifier,
      rulesetId,
    ]);
    map.set(sourceId, destId);
  }
  return map;
}

async function importItems(client, { filePath, rows }, rulesetId, categoryMap, typeMap) {
  const map = new Map();
  const seen = new Set();
  const reserved = new Set();
  for (const row of rows) {
    const sourceId = asIntOrNull(row.id);
    if (sourceId == null) throw new Error(`${filePath}: row missing ID`);
    if (seen.has(sourceId)) throw new Error(`${filePath}: duplicate source ID ${sourceId}`);
    seen.add(sourceId);
    const name = row.name;
    if (!name) throw new Error(`${filePath}: id ${sourceId} missing Name`);

    let category = asIntOrNull(row.category);
    if (category != null) {
      if (!categoryMap.has(category)) {
        throw new Error(`${filePath}: id ${sourceId} Category ${category} not in ITEM_CATEGORIES`);
      }
      category = categoryMap.get(category);
    }

    let type = asIntOrNull(row.type);
    if (type != null) {
      if (!typeMap.has(type)) {
        throw new Error(`${filePath}: id ${sourceId} Type ${type} not in ITEM_TYPES`);
      }
      type = typeMap.get(type);
    }

    const destId = await allocDestId(client, 'items', sourceId, reserved);
    await insertRow(
      client,
      'items',
      [
        'id',
        'category',
        '"type"',
        'name',
        'price',
        'size',
        'weight',
        'attackbonus',
        'damagebonus',
        'defensebonus',
        'damage',
        'range_short',
        'range_medium',
        'range_long',
        'rof',
        'ac',
        'ac_melee',
        'ac_ranged',
        'notes',
        'modified',
        'effect',
        'value',
        'duration',
        'charges',
        'perday',
        'ruleset_id',
      ],
      [
        destId,
        category,
        type,
        name,
        asIntOrNull(row.price),
        emptyToNull(row.size),
        asIntOrNull(row.weight),
        asIntOrNull(row.attackbonus),
        asIntOrNull(row.damagebonus),
        asIntOrNull(row.defensebonus),
        emptyToNull(row.damage),
        asIntOrNull(row.range_short),
        asIntOrNull(row.range_medium),
        asIntOrNull(row.range_long),
        emptyToNull(row.rof),
        asIntOrNull(row.ac),
        asIntOrNull(row.ac_melee),
        asIntOrNull(row.ac_ranged),
        emptyToNull(row.notes),
        asTimestampOrNow(row.modified),
        asIntOrNull(row.effect),
        asIntOrNull(row.value),
        asIntOrNull(row.duration),
        asIntOrNull(row.charges),
        asIntOrNull(row.perday) ?? 0,
        rulesetId,
      ]
    );
    map.set(sourceId, destId);
  }
  return map;
}

function requireMapped(map, sourceId, label, filePath) {
  if (sourceId == null) {
    throw new Error(`${filePath}: missing ${label}`);
  }
  if (!map.has(sourceId)) {
    throw new Error(`${filePath}: ${label} ${sourceId} has no remapped destination id`);
  }
  return map.get(sourceId);
}

async function importClassAbilities(client, { filePath, rows }, rulesetId, classMap, abilityMap) {
  for (const row of rows) {
    const classId = requireMapped(classMap, asIntOrNull(row.class_id), 'CLASS_ID', filePath);
    const abilityId = requireMapped(abilityMap, asIntOrNull(row.ability_id), 'ABILITY_ID', filePath);
    const level = asIntOrNull(row.level);
    if (level == null) throw new Error(`${filePath}: missing LEVEL for class ${row.class_id}`);
    await client.query(
      `INSERT INTO public.class_abilities
        (class_id, ability_id, level, int_param, str_param, modified, ruleset_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        classId,
        abilityId,
        level,
        asIntOrNull(row.int_param),
        emptyToNull(row.str_param),
        asTimestampOrNow(row.modified),
        rulesetId,
      ]
    );
  }
}

async function importClassLeveling(client, { filePath, rows }, rulesetId, classMap) {
  for (const row of rows) {
    const classId = requireMapped(classMap, asIntOrNull(row.class_id), 'CLASS_ID', filePath);
    const level = asIntOrNull(row.level);
    if (level == null) throw new Error(`${filePath}: missing LEVEL`);
    const xp = asIntOrNull(row.xp);
    if (xp == null) throw new Error(`${filePath}: missing XP for class ${row.class_id} level ${level}`);
    await client.query(
      `INSERT INTO public.class_leveling
        (class_id, level, xp, hd, hp, ab, modified, ruleset_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        classId,
        level,
        xp,
        asIntOrNull(row.hd),
        asIntOrNull(row.hp),
        asIntOrNull(row.ab),
        asTimestampOrNow(row.modified),
        rulesetId,
      ]
    );
  }
}

async function importClassSpells(client, { filePath, rows }, rulesetId, classMap) {
  for (const row of rows) {
    const classId = requireMapped(classMap, asIntOrNull(row.class_id), 'CLASS_ID', filePath);
    const charLevel = asIntOrNull(row.char_level);
    if (charLevel == null) throw new Error(`${filePath}: missing CHAR_LEVEL`);
    await client.query(
      `INSERT INTO public.class_spells
        (class_id, char_level, level1, level2, level3, level4, level5, level6, level7, modified, ruleset_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        classId,
        charLevel,
        asIntOrNull(row.level1),
        asIntOrNull(row.level2),
        asIntOrNull(row.level3),
        asIntOrNull(row.level4),
        asIntOrNull(row.level5),
        asIntOrNull(row.level6),
        asIntOrNull(row.level7),
        asTimestampOrNow(row.modified),
        rulesetId,
      ]
    );
  }
}

async function importRaceAbilities(client, { filePath, rows }, rulesetId, raceMap, abilityMap) {
  for (const row of rows) {
    const raceId = requireMapped(raceMap, asIntOrNull(row.race_id), 'RACE_ID', filePath);
    const abilityId = requireMapped(abilityMap, asIntOrNull(row.ability_id), 'ABILITY_ID', filePath);
    await client.query(
      `INSERT INTO public.race_abilities
        (race_id, ability_id, int_param, str_param, modified, ruleset_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        raceId,
        abilityId,
        asIntOrNull(row.int_param),
        emptyToNull(row.str_param),
        asTimestampOrNow(row.modified),
        rulesetId,
      ]
    );
  }
}

async function importSpellClass(client, { filePath, rows }, classMap, spellMap) {
  for (const row of rows) {
    const classId = requireMapped(classMap, asIntOrNull(row.class_id), 'CLASS_ID', filePath);
    const spellId = requireMapped(spellMap, asIntOrNull(row.spell_id), 'SPELL_ID', filePath);
    const level = asIntOrNull(row.level);
    if (level == null) throw new Error(`${filePath}: missing LEVEL`);
    await client.query(
      `INSERT INTO public.spell_class (class_id, spell_id, level, modified)
       VALUES ($1, $2, $3, $4)`,
      [classId, spellId, level, asTimestampOrNow(row.modified)]
    );
  }
}

async function main() {
  const { dir, dryRun } = parseArgs(process.argv);

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(1);
  }

  const meta = loadGamesystem(dir);
  if (meta.description) {
    console.log(`Note: gamesystem description is present but not stored (no ruleset.description column yet).`);
  }

  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.json')) continue;
    if (SKIP_FILES.has(name.toLowerCase())) continue;
    const known = [
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
    const base = path.basename(name, path.extname(name)).toUpperCase();
    if (!known.includes(base)) {
      console.warn(`Ignoring unrecognized file: ${name}`);
    }
  }

    const abilityCategories = loadTableJson(dir, 'ABILITY_CATEGORIES');
    const stats = loadTableJson(dir, 'STATS');
    const itemCategories = loadTableJson(dir, 'ITEM_CATEGORIES');
  const itemTypes = loadTableJson(dir, 'ITEM_TYPES');
  const classes = loadTableJson(dir, 'CLASSES');
  const races = loadTableJson(dir, 'RACES');
  const spells = loadTableJson(dir, 'SPELLS');
  const abilities = loadTableJson(dir, 'ABILITIES');
  const items = loadTableJson(dir, 'ITEMS');
  const classAbilities = loadTableJson(dir, 'CLASS_ABILITIES');
  const classLeveling = loadTableJson(dir, 'CLASS_LEVELING');
  const classSpells = loadTableJson(dir, 'CLASS_SPELLS');
  const raceAbilities = loadTableJson(dir, 'RACE_ABILITIES');
  const spellClass = loadTableJson(dir, 'SPELL_CLASS');

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'rpghub',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rulesetId = await ensureRuleset(client, meta.name);
    console.log(`Ruleset ${JSON.stringify(meta.name)} → id ${rulesetId}`);

    await assertReplaceAllowed(client, rulesetId);
    await deleteRulesetCatalog(client, rulesetId);
    console.log(`Cleared existing catalog for ruleset_id=${rulesetId}`);

    const categoryMap = await importSharedLookup(client, abilityCategories, 'ability_categories');
    const statMap = await importStats(client, stats, categoryMap);
    const itemCategoryMap = await importSharedLookup(client, itemCategories, 'item_categories');
    const itemTypeMap = await importSharedLookup(client, itemTypes, 'item_types');
    console.log(
      `Shared lookups: ability_categories=${categoryMap.size}, stat=${statMap.size}, item_categories=${itemCategoryMap.size}, item_types=${itemTypeMap.size}`
    );

    const classMap = await importClasses(client, classes, rulesetId);
    const raceMap = await importRaces(client, races, rulesetId);
    const spellMap = await importSpells(client, spells, rulesetId);
    const abilityMap = await importAbilities(client, abilities, rulesetId, statMap);
    const itemMap = await importItems(client, items, rulesetId, itemCategoryMap, itemTypeMap);
    console.log(
      `Catalog: classes=${classMap.size}, races=${raceMap.size}, spells=${spellMap.size}, abilities=${abilityMap.size}, items=${itemMap.size}`
    );

    await importClassAbilities(client, classAbilities, rulesetId, classMap, abilityMap);
    await importClassLeveling(client, classLeveling, rulesetId, classMap);
    await importClassSpells(client, classSpells, rulesetId, classMap);
    await importRaceAbilities(client, raceAbilities, rulesetId, raceMap, abilityMap);
    await importSpellClass(client, spellClass, classMap, spellMap);
    console.log(
      `Junctions: class_abilities=${classAbilities.rows.length}, class_leveling=${classLeveling.rows.length}, class_spells=${classSpells.rows.length}, race_abilities=${raceAbilities.rows.length}, spell_class=${spellClass.rows.length}`
    );

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('Dry run OK — transaction rolled back.');
    } else {
      await client.query('COMMIT');
      console.log('Replace import committed.');
    }
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
