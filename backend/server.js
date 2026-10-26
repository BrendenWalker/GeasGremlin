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
const { assignmentError } = require('./classAssignment');
const {
  COOKIE,
  SESSION_SECONDS,
  hashToken,
  newToken,
  hashPassword,
  checkPassword,
  readCookie,
  sessionCookie,
  clearSessionCookie,
  usernameOk,
  passwordOk,
} = require('./auth');

const app = express();
const port = process.env.PORT || 8140;

let isReady = false;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const pool = createDbPool({
  database: process.env.DB_NAME || 'geasgremlin',
});

testConnection(pool);

/** Subqueries for primary class + labels (characters.class column removed; use character_classes). */
const SQL_CHAR_CLASS_NAME = `(SELECT CASE
  WHEN c.quasiclass IS NULL THEN (
    SELECT string_agg(cl.name, ', ' ORDER BY cc.sort_order, cc.class_id)
    FROM character_classes cc
    JOIN classes cl ON cl.id = cc.class_id
    WHERE cc.character_id = c.id
  )
  ELSE (
    SELECT qc.name || COALESCE(' (' || string_agg(cl.name, ', ' ORDER BY cc.sort_order, cc.class_id) || ')', '')
    FROM classes qc
    LEFT JOIN character_classes cc ON cc.character_id = c.id
    LEFT JOIN classes cl ON cl.id = cc.class_id
    WHERE qc.id = c.quasiclass
    GROUP BY qc.name
  )
END)`;
const SQL_CHAR_PRIMARY_CLASS_ID =
  '(SELECT cc.class_id FROM character_classes cc WHERE cc.character_id = c.id ORDER BY cc.sort_order, cc.class_id LIMIT 1)';
const SQL_CHAR_CLASSES_JSON =
  '(SELECT json_agg(json_build_object(\'class_id\', cc.class_id, \'class_level\', cc.class_level, \'sort_order\', cc.sort_order, \'name\', cl.name) ORDER BY cc.sort_order, cc.class_id) FROM character_classes cc JOIN classes cl ON cl.id = cc.class_id WHERE cc.character_id = c.id)';

async function readClass(id) {
  if (id == null || id === '') return { row: null };
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return { error: 'Invalid class' };
  const result = await pool.query(
    'SELECT id, ruleset_id, is_quasi FROM classes WHERE id = $1',
    [n]
  );
  if (result.rows.length === 0) return { error: 'Invalid class' };
  return { row: result.rows[0] };
}

function primaryClassIdFromBody(body, fallback) {
  if (Object.prototype.hasOwnProperty.call(body, 'character_classes') && Array.isArray(body.character_classes)) {
    const rows = body.character_classes.filter((cc) => cc && cc.class_id != null && cc.class_id !== '');
    if (rows.length === 0) return null;
    rows.sort((a, b) => {
      const so = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      if (so !== 0) return so;
      return Number(a.class_id) - Number(b.class_id);
    });
    return rows[0].class_id;
  }
  return fallback;
}

async function classAssignmentMessage(rulesetId, classId, quasiclassId) {
  const base = await readClass(classId);
  if (base.error) return base.error;
  const quasi = await readClass(quasiclassId);
  if (quasi.error) return quasi.error;
  return assignmentError(rulesetId, base.row, quasi.row);
}

async function loadSessionUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id, u.username
     FROM app_session s
     JOIN app_user u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
    [hashToken(token)]
  );
  return result.rows[0] || null;
}

async function startSession(res, userId) {
  const token = newToken();
  await pool.query(
    `INSERT INTO app_session (token_hash, user_id, expires_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second'))`,
    [hashToken(token), userId, SESSION_SECONDS]
  );
  res.setHeader('Set-Cookie', sessionCookie(token));
}

app.post('/api/register', async (req, res) => {
  const username = (req.body?.username || '').trim();
  const password = req.body?.password || '';
  if (!usernameOk(username)) {
    return res.status(400).json({ error: 'Username must be 3–80 letters, numbers, or underscores' });
  }
  if (!passwordOk(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const passwordHash = await hashPassword(password);
    const created = await pool.query(
      'INSERT INTO app_user (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );
    await startSession(res, created.rows[0].id);
    res.status(201).json(created.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Username is already taken' });
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Account tables are missing. Apply database/schema.sql.' });
    }
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

app.post('/api/login', async (req, res) => {
  const username = (req.body?.username || '').trim();
  const password = req.body?.password || '';
  try {
    const found = await pool.query(
      'SELECT id, username, password_hash FROM app_user WHERE lower(username) = lower($1)',
      [username]
    );
    const user = found.rows[0];
    if (!user || !(await checkPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Unknown username or password' });
    }
    await startSession(res, user.id);
    res.json({ id: user.id, username: user.username });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Account tables are missing. Apply database/schema.sql.' });
    }
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

app.post('/api/logout', async (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) {
    await pool.query('DELETE FROM app_session WHERE token_hash = $1', [hashToken(token)]).catch(() => {});
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ ok: true });
});

app.use(async (req, res, next) => {
  if (req.method === 'GET' && req.path === '/api/health') return next();
  try {
    const user = await loadSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Login required' });
    req.user = user;
    next();
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Account tables are missing. Apply database/schema.sql.' });
    }
    console.error('Error reading session:', error);
    res.status(500).json({ error: 'Failed to read session' });
  }
});

app.get('/api/me', (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

async function requireCampaign(req, res, campaignId, gmOnly) {
  const result = await pool.query(
    'SELECT role, status FROM campaign_member WHERE user_id = $1 AND campaign_id = $2',
    [req.user.id, campaignId]
  );
  const row = result.rows[0];
  if (!row || row.status !== 'accepted' || (gmOnly && row.role !== 'gm')) {
    res.status(404).json({ error: 'Campaign not found' });
    return null;
  }
  return row;
}

async function characterGate(req, res, characterId, edit) {
  const result = await pool.query(
    `SELECT m.role, c."user"
     FROM campaign_character cc
     JOIN campaign_member m ON m.campaign_id = cc.campaign_id AND m.user_id = $1 AND m.status = 'accepted'
     JOIN characters c ON c.id = cc.character_id
     WHERE cc.character_id = $2`,
    [req.user.id, characterId]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Character not found' });
    return null;
  }
  const gm = result.rows.some((row) => row.role === 'gm');
  const owner = String(result.rows[0].user || '').toLowerCase() === req.user.username.toLowerCase();
  if (edit && !gm && !owner) {
    res.status(404).json({ error: 'Character not found' });
    return null;
  }
  return { gm, owner };
}

// ==================== CAMPAIGNS ====================

app.get('/api/campaigns', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, r.name AS ruleset_name, m.role
       FROM campaign c
       JOIN ruleset r ON r.id = c.ruleset_id
       JOIN campaign_member m ON m.campaign_id = c.id
       WHERE m.user_id = $1 AND m.status = 'accepted'
       ORDER BY c.name`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Campaign table does not exist. Run database/schema.sql on your geasgremlin database (see README).' });
    }
    res.status(500).json({ error: error.message || 'Failed to fetch campaigns' });
  }
});

app.get('/api/campaigns/:id', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.id, false);
    if (!member) return;
    const result = await pool.query(
      `SELECT c.*, r.name AS ruleset_name
       FROM campaign c
       JOIN ruleset r ON r.id = c.ruleset_id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ ...result.rows[0], role: member.role });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

app.post('/api/campaigns', async (req, res) => {
  try {
    const { name, ruleset_id: rulesetRaw } = req.body;
    const rulesetId = parseRulesetId(rulesetRaw);
    if (rulesetId == null) {
      return res.status(400).json({ error: 'ruleset_id must be a positive integer' });
    }
    const ruleset = await pool.query('SELECT id FROM ruleset WHERE id = $1', [rulesetId]);
    if (ruleset.rows.length === 0) {
      return res.status(400).json({ error: 'Unknown ruleset' });
    }
    const result = await pool.query(
      'INSERT INTO campaign (name, ruleset_id) VALUES ($1, $2) RETURNING *',
      [name, rulesetId]
    );
    await pool.query(
      `INSERT INTO campaign_member (campaign_id, user_id, role, status)
       VALUES ($1, $2, 'gm', 'accepted')`,
      [result.rows[0].id, req.user.id]
    );
    res.status(201).json({ ...result.rows[0], role: 'gm' });
  } catch (error) {
    console.error('Error creating campaign:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Campaign name already exists' });
    }
    if (error.code === '42P01') {
      return res.status(503).json({ error: 'Campaign table does not exist. Run database/schema.sql on your geasgremlin database (see README).' });
    }
    res.status(500).json({ error: error.message || 'Failed to create campaign' });
  }
});

app.put('/api/campaigns/:id', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.id, true);
    if (!member) return;
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

app.post('/api/campaigns/:id/start', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.id, false);
    if (!member) return;
    if (member.role === 'gm') {
      const result = await pool.query(
        'UPDATE campaign SET running = true, modified = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
      return res.json({ ...result.rows[0], role: member.role });
    }
    const result = await pool.query('SELECT * FROM campaign WHERE id = $1', [req.params.id]);
    if (!result.rows[0]?.running) {
      return res.status(409).json({ error: 'Campaign has not been started' });
    }
    res.json({ ...result.rows[0], role: member.role });
  } catch (error) {
    console.error('Error starting campaign:', error);
    if (error.code === '42703') {
      return res.status(503).json({ error: 'Campaign.running is missing. Re-run database/schema.sql as the table owner.' });
    }
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

app.post('/api/campaigns/:id/pause', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.id, true);
    if (!member) return;
    const result = await pool.query(
      'UPDATE campaign SET running = false, modified = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ ...result.rows[0], role: member.role });
  } catch (error) {
    console.error('Error pausing campaign:', error);
    if (error.code === '42703') {
      return res.status(503).json({ error: 'Campaign.running is missing. Re-run database/schema.sql as the table owner.' });
    }
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
});

app.delete('/api/campaigns/:id', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.id, true);
    if (!member) return;
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

app.get('/api/invites', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name
       FROM campaign_member m
       JOIN campaign c ON c.id = m.campaign_id
       WHERE m.user_id = $1 AND m.status = 'invited'
       ORDER BY c.name`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing invites:', error);
    res.status(500).json({ error: 'Failed to list invites' });
  }
});

app.post('/api/campaigns/:id/members', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.id, true);
    if (!member) return;
    const username = (req.body?.username || '').trim();
    if (!usernameOk(username)) {
      return res.status(400).json({ error: 'Username must be 3–80 letters, numbers, or underscores' });
    }
    const found = await pool.query(
      'SELECT id, username FROM app_user WHERE lower(username) = lower($1)',
      [username]
    );
    if (!found.rows[0]) return res.status(400).json({ error: 'Unknown username' });
    if (found.rows[0].id === req.user.id) return res.status(400).json({ error: 'You already belong to this campaign' });
    const inserted = await pool.query(
      `INSERT INTO campaign_member (campaign_id, user_id, role, status)
       VALUES ($1, $2, 'player', 'invited')
       ON CONFLICT (campaign_id, user_id) DO NOTHING
       RETURNING status`,
      [req.params.id, found.rows[0].id]
    );
    if (inserted.rows.length === 0) {
      return res.status(409).json({ error: 'That user already has an invite or membership' });
    }
    res.status(201).json({ username: found.rows[0].username, status: 'invited' });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ error: 'Failed to invite' });
  }
});

app.post('/api/invites/:campaignId/accept', async (req, res) => {
  try {
    const updated = await pool.query(
      `UPDATE campaign_member SET status = 'accepted'
       WHERE campaign_id = $1 AND user_id = $2 AND status = 'invited'
       RETURNING campaign_id`,
      [req.params.campaignId, req.user.id]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Invite not found' });
    res.json({ campaign_id: updated.rows[0].campaign_id, status: 'accepted' });
  } catch (error) {
    console.error('Error accepting invite:', error);
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

app.post('/api/invites/:campaignId/decline', async (req, res) => {
  try {
    const removed = await pool.query(
      `DELETE FROM campaign_member
       WHERE campaign_id = $1 AND user_id = $2 AND status = 'invited'
       RETURNING campaign_id`,
      [req.params.campaignId, req.user.id]
    );
    if (removed.rows.length === 0) return res.status(404).json({ error: 'Invite not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error declining invite:', error);
    res.status(500).json({ error: 'Failed to decline invite' });
  }
});

// ==================== CHARACTERS ====================

app.get('/api/campaigns/:campaignId/characters', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, false);
    if (!member) return;
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
    const gate = await characterGate(req, res, req.params.id, false);
    if (!gate) return;
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
    let effects = { rows: [] };
    let casts = { rows: [] };
    try {
      [abil, spells, items, effects, casts] = await Promise.all([
        pool.query(
          `SELECT ca.*, a.description as ability_description,
                  a.stat_modifier, s.name as stat_name, ac.name as category_name
           FROM character_abilities ca
           JOIN abilities a ON ca.ability_id = a.id
           LEFT JOIN stat s ON s.id = a.stat_id
           LEFT JOIN ability_categories ac ON ac.id = s.category
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
            i.weight as item_weight, i.attackbonus as item_attackbonus, i.damagebonus as item_damagebonus, i.damage as item_damage,
            i.ac as item_ac, i.ac_melee as item_ac_melee, i.ac_ranged as item_ac_ranged,
            i.range_short as item_range_short, i.range_medium as item_range_medium, i.range_long as item_range_long,
            i.rof as item_rof, i.category as item_category
           FROM character_items ci
           LEFT JOIN items i ON ci.item_id = i.id
           WHERE ci.character_id = $1`,
          [req.params.id]
        ),
        pool.query(
          `SELECT id, effect, note, value, duration
           FROM character_effects WHERE character_id = $1 ORDER BY id`,
          [req.params.id]
        ),
        pool.query(
          `SELECT spell_level, numcast
           FROM character_spells_cast WHERE character_id = $1 ORDER BY spell_level`,
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
    character.effects = effects.rows;
    character.spells_cast = casts.rows;

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
    const member = await requireCampaign(req, res, campaignId, false);
    if (!member) return;
    const {
      name, gender, age, hair, eyes, height, weight, race, class: classId,
      str, int: intVal, wis, dex, con, chr, hp, notes, quasiclass, level, xp, skillpoints, money,
      ruleset_id: rulesetRaw,
    } = req.body;
    const campaignRow = await pool.query('SELECT ruleset_id FROM campaign WHERE id = $1', [campaignId]);
    const campaignRuleset = campaignRow.rows[0] ? Number(campaignRow.rows[0].ruleset_id) : null;
    if (campaignRuleset == null) {
      return res.status(400).json({ error: 'Campaign has no ruleset' });
    }
    const sentRuleset = rulesetRaw == null || rulesetRaw === '' ? campaignRuleset : parseRulesetId(rulesetRaw);
    if (sentRuleset == null) {
      return res.status(400).json({ error: 'ruleset_id must be a positive integer' });
    }
    if (sentRuleset !== campaignRuleset) {
      return res.status(400).json({ error: 'Character ruleset must match the campaign' });
    }
    const rulesetId = campaignRuleset;
    const assignmentMessage = await classAssignmentMessage(rulesetId, classId, quasiclass);
    if (assignmentMessage) {
      return res.status(400).json({ error: assignmentMessage });
    }
    const idResult = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM characters');
    const nextId = idResult.rows[0].next_id;
    const result = await pool.query(
      `INSERT INTO characters (id, name, "user", gender, age, hair, eyes, height, weight, race,
       str, "int", wis, dex, con, chr, hp, notes, quasiclass, level, xp, skillpoints, money, ruleset_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       RETURNING *`,
      [nextId, name || 'Unnamed', req.user.username, gender || null, age ?? null, hair || null, eyes || null, height || null, weight || null,
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
      return res.status(503).json({ error: 'Characters table does not exist. Run the full database/schema.sql on your geasgremlin database (see README).' });
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
    const gate = await characterGate(req, res, id, true);
    if (!gate) return;
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
    const baseId = primaryClassIdFromBody(body, merged.class);
    if (Object.prototype.hasOwnProperty.call(body, 'character_classes') && Array.isArray(body.character_classes)) {
      for (const cc of body.character_classes) {
        if (cc == null || cc.class_id == null || cc.class_id === '') continue;
        const extra = await readClass(cc.class_id);
        if (extra.error) return res.status(400).json({ error: extra.error });
        if (extra.row && extra.row.is_quasi) {
          return res.status(400).json({ error: 'Base class cannot be a quasi-class' });
        }
        if (extra.row && Number(extra.row.ruleset_id) !== Number(row.ruleset_id)) {
          return res.status(400).json({ error: 'Base class is not in this ruleset' });
        }
      }
    }
    const assignmentMessage = await classAssignmentMessage(row.ruleset_id, baseId, merged.quasiclass);
    if (assignmentMessage) {
      return res.status(400).json({ error: assignmentMessage });
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
  const gate = await characterGate(req, res, req.params.id, true);
  if (!gate) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = req.params.id;
    await client.query('DELETE FROM character_abilities WHERE character_id = $1', [id]);
    await client.query('DELETE FROM character_effects WHERE character_id = $1', [id]);
    await client.query('DELETE FROM character_items WHERE character_id = $1', [id]);
    await client.query('DELETE FROM character_spells WHERE character_id = $1', [id]);
    await client.query('DELETE FROM character_spells_cast WHERE character_id = $1', [id]);
    const result = await client.query('DELETE FROM characters WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Character not found' });
    }
    await client.query('COMMIT');
    res.json({ message: 'Character deleted successfully' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    console.error('Error deleting character:', error);
    res.status(500).json({ error: 'Failed to delete character' });
  } finally {
    client.release();
  }
});

// ==================== CHARACTER ITEMS ====================

app.post('/api/characters/:id/items', async (req, res) => {
  try {
    const gate = await characterGate(req, res, req.params.id, true);
    if (!gate) return;
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
        i.attackbonus as item_attackbonus, i.damagebonus as item_damagebonus, i.damage as item_damage, i.ac as item_ac,
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
    const gate = await characterGate(req, res, req.params.id, true);
    if (!gate) return;
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
    const gate = await characterGate(req, res, req.params.id, true);
    if (!gate) return;
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
    const gate = await characterGate(req, res, req.params.id, true);
    if (!gate) return;
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
    const gate = await characterGate(req, res, req.params.id, true);
    if (!gate) return;
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
    const gate = await characterGate(req, res, characterId, true);
    if (!gate) return;
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
    let result;
    try {
      result = await pool.query('SELECT id, name, mechanic FROM ruleset ORDER BY name');
    } catch (error) {
      if (error.code !== '42703') throw error;
      console.error('ruleset.mechanic is missing; serving bfrpg until the column is added');
      result = await pool.query('SELECT id, name FROM ruleset ORDER BY name');
    }
    const attrs = await pool.query(
      `SELECT s.name
       FROM stat s
       JOIN ability_categories ac ON ac.id = s.category
       WHERE ac.name = 'Attribute'
       ORDER BY s.id`
    );
    const attributeStats = attrs.rows.map((row) => row.name);
    res.json(result.rows.map((row) => ({
      ...row,
      mechanic: row.mechanic || 'bfrpg',
      attribute_stats: attributeStats,
    })));
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
                'category_name', ac.name,
                'stat_name', s.name,
                'stat_modifier', a.stat_modifier
              )
              ORDER BY ac.name NULLS LAST, a.description
            )
            FROM race_abilities ra
            JOIN abilities a ON a.id = ra.ability_id
            LEFT JOIN stat s ON s.id = a.stat_id
            LEFT JOIN ability_categories ac ON ac.id = s.category
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
                'ability_id', ca.ability_id,
                'level', ca.level,
                'int_param', ca.int_param,
                'str_param', ca.str_param,
                'description', a.description,
                'category_name', ac.name,
                'stat_name', s.name,
                'stat_modifier', a.stat_modifier
              )
              ORDER BY ca.level, ac.name NULLS LAST, a.description
            )
            FROM class_abilities ca
            JOIN abilities a ON a.id = ca.ability_id
            LEFT JOIN stat s ON s.id = a.stat_id
            LEFT JOIN ability_categories ac ON ac.id = s.category
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
      `SELECT a.*, s.name as stat_name, ac.name as category_name
       FROM abilities a
       LEFT JOIN stat s ON s.id = a.stat_id
       LEFT JOIN ability_categories ac ON ac.id = s.category
       ORDER BY a.description`
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

function storedError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function integerField(value, name) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isInteger(n)) throw storedError(`${name} must be an integer`, 400);
  return n;
}

const STORED_CHARACTER_FIELDS = ['xp', 'level', 'hp', 'money'];

async function applyStoredCharacterPatch(client, characterId, patch) {
  if (!patch || typeof patch !== 'object') return;
  const sets = [];
  const values = [];
  for (const key of STORED_CHARACTER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    values.push(integerField(patch[key], key));
    sets.push(`${key} = $${values.length}`);
  }
  if (sets.length === 0) return;
  values.push(characterId);
  const result = await client.query(
    `UPDATE characters SET ${sets.join(', ')}, modified = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
    values
  );
  if (result.rowCount === 0) throw storedError('Character not found', 404);
}

async function applyPrimaryClassLevel(client, characterId, primary) {
  if (!primary) return;
  const classId = integerField(primary.class_id, 'class_id');
  const classLevel = integerField(primary.class_level, 'class_level');
  if (classId == null || classLevel == null) throw storedError('primary_class requires class_id and class_level', 400);
  const updated = await client.query(
    `UPDATE character_classes SET class_level = $1, modified = CURRENT_TIMESTAMP
     WHERE character_id = $2 AND class_id = $3`,
    [classLevel, characterId, classId]
  );
  if (updated.rowCount === 0) throw storedError('Class is not on this character', 400);
}

async function insertStoredItem(client, characterId, item) {
  const itemId = integerField(item.item_id, 'item_id');
  const quantity = integerField(item.quantity == null ? 1 : item.quantity, 'quantity');
  const bonus = integerField(item.bonus == null ? 0 : item.bonus, 'bonus');
  const value = integerField(item.value == null ? 0 : item.value, 'value');
  if (itemId == null || quantity == null || quantity < 1 || bonus == null || value == null) {
    throw storedError('item requires item_id and a positive quantity', 400);
  }
  const idResult = await client.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM character_items');
  const inserted = await client.query(
    `INSERT INTO character_items (id, character_id, item_id, quantity, bonus, value)
     SELECT $1, $2, $3, $4, $5, $6
     WHERE EXISTS (SELECT 1 FROM characters WHERE id = $2)`,
    [idResult.rows[0].next_id, characterId, itemId, quantity, bonus, value]
  );
  if (inserted.rowCount === 0) throw storedError('Character not found', 404);
}

async function moveStoredItem(client, fromCharacterId, toCharacterId, characterItemId, quantity) {
  const itemId = integerField(characterItemId, 'character_item_id');
  const qty = integerField(quantity, 'quantity');
  if (itemId == null || qty == null || qty < 1) throw storedError('item quantity must be a positive integer', 400);
  const fromRow = await client.query(
    `SELECT id, item_id, quantity, bonus, value, name, description
     FROM character_items WHERE id = $1 AND character_id = $2`,
    [itemId, fromCharacterId]
  );
  if (fromRow.rows.length === 0) throw storedError('Item is not on the sending character', 400);
  const fr = fromRow.rows[0];
  const owned = Number(fr.quantity) || 0;
  const transferQty = Math.min(owned, qty);
  if (transferQty < 1) throw storedError('Not enough of that item', 400);
  const nextIdResult = await client.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM character_items');
  await client.query(
    `INSERT INTO character_items (id, character_id, item_id, quantity, bonus, value, name, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [nextIdResult.rows[0].next_id, toCharacterId, fr.item_id, transferQty, fr.bonus || 0, fr.value || 0, fr.name, fr.description]
  );
  if (owned <= transferQty) {
    await client.query('DELETE FROM character_items WHERE id = $1 AND character_id = $2', [itemId, fromCharacterId]);
  } else {
    await client.query(
      'UPDATE character_items SET quantity = quantity - $1, modified = CURRENT_TIMESTAMP WHERE id = $2 AND character_id = $3',
      [transferQty, itemId, fromCharacterId]
    );
  }
}

async function applyStoredAbilities(client, characterId, abilities) {
  if (!Array.isArray(abilities)) return;
  for (const row of abilities) {
    if (!row || typeof row !== 'object') throw storedError('ability is invalid', 400);
    const abilityId = integerField(row.ability_id, 'ability_id');
    if (abilityId == null) throw storedError('ability_id is required', 400);
    const mod = Object.prototype.hasOwnProperty.call(row, 'mod') ? integerField(row.mod, 'mod') : null;
    await client.query(
      `INSERT INTO character_abilities (character_id, ability_id, mod)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id, ability_id) DO UPDATE SET mod = EXCLUDED.mod, modified = CURRENT_TIMESTAMP`,
      [characterId, abilityId, mod]
    );
  }
}

async function applyStoredCasts(client, characterId, casts) {
  if (!Array.isArray(casts)) return;
  for (const row of casts) {
    if (!row || typeof row !== 'object') throw storedError('cast row is invalid', 400);
    const spellLevel = integerField(row.spell_level, 'spell_level');
    const numcast = integerField(row.numcast, 'numcast');
    if (spellLevel == null || numcast == null || numcast < 0) {
      throw storedError('cast row requires spell_level and numcast', 400);
    }
    await client.query(
      `INSERT INTO character_spells_cast (character_id, spell_level, numcast)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id, spell_level) DO UPDATE SET numcast = EXCLUDED.numcast, modified = CURRENT_TIMESTAMP`,
      [characterId, spellLevel, numcast]
    );
  }
}

async function applyStoredEffects(client, characterId, effects, deleteIds) {
  for (const rawId of deleteIds || []) {
    const id = integerField(rawId, 'effect id');
    if (id == null) throw storedError('effect id is required', 400);
    await client.query('DELETE FROM character_effects WHERE character_id = $1 AND id = $2', [characterId, id]);
  }
  for (const row of effects || []) {
    if (!row || typeof row !== 'object') throw storedError('effect is invalid', 400);
    const id = integerField(row.id, 'effect id');
    const duration = integerField(row.duration, 'duration');
    if (id == null || duration == null) throw storedError('effect requires id and duration', 400);
    const updated = await client.query(
      `UPDATE character_effects SET duration = $1, modified = CURRENT_TIMESTAMP
       WHERE character_id = $2 AND id = $3`,
      [duration, characterId, id]
    );
    if (updated.rowCount === 0) throw storedError('Effect is not on this character', 400);
  }
}

function sendStoredError(res, error, fallback) {
  if (error.code === '23503') {
    return res.status(400).json({ error: 'Invalid item or character reference' });
  }
  const status = error.status || 500;
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({ error: error.message || fallback });
}

// ==================== PLAYER / GM (database-backed, replaces RabbitMQ) ====================

// List characters for a player (by user name)
app.get('/api/player/characters', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c."user", c.level, c.xp, c.hp, r.name as race_name, ${SQL_CHAR_CLASS_NAME} AS class_name,
       (SELECT array_agg(cc.campaign_id) FROM campaign_character cc WHERE cc.character_id = c.id) AS campaign_ids,
       (SELECT array_agg(cam.name) FROM campaign_character cc JOIN campaign cam ON cam.id = cc.campaign_id WHERE cc.character_id = c.id) AS campaign_names
       FROM characters c
       LEFT JOIN races r ON c.race = r.id
       WHERE lower(c."user") = lower($1)
         AND EXISTS (
           SELECT 1 FROM campaign_character cc
           JOIN campaign_member m ON m.campaign_id = cc.campaign_id
           WHERE cc.character_id = c.id AND m.user_id = $2 AND m.status = 'accepted'
         )
       ORDER BY c.name`,
      [req.user.username, req.user.id]
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
    const member = await requireCampaign(req, res, req.params.campaignId, false);
    if (!member) return;
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
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
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
    const gate = await characterGate(req, res, req.params.characterId, true);
    if (!gate) return;
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

// Stamp a command and store the absolute rows the client already calculated.
// ponytail: two clients can each read the sheet and submit absolutes; the later commit wins.
// Upgrade path: compare a base value inside the locked row and return 409.
app.patch('/api/commands/:id/read', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cmdId = req.params.id;
    const charResult = await client.query(
      'SELECT * FROM campaign_command WHERE id = $1 AND read_at IS NULL FOR UPDATE',
      [cmdId]
    );
    if (charResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Command not found or already read' });
    }
    const commandRow = charResult.rows[0];
    if (commandRow.recipient_character_id) {
      const gate = await characterGate(req, res, commandRow.recipient_character_id, true);
      if (!gate) {
        await client.query('ROLLBACK');
        return;
      }
    } else {
      const member = await requireCampaign(req, res, commandRow.campaign_id, false);
      if (!member) {
        await client.query('ROLLBACK');
        return;
      }
    }
    const characterId = commandRow.recipient_character_id;
    const body = req.body || {};
    const hasSheet = body.character || body.primary_class || body.item
      || body.abilities || body.casts || body.effects || body.delete_effects;
    if (characterId && hasSheet) {
      await client.query('SELECT id FROM characters WHERE id = $1 FOR UPDATE', [characterId]);
      await applyStoredCharacterPatch(client, characterId, body.character);
      await applyPrimaryClassLevel(client, characterId, body.primary_class);
      if (body.item) await insertStoredItem(client, characterId, body.item);
      if (body.abilities) await applyStoredAbilities(client, characterId, body.abilities);
      if (body.casts) await applyStoredCasts(client, characterId, body.casts);
      if (body.effects || body.delete_effects) {
        await applyStoredEffects(client, characterId, body.effects, body.delete_effects);
      }
    }
    const stamped = await client.query(
      'UPDATE campaign_command SET read_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING read_at',
      [cmdId]
    );
    await client.query('COMMIT');
    res.json({ id: Number(cmdId), read_at: stamped.rows[0].read_at });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    sendStoredError(res, error, 'Failed to mark read');
  } finally {
    client.release();
  }
});

// Player: create a transfer (send items/gold to another character)
app.post('/api/characters/:characterId/transfers', async (req, res) => {
  try {
    const fromId = req.params.characterId;
    const gate = await characterGate(req, res, fromId, true);
    if (!gate) return;
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
    const gate = await characterGate(req, res, req.params.characterId, false);
    if (!gate) return;
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

// Store the absolute money and item moves the client calculated, then stamp status.
app.patch('/api/transfers/:id', async (req, res) => {
  const { status, from, to, items } = req.body || {};
  if (status !== 'accepted' && status !== 'rejected') {
    return res.status(400).json({ error: 'status must be accepted or rejected' });
  }
  const pending = await pool.query(
    'SELECT to_character_id FROM character_transfer WHERE id = $1 AND status = $2',
    [req.params.id, 'pending']
  );
  if (pending.rows.length === 0) {
    return res.status(404).json({ error: 'Transfer not found or not pending' });
  }
  const gate = await characterGate(req, res, pending.rows[0].to_character_id, true);
  if (!gate) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const transferResult = await client.query(
      'SELECT * FROM character_transfer WHERE id = $1 AND status = $2 FOR UPDATE',
      [req.params.id, 'pending']
    );
    if (transferResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transfer not found or not pending' });
    }
    const t = transferResult.rows[0];
    if (status === 'accepted') {
      if (!from || !to) throw storedError('accepted transfer requires from and to money', 400);
      if (Number(from.id) !== Number(t.from_character_id) || Number(to.id) !== Number(t.to_character_id)) {
        throw storedError('Transfer characters do not match', 400);
      }
      await client.query('SELECT id FROM characters WHERE id = ANY($1::int[]) FOR UPDATE', [[t.from_character_id, t.to_character_id]]);
      await applyStoredCharacterPatch(client, t.from_character_id, { money: from.money });
      await applyStoredCharacterPatch(client, t.to_character_id, { money: to.money });
      for (const it of items || []) {
        await moveStoredItem(client, t.from_character_id, t.to_character_id, it.character_item_id, it.quantity);
      }
    }
    await client.query(
      'UPDATE character_transfer SET status = $1, resolved_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, req.params.id]
    );
    const updated = await client.query('SELECT * FROM character_transfer WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    sendStoredError(res, error, 'Failed to update transfer');
  } finally {
    client.release();
  }
});

// Keep in step with frontend/src/domain/gameTime.mjs ROUND_SECONDS and DAY_SECONDS.
const ROUND_SECONDS = 10;
const DAY_SECONDS = 86400;
const PRESENCE_SECONDS = 30;

function adventuringMissing(res, error) {
  if (error.code === '42P01' || error.code === '42703') {
    res.status(503).json({ error: 'Adventuring tables are missing. Apply database/schema.sql.' });
    return true;
  }
  return false;
}

function positiveInt(value, name) {
  const n = integerField(value, name);
  if (n == null || n < 1) throw storedError(`${name} must be a positive integer`, 400);
  return n;
}

function nonNegativeInt(value, name) {
  const n = integerField(value, name);
  if (n == null || n < 0) throw storedError(`${name} must be a non-negative integer`, 400);
  return n;
}

async function loadAdventuring(campaignId) {
  const camp = await pool.query(
    `SELECT COALESCE(b.game_seconds, 0) AS game_seconds,
            COALESCE(b.in_encounter, false) AS in_encounter
     FROM campaign c
     LEFT JOIN campaign_board b ON b.campaign_id = c.id
     WHERE c.id = $1`,
    [campaignId]
  );
  if (camp.rows.length === 0) return null;
  const [enemies, characters, marks] = await Promise.all([
    pool.query(
      'SELECT id, name FROM campaign_enemy WHERE campaign_id = $1 ORDER BY id',
      [campaignId]
    ),
    pool.query(
      `SELECT c.id, c.name, c."user",
              (p.seen_at IS NOT NULL AND p.seen_at > CURRENT_TIMESTAMP - make_interval(secs => $2)) AS active
       FROM characters c
       INNER JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
       LEFT JOIN campaign_presence p ON p.campaign_id = cc.campaign_id AND p.character_id = c.id
       ORDER BY c.name`,
      [campaignId, PRESENCE_SECONDS]
    ),
    pool.query(
      `SELECT id, kind, note, at_seconds, duration_minutes
       FROM campaign_mark WHERE campaign_id = $1 ORDER BY at_seconds, id`,
      [campaignId]
    ),
  ]);
  return {
    game_seconds: camp.rows[0].game_seconds,
    in_encounter: camp.rows[0].in_encounter,
    enemies: enemies.rows,
    characters: characters.rows.map((row) => ({
      id: row.id,
      name: row.name,
      user: row.user,
      active: row.active === true,
    })),
    marks: marks.rows,
  };
}

async function queueForParty(campaignId, type, payload) {
  const result = await pool.query(
    `INSERT INTO campaign_command (campaign_id, recipient_character_id, type, payload)
     SELECT $1, cc.character_id, $2, $3::jsonb
     FROM campaign_character cc
     WHERE cc.campaign_id = $1`,
    [campaignId, type, payload == null ? null : JSON.stringify(payload)]
  );
  return result.rowCount;
}

app.get('/api/campaigns/:campaignId/adventuring', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const board = await loadAdventuring(req.params.campaignId);
    if (!board) return res.status(404).json({ error: 'Campaign not found' });
    res.json(board);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error fetching adventuring board:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch adventuring board' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/tick', async (req, res) => {
  const step = req.body?.step;
  const delta = step === 'round' ? ROUND_SECONDS : step === 'day' ? DAY_SECONDS : null;
  const commandType = step === 'round' ? 'new_round' : step === 'day' ? 'new_day' : null;
  if (delta == null) return res.status(400).json({ error: 'step must be round or day' });
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    await client.query('BEGIN');
    const updated = await client.query(
      `INSERT INTO campaign_board (campaign_id, game_seconds)
       VALUES ($1, $2)
       ON CONFLICT (campaign_id) DO UPDATE
       SET game_seconds = campaign_board.game_seconds + EXCLUDED.game_seconds
       RETURNING game_seconds`,
      [req.params.campaignId, delta]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const queued = await client.query(
      `INSERT INTO campaign_command (campaign_id, recipient_character_id, type, payload)
       SELECT $1, cc.character_id, $2, NULL
       FROM campaign_character cc
       WHERE cc.campaign_id = $1`,
      [req.params.campaignId, commandType]
    );
    await client.query('COMMIT');
    res.json({ game_seconds: updated.rows[0].game_seconds, queued: queued.rowCount });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    console.error('Error advancing campaign clock:', error);
    res.status(500).json({ error: error.message || 'Failed to advance campaign clock' });
  } finally {
    client.release();
  }
});

app.post('/api/campaigns/:campaignId/adventuring/party', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const type = req.body?.type;
    let payload;
    if (type === 'give_xp') {
      payload = { amount: positiveInt(req.body.amount, 'amount') };
    } else if (type === 'give_item') {
      const itemId = positiveInt(req.body.item_id, 'item_id');
      const quantity = req.body.quantity == null ? 1 : positiveInt(req.body.quantity, 'quantity');
      const item = await pool.query(
        `SELECT i.id FROM items i
         JOIN campaign c ON c.ruleset_id = i.ruleset_id
         WHERE i.id = $1 AND c.id = $2`,
        [itemId, req.params.campaignId]
      );
      if (item.rows.length === 0) {
        return res.status(400).json({ error: 'Item is not in this campaign ruleset' });
      }
      payload = { item_id: itemId, quantity };
    } else {
      return res.status(400).json({ error: 'type must be give_xp or give_item' });
    }
    const queued = await queueForParty(req.params.campaignId, type, payload);
    res.status(201).json({ queued });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error queuing party command:', error);
    res.status(500).json({ error: error.message || 'Failed to queue party command' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/encounter', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const camp = await pool.query('SELECT id FROM campaign WHERE id = $1', [req.params.campaignId]);
    if (camp.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    const updated = await pool.query(
      `INSERT INTO campaign_board (campaign_id, in_encounter)
       VALUES ($1, true)
       ON CONFLICT (campaign_id) DO UPDATE SET in_encounter = true
       RETURNING in_encounter`,
      [req.params.campaignId]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ in_encounter: true });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error starting encounter:', error);
    res.status(500).json({ error: error.message || 'Failed to start encounter' });
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/encounter', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    await client.query('BEGIN');
    const camp = await client.query('SELECT id FROM campaign WHERE id = $1', [req.params.campaignId]);
    if (camp.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const updated = await client.query(
      `INSERT INTO campaign_board (campaign_id, in_encounter)
       VALUES ($1, false)
       ON CONFLICT (campaign_id) DO UPDATE SET in_encounter = false
       RETURNING in_encounter`,
      [req.params.campaignId]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found' });
    }
    await client.query('DELETE FROM campaign_enemy WHERE campaign_id = $1', [req.params.campaignId]);
    await client.query('COMMIT');
    res.json({ in_encounter: false });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    console.error('Error ending encounter:', error);
    res.status(500).json({ error: error.message || 'Failed to end encounter' });
  } finally {
    client.release();
  }
});

app.post('/api/campaigns/:campaignId/adventuring/enemies', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const camp = await pool.query(
      `SELECT COALESCE(b.in_encounter, false) AS in_encounter
       FROM campaign c
       LEFT JOIN campaign_board b ON b.campaign_id = c.id
       WHERE c.id = $1`,
      [req.params.campaignId]
    );
    if (camp.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    if (!camp.rows[0].in_encounter) return res.status(400).json({ error: 'Start an encounter first' });
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'name must be 1 to 80 characters' });
    const inserted = await pool.query(
      'INSERT INTO campaign_enemy (campaign_id, name) VALUES ($1, $2) RETURNING id, name',
      [req.params.campaignId, name]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error adding enemy:', error);
    res.status(500).json({ error: error.message || 'Failed to add enemy' });
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/enemies/:enemyId', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const deleted = await pool.query(
      'DELETE FROM campaign_enemy WHERE id = $1 AND campaign_id = $2 RETURNING id',
      [req.params.enemyId, req.params.campaignId]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Enemy not found' });
    res.json({ id: deleted.rows[0].id });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error removing enemy:', error);
    res.status(500).json({ error: error.message || 'Failed to remove enemy' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/marks', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const kind = req.body?.kind;
    if (kind !== 'effect' && kind !== 'event') {
      return res.status(400).json({ error: 'kind must be effect or event' });
    }
    const note = String(req.body?.note || '').trim();
    if (!note || note.length > 120) return res.status(400).json({ error: 'note must be 1 to 120 characters' });
    const atSeconds = nonNegativeInt(req.body.at_seconds, 'at_seconds');
    const duration = kind === 'effect' ? positiveInt(req.body.duration_minutes, 'duration_minutes') : null;
    const inserted = await pool.query(
      `INSERT INTO campaign_mark (campaign_id, kind, note, at_seconds, duration_minutes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, kind, note, at_seconds, duration_minutes`,
      [req.params.campaignId, kind, note, atSeconds, duration]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error adding mark:', error);
    res.status(500).json({ error: error.message || 'Failed to add mark' });
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/marks/:markId', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const deleted = await pool.query(
      'DELETE FROM campaign_mark WHERE id = $1 AND campaign_id = $2 RETURNING id',
      [req.params.markId, req.params.campaignId]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Mark not found' });
    res.json({ id: deleted.rows[0].id });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error removing mark:', error);
    res.status(500).json({ error: error.message || 'Failed to remove mark' });
  }
});

app.post('/api/campaigns/:campaignId/presence', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, false);
    if (!member) return;
    const characterId = positiveInt(req.body?.character_id, 'character_id');
    const owned = await pool.query(
      `SELECT 1 FROM characters c
       JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
       WHERE c.id = $2 AND lower(c."user") = lower($3)`,
      [req.params.campaignId, characterId, req.user.username]
    );
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    await pool.query(
      `INSERT INTO campaign_presence (campaign_id, character_id, seen_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (campaign_id, character_id) DO UPDATE SET seen_at = CURRENT_TIMESTAMP`,
      [req.params.campaignId, characterId]
    );
    res.json({ ok: true });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error recording presence:', error);
    res.status(500).json({ error: error.message || 'Failed to record presence' });
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
    console.log(`GeasGremlin server running on port ${portToUse}`);
    isReady = true;
  });
}

if (require.main === module) {
  startServer();
} else {
  module.exports = { app, startServer };
}
