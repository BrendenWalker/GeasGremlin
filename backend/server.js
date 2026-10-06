const fs = require('fs');
const path = require('path');
const repoEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(repoEnv)) {
  require('dotenv').config({ path: repoEnv });
}
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const { createDbPool, testConnection } = require('./db-config');

const app = express();
const port = process.env.PORT || 8140;

let isReady = false;

app.use(cors());
app.use(express.json());

const pool = createDbPool({
  database: process.env.DB_NAME || 'rpghub',
});

testConnection(pool);

/** Subqueries for primary class + labels (characters.class column removed; use character_classes). */
const SQL_CHAR_CLASS_NAME =
  '(SELECT string_agg(cl.name, \', \' ORDER BY cc.sort_order, cc.class_id) FROM character_classes cc JOIN classes cl ON cl.id = cc.class_id WHERE cc.character_id = c.id)';
const SQL_CHAR_PRIMARY_CLASS_ID =
  '(SELECT cc.class_id FROM character_classes cc WHERE cc.character_id = c.id ORDER BY cc.sort_order, cc.class_id LIMIT 1)';
const SQL_CHAR_CLASSES_JSON =
  '(SELECT json_agg(json_build_object(\'class_id\', cc.class_id, \'class_level\', cc.class_level, \'sort_order\', cc.sort_order, \'name\', cl.name) ORDER BY cc.sort_order, cc.class_id) FROM character_classes cc JOIN classes cl ON cl.id = cc.class_id WHERE cc.character_id = c.id)';

// ==================== CAMPAIGNS ====================

app.get('/api/campaigns', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM campaign ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Campaign table does not exist. Run database/schema.sql on your rpghub database (see README).' });
    }
    res.status(500).json({ error: error.message || 'Failed to fetch campaigns' });
  }
});

app.get('/api/campaigns/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM campaign WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

app.post('/api/campaigns', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      'INSERT INTO campaign (name) VALUES ($1) RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating campaign:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Campaign name already exists' });
    }
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Campaign table does not exist. Run database/schema.sql on your rpghub database (see README).' });
    }
    res.status(500).json({ error: error.message || 'Failed to create campaign' });
  }
});

app.put('/api/campaigns/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      'UPDATE campaign SET name = $1, modified = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [name, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

app.delete('/api/campaigns/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM campaign WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// ==================== CHARACTERS ====================

app.get('/api/campaigns/:campaignId/characters', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, r.name as race_name, ${SQL_CHAR_CLASS_NAME} AS class_name
       FROM characters c
       INNER JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
       LEFT JOIN races r ON c.race = r.id
       ORDER BY c.name`,
      [req.params.campaignId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching characters:', error);
    res.status(500).json({ error: 'Failed to fetch characters' });
  }
});

app.get('/api/characters/:id', async (req, res) => {
  try {
    const charResult = await pool.query(
      `SELECT c.*, r.name as race_name, ${SQL_CHAR_CLASS_NAME} AS class_name,
       ${SQL_CHAR_PRIMARY_CLASS_ID} AS class,
       ${SQL_CHAR_CLASSES_JSON} AS character_classes,
       (SELECT COALESCE(array_agg(cc.campaign_id), ARRAY[]::int[]) FROM campaign_character cc WHERE cc.character_id = c.id) AS campaign_ids
       FROM characters c
       LEFT JOIN races r ON c.race = r.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (charResult.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const character = charResult.rows[0];

    let abil = { rows: [] };
    let spells = { rows: [] };
    let items = { rows: [] };
    try {
      [abil, spells, items] = await Promise.all([
        pool.query(
          `SELECT ca.*, a.description as ability_description
           FROM character_abilities ca
           JOIN abilities a ON ca.ability_id = a.id
           WHERE ca.character_id = $1`,
          [req.params.id]
        ),
        pool.query(
          `SELECT cs.*, s.name as spell_name, s.description as spell_description, s.range as spell_range, s.duration as spell_duration,
            COALESCE(sc.level, 0) as spell_level
           FROM character_spells cs
           JOIN spells s ON cs.spell_id = s.id
           LEFT JOIN LATERAL (
             SELECT MIN(sc2.level) AS level
             FROM spell_class sc2
             WHERE sc2.spell_id = cs.spell_id
               AND EXISTS (
                 SELECT 1 FROM character_classes cc
                 WHERE cc.character_id = $1 AND cc.class_id = sc2.class_id
               )
           ) sc ON true
           WHERE cs.character_id = $1`,
          [req.params.id]
        ).catch((err) => {
          if (err.code === '42P01' || err.code === '42703') {
            return pool.query(
              `SELECT cs.*, s.name as spell_name, s.description as spell_description, s.range as spell_range, s.duration as spell_duration
               FROM character_spells cs JOIN spells s ON cs.spell_id = s.id WHERE cs.character_id = $1`,
              [req.params.id]
            ).then((r) => ({ rows: r.rows.map((row) => ({ ...row, spell_level: 0 })) }));
          }
          throw err;
        }),
        pool.query(
          `SELECT ci.*, i.name as item_name, i.notes as item_description,
            i.weight as item_weight, i.attackbonus as item_attackbonus, i.damage as item_damage,
            i.ac as item_ac, i.ac_melee as item_ac_melee, i.ac_ranged as item_ac_ranged,
            i.range_short as item_range_short, i.range_medium as item_range_medium, i.range_long as item_range_long,
            i.rof as item_rof, i.category as item_category
           FROM character_items ci
           LEFT JOIN items i ON ci.item_id = i.id
           WHERE ci.character_id = $1`,
          [req.params.id]
        ),
      ]);
    } catch (err) {
      if (err.code === '42P01') {
        return res.status(503).json({ error: 'Table "' + (err.message || '').replace(/^relation "([^"]+)" .*/, '$1') + '" does not exist. Run the full database/schema.sql (see README).' });
      }
      if (err.code === '42703') {
        return res.status(503).json({ error: 'Schema mismatch: ' + (err.message || '') });
      }
      throw err;
    }
    character.abilities = abil.rows;
    character.spells = spells.rows;
    character.items = items.rows;

    character.next_level_xp = null;
    try {
      const primary = await pool.query(
        `SELECT cc.class_id, COALESCE(cc.class_level, c.level, 1) AS class_level
         FROM characters c
         JOIN character_classes cc ON cc.character_id = c.id
         WHERE c.id = $1
         ORDER BY cc.sort_order, cc.class_id
         LIMIT 1`,
        [req.params.id]
      );
      if (primary.rows[0]) {
        const clid = primary.rows[0].class_id;
        const clvl = primary.rows[0].class_level || 1;
        const nextLevel = await pool.query(
          `SELECT xp FROM class_leveling WHERE class_id = $1 AND level = $2`,
          [clid, clvl + 1]
        );
        character.next_level_xp = nextLevel.rows[0] ? nextLevel.rows[0].xp : null;
      }
    } catch (_) {
      // class_leveling / character_classes may not exist in older schema
    }

    res.json(character);
  } catch (error) {
    console.error('Error fetching character:', error);
    if (error && error.code === '42P01') {
      return res.status(503).json({ error: 'Table "' + (error.message || '').replace(/^relation "([^"]+)" .*/, '$1') + '" does not exist. Run the full database/schema.sql (see README).' });
    }
    if (error && error.code === '42703') {
      return res.status(503).json({ error: 'Schema mismatch (missing column): ' + (error.message || '') });
    }
    const msg = (error && (error.message || error.detail || (error.code ? `Error ${error.code}` : '') || error.hint)) || (error ? String(error) : '') || 'Unknown error';
    const payload = {
      error: (msg && String(msg).trim()) ? String(msg).trim() : 'Failed to fetch character',
      code: error && error.code,
      detail: error && error.detail,
      hint: error && error.hint,
      debug: error ? { message: error.message, name: error.name, code: error.code } : undefined,
    };
    console.error('GET /api/characters/:id payload:', JSON.stringify(payload));
    res.status(500).json(payload);
  }
});

app.post('/api/campaigns/:campaignId/characters', async (req, res) => {
  try {
    const campaignId = req.params.campaignId;
    const {
      name, user, gender, age, hair, eyes, height, weight, race, class: classId,
      str, int: intVal, wis, dex, con, chr, hp, notes, quasiclass, level, xp, skillpoints, money,
      ruleset_id: rulesetRaw,
    } = req.body;
    const rulesetId = parseRulesetId(rulesetRaw);
    if (rulesetId == null) {
      return res.status(400).json({ error: 'ruleset_id must be a positive integer' });
    }
    const idResult = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM characters');
    const nextId = idResult.rows[0].next_id;
    const result = await pool.query(
      `INSERT INTO characters (id, name, "user", gender, age, hair, eyes, height, weight, race,
       str, "int", wis, dex, con, chr, hp, notes, quasiclass, level, xp, skillpoints, money, ruleset_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       RETURNING *`,
      [nextId, name || 'Unnamed', user || 'TEMP$USER', gender || null, age ?? null, hair || null, eyes || null, height || null, weight || null,
        race ?? null, str ?? null, intVal ?? null, wis ?? null, dex ?? null, con ?? null, chr ?? null,
        hp ?? null, notes || null, quasiclass ?? null, level ?? 1, xp ?? 0, skillpoints ?? null, money ?? null,
        rulesetId]
    );
    const newId = result.rows[0].id;
    await pool.query(
      'INSERT INTO campaign_character (campaign_id, character_id) VALUES ($1, $2)',
      [campaignId, newId]
    );
    if (classId != null) {
      await pool.query(
        `INSERT INTO character_classes (character_id, class_id, class_level, sort_order)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (character_id, class_id) DO UPDATE SET
           class_level = EXCLUDED.class_level, modified = CURRENT_TIMESTAMP`,
        [newId, classId, level ?? 1]
      );
    }
    const full = await pool.query(
      `SELECT c.*, r.name as race_name, ${SQL_CHAR_CLASS_NAME} AS class_name,
       ${SQL_CHAR_PRIMARY_CLASS_ID} AS class,
       ${SQL_CHAR_CLASSES_JSON} AS character_classes
       FROM characters c
       LEFT JOIN races r ON c.race = r.id
       WHERE c.id = $1`,
      [newId]
    );
    const character = full.rows[0];
    character.campaign_ids = [parseInt(campaignId, 10)];
    res.status(201).json(character);
  } catch (error) {
    console.error('Error creating character:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Character name already exists' });
    }
    if (error.code === '23503') {
      return res.status(400).json({ error: 'Invalid campaign, race, class, or ruleset reference' });
    }
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Characters table does not exist. Run the full database/schema.sql on your rpghub database (see README).' });
    }
    if (error.code === '42703') {
      return res.status(503).json({ error: 'Database schema mismatch: ' + (error.message || 'missing column') });
    }
    res.status(500).json({ error: error.message || 'Failed to create character' });
  }
});

app.put('/api/characters/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const current = await pool.query(
      `SELECT c.*, ${SQL_CHAR_PRIMARY_CLASS_ID} AS class
       FROM characters c WHERE c.id = $1`,
      [id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const row = current.rows[0];
    const body = req.body;
    const allowed = [
      'name', 'user', 'gender', 'age', 'hair', 'eyes', 'height', 'weight', 'race',
      'str', 'int', 'wis', 'dex', 'con', 'chr', 'hp', 'notes', 'quasiclass', 'level', 'xp', 'skillpoints', 'money',
      'equipped_melee_primary_id', 'equipped_melee_secondary_id', 'equipped_ranged_id', 'equipped_armor_id', 'equipped_shield_id'
    ];
    const merged = { ...row };
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        merged[key] = body[key] ?? null;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'class')) {
      merged.class = body.class ?? null;
    }
    await pool.query(
      `UPDATE characters SET
       name = $1, "user" = $2, gender = $3, age = $4, hair = $5, eyes = $6, height = $7, weight = $8,
       race = $9, str = $10, "int" = $11, wis = $12, dex = $13, con = $14, chr = $15,
       hp = $16, notes = $17, quasiclass = $18, level = $19, xp = $20, skillpoints = $21, money = $22,
       equipped_melee_primary_id = $23, equipped_melee_secondary_id = $24, equipped_ranged_id = $25,
       equipped_armor_id = $26, equipped_shield_id = $27,
       modified = CURRENT_TIMESTAMP
       WHERE id = $28`,
      [merged.name, merged.user, merged.gender, merged.age, merged.hair, merged.eyes, merged.height, merged.weight,
        merged.race, merged.str, merged.int, merged.wis, merged.dex, merged.con, merged.chr,
        merged.hp, merged.notes, merged.quasiclass, merged.level, merged.xp, merged.skillpoints, merged.money,
        merged.equipped_melee_primary_id, merged.equipped_melee_secondary_id, merged.equipped_ranged_id,
        merged.equipped_armor_id, merged.equipped_shield_id,
        id]
    );

    if (Object.prototype.hasOwnProperty.call(body, 'character_classes') && Array.isArray(body.character_classes)) {
      await pool.query('DELETE FROM character_classes WHERE character_id = $1', [id]);
      let ord = 0;
      for (const cc of body.character_classes) {
        if (cc == null || cc.class_id == null) continue;
        await pool.query(
          `INSERT INTO character_classes (character_id, class_id, class_level, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [id, cc.class_id, cc.class_level ?? merged.level ?? 1, cc.sort_order ?? ord]
        );
        ord += 1;
      }
    } else if (Object.prototype.hasOwnProperty.call(body, 'class')) {
      await pool.query('DELETE FROM character_classes WHERE character_id = $1', [id]);
      if (merged.class != null) {
        await pool.query(
          `INSERT INTO character_classes (character_id, class_id, class_level, sort_order)
           VALUES ($1, $2, $3, 0)`,
          [id, merged.class, merged.level ?? 1]
        );
      }
    }

    const result = await pool.query(
      `SELECT c.*, r.name as race_name, ${SQL_CHAR_CLASS_NAME} AS class_name,
       ${SQL_CHAR_PRIMARY_CLASS_ID} AS class,
       ${SQL_CHAR_CLASSES_JSON} AS character_classes,
       (SELECT COALESCE(array_agg(cc2.campaign_id), ARRAY[]::int[]) FROM campaign_character cc2 WHERE cc2.character_id = c.id) AS campaign_ids
       FROM characters c
       LEFT JOIN races r ON c.race = r.id
       WHERE c.id = $1`,
      [id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating character:', error);
    res.status(500).json({ error: 'Failed to update character' });
  }
});

app.delete('/api/characters/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM characters WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    res.json({ message: 'Character deleted successfully' });
  } catch (error) {
    console.error('Error deleting character:', error);
    res.status(500).json({ error: 'Failed to delete character' });
  }
});

// ==================== CHARACTER ITEMS ====================

app.post('/api/characters/:id/items', async (req, res) => {
  try {
    const characterId = req.params.id;
    const { item_id, quantity = 1, name, description } = req.body;
    const idResult = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM character_items');
    const nextId = idResult.rows[0].next_id;
    const result = await pool.query(
      `INSERT INTO character_items (id, character_id, item_id, quantity, name, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nextId, characterId, item_id ?? null, Math.max(1, quantity), name || null, description || null]
    );
    const row = result.rows[0];
    const itemRow = await pool.query(
      `SELECT i.name as item_name, i.notes as item_description, i.weight as item_weight,
        i.attackbonus as item_attackbonus, i.damage as item_damage, i.ac as item_ac,
        i.ac_melee as item_ac_melee, i.ac_ranged as item_ac_ranged,
        i.range_short as item_range_short, i.range_medium as item_range_medium, i.range_long as item_range_long,
        i.rof as item_rof, i.category as item_category
       FROM items i WHERE i.id = $1`,
      [row.item_id]
    );
    const out = { ...row, item_name: itemRow.rows[0]?.item_name, item_description: itemRow.rows[0]?.item_description };
    if (itemRow.rows[0]) Object.assign(out, itemRow.rows[0]);
    res.status(201).json(out);
  } catch (error) {
    console.error('Error adding character item:', error);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

app.put('/api/characters/:id/items/:itemId', async (req, res) => {
  try {
    const { id: characterId, itemId } = req.params;
    const { quantity } = req.body;
    const result = await pool.query(
      `UPDATE character_items SET quantity = $1, modified = CURRENT_TIMESTAMP
       WHERE character_id = $2 AND id = $3 RETURNING *`,
      [Math.max(0, quantity), characterId, itemId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Character item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating character item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

app.delete('/api/characters/:id/items/:itemId', async (req, res) => {
  try {
    const { id: characterId, itemId } = req.params;
    const removeOne = req.query.quantity === '1';
    if (removeOne) {
      const row = await pool.query(
        'SELECT quantity FROM character_items WHERE character_id = $1 AND id = $2',
        [characterId, itemId]
      );
      if (row.rows.length === 0) {
        return res.status(404).json({ error: 'Character item not found' });
      }
      const qty = row.rows[0].quantity;
      if (qty <= 1) {
        await pool.query('DELETE FROM character_items WHERE character_id = $1 AND id = $2', [characterId, itemId]);
      } else {
        await pool.query(
          'UPDATE character_items SET quantity = quantity - 1, modified = CURRENT_TIMESTAMP WHERE character_id = $1 AND id = $2',
          [characterId, itemId]
        );
      }
    } else {
      const result = await pool.query('DELETE FROM character_items WHERE character_id = $1 AND id = $2 RETURNING *', [characterId, itemId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Character item not found' });
      }
    }
    res.json({ message: 'Item removed' });
  } catch (error) {
    console.error('Error removing character item:', error);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// ==================== CHARACTER SPELLS (learn, memorized, cast) ====================

app.post('/api/characters/:id/spells', async (req, res) => {
  try {
    const characterId = req.params.id;
    const { spell_id, memorized = 0 } = req.body;
    await pool.query(
      `INSERT INTO character_spells (character_id, spell_id, known, memorized)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (character_id, spell_id) DO UPDATE SET known = 1, memorized = character_spells.memorized + EXCLUDED.memorized, modified = CURRENT_TIMESTAMP`,
      [characterId, spell_id, Math.max(0, memorized)]
    );
    const row = await pool.query(
      `SELECT cs.*, s.name as spell_name, s.description as spell_description, s.range as spell_range, s.duration as spell_duration,
        (SELECT MIN(scm.level) FROM spell_class scm
         WHERE scm.spell_id = cs.spell_id
           AND EXISTS (SELECT 1 FROM character_classes ccl WHERE ccl.character_id = $1 AND ccl.class_id = scm.class_id)) as spell_level
       FROM character_spells cs JOIN spells s ON cs.spell_id = s.id WHERE cs.character_id = $1 AND cs.spell_id = $2`,
      [characterId, spell_id]
    );
    res.status(201).json(row.rows[0] || { character_id: characterId, spell_id, known: 1, memorized });
  } catch (error) {
    console.error('Error learning spell:', error);
    res.status(500).json({ error: 'Failed to learn spell' });
  }
});

app.put('/api/characters/:id/spells/:spellId', async (req, res) => {
  try {
    const { id: characterId, spellId } = req.params;
    const { memorized } = req.body;
    const result = await pool.query(
      `UPDATE character_spells SET memorized = $1, modified = CURRENT_TIMESTAMP
       WHERE character_id = $2 AND spell_id = $3 RETURNING *`,
      [Math.max(0, memorized), characterId, spellId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Character spell not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating character spell:', error);
    res.status(500).json({ error: 'Failed to update spell' });
  }
});

app.post('/api/characters/:id/spells/:spellId/cast', async (req, res) => {
  try {
    const { id: characterId, spellId } = req.params;
    const char = await pool.query('SELECT id FROM characters WHERE id = $1', [characterId]);
    if (char.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    const spellLevel = await pool.query(
      `SELECT MIN(sc.level) AS level FROM spell_class sc
       WHERE sc.spell_id = $1
         AND EXISTS (SELECT 1 FROM character_classes cc WHERE cc.character_id = $2 AND cc.class_id = sc.class_id)`,
      [spellId, characterId]
    );
    if (spellLevel.rows.length === 0 || spellLevel.rows[0].level == null) {
      return res.status(400).json({ error: 'Spell level not found for this class' });
    }
    const level = spellLevel.rows[0].level;
    await pool.query(
      `UPDATE character_spells SET memorized = GREATEST(0, memorized - 1), modified = CURRENT_TIMESTAMP WHERE character_id = $1 AND spell_id = $2`,
      [characterId, spellId]
    );
    await pool.query(
      `INSERT INTO character_spells_cast (character_id, spell_level, numcast)
       VALUES ($1, $2, 1)
       ON CONFLICT (character_id, spell_level) DO UPDATE SET numcast = character_spells_cast.numcast + 1, modified = CURRENT_TIMESTAMP`,
      [characterId, level]
    );
    res.json({ message: 'Spell cast', spell_level: level });
  } catch (error) {
    console.error('Error recording spell cast:', error);
    res.status(500).json({ error: 'Failed to record cast' });
  }
});

// ==================== REFERENCE: RACES, CLASSES, ABILITIES, SPELLS, ITEMS ====================

function parseRulesetId(raw) {
  const text = typeof raw === 'number' && Number.isInteger(raw) ? String(raw) : raw;
  if (typeof text !== 'string' || !/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  if (!Number.isSafeInteger(id) || id > 2147483647) return null;
  return id;
}

/** Optional ?ruleset_id= on catalog lists. Missing means every ruleset. Invalid is 400. */
function readRulesetFilter(req, res) {
  if (!Object.prototype.hasOwnProperty.call(req.query, 'ruleset_id')) return { id: null };
  const id = parseRulesetId(req.query.ruleset_id);
  if (id == null) {
    res.status(400).json({ error: 'ruleset_id must be a positive integer' });
    return null;
  }
  return { id };
}

app.get('/api/rulesets', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name FROM ruleset ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching rulesets:', error);
    res.status(500).json({ error: 'Failed to fetch rulesets' });
  }
});

app.get('/api/races', async (req, res) => {
  try {
    const filter = readRulesetFilter(req, res);
    if (!filter) return;
    const result = filter.id == null
      ? await pool.query('SELECT * FROM races ORDER BY name')
      : await pool.query(
      `SELECT r.*,
         COALESCE(
           (SELECT json_agg(
              json_build_object(
                'int_param', ra.int_param,
                'str_param', ra.str_param,
                'description', a.description,
                'category_name', ac.name
              )
              ORDER BY ac.name NULLS LAST, a.description
            )
            FROM race_abilities ra
            JOIN abilities a ON a.id = ra.ability_id
            LEFT JOIN ability_categories ac ON ac.id = a.category
            WHERE ra.race_id = r.id),
           '[]'::json
         ) AS abilities
       FROM races r
       WHERE r.ruleset_id = $1
       ORDER BY r.name`,
      [filter.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching races:', error);
    res.status(500).json({ error: 'Failed to fetch races' });
  }
});

app.get('/api/races/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM races WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Race not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching race:', error);
    res.status(500).json({ error: 'Failed to fetch race' });
  }
});

app.get('/api/classes', async (req, res) => {
  try {
    const filter = readRulesetFilter(req, res);
    if (!filter) return;
    const result = filter.id == null
      ? await pool.query('SELECT * FROM classes ORDER BY name')
      : await pool.query(
      `SELECT c.*,
         parent.name AS subclass_name,
         COALESCE(
           (SELECT json_agg(
              json_build_object(
                'level', ca.level,
                'int_param', ca.int_param,
                'str_param', ca.str_param,
                'description', a.description,
                'category_name', ac.name
              )
              ORDER BY ca.level, ac.name NULLS LAST, a.description
            )
            FROM class_abilities ca
            JOIN abilities a ON a.id = ca.ability_id
            LEFT JOIN ability_categories ac ON ac.id = a.category
            WHERE ca.class_id = c.id),
           '[]'::json
         ) AS abilities,
         COALESCE(
           (SELECT json_agg(
              json_build_object(
                'level', cl.level,
                'xp', cl.xp,
                'hd', cl.hd,
                'hp', cl.hp,
                'ab', cl.ab
              )
              ORDER BY cl.level
            )
            FROM class_leveling cl
            WHERE cl.class_id = c.id),
           '[]'::json
         ) AS leveling,
         COALESCE(
           (SELECT json_agg(
              json_build_object(
                'char_level', cs.char_level,
                'level1', cs.level1,
                'level2', cs.level2,
                'level3', cs.level3,
                'level4', cs.level4,
                'level5', cs.level5,
                'level6', cs.level6,
                'level7', cs.level7
              )
              ORDER BY cs.char_level
            )
            FROM class_spells cs
            WHERE cs.class_id = c.id),
           '[]'::json
         ) AS spell_slots
       FROM classes c
       LEFT JOIN classes parent ON parent.id = c.subclass_of
       WHERE c.ruleset_id = $1
       ORDER BY c.name`,
      [filter.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

app.get('/api/classes/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM classes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching class:', error);
    res.status(500).json({ error: 'Failed to fetch class' });
  }
});

app.get('/api/classes/:id/leveling', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM class_leveling WHERE class_id = $1 ORDER BY level',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching class leveling:', error);
    res.status(500).json({ error: 'Failed to fetch class leveling' });
  }
});

app.get('/api/abilities', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, ac.name as category_name FROM abilities a LEFT JOIN ability_categories ac ON a.category = ac.id ORDER BY a.description`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching abilities:', error);
    res.status(500).json({ error: 'Failed to fetch abilities' });
  }
});

app.get('/api/spells', async (req, res) => {
  try {
    const filter = readRulesetFilter(req, res);
    if (!filter) return;
    const result = await pool.query(
      `SELECT * FROM spells
       WHERE ($1::int IS NULL OR ruleset_id = $1)
       ORDER BY name`,
      [filter.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching spells:', error);
    res.status(500).json({ error: 'Failed to fetch spells' });
  }
});

app.get('/api/spells/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM spells WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Spell not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching spell:', error);
    res.status(500).json({ error: 'Failed to fetch spell' });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    const filter = readRulesetFilter(req, res);
    if (!filter) return;
    const result = await pool.query(
      `SELECT i.*, ic.name as category_name, it.name as type_name
       FROM items i
       LEFT JOIN item_categories ic ON i.category = ic.id
       LEFT JOIN item_types it ON i.type = it.id
       WHERE ($1::int IS NULL OR i.ruleset_id = $1)
       ORDER BY i.name`,
      [filter.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, ic.name as category_name, it.name as type_name
       FROM items i
       LEFT JOIN item_categories ic ON i.category = ic.id
       LEFT JOIN item_types it ON i.type = it.id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

app.get('/api/ability-categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ability_categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching ability categories:', error);
    res.status(500).json({ error: 'Failed to fetch ability categories' });
  }
});

app.get('/api/item-categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM item_categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching item categories:', error);
    res.status(500).json({ error: 'Failed to fetch item categories' });
  }
});

app.get('/api/item-types', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM item_types ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching item types:', error);
    res.status(500).json({ error: 'Failed to fetch item types' });
  }
});

// ==================== PLAYER / GM (database-backed, replaces RabbitMQ) ====================

// List characters for a player (by user name)
app.get('/api/player/characters', async (req, res) => {
  try {
    const user = (req.query.user || '').toString().trim();
    if (!user) {
      return res.status(400).json({ error: 'Query parameter "user" is required' });
    }
    const result = await pool.query(
      `SELECT c.id, c.name, c."user", c.level, c.xp, c.hp, r.name as race_name, ${SQL_CHAR_CLASS_NAME} AS class_name,
       (SELECT array_agg(cc.campaign_id) FROM campaign_character cc WHERE cc.character_id = c.id) AS campaign_ids,
       (SELECT array_agg(cam.name) FROM campaign_character cc JOIN campaign cam ON cam.id = cc.campaign_id WHERE cc.character_id = c.id) AS campaign_names
       FROM characters c
       LEFT JOIN races r ON c.race = r.id
       WHERE c."user" = $1
       ORDER BY c.name`,
      [user.toUpperCase()]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching player characters:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch player characters' });
  }
});

// Party list: characters in this campaign (for "Send stuff" recipient list)
app.get('/api/campaigns/:campaignId/party', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c."user", c.hp
       FROM characters c
       INNER JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
       ORDER BY c.name`,
      [req.params.campaignId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching party:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch party' });
  }
});

// GM: create a campaign command (give_xp, give_gold, give_item, open_shop, new_round, new_day, switch_tab)
app.post('/api/campaigns/:campaignId/commands', async (req, res) => {
  try {
    const { recipient_character_id, type, payload } = req.body;
    const campaignId = req.params.campaignId;
    const result = await pool.query(
      `INSERT INTO campaign_command (campaign_id, recipient_character_id, type, payload)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [campaignId, recipient_character_id ?? null, type || 'none', payload ? JSON.stringify(payload) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating campaign command:', error);
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'campaign_command table missing. Run database/migrate_player_gm.sql (see README).' });
    }
    res.status(500).json({ error: error.message || 'Failed to create command' });
  }
});

// Player: list unread commands for this character (campaign-level + addressed to this character)
app.get('/api/characters/:characterId/commands', async (req, res) => {
  try {
    const characterId = req.params.characterId;
    const campaignIds = await pool.query(
      'SELECT campaign_id FROM campaign_character WHERE character_id = $1',
      [characterId]
    );
    const ids = campaignIds.rows.map((r) => r.campaign_id);
    if (ids.length === 0) {
      return res.json([]);
    }
    const result = await pool.query(
      `SELECT id, campaign_id, recipient_character_id, type, payload, created_at
       FROM campaign_command
       WHERE campaign_id = ANY($1::int[])
         AND read_at IS NULL
         AND (recipient_character_id IS NULL OR recipient_character_id = $2)
       ORDER BY created_at`,
      [ids, characterId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching character commands:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch commands' });
  }
});

// Player: mark command read (and apply give_xp / give_gold / give_item to character)
app.patch('/api/commands/:id/read', async (req, res) => {
  try {
    const cmdId = req.params.id;
    const charResult = await pool.query(
      'SELECT * FROM campaign_command WHERE id = $1 AND read_at IS NULL',
      [cmdId]
    );
    if (charResult.rows.length === 0) {
      return res.status(404).json({ error: 'Command not found or already read' });
    }
    const cmd = charResult.rows[0];
    const characterId = cmd.recipient_character_id;
    if (!characterId) {
      await pool.query('UPDATE campaign_command SET read_at = CURRENT_TIMESTAMP WHERE id = $1', [cmdId]);
      return res.json({ id: cmdId, read_at: new Date().toISOString() });
    }
    const payload = cmd.payload || {};
    if (cmd.type === 'give_xp' && payload.amount != null) {
      await pool.query(
        'UPDATE characters SET xp = COALESCE(xp, 0) + $1, modified = CURRENT_TIMESTAMP WHERE id = $2',
        [payload.amount, characterId]
      );
    } else if (cmd.type === 'give_gold' && payload.amount_cp != null) {
      await pool.query(
        'UPDATE characters SET money = COALESCE(money, 0) + $1, modified = CURRENT_TIMESTAMP WHERE id = $2',
        [payload.amount_cp, characterId]
      );
    } else if (cmd.type === 'give_item' && payload.item_id != null) {
      const idResult = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM character_items');
      await pool.query(
        `INSERT INTO character_items (id, character_id, item_id, quantity, bonus, value)
         SELECT $1, $2, $3, $4, $5, $6
         WHERE EXISTS (SELECT 1 FROM characters WHERE id = $2)`,
        [idResult.rows[0].next_id, characterId, payload.item_id, payload.quantity ?? 1, payload.bonus ?? 0, payload.value ?? 0]
      );
    }
    await pool.query('UPDATE campaign_command SET read_at = CURRENT_TIMESTAMP WHERE id = $1', [cmdId]);
    res.json({ id: cmdId, read_at: new Date().toISOString() });
  } catch (error) {
    console.error('Error marking command read:', error);
    res.status(500).json({ error: error.message || 'Failed to mark read' });
  }
});

// Player: create a transfer (send items/gold to another character)
app.post('/api/characters/:characterId/transfers', async (req, res) => {
  try {
    const fromId = req.params.characterId;
    const { to_character_id, gold_cp = 0, items = [] } = req.body;
    if (!to_character_id || (gold_cp <= 0 && (!items || items.length === 0))) {
      return res.status(400).json({ error: 'to_character_id and (gold_cp > 0 or non-empty items) required' });
    }
    const result = await pool.query(
      `INSERT INTO character_transfer (from_character_id, to_character_id, gold_cp, payload, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [fromId, to_character_id, gold_cp || 0, JSON.stringify({ items })]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating transfer:', error);
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'character_transfer table missing. Run database/migrate_player_gm.sql.' });
    }
    res.status(500).json({ error: error.message || 'Failed to create transfer' });
  }
});

// List transfers (incoming pending for this character, or outgoing)
app.get('/api/characters/:characterId/transfers', async (req, res) => {
  try {
    const direction = (req.query.direction || 'incoming').toString();
    const characterId = req.params.characterId;
    if (direction === 'outgoing') {
      const result = await pool.query(
        `SELECT t.*, c.name as to_name, c."user" as to_user
         FROM character_transfer t
         JOIN characters c ON c.id = t.to_character_id
         WHERE t.from_character_id = $1
         ORDER BY t.created_at DESC`,
        [characterId]
      );
      return res.json(result.rows);
    }
    const result = await pool.query(
      `SELECT t.*, c.name as from_name, c."user" as from_user
       FROM character_transfer t
       JOIN characters c ON c.id = t.from_character_id
       WHERE t.to_character_id = $1
       ORDER BY t.created_at DESC`,
      [characterId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transfers:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch transfers' });
  }
});

// Accept or reject an incoming transfer
app.patch('/api/transfers/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (status !== 'accepted' && status !== 'rejected') {
      return res.status(400).json({ error: 'status must be accepted or rejected' });
    }
    const transferResult = await pool.query(
      'SELECT * FROM character_transfer WHERE id = $1 AND status = $2',
      [req.params.id, 'pending']
    );
    if (transferResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found or not pending' });
    }
    const t = transferResult.rows[0];
    if (status === 'accepted') {
      if (t.gold_cp > 0) {
        await pool.query(
          'UPDATE characters SET money = COALESCE(money, 0) + $1, modified = CURRENT_TIMESTAMP WHERE id = $2',
          [t.gold_cp, t.to_character_id]
        );
        await pool.query(
          'UPDATE characters SET money = COALESCE(money, 0) - $1, modified = CURRENT_TIMESTAMP WHERE id = $2',
          [t.gold_cp, t.from_character_id]
        );
      }
      const payload = t.payload || {};
      const items = payload.items || [];
      for (const it of items) {
        const charItemId = it.character_item_id;
        const qty = Math.max(1, it.quantity || 1);
        const fromRow = await pool.query(
          'SELECT id, character_id, item_id, quantity, bonus, value, name, description FROM character_items WHERE id = $1 AND character_id = $2',
          [charItemId, t.from_character_id]
        );
        if (fromRow.rows.length > 0) {
          const fr = fromRow.rows[0];
          const transferQty = Math.min(fr.quantity, qty);
          const nextIdResult = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM character_items');
          await pool.query(
            `INSERT INTO character_items (id, character_id, item_id, quantity, bonus, value, name, description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [nextIdResult.rows[0].next_id, t.to_character_id, fr.item_id, transferQty, fr.bonus || 0, fr.value || 0, fr.name, fr.description]
          );
          if (fr.quantity <= transferQty) {
            await pool.query('DELETE FROM character_items WHERE id = $1 AND character_id = $2', [charItemId, t.from_character_id]);
          } else {
            await pool.query(
              'UPDATE character_items SET quantity = quantity - $1, modified = CURRENT_TIMESTAMP WHERE id = $2 AND character_id = $3',
              [transferQty, charItemId, t.from_character_id]
            );
          }
        }
      }
    }
    await pool.query(
      'UPDATE character_transfer SET status = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, req.params.id]
    );
    const updated = await pool.query('SELECT * FROM character_transfer WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error updating transfer:', error);
    res.status(500).json({ error: error.message || 'Failed to update transfer' });
  }
});

// ==================== HEALTH ====================

app.get('/api/health', (req, res) => {
  const payload = {
    status: isReady ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
    version: process.env.VERSION || 'dev',
  };
  if (isReady) {
    res.status(200).json(payload);
  } else {
    res.status(503).json(payload);
  }
});

function startServer(portToUse = port) {
  return app.listen(portToUse, () => {
    console.log(`RPGHub server running on port ${portToUse}`);
    isReady = true;
  });
}

if (require.main === module) {
  startServer();
} else {
  module.exports = { app, startServer };
}
