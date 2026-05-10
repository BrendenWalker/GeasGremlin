/**
 * Export catalog rows for a ruleset to idempotent PostgreSQL upsert SQL.
 * Loads ../.env (repo root) then backend/.env — same as server.js.
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

const DEFAULT_RULESET_NAME = 'Basic Fantasy Enhanced';

function parseArgs(argv) {
  let rulesetName = DEFAULT_RULESET_NAME;
  let outputPath = null;
  /** @type {number | null} explicit source ruleset_id for catalog queries */
  let fromRulesetId = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ruleset-name' && argv[i + 1]) {
      rulesetName = argv[++i];
    } else if (a === '--output' && argv[i + 1]) {
      outputPath = argv[++i];
    } else if (a === '--from-ruleset-id' && argv[i + 1]) {
      const n = parseInt(argv[++i], 10);
      if (!Number.isInteger(n) || n < 1) {
        console.error('--from-ruleset-id must be a positive integer');
        process.exit(1);
      }
      fromRulesetId = n;
    } else if (a === '--help' || a === '-h') {
      console.log(`
Usage: node export-ruleset.js [options]

  --ruleset-name <name>   Target ruleset name in the OUTPUT SQL (default: "${DEFAULT_RULESET_NAME}")
  --from-ruleset-id <id>   Read catalog rows with this ruleset_id from the DB (optional).
                           If omitted: use a row named --ruleset-name, else "Default", else 1.
  --output <path>         SQL file to write (default: database/rulesets/<slug>.sql under repo root)

Reads DB_* from repo-root .env (see env.example).

When no ruleset row matches --ruleset-name, catalog is still exported from the resolved source id;
the generated file inserts the target ruleset name and binds all rows to it via ruleset_id.
`);
      process.exit(0);
    }
  }
  if (!outputPath) {
    const slug = rulesetName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'ruleset';
    outputPath = path.join(repoRoot, 'database', 'rulesets', `${slug}.sql`);
  } else if (!path.isAbsolute(outputPath)) {
    outputPath = path.join(repoRoot, outputPath);
  }
  return { rulesetName, outputPath, fromRulesetId };
}

/**
 * Decide which ruleset_id in the DB to SELECT catalog rows from.
 * Output SQL binds catalog rows to --ruleset-name via ruleset_id subquery.
 */
async function resolveSourceRulesetId(pool, targetRulesetName, fromRulesetIdOpt) {
  const targetRs = await pool.query(
    'SELECT id, name, modified FROM public.ruleset WHERE name = $1',
    [targetRulesetName]
  );
  const targetRow = targetRs.rows[0] || null;

  let sourceId;
  let sourceLabel;

  if (fromRulesetIdOpt != null) {
    sourceId = fromRulesetIdOpt;
    sourceLabel =
      targetRow && targetRow.id !== fromRulesetIdOpt
        ? `explicit --from-ruleset-id=${fromRulesetIdOpt} (target ${JSON.stringify(
            targetRulesetName
          )} exists as id ${targetRow.id} but catalog read from ${fromRulesetIdOpt})`
        : `explicit --from-ruleset-id=${fromRulesetIdOpt}`;
  } else if (targetRow) {
    sourceId = targetRow.id;
    sourceLabel = `ruleset named ${JSON.stringify(targetRulesetName)}`;
  } else {
    const defaultRs = await pool.query(`SELECT id FROM public.ruleset WHERE name = 'Default'`);
    if (defaultRs.rows.length > 0) {
      sourceId = defaultRs.rows[0].id;
      sourceLabel = `'Default' ruleset (no row named ${JSON.stringify(targetRulesetName)})`;
    } else {
      sourceId = 1;
      sourceLabel = `fallback ruleset_id = 1 (no "${targetRulesetName}" or "Default" in public.ruleset)`;
    }
  }

  return { sourceId, sourceLabel, targetRow };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }
  if (value instanceof Date) {
    const iso = value.toISOString().replace('T', ' ').replace('Z', '+00');
    return `'${iso.replace(/'/g, "''")}'::timestamp`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function rulesetIdExpr(rulesetName) {
  return `(SELECT id FROM public.ruleset WHERE name = ${sqlLiteral(rulesetName)} LIMIT 1)`;
}

/** @param {string} rulesetName */
function buildUpsert({ rulesetName, rows, table, columns, conflictClause, updateCols, rulesetIdColumn }) {
  const lines = [];
  const rsExpr = rulesetIdExpr(rulesetName);
  for (const row of rows) {
    const parts = columns.map((col) => {
      if (col === rulesetIdColumn) return rsExpr;
      const key = col.replace(/"/g, '');
      const v = row[key] !== undefined ? row[key] : row[col];
      return sqlLiteral(v);
    });
    const colList = columns.join(', ');
    const insertSql = `INSERT INTO public.${table} (${colList}) VALUES (${parts.join(', ')})`;
    lines.push(`${insertSql}\n${conflictClause}\n${updateCols};`);
  }
  return lines.join('\n\n');
}

async function main() {
  const { rulesetName, outputPath, fromRulesetId } = parseArgs(process.argv);

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'rpghub',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    const resolved = await resolveSourceRulesetId(pool, rulesetName, fromRulesetId);
    const rulesetId = resolved.sourceId;

    if (!resolved.targetRow && fromRulesetId == null) {
      console.warn(
        `Note: ${JSON.stringify(
          rulesetName
        )} not in public.ruleset — exporting catalog WHERE ruleset_id = ${rulesetId} (${resolved.sourceLabel}).`
      );
    } else {
      console.log(`Exporting catalog for ruleset_id = ${rulesetId} (${resolved.sourceLabel})`);
    }

    const sections = [];

    const header = `-- RPGHub ruleset catalog snapshot (idempotent upserts)
-- Target ruleset name in output: ${rulesetName}
-- Source catalog in DB: ruleset_id = ${rulesetId} (${resolved.sourceLabel})
-- Generated by backend/scripts/export-ruleset.js — re-run to refresh after editing source DB.
BEGIN;

`;
    sections.push(header);

    if (resolved.targetRow) {
      const r = resolved.targetRow;
      sections.push(`-- ruleset
INSERT INTO public.ruleset (id, name, modified) VALUES (${sqlLiteral(r.id)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.modified)})
ON CONFLICT (name) DO UPDATE SET modified = EXCLUDED.modified;`);
    } else {
      sections.push(`-- Create target ruleset; catalog rows below bind ruleset_id to this name
INSERT INTO public.ruleset (name, modified) VALUES (${sqlLiteral(rulesetName)}, NOW())
ON CONFLICT (name) DO UPDATE SET modified = EXCLUDED.modified;`);
    }

    const acRows = await pool.query(
      `SELECT DISTINCT ac.id, ac.name, ac.modified
       FROM public.ability_categories ac
       INNER JOIN public.abilities a ON a.category = ac.id
       WHERE a.ruleset_id = $1 AND a.category IS NOT NULL`,
      [rulesetId]
    );
    acRows.rows.sort((a, b) => a.id - b.id);
    for (const r of acRows.rows) {
      sections.push(`INSERT INTO public.ability_categories (id, name, modified) VALUES (${sqlLiteral(r.id)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.modified)})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, modified = EXCLUDED.modified;`);
    }

    const icRows = await pool.query(
      `SELECT DISTINCT ic.id, ic.name, ic.modified
       FROM public.item_categories ic
       INNER JOIN public.items i ON i.category = ic.id
       WHERE i.ruleset_id = $1 AND i.category IS NOT NULL`,
      [rulesetId]
    );
    icRows.rows.sort((a, b) => a.id - b.id);
    for (const r of icRows.rows) {
      sections.push(`INSERT INTO public.item_categories (id, name, modified) VALUES (${sqlLiteral(r.id)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.modified)})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, modified = EXCLUDED.modified;`);
    }

    const itRows = await pool.query(
      `SELECT DISTINCT it.id, it.name, it.modified
       FROM public.item_types it
       INNER JOIN public.items i ON i.type = it.id
       WHERE i.ruleset_id = $1 AND i.type IS NOT NULL`,
      [rulesetId]
    );
    itRows.rows.sort((a, b) => a.id - b.id);
    for (const r of itRows.rows) {
      sections.push(`INSERT INTO public.item_types (id, name, modified) VALUES (${sqlLiteral(r.id)}, ${sqlLiteral(r.name)}, ${sqlLiteral(r.modified)})
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, modified = EXCLUDED.modified;`);
    }

    const classesCols = [
      'id',
      'name',
      'hitdie',
      'min_str',
      'min_int',
      'min_wis',
      'min_dex',
      'min_con',
      'min_chr',
      'xpadjustment',
      'armor',
      'weapons',
      'description',
      'modified',
      'ruleset_id',
      'subclass_of',
    ];
    const classesResult = await pool.query(
      `SELECT ${classesCols.join(', ')} FROM public.classes WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    sections.push(
      '-- classes (conflict on id so FKs from junction tables stay valid)\n' +
        buildUpsert({
          rulesetName,
          rows: classesResult.rows,
          table: 'classes',
          columns: classesCols,
          conflictClause: 'ON CONFLICT (id) DO UPDATE SET',
          updateCols: `  name = EXCLUDED.name,
  hitdie = EXCLUDED.hitdie,
  min_str = EXCLUDED.min_str,
  min_int = EXCLUDED.min_int,
  min_wis = EXCLUDED.min_wis,
  min_dex = EXCLUDED.min_dex,
  min_con = EXCLUDED.min_con,
  min_chr = EXCLUDED.min_chr,
  xpadjustment = EXCLUDED.xpadjustment,
  armor = EXCLUDED.armor,
  weapons = EXCLUDED.weapons,
  description = EXCLUDED.description,
  modified = EXCLUDED.modified,
  ruleset_id = EXCLUDED.ruleset_id`,
          rulesetIdColumn: 'ruleset_id',
        })
    );

    const racesCols = [
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
      'xpadjustment',
      'armor',
      'weapons',
      'description',
      'rangedbonus',
      'max_hd',
      'modified',
      'hd_mod',
      'ruleset_id',
    ];
    const racesResult = await pool.query(
      `SELECT ${racesCols.join(', ')} FROM public.races WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    sections.push(
      '-- races\n' +
        buildUpsert({
          rulesetName,
          rows: racesResult.rows,
          table: 'races',
          columns: racesCols,
          conflictClause: 'ON CONFLICT (id) DO UPDATE SET',
          updateCols: `  name = EXCLUDED.name,
  avgweight = EXCLUDED.avgweight,
  avgheight = EXCLUDED.avgheight,
  min_str = EXCLUDED.min_str,
  min_int = EXCLUDED.min_int,
  min_wis = EXCLUDED.min_wis,
  min_dex = EXCLUDED.min_dex,
  min_con = EXCLUDED.min_con,
  min_chr = EXCLUDED.min_chr,
  max_str = EXCLUDED.max_str,
  max_int = EXCLUDED.max_int,
  max_wis = EXCLUDED.max_wis,
  max_dex = EXCLUDED.max_dex,
  max_con = EXCLUDED.max_con,
  max_chr = EXCLUDED.max_chr,
  xpadjustment = EXCLUDED.xpadjustment,
  armor = EXCLUDED.armor,
  weapons = EXCLUDED.weapons,
  description = EXCLUDED.description,
  rangedbonus = EXCLUDED.rangedbonus,
  max_hd = EXCLUDED.max_hd,
  modified = EXCLUDED.modified,
  hd_mod = EXCLUDED.hd_mod,
  ruleset_id = EXCLUDED.ruleset_id`,
          rulesetIdColumn: 'ruleset_id',
        })
    );

    const spellsCols = ['id', 'name', '"range"', 'duration', 'description', 'modified', 'ruleset_id'];
    const spellsResult = await pool.query(
      `SELECT id, name, "range", duration, description, modified, ruleset_id FROM public.spells WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    sections.push(
      '-- spells\n' +
        buildUpsert({
          rulesetName,
          rows: spellsResult.rows,
          table: 'spells',
          columns: spellsCols,
          conflictClause: 'ON CONFLICT (id) DO UPDATE SET',
          updateCols: `  name = EXCLUDED.name,
  "range" = EXCLUDED."range",
  duration = EXCLUDED.duration,
  description = EXCLUDED.description,
  modified = EXCLUDED.modified,
  ruleset_id = EXCLUDED.ruleset_id`,
          rulesetIdColumn: 'ruleset_id',
        })
    );

    const abilitiesCols = ['id', 'description', 'modified', 'category', 'ruleset_id'];
    const abilitiesResult = await pool.query(
      `SELECT ${abilitiesCols.join(', ')} FROM public.abilities WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    sections.push(
      '-- abilities\n' +
        buildUpsert({
          rulesetName,
          rows: abilitiesResult.rows,
          table: 'abilities',
          columns: abilitiesCols,
          conflictClause: 'ON CONFLICT (id) DO UPDATE SET',
          updateCols: `  description = EXCLUDED.description,
  modified = EXCLUDED.modified,
  category = EXCLUDED.category,
  ruleset_id = EXCLUDED.ruleset_id`,
          rulesetIdColumn: 'ruleset_id',
        })
    );

    const itemsCols = [
      'id',
      'category',
      'type',
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
    ];
    const itemsResult = await pool.query(
      `SELECT id, category, "type" AS type, name, price, size, weight, attackbonus, damagebonus, defensebonus, damage,
              range_short, range_medium, range_long, rof, ac, ac_melee, ac_ranged, notes, modified, effect, value,
              duration, charges, perday, ruleset_id
       FROM public.items WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    sections.push(
      '-- items\n' +
        buildUpsert({
          rulesetName,
          rows: itemsResult.rows,
          table: 'items',
          columns: itemsCols.map((c) => (c === 'type' ? '"type"' : c)),
          conflictClause: 'ON CONFLICT (id) DO UPDATE SET',
          updateCols: `  category = EXCLUDED.category,
  "type" = EXCLUDED."type",
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  size = EXCLUDED.size,
  weight = EXCLUDED.weight,
  attackbonus = EXCLUDED.attackbonus,
  damagebonus = EXCLUDED.damagebonus,
  defensebonus = EXCLUDED.defensebonus,
  damage = EXCLUDED.damage,
  range_short = EXCLUDED.range_short,
  range_medium = EXCLUDED.range_medium,
  range_long = EXCLUDED.range_long,
  rof = EXCLUDED.rof,
  ac = EXCLUDED.ac,
  ac_melee = EXCLUDED.ac_melee,
  ac_ranged = EXCLUDED.ac_ranged,
  notes = EXCLUDED.notes,
  modified = EXCLUDED.modified,
  effect = EXCLUDED.effect,
  value = EXCLUDED.value,
  duration = EXCLUDED.duration,
  charges = EXCLUDED.charges,
  perday = EXCLUDED.perday,
  ruleset_id = EXCLUDED.ruleset_id`,
          rulesetIdColumn: 'ruleset_id',
        })
    );

    const caCols = ['class_id', 'ability_id', 'level', 'int_param', 'str_param', 'modified', 'ruleset_id'];
    const caResult = await pool.query(
      `SELECT ${caCols.join(', ')} FROM public.class_abilities WHERE ruleset_id = $1 ORDER BY class_id, ability_id, level`,
      [rulesetId]
    );
    sections.push(
      '-- class_abilities\n' +
        buildUpsert({
          rulesetName,
          rows: caResult.rows,
          table: 'class_abilities',
          columns: caCols,
          conflictClause: 'ON CONFLICT (class_id, ability_id, level) DO UPDATE SET',
          updateCols: `  int_param = EXCLUDED.int_param,
  str_param = EXCLUDED.str_param,
  modified = EXCLUDED.modified,
  ruleset_id = EXCLUDED.ruleset_id`,
          rulesetIdColumn: 'ruleset_id',
        })
    );

    const clCols = ['class_id', 'level', 'xp', 'hd', 'hp', 'ab', 'modified', 'ruleset_id'];
    const clResult = await pool.query(
      `SELECT ${clCols.join(', ')} FROM public.class_leveling WHERE ruleset_id = $1 ORDER BY class_id, level`,
      [rulesetId]
    );
    sections.push(
      '-- class_leveling\n' +
        buildUpsert({
          rulesetName,
          rows: clResult.rows,
          table: 'class_leveling',
          columns: clCols,
          conflictClause: 'ON CONFLICT (class_id, level) DO UPDATE SET',
          updateCols: `  xp = EXCLUDED.xp,
  hd = EXCLUDED.hd,
  hp = EXCLUDED.hp,
  ab = EXCLUDED.ab,
  modified = EXCLUDED.modified,
  ruleset_id = EXCLUDED.ruleset_id`,
          rulesetIdColumn: 'ruleset_id',
        })
    );

    const csCols = [
      'class_id',
      'char_level',
      'level1',
      'level2',
      'level3',
      'level4',
      'level5',
      'level6',
      'level7',
      'modified',
      'ruleset_id',
    ];
    const csResult = await pool.query(
      `SELECT ${csCols.join(', ')} FROM public.class_spells WHERE ruleset_id = $1 ORDER BY class_id, char_level`,
      [rulesetId]
    );
    sections.push(
      '-- class_spells\n' +
        buildUpsert({
          rulesetName,
          rows: csResult.rows,
          table: 'class_spells',
          columns: csCols,
          conflictClause: 'ON CONFLICT (class_id, char_level) DO UPDATE SET',
          updateCols: `  level1 = EXCLUDED.level1,
  level2 = EXCLUDED.level2,
  level3 = EXCLUDED.level3,
  level4 = EXCLUDED.level4,
  level5 = EXCLUDED.level5,
  level6 = EXCLUDED.level6,
  level7 = EXCLUDED.level7,
  modified = EXCLUDED.modified,
  ruleset_id = EXCLUDED.ruleset_id`,
          rulesetIdColumn: 'ruleset_id',
        })
    );

    const raCols = ['race_id', 'ability_id', 'int_param', 'str_param', 'modified', 'ruleset_id'];
    const raResult = await pool.query(
      `SELECT ${raCols.join(', ')} FROM public.race_abilities WHERE ruleset_id = $1 ORDER BY race_id, ability_id`,
      [rulesetId]
    );
    sections.push(
      '-- race_abilities\n' +
        buildUpsert({
          rulesetName,
          rows: raResult.rows,
          table: 'race_abilities',
          columns: raCols,
          conflictClause: 'ON CONFLICT (race_id, ability_id) DO UPDATE SET',
          updateCols: `  int_param = EXCLUDED.int_param,
  str_param = EXCLUDED.str_param,
  modified = EXCLUDED.modified,
  ruleset_id = EXCLUDED.ruleset_id`,
          rulesetIdColumn: 'ruleset_id',
        })
    );

    const scResult = await pool.query(
      `SELECT sc.class_id, sc.spell_id, sc.level, sc.modified
       FROM public.spell_class sc
       WHERE sc.class_id IN (SELECT id FROM public.classes WHERE ruleset_id = $1)
         AND sc.spell_id IN (SELECT id FROM public.spells WHERE ruleset_id = $1)
       ORDER BY sc.class_id, sc.spell_id`,
      [rulesetId]
    );
    const scCols = ['class_id', 'spell_id', 'level', 'modified'];
    sections.push(
      '-- spell_class\n' +
        scResult.rows
          .map((r) => {
            const parts = scCols.map((col) => sqlLiteral(r[col]));
            return `INSERT INTO public.spell_class (${scCols.join(', ')}) VALUES (${parts.join(', ')})
ON CONFLICT (class_id, spell_id) DO UPDATE SET
  level = EXCLUDED.level,
  modified = EXCLUDED.modified;`;
          })
          .join('\n\n')
    );

    sections.push('\nCOMMIT;\n');

    const out = sections.join('\n');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, out, 'utf8');
    console.log(`Wrote ${outputPath} (${Buffer.byteLength(out, 'utf8')} bytes)`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
