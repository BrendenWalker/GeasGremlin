/**
 * One-level ruleset overlay. A child stores only rows that add to or override
 * its parent. Matching ignores id and modified, treats null and missing as the
 * same value, and collapses whitespace in text.
 *
 * A junction override (same key, different payload) keeps the child entity row
 * even when that row matches the parent. The junction primary key is the
 * entity id, so the override cannot sit on the parent's id.
 */

const fs = require('fs');
const path = require('path');

const DROP_ABILITY_DESCRIPTIONS = [
  'When fighting invisible opponent detected by naturally observant.  %d penalty to attack.',
  'When fighting invisible opponent detectd by naturally observant.  %d penalty to attack.',
];

const DROP_CHILD_GRANTS = ['Turn undead - consult GM'];

const ENTITY_TABLES = ['CLASSES', 'RACES', 'SPELLS', 'ABILITIES', 'ITEMS'];
const JUNCTION_TABLES = [
  'CLASS_ABILITIES',
  'CLASS_LEVELING',
  'CLASS_SPELLS',
  'RACE_ABILITIES',
  'SPELL_CLASS',
];

function norm(value, field) {
  if (field === 'is_quasi') return value === true;
  if (field === 'perday') {
    if (value == null || value === '') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : value;
  }
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const collapsed = value.replace(/\s+/g, ' ').trim();
    if (collapsed === '') return null;
    if (/^-?\d+$/.test(collapsed)) return Number(collapsed);
    return collapsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return value;
}

function payload(row, ignore, fields) {
  const out = {};
  const keys = fields || Object.keys(row).filter((key) => !ignore.has(key));
  for (const key of keys) {
    if (ignore.has(key)) continue;
    out[key] = norm(row[key], key);
  }
  return JSON.stringify(out, Object.keys(out).sort());
}

function fieldUnion(rows, ignore) {
  const fields = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!ignore.has(key)) fields.add(key);
    }
  }
  return [...fields].sort();
}

function loadTable(dir, baseName) {
  const filePath = path.join(dir, `${baseName}.json`);
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const key = Object.keys(raw).find((k) => k.toUpperCase() === baseName);
  if (!key || !Array.isArray(raw[key])) return [];
  return raw[key].map(lowerKeys);
}

function lowerKeys(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) out[key.toLowerCase()] = value;
  return out;
}

function byId(rows, field) {
  const map = new Map();
  for (const row of rows) map.set(norm(row.id), row[field]);
  return map;
}

function catalog(dir) {
  const classes = loadTable(dir, 'CLASSES');
  const races = loadTable(dir, 'RACES');
  const spells = loadTable(dir, 'SPELLS');
  const abilities = loadTable(dir, 'ABILITIES').filter(
    (row) => !DROP_ABILITY_DESCRIPTIONS.includes(String(row.description || ''))
  );
  return {
    CLASSES: classes,
    RACES: races,
    SPELLS: spells,
    ABILITIES: abilities,
    ITEMS: loadTable(dir, 'ITEMS'),
    CLASS_ABILITIES: loadTable(dir, 'CLASS_ABILITIES'),
    CLASS_LEVELING: loadTable(dir, 'CLASS_LEVELING'),
    CLASS_SPELLS: loadTable(dir, 'CLASS_SPELLS'),
    RACE_ABILITIES: loadTable(dir, 'RACE_ABILITIES'),
    SPELL_CLASS: loadTable(dir, 'SPELL_CLASS'),
    look: {
      class: byId(classes, 'name'),
      race: byId(races, 'name'),
      spell: byId(spells, 'name'),
      ability: byId(abilities, 'description'),
    },
  };
}

function entityKey(table, row) {
  if (table === 'ITEMS') {
    return [norm(row.category), norm(row.type), norm(row.name), norm(row.size, 'size')].join('\n');
  }
  if (table === 'ABILITIES') return String(norm(row.description, 'description'));
  return String(norm(row.name, 'name'));
}

function junctionKey(table, row, look) {
  const className = look.class.get(norm(row.class_id));
  const raceName = look.race.get(norm(row.race_id));
  const ability = look.ability.get(norm(row.ability_id));
  const spell = look.spell.get(norm(row.spell_id));
  if (table === 'CLASS_ABILITIES') return [className, ability, norm(row.level)].join('\n');
  if (table === 'CLASS_LEVELING') return [className, norm(row.level)].join('\n');
  if (table === 'CLASS_SPELLS') return [className, norm(row.char_level)].join('\n');
  if (table === 'RACE_ABILITIES') return [raceName, ability].join('\n');
  if (table === 'SPELL_CLASS') return [className, spell].join('\n');
  throw new Error(`unknown junction ${table}`);
}

function junctionPayload(table, row) {
  if (table === 'CLASS_ABILITIES' || table === 'RACE_ABILITIES') {
    return JSON.stringify({ int_param: norm(row.int_param), str_param: norm(row.str_param, 'str_param') });
  }
  if (table === 'CLASS_LEVELING') {
    return JSON.stringify({
      xp: norm(row.xp),
      hd: norm(row.hd),
      hp: norm(row.hp),
      ab: norm(row.ab),
    });
  }
  if (table === 'CLASS_SPELLS') {
    return JSON.stringify({
      level1: norm(row.level1),
      level2: norm(row.level2),
      level3: norm(row.level3),
      level4: norm(row.level4),
      level5: norm(row.level5),
      level6: norm(row.level6),
      level7: norm(row.level7),
    });
  }
  if (table === 'SPELL_CLASS') return JSON.stringify({ level: norm(row.level) });
  throw new Error(`unknown junction ${table}`);
}

const ENTITY_IGNORE = new Set(['id', 'modified']);

/**
 * Rows the child should keep. Entity names in anchorEntities stay even when
 * the entity payload matches the parent, because a junction override needs
 * its own entity id.
 */
function planOverlay(coreDir, childDir) {
  const core = catalog(coreDir);
  const child = catalog(childDir);
  const keep = {};
  const anchorEntities = { CLASSES: new Set(), RACES: new Set() };

  for (const table of JUNCTION_TABLES) {
    const parentByKey = new Map();
    for (const row of core[table]) {
      const key = junctionKey(table, row, core.look);
      if (key.includes('undefined') || key.includes('null')) continue;
      parentByKey.set(key, junctionPayload(table, row));
    }
    const kept = [];
    for (const row of child[table]) {
      const ability = child.look.ability.get(norm(row.ability_id));
      if (ability && DROP_CHILD_GRANTS.includes(ability)) continue;
      const key = junctionKey(table, row, child.look);
      const parentPayload = parentByKey.get(key);
      const own = junctionPayload(table, row);
      if (parentPayload == null) {
        kept.push(row);
        continue;
      }
      if (parentPayload === own) continue;
      kept.push(row);
      if (table === 'RACE_ABILITIES') anchorEntities.RACES.add(child.look.race.get(norm(row.race_id)));
      else anchorEntities.CLASSES.add(child.look.class.get(norm(row.class_id)));
    }
    keep[table] = kept;
  }

  for (const table of ENTITY_TABLES) {
    const fields = fieldUnion([...core[table], ...child[table]], ENTITY_IGNORE);
    const parentByKey = new Map();
    for (const row of core[table]) parentByKey.set(entityKey(table, row), payload(row, ENTITY_IGNORE, fields));
    const anchors = anchorEntities[table] || new Set();
    keep[table] = child[table].filter((row) => {
      const key = entityKey(table, row);
      const parentPayload = parentByKey.get(key);
      if (parentPayload == null) return true;
      if (parentPayload !== payload(row, ENTITY_IGNORE, fields)) return true;
      return anchors.has(key);
    });
  }

  return { core, child, keep };
}

function pendingDrops(plan) {
  let n = 0;
  for (const table of [...ENTITY_TABLES, ...JUNCTION_TABLES]) {
    n += plan.child[table].length - plan.keep[table].length;
  }
  return n;
}

function readGamesystem(dir) {
  const filePath = path.join(dir, 'gamesystem.json');
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function findRulesetDir(gamesystemsDir, rulesetName) {
  if (!fs.existsSync(gamesystemsDir)) return null;
  for (const entry of fs.readdirSync(gamesystemsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(gamesystemsDir, entry.name);
    const metaPath = path.join(dir, 'gamesystem.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.name === rulesetName) return dir;
  }
  return null;
}

function writeTable(dir, baseName, rows) {
  const filePath = path.join(dir, `${baseName}.json`);
  if (rows.length === 0) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return;
  }
  const raw = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : {};
  const key = Object.keys(raw).find((k) => k.toUpperCase() === baseName) || baseName;
  const original = Array.isArray(raw[key]) ? raw[key] : [];
  const wanted = new Set(rows.map((row) => JSON.stringify(lowerKeys(row))));
  const kept = original.filter((row) => wanted.has(JSON.stringify(lowerKeys(row))));
  const body = JSON.stringify({ [key]: kept }, null, '\t').replace(/": /g, '" : ');
  fs.writeFileSync(filePath, `${body}\n`, 'utf8');
}

function applyOverlay(coreDir, childDir, parentName) {
  const plan = planOverlay(coreDir, childDir);
  const coreAbilities = loadTable(coreDir, 'ABILITIES');
  const keptCoreAbilities = coreAbilities.filter(
    (row) => !DROP_ABILITY_DESCRIPTIONS.includes(String(row.description || ''))
  );
  writeTable(coreDir, 'ABILITIES', keptCoreAbilities);
  for (const table of [...ENTITY_TABLES, ...JUNCTION_TABLES]) {
    writeTable(childDir, table, plan.keep[table]);
  }
  const metaPath = path.join(childDir, 'gamesystem.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  meta.parent_ruleset = parentName;
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return plan;
}

module.exports = {
  DROP_ABILITY_DESCRIPTIONS,
  DROP_CHILD_GRANTS,
  ENTITY_TABLES,
  JUNCTION_TABLES,
  norm,
  payload,
  planOverlay,
  pendingDrops,
  readGamesystem,
  findRulesetDir,
  applyOverlay,
};
