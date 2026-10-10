/**
 * Export catalog rows for a ruleset as GameSystems JSON (import-ruleset.js compatible).
 * Writes gamesystem.json plus one *.json file per catalog table.
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
  let outputDir = null;
  /** @type {number | null} explicit source ruleset_id for catalog queries */
  let fromRulesetId = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ruleset-name' && argv[i + 1]) {
      rulesetName = argv[++i];
    } else if (a === '--output' && argv[i + 1]) {
      outputDir = argv[++i];
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

  --ruleset-name <name>   Name written to gamesystem.json (default: "${DEFAULT_RULESET_NAME}")
  --from-ruleset-id <id>   Read catalog rows with this ruleset_id from the DB (optional).
                           If omitted: use a row named --ruleset-name, else "Default", else 1.
  --output <dir>          Directory to write JSON files (default: GameSystems/<slug>/ under repo root)

Reads DB_* from repo-root .env (see env.example).

Output is compatible with: npm run import-ruleset -- --dir <dir>
Does not delete PENDING_CHANGES.json if present. Omits ruleset_id (import binds via gamesystem name).
`);
      process.exit(0);
    }
  }
  if (!outputDir) {
    const slug = rulesetName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'ruleset';
    outputDir = path.join(repoRoot, 'GameSystems', slug);
  } else if (!path.isAbsolute(outputDir)) {
    outputDir = path.join(repoRoot, outputDir);
  }
  return { rulesetName, outputDir, fromRulesetId };
}

/**
 * Decide which ruleset_id in the DB to SELECT catalog rows from.
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

/** Format timestamps like existing Firebird-style dumps for readable diffs. */
function formatTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  const ms = d.getUTCMilliseconds();
  if (ms === 0) return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${pad(ms, 3)}`;
}

function jsonValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return formatTimestamp(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const formatted = formatTimestamp(value);
    if (formatted != null) return formatted;
  }
  return value;
}

/**
 * Map a DB row to export keys. `fields` is [{ db, json }, ...] or string (same name).
 */
function mapRow(row, fields) {
  const out = {};
  for (const f of fields) {
    const dbKey = typeof f === 'string' ? f : f.db;
    const jsonKey = typeof f === 'string' ? f.toUpperCase() : f.json;
    out[jsonKey] = jsonValue(row[dbKey]);
  }
  return out;
}

function writeTableJson(outputDir, tableName, rows) {
  const filePath = path.join(outputDir, `${tableName}.json`);
  const payload = { [tableName]: rows };
  // Match existing GameSystems dumps: pretty-print with tabs, space before colon.
  const body = JSON.stringify(payload, null, '\t').replace(/": /g, '" : ');
  fs.writeFileSync(filePath, body + '\n', 'utf8');
  return { filePath, count: rows.length };
}

async function main() {
  const { rulesetName, outputDir, fromRulesetId } = parseArgs(process.argv);

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

    fs.mkdirSync(outputDir, { recursive: true });

    const gamesystem = {
      name: rulesetName,
      description: `Exported from database ruleset_id=${rulesetId} (${resolved.sourceLabel}).`,
    };
    fs.writeFileSync(
      path.join(outputDir, 'gamesystem.json'),
      JSON.stringify(gamesystem, null, 2) + '\n',
      'utf8'
    );

    const written = [];

    // Shared lookups are global (matched by name on import). Export all rows present
    // so unused categories/types still round-trip on a fresh single-ruleset DB.
    const acRows = await pool.query(
      `SELECT id, name, modified FROM public.ability_categories ORDER BY id`
    );
    written.push(
      writeTableJson(
        outputDir,
        'ABILITY_CATEGORIES',
        acRows.rows.map((r) => mapRow(r, ['id', 'name', 'modified']))
      )
    );

    const statRows = await pool.query(
      `SELECT id, name, category, modified FROM public.stat ORDER BY id`
    );
    written.push(
      writeTableJson(
        outputDir,
        'STATS',
        statRows.rows.map((r) => mapRow(r, ['id', 'name', 'category', 'modified']))
      )
    );

    const icRows = await pool.query(
      `SELECT id, name, modified FROM public.item_categories ORDER BY id`
    );
    written.push(
      writeTableJson(
        outputDir,
        'ITEM_CATEGORIES',
        icRows.rows.map((r) => mapRow(r, ['id', 'name', 'modified']))
      )
    );

    const itRows = await pool.query(
      `SELECT id, name, modified FROM public.item_types ORDER BY id`
    );
    written.push(
      writeTableJson(
        outputDir,
        'ITEM_TYPES',
        itRows.rows.map((r) => mapRow(r, ['id', 'name', 'modified']))
      )
    );

    const classesFields = [
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
    ];
    const classesResult = await pool.query(
      `SELECT id, name, min_str, min_int, min_wis, min_dex, min_con, min_chr,
              armor, weapons, is_quasi, description, modified
       FROM public.classes WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'CLASSES',
        classesResult.rows.map((r) => mapRow(r, classesFields))
      )
    );

    const racesFields = [
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
    ];
    const racesResult = await pool.query(
      `SELECT id, name, avgweight, avgheight, min_str, min_int, min_wis, min_dex, min_con, min_chr,
              max_str, max_int, max_wis, max_dex, max_con, max_chr, armor, weapons,
              description, max_hd, modified, hd_mod
       FROM public.races WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'RACES',
        racesResult.rows.map((r) => mapRow(r, racesFields))
      )
    );

    const spellsFields = [
      'id',
      { db: 'name', json: 'Name' },
      { db: 'range', json: 'Range' },
      { db: 'duration', json: 'Duration' },
      { db: 'description', json: 'Description' },
      'modified',
    ];
    const spellsResult = await pool.query(
      `SELECT id, name, "range", duration, description, modified
       FROM public.spells WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'SPELLS',
        spellsResult.rows.map((r) => mapRow(r, spellsFields))
      )
    );

    const abilitiesResult = await pool.query(
      `SELECT id, description, modified, stat_id, stat_modifier
       FROM public.abilities WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'ABILITIES',
        abilitiesResult.rows.map((r) => mapRow(r, ['id', 'description', 'modified', 'stat_id', 'stat_modifier']))
      )
    );

    const itemsFields = [
      'id',
      { db: 'category', json: 'Category' },
      { db: 'type', json: 'Type' },
      { db: 'name', json: 'Name' },
      { db: 'price', json: 'Price' },
      { db: 'size', json: 'Size' },
      { db: 'weight', json: 'Weight' },
      { db: 'attackbonus', json: 'AttackBonus' },
      { db: 'damagebonus', json: 'DamageBonus' },
      { db: 'defensebonus', json: 'DefenseBonus' },
      { db: 'damage', json: 'Damage' },
      { db: 'range_short', json: 'Range_Short' },
      { db: 'range_medium', json: 'Range_Medium' },
      { db: 'range_long', json: 'Range_Long' },
      { db: 'rof', json: 'ROF' },
      { db: 'ac', json: 'AC' },
      { db: 'ac_melee', json: 'AC_Melee' },
      { db: 'ac_ranged', json: 'AC_Ranged' },
      { db: 'notes', json: 'NOTES' },
      'modified',
      { db: 'effect', json: 'EFFECT' },
      { db: 'value', json: 'VALUE' },
      { db: 'duration', json: 'DURATION' },
      { db: 'charges', json: 'CHARGES' },
      { db: 'perday', json: 'PERDAY' },
    ];
    const itemsResult = await pool.query(
      `SELECT id, category, "type" AS type, name, price, size, weight, attackbonus, damagebonus,
              defensebonus, damage, range_short, range_medium, range_long, rof, ac, ac_melee,
              ac_ranged, notes, modified, effect, value, duration, charges, perday
       FROM public.items WHERE ruleset_id = $1 ORDER BY id`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'ITEMS',
        itemsResult.rows.map((r) => mapRow(r, itemsFields))
      )
    );

    const caResult = await pool.query(
      `SELECT class_id, ability_id, level, int_param, str_param, modified
       FROM public.class_abilities WHERE ruleset_id = $1
       ORDER BY class_id, ability_id, level`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'CLASS_ABILITIES',
        caResult.rows.map((r) =>
          mapRow(r, ['class_id', 'ability_id', 'level', 'int_param', 'str_param', 'modified'])
        )
      )
    );

    const clResult = await pool.query(
      `SELECT class_id, level, xp, hd, hp, ab, modified
       FROM public.class_leveling WHERE ruleset_id = $1
       ORDER BY class_id, level`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'CLASS_LEVELING',
        clResult.rows.map((r) =>
          mapRow(r, ['class_id', 'level', 'xp', 'hd', 'hp', 'ab', 'modified'])
        )
      )
    );

    const csResult = await pool.query(
      `SELECT class_id, char_level, level1, level2, level3, level4, level5, level6, level7, modified
       FROM public.class_spells WHERE ruleset_id = $1
       ORDER BY class_id, char_level`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'CLASS_SPELLS',
        csResult.rows.map((r) =>
          mapRow(r, [
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
          ])
        )
      )
    );

    const raResult = await pool.query(
      `SELECT race_id, ability_id, int_param, str_param, modified
       FROM public.race_abilities WHERE ruleset_id = $1
       ORDER BY race_id, ability_id`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'RACE_ABILITIES',
        raResult.rows.map((r) =>
          mapRow(r, ['race_id', 'ability_id', 'int_param', 'str_param', 'modified'])
        )
      )
    );

    const scResult = await pool.query(
      `SELECT sc.class_id, sc.spell_id, sc.level, sc.modified
       FROM public.spell_class sc
       WHERE sc.class_id IN (SELECT id FROM public.classes WHERE ruleset_id = $1)
         AND sc.spell_id IN (SELECT id FROM public.spells WHERE ruleset_id = $1)
       ORDER BY sc.class_id, sc.spell_id`,
      [rulesetId]
    );
    written.push(
      writeTableJson(
        outputDir,
        'SPELL_CLASS',
        scResult.rows.map((r) => mapRow(r, ['class_id', 'spell_id', 'level', 'modified']))
      )
    );

    console.log(`Wrote ${outputDir}`);
    for (const w of written) {
      console.log(`  ${path.basename(w.filePath)}: ${w.count} row(s)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
