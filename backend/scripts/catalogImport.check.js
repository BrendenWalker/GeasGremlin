/**
 * Shape checks for the play catalog, plus a rolled-back database proof that
 * import-catalog leaves classes, spells, items, and characters in place and
 * aborts when play data still points at a monster.
 *
 * Requires schema.sql applied and DB_* (same as import-ruleset).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ownerError, referenceBlockMessage, loadCatalog, validateCatalog } = require('./catalogImport');
const { importCatalog, poolFromEnv } = require('./import-catalog');

assert.equal(ownerError(1, null), null);
assert.equal(ownerError(null, 4), null);
assert.ok(ownerError(1, 4));
assert.ok(ownerError(null, null));
assert.equal(referenceBlockMessage(3, 'a campaign enemy', []), null);
assert.match(referenceBlockMessage(3, 'a campaign enemy', ['enemy 1']), /ruleset_id=3/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-'));
fs.writeFileSync(path.join(temp, 'gamesystem.json'), JSON.stringify({ name: 'Shape Check' }));
fs.writeFileSync(path.join(temp, 'MONSTERS.json'), JSON.stringify({
  MONSTERS: [
    {
      ID: 1,
      NAME: 'Goblin',
      HIT_DICE: '1-1',
      ARMOR_CLASS: 14,
      MORALE: 7,
      TREASURE_TYPE: 'B',
      MOVEMENT: "20'",
      NUMBER_APPEARING: '2d4',
    },
    {
      ID: 2,
      NAME: 'Statue',
      HIT_DICE: '2',
      ARMOR_CLASS: 16,
      MORALE: null,
      MOVEMENT: '0',
      NUMBER_APPEARING: '1',
    },
  ],
}));
fs.writeFileSync(path.join(temp, 'TREASURE_TYPES.json'), JSON.stringify({
  TREASURE_TYPES: [{ ID: 1, CODE: 'B', DEFINITION: { cp: { percent: 50, dice: '1d6' } } }],
}));
fs.writeFileSync(path.join(temp, 'ENCOUNTER_TABLES.json'), JSON.stringify({
  ENCOUNTER_TABLES: [{ ID: 1, NAME: 'Woods', DIE: 6 }],
}));
fs.writeFileSync(path.join(temp, 'ENCOUNTER_TABLE_ROWS.json'), JSON.stringify({
  ENCOUNTER_TABLE_ROWS: [
    { ID: 1, ENCOUNTER_TABLE_ID: 1, FACE_LO: 1, FACE_HI: 1, MONSTER_ID: 1, QUANTITY: '2d4' },
    { ID: 2, ENCOUNTER_TABLE_ID: 1, FACE_LO: 2, FACE_HI: 2, LABEL: 'Special' },
  ],
}));

const good = loadCatalog(temp);
assert.equal(good.monsters.rows.length, 2);
assert.deepEqual(validateCatalog(good), []);

const missing = loadCatalog(os.tmpdir());
assert.equal(missing.monsters, null);
assert.equal(missing.tables, null);

function problemsFor(patch) {
  const catalog = {
    monsters: good.monsters,
    treasures: good.treasures,
    tables: good.tables,
    rows: { filePath: 'rows', rows: good.rows.rows.map((row) => ({ ...row })) },
  };
  patch(catalog);
  return validateCatalog(catalog).join('\n');
}

assert.match(problemsFor((catalog) => {
  catalog.rows.rows[0].face_hi = 7;
}), /above the table die/);
assert.match(problemsFor((catalog) => {
  catalog.rows.rows[1].label = '';
  catalog.rows.rows[1].monster_id = null;
}), /needs a monster id or a label/);
assert.match(problemsFor((catalog) => {
  catalog.rows.rows[0].monster_id = 99;
}), /not in MONSTERS.json/);
assert.match(problemsFor((catalog) => {
  catalog.monsters = { rows: catalog.monsters.rows.map((row) => ({ ...row, morale: 1 })) };
}), /morale/);
assert.match(problemsFor((catalog) => {
  catalog.monsters = { rows: catalog.monsters.rows.map((row) => ({ ...row, morale_engaged: 1 })) };
}), /morale/);
assert.match(problemsFor((catalog) => {
  catalog.monsters = { rows: catalog.monsters.rows.map((row) => ({ ...row, armor_class: null, defense_note: '' })) };
}), /armor class or defense note/);
assert.equal(problemsFor((catalog) => {
  catalog.monsters = { rows: catalog.monsters.rows.map((row) => ({
    ...row,
    armor_class: null,
    defense_note: 'Can always be hit',
    hitdie_note: 'variable',
    attack_note: '1 bite; 1d6',
    morale_engaged: 12,
  })) };
}), '');
assert.match(problemsFor((catalog) => {
  catalog.treasures = { rows: [{ id: 1, code: 'B', definition: ['nope'] }] };
}), /JSON object/);
assert.match(problemsFor((catalog) => {
  catalog.tables = null;
}), /requires ENCOUNTER_TABLES.json/);
assert.match(problemsFor((catalog) => {
  catalog.tables = { rows: [{ id: 1, name: 'Woods', die: 1 }] };
}), /die must be an integer/);
assert.match(problemsFor((catalog) => {
  catalog.monsters = { rows: catalog.monsters.rows.map((row) => ({ ...row, notes: 'x'.repeat(30001) })) };
}), /notes/);

console.log('catalogImport shape ok');

function writeGamesystem(dir, name) {
  fs.writeFileSync(path.join(dir, 'gamesystem.json'), JSON.stringify({ name }));
}

function writeJson(dir, base, key, rows) {
  fs.writeFileSync(path.join(dir, `${base}.json`), JSON.stringify({ [key]: rows }));
}

function monsterRow(id, name) {
  return {
    ID: id,
    NAME: name,
    HIT_DICE: '1-1',
    ARMOR_CLASS: 14,
    MORALE: 7,
    TREASURE_TYPE: 'B',
    MOVEMENT: "20'",
    NUMBER_APPEARING: '2d4',
  };
}

async function freeId(client, table) {
  const res = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 AS id FROM public.${table}`);
  return Number(res.rows[0].id);
}

async function seedRuleset(client) {
  const name = `Catalog Import Check ${Date.now()}`;
  const rulesetId = await freeId(client, 'ruleset');
  await client.query('INSERT INTO public.ruleset (id, name) VALUES ($1, $2)', [rulesetId, name]);
  const classId = await freeId(client, 'classes');
  const spellId = await freeId(client, 'spells');
  const itemId = await freeId(client, 'items');
  const characterId = await freeId(client, '"characters"');
  await client.query(
    'INSERT INTO public.classes (id, name, ruleset_id) VALUES ($1, $2, $3)',
    [classId, 'Fighter', rulesetId]
  );
  await client.query(
    'INSERT INTO public.spells (id, name, ruleset_id) VALUES ($1, $2, $3)',
    [spellId, 'Light', rulesetId]
  );
  await client.query(
    'INSERT INTO public.items (id, name, ruleset_id) VALUES ($1, $2, $3)',
    [itemId, 'Torch', rulesetId]
  );
  await client.query(
    'INSERT INTO public."characters" (id, name, ruleset_id) VALUES ($1, $2, $3)',
    [characterId, 'Ada', rulesetId]
  );
  return { name, rulesetId, classId, spellId, itemId, characterId };
}

async function counts(client, rulesetId) {
  const q = async (sql) => Number((await client.query(sql, [rulesetId])).rows[0].n);
  return {
    classes: await q('SELECT COUNT(*)::int AS n FROM public.classes WHERE ruleset_id = $1'),
    spells: await q('SELECT COUNT(*)::int AS n FROM public.spells WHERE ruleset_id = $1'),
    items: await q('SELECT COUNT(*)::int AS n FROM public.items WHERE ruleset_id = $1'),
    characters: await q('SELECT COUNT(*)::int AS n FROM public."characters" WHERE ruleset_id = $1'),
    monsters: await q('SELECT COUNT(*)::int AS n FROM public.monster WHERE ruleset_id = $1'),
  };
}

async function withRollback(client, fn) {
  await client.query('BEGIN');
  try {
    await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

async function databaseProof(client) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-db-'));

  await withRollback(client, async () => {
    const seeded = await seedRuleset(client);
    writeGamesystem(dir, seeded.name);
    writeJson(dir, 'MONSTERS', 'MONSTERS', [monsterRow(1, 'Goblin')]);
    writeJson(dir, 'TREASURE_TYPES', 'TREASURE_TYPES', [
      { ID: 1, CODE: 'B', DEFINITION: { cp: { percent: 50, dice: '1d6' } } },
    ]);
    writeJson(dir, 'ENCOUNTER_TABLES', 'ENCOUNTER_TABLES', [{ ID: 1, NAME: 'Woods', DIE: 6 }]);
    writeJson(dir, 'ENCOUNTER_TABLE_ROWS', 'ENCOUNTER_TABLE_ROWS', [
      { ID: 1, ENCOUNTER_TABLE_ID: 1, FACE_LO: 1, FACE_HI: 1, MONSTER_ID: 1, QUANTITY: '2d4' },
    ]);
    const imported = await importCatalog(client, dir);
    assert.equal(imported.rulesetId, seeded.rulesetId);
    const after = await counts(client, seeded.rulesetId);
    assert.equal(after.classes, 1);
    assert.equal(after.spells, 1);
    assert.equal(after.items, 1);
    assert.equal(after.characters, 1);
    assert.equal(after.monsters, 1);
    const treasure = await client.query(
      'SELECT code, definition FROM public.treasure_type WHERE ruleset_id = $1',
      [seeded.rulesetId]
    );
    assert.equal(treasure.rows[0].code, 'B');
    assert.equal(treasure.rows[0].definition.cp.percent, 50);
    const row = await client.query(
      `SELECT r.face_lo, r.face_hi, r.quantity, m.name
       FROM public.encounter_table_row r
       JOIN public.encounter_table t ON t.id = r.encounter_table_id
       JOIN public.monster m ON m.id = r.monster_id
       WHERE t.ruleset_id = $1`,
      [seeded.rulesetId]
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].name, 'Goblin');
    assert.equal(row.rows[0].quantity, '2d4');
  });

  await withRollback(client, async () => {
    const seeded = await seedRuleset(client);
    const monsters = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-wipe-'));
    writeGamesystem(monsters, seeded.name);
    writeJson(monsters, 'MONSTERS', 'MONSTERS', [monsterRow(1, 'Goblin')]);
    writeJson(monsters, 'TREASURE_TYPES', 'TREASURE_TYPES', [
      { ID: 1, CODE: 'B', DEFINITION: {} },
    ]);
    await importCatalog(client, monsters);
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-empty-'));
    writeGamesystem(emptyDir, seeded.name);
    writeJson(emptyDir, 'MONSTERS', 'MONSTERS', []);
    await importCatalog(client, emptyDir);
    const wiped = await counts(client, seeded.rulesetId);
    assert.equal(wiped.monsters, 0);
    assert.equal(wiped.classes, 1);
    assert.equal(wiped.characters, 1);
    const treasureLeft = await client.query(
      'SELECT COUNT(*)::int AS n FROM public.treasure_type WHERE ruleset_id = $1',
      [seeded.rulesetId]
    );
    assert.equal(treasureLeft.rows[0].n, 1);
  });

  await withRollback(client, async () => {
    const seeded = await seedRuleset(client);
    const keep = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-keep-'));
    writeGamesystem(keep, seeded.name);
    writeJson(keep, 'MONSTERS', 'MONSTERS', [monsterRow(1, 'Goblin')]);
    await importCatalog(client, keep);
    const skip = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-skip-'));
    writeGamesystem(skip, seeded.name);
    await importCatalog(client, skip);
    const after = await counts(client, seeded.rulesetId);
    assert.equal(after.monsters, 1);
    assert.equal(after.classes, 1);
  });

  await withRollback(client, async () => {
    const seeded = await seedRuleset(client);
    const full = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-full-'));
    writeGamesystem(full, seeded.name);
    writeJson(full, 'MONSTERS', 'MONSTERS', [monsterRow(1, 'Goblin')]);
    writeJson(full, 'ENCOUNTER_TABLES', 'ENCOUNTER_TABLES', [{ ID: 1, NAME: 'Woods', DIE: 6 }]);
    writeJson(full, 'ENCOUNTER_TABLE_ROWS', 'ENCOUNTER_TABLE_ROWS', [
      { ID: 1, ENCOUNTER_TABLE_ID: 1, FACE_LO: 1, FACE_HI: 1, MONSTER_ID: 1 },
    ]);
    await importCatalog(client, full);
    const monstersOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-monsters-'));
    writeGamesystem(monstersOnly, seeded.name);
    writeJson(monstersOnly, 'MONSTERS', 'MONSTERS', [monsterRow(1, 'Hobgoblin')]);
    await assert.rejects(importCatalog(client, monstersOnly), /stock encounter row/);
    const after = await counts(client, seeded.rulesetId);
    assert.equal(after.monsters, 1);
    const name = await client.query('SELECT name FROM public.monster WHERE ruleset_id = $1', [seeded.rulesetId]);
    assert.equal(name.rows[0].name, 'Goblin');
  });

  await withRollback(client, async () => {
    const seeded = await seedRuleset(client);
    const full = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-enemy-'));
    writeGamesystem(full, seeded.name);
    writeJson(full, 'MONSTERS', 'MONSTERS', [monsterRow(1, 'Goblin')]);
    await importCatalog(client, full);
    const monster = await client.query('SELECT id FROM public.monster WHERE ruleset_id = $1', [seeded.rulesetId]);
    const campaignId = await freeId(client, 'campaign');
    await client.query(
      'INSERT INTO public.campaign (id, name, ruleset_id) VALUES ($1, $2, $3)',
      [campaignId, 'Check', seeded.rulesetId]
    );
    const creatureId = await freeId(client, 'campaign_creature');
    await client.query(
      `INSERT INTO public.campaign_creature
         (id, campaign_id, name, monster_id, hp, base_hp, disposition, base_disposition)
       VALUES ($1, $2, $3, $4, 4, 4, 'present', 'present')`,
      [creatureId, campaignId, 'Goblin', monster.rows[0].id]
    );
    await assert.rejects(importCatalog(client, full), /campaign creature/);
  });

  await withRollback(client, async () => {
    const seeded = await seedRuleset(client);
    const full = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-loc-'));
    writeGamesystem(full, seeded.name);
    writeJson(full, 'MONSTERS', 'MONSTERS', [monsterRow(1, 'Goblin')]);
    await importCatalog(client, full);
    const monster = await client.query('SELECT id FROM public.monster WHERE ruleset_id = $1', [seeded.rulesetId]);
    const col = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'campaign_location' AND column_name = 'monster_id'`
    );
    if (col.rows.length === 0) return;
    const reg = await client.query(`SELECT to_regclass('public.campaign_location') AS reg`);
    if (reg.rows[0].reg == null) {
      await client.query('CREATE TABLE public.campaign_location (monster_id int4)');
    }
    await client.query('INSERT INTO public.campaign_location (monster_id) VALUES ($1)', [monster.rows[0].id]);
    await assert.rejects(importCatalog(client, full), /campaign location/);
  });

  await withRollback(client, async () => {
    const seeded = await seedRuleset(client);
    const full = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-loc-table-'));
    writeGamesystem(full, seeded.name);
    writeJson(full, 'MONSTERS', 'MONSTERS', [monsterRow(1, 'Goblin')]);
    writeJson(full, 'ENCOUNTER_TABLES', 'ENCOUNTER_TABLES', [{ ID: 1, NAME: 'Woods', DIE: 6 }]);
    writeJson(full, 'ENCOUNTER_TABLE_ROWS', 'ENCOUNTER_TABLE_ROWS', [
      { ID: 1, ENCOUNTER_TABLE_ID: 1, FACE_LO: 1, FACE_HI: 1, MONSTER_ID: 1 },
    ]);
    await importCatalog(client, full);
    const table = await client.query(
      'SELECT id FROM public.encounter_table WHERE ruleset_id = $1',
      [seeded.rulesetId]
    );
    const reg = await client.query(`SELECT to_regclass('public.campaign_location') AS reg`);
    if (reg.rows[0].reg == null) {
      await client.query('CREATE TABLE public.campaign_location (encounter_table_id int4)');
      await client.query(
        'INSERT INTO public.campaign_location (encounter_table_id) VALUES ($1)',
        [table.rows[0].id]
      );
    } else {
      const campaignId = await freeId(client, 'campaign');
      await client.query(
        'INSERT INTO public.campaign (id, name, ruleset_id) VALUES ($1, $2, $3)',
        [campaignId, 'Loc', seeded.rulesetId]
      );
      await client.query(
        `INSERT INTO public.campaign_location
           (campaign_id, name, place, interval_seconds, encounter_table_id)
         VALUES ($1, 'Woods', 'outside', 14400, $2)`,
        [campaignId, table.rows[0].id]
      );
    }
    await assert.rejects(importCatalog(client, full), /campaign location/);
  });

  await withRollback(client, async () => {
    const seeded = await seedRuleset(client);
    const full = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-import-custom-'));
    writeGamesystem(full, seeded.name);
    writeJson(full, 'MONSTERS', 'MONSTERS', [monsterRow(1, 'Goblin')]);
    await importCatalog(client, full);
    const monster = await client.query('SELECT id FROM public.monster WHERE ruleset_id = $1', [seeded.rulesetId]);
    const campaignId = await freeId(client, 'campaign');
    await client.query(
      'INSERT INTO public.campaign (id, name, ruleset_id) VALUES ($1, $2, $3)',
      [campaignId, 'Custom', seeded.rulesetId]
    );
    const tableId = await freeId(client, 'encounter_table');
    await client.query(
      `INSERT INTO public.encounter_table (id, name, die, campaign_id)
       VALUES ($1, 'Cellar', 6, $2)`,
      [tableId, campaignId]
    );
    const rowId = await freeId(client, 'encounter_table_row');
    await client.query(
      `INSERT INTO public.encounter_table_row (id, encounter_table_id, face_lo, face_hi, monster_id)
       VALUES ($1, $2, 1, 1, $3)`,
      [rowId, tableId, monster.rows[0].id]
    );
    await assert.rejects(importCatalog(client, full), /custom encounter row/);
  });

  console.log('catalogImport database ok');
}

async function main() {
  const pool = poolFromEnv();
  const client = await pool.connect();
  try {
    await databaseProof(client);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
