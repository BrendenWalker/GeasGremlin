/**
 * Replace one ruleset's play catalog: monsters, treasure types, stock encounter tables.
 * Does not delete classes, spells, abilities, or items, and does not look at characters.
 *
 * A missing JSON file leaves that table alone. A present file replaces the ruleset's rows.
 * Aborts when a campaign enemy, a campaign location, or a custom encounter row still
 * points at a monster being replaced. Stock encounter rows block a monster-only replace;
 * import the encounter tables in the same run to replace them together.
 *
 * Loads repo-root .env then backend/.env — same as import-ruleset.js.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { asInt, loadCatalog, referenceBlockMessage, validateCatalog } = require('./catalogImport');

const repoRoot = path.join(__dirname, '..', '..');
const repoEnv = path.join(repoRoot, '.env');
if (fs.existsSync(repoEnv)) {
  require('dotenv').config({ path: repoEnv });
}
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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
Usage: node import-catalog.js --dir <GameSystems/Folder> [--dry-run]

  --dir <path>   Folder with gamesystem.json. Catalog files are optional.
  --dry-run      Run the import inside a transaction, then ROLLBACK

Reads DB_* from repo-root .env (see env.example).

Replaces only monster, treasure_type, and stock encounter_table rows for the
ruleset named in gamesystem.json. Does not create the ruleset, and does not
delete classes, spells, or items. Does not use the character-count abort.

MONSTERS.json, TREASURE_TYPES.json, ENCOUNTER_TABLES.json, and
ENCOUNTER_TABLE_ROWS.json are each optional. A missing file leaves that table
alone. A present file, including an empty array, replaces that ruleset's rows.
Encounter rows require the tables file in the same run.

Aborts if a campaign enemy, a campaign location, or a custom encounter row
still points at a monster this run would delete.
`);
      process.exit(0);
    }
  }
  if (!dir) {
    console.error('Missing required --dir <path>');
    process.exit(1);
  }
  return { dir: path.resolve(dir), dryRun };
}

function loadGamesystem(dir) {
  const filePath = path.join(dir, 'gamesystem.json');
  if (!fs.existsSync(filePath)) throw new Error(`Missing gamesystem.json in ${dir}`);
  const meta = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!meta.name || typeof meta.name !== 'string' || !meta.name.trim()) {
    throw new Error(`${filePath}: "name" is required`);
  }
  if (meta.name.length > 40) throw new Error(`${filePath}: "name" exceeds ruleset.name varchar(40)`);
  return { name: meta.name.trim() };
}

async function nextId(client, table) {
  const res = await client.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM public.${table}`);
  const maxId = Number(res.rows[0].max_id);
  return maxId >= 0 ? maxId + 1 : 1;
}

async function allocDestId(client, table, sourceId, reserved) {
  if (sourceId != null && !reserved.has(sourceId)) {
    const free = await client.query(`SELECT 1 FROM public.${table} WHERE id = $1`, [sourceId]);
    if (free.rows.length === 0) {
      reserved.add(sourceId);
      return sourceId;
    }
  }
  let id = await nextId(client, table);
  while (reserved.has(id)) id += 1;
  reserved.add(id);
  return id;
}

async function syncSerial(client, table) {
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('public.${table}', 'id'),
       GREATEST(COALESCE((SELECT MAX(id) FROM public.${table}), 1), 1)
     )`
  );
}

async function rulesetIdFor(client, name) {
  const existing = await client.query('SELECT id FROM public.ruleset WHERE name = $1', [name]);
  if (existing.rows.length === 0) {
    throw new Error(
      `No ruleset named ${JSON.stringify(name)}. Create it with import-ruleset first. This import does not.`
    );
  }
  return existing.rows[0].id;
}

async function columnExists(client, table, column) {
  const found = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return found.rows.length > 0;
}

async function monsterReplaceBlock(client, rulesetId) {
  const enemies = await client.query(
    `SELECT e.id, e.name, m.id AS monster_id, m.name AS monster_name
     FROM campaign_enemy e
     JOIN monster m ON m.id = e.monster_id
     WHERE m.ruleset_id = $1
     ORDER BY e.id
     LIMIT 10`,
    [rulesetId]
  );
  const enemyMessage = referenceBlockMessage(
    rulesetId,
    'a campaign enemy',
    enemies.rows.map((row) => `enemy ${row.id} (${row.name}) → monster ${row.monster_id} (${row.monster_name})`)
  );
  if (enemyMessage) return enemyMessage;

  if (await columnExists(client, 'campaign_location', 'monster_id')) {
    const locs = await client.query(
      `SELECT l.monster_id, m.name AS monster_name
       FROM campaign_location l
       JOIN monster m ON m.id = l.monster_id
       WHERE m.ruleset_id = $1
       ORDER BY l.monster_id
       LIMIT 10`,
      [rulesetId]
    );
    const message = referenceBlockMessage(
      rulesetId,
      'a campaign location',
      locs.rows.map((row) => `monster ${row.monster_id} (${row.monster_name})`)
    );
    if (message) return message;
  }

  if (await columnExists(client, 'campaign_location', 'encounter_table_id')) {
    const through = await client.query(
      `SELECT m.id AS monster_id, m.name AS monster_name
       FROM campaign_location l
       JOIN encounter_table_row r ON r.encounter_table_id = l.encounter_table_id
       JOIN monster m ON m.id = r.monster_id
       WHERE m.ruleset_id = $1
       ORDER BY m.id
       LIMIT 10`,
      [rulesetId]
    );
    const message = referenceBlockMessage(
      rulesetId,
      'a campaign location',
      through.rows.map((row) => `monster ${row.monster_id} (${row.monster_name})`)
    );
    if (message) return message;
  }

  const custom = await client.query(
    `SELECT t.name AS table_name, m.id AS monster_id, m.name AS monster_name
     FROM encounter_table_row r
     JOIN encounter_table t ON t.id = r.encounter_table_id
     JOIN monster m ON m.id = r.monster_id
     WHERE m.ruleset_id = $1 AND t.campaign_id IS NOT NULL
     ORDER BY r.id
     LIMIT 10`,
    [rulesetId]
  );
  return referenceBlockMessage(
    rulesetId,
    'a custom encounter row',
    custom.rows.map((row) => `${row.table_name} → monster ${row.monster_id} (${row.monster_name})`)
  );
}

async function stockRowsBlock(client, rulesetId) {
  const stock = await client.query(
    `SELECT t.name AS table_name, m.id AS monster_id, m.name AS monster_name
     FROM encounter_table_row r
     JOIN encounter_table t ON t.id = r.encounter_table_id
     JOIN monster m ON m.id = r.monster_id
     WHERE m.ruleset_id = $1 AND t.ruleset_id = $1
     ORDER BY r.id
     LIMIT 10`,
    [rulesetId]
  );
  if (stock.rows.length === 0) return null;
  const sample = stock.rows
    .map((row) => `${row.table_name} → monster ${row.monster_id} (${row.monster_name})`)
    .join(', ');
  return (
    `Cannot replace monsters for ruleset_id=${rulesetId}: a stock encounter row still points at one ` +
    `(${sample}). Import ENCOUNTER_TABLES.json in the same run.`
  );
}

async function insertMapped(client, table, rows, rulesetId, writeRow) {
  const map = new Map();
  const reserved = new Set();
  for (const row of rows) {
    const sourceId = asInt(row.id);
    const destId = await allocDestId(client, table, sourceId, reserved);
    await writeRow(destId, row, rulesetId);
    map.set(sourceId, destId);
  }
  if (rows.length > 0) await syncSerial(client, table);
  return map;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} dir
 */
async function importCatalog(client, dir) {
  const meta = loadGamesystem(dir);
  const catalog = loadCatalog(dir);
  const problems = validateCatalog(catalog);
  if (problems.length > 0) throw new Error(problems.join('\n'));

  const rulesetId = await rulesetIdFor(client, meta.name);
  const counts = { monsters: null, treasures: null, tables: null, rows: null };

  if (catalog.monsters) {
    const block = await monsterReplaceBlock(client, rulesetId);
    if (block) throw new Error(block);
    if (!catalog.tables) {
      const stock = await stockRowsBlock(client, rulesetId);
      if (stock) throw new Error(stock);
    }
  }

  if (catalog.tables) {
    await client.query(
      `DELETE FROM public.encounter_table WHERE ruleset_id = $1`,
      [rulesetId]
    );
  }
  if (catalog.monsters) {
    await client.query(`DELETE FROM public.monster WHERE ruleset_id = $1`, [rulesetId]);
  }
  if (catalog.treasures) {
    await client.query(`DELETE FROM public.treasure_type WHERE ruleset_id = $1`, [rulesetId]);
  }

  if (catalog.treasures) {
    await insertMapped(client, 'treasure_type', catalog.treasures.rows, rulesetId, (destId, row, id) =>
      client.query(
        `INSERT INTO public.treasure_type (id, code, definition, ruleset_id)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [destId, String(row.code).trim(), JSON.stringify(row.definition), id]
      )
    );
    counts.treasures = catalog.treasures.rows.length;
  }

  let monsterMap = null;
  if (catalog.monsters) {
    monsterMap = await insertMapped(client, 'monster', catalog.monsters.rows, rulesetId, (destId, row, id) =>
      client.query(
        `INSERT INTO public.monster
           (id, name, hit_dice, armor_class, morale, treasure_type, movement, number_appearing, ruleset_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          destId,
          String(row.name).trim(),
          String(row.hit_dice).trim(),
          asInt(row.armor_class),
          row.morale == null || row.morale === '' ? null : asInt(row.morale),
          row.treasure_type == null || String(row.treasure_type).trim() === ''
            ? null
            : String(row.treasure_type).trim(),
          String(row.movement).trim(),
          String(row.number_appearing).trim(),
          id,
        ]
      )
    );
    counts.monsters = catalog.monsters.rows.length;
  }

  if (catalog.tables) {
    const tableMap = await insertMapped(
      client,
      'encounter_table',
      catalog.tables.rows,
      rulesetId,
      (destId, row, id) =>
        client.query(
          `INSERT INTO public.encounter_table (id, name, die, ruleset_id)
           VALUES ($1, $2, $3, $4)`,
          [destId, String(row.name).trim(), asInt(row.die), id]
        )
    );
    counts.tables = catalog.tables.rows.length;

    if (!monsterMap) {
      const existing = await client.query('SELECT id FROM public.monster WHERE ruleset_id = $1', [rulesetId]);
      monsterMap = new Map(existing.rows.map((row) => [row.id, row.id]));
    }
    const faceRows = catalog.rows ? catalog.rows.rows : [];
    await insertMapped(client, 'encounter_table_row', faceRows, rulesetId, (destId, row) => {
      const monsterSource = row.monster_id == null || row.monster_id === '' ? null : asInt(row.monster_id);
      if (monsterSource != null && !monsterMap.has(monsterSource)) {
        throw new Error(
          `ENCOUNTER_TABLE_ROWS id ${row.id}: monster id ${monsterSource} is not in this ruleset`
        );
      }
      const label = row.label == null || String(row.label).trim() === '' ? null : String(row.label).trim();
      const quantity =
        row.quantity == null || String(row.quantity).trim() === '' ? null : String(row.quantity).trim();
      return client.query(
        `INSERT INTO public.encounter_table_row
           (id, encounter_table_id, face_lo, face_hi, monster_id, label, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          destId,
          tableMap.get(asInt(row.encounter_table_id)),
          asInt(row.face_lo),
          asInt(row.face_hi),
          monsterSource == null ? null : monsterMap.get(monsterSource),
          label,
          quantity,
        ]
      );
    });
    counts.rows = faceRows.length;
  }

  return { rulesetId, name: meta.name, counts };
}

function poolFromEnv() {
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'rpghub',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });
}

async function main() {
  const { dir, dryRun } = parseArgs(process.argv);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(1);
  }

  const pool = poolFromEnv();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await importCatalog(client, dir);
    const c = result.counts;
    const shown = (n) => (n == null ? 'skipped' : String(n));
    console.log(
      `Ruleset ${JSON.stringify(result.name)} → id ${result.rulesetId}. ` +
        `monsters=${shown(c.monsters)}, treasure_types=${shown(c.treasures)}, ` +
        `encounter_tables=${shown(c.tables)}, rows=${shown(c.rows)}`
    );
    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('Dry run OK — transaction rolled back.');
    } else {
      await client.query('COMMIT');
      console.log('Catalog import committed.');
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

module.exports = { importCatalog, poolFromEnv };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
