const { randomInt } = require('crypto');
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
const { assignmentError, inCatalog } = require('./classAssignment');
const { INSIDE_INTERVAL, OUTSIDE_INTERVAL, checksDue, checkHit, matchingRow, acceptRoll } = require('./wander');
const { rollTreasure } = require('./treasure');
const {
  abilityModifier,
  resolveUndead,
  rollSurprise,
  rollReaction,
  rollInitiative,
  rollMorale,
  rollTurn,
} = require('./encounterDice');
const {
  armorClass,
  applyHitPoints,
  characterAttackBonus,
  characterDamageDice,
  monsterAttackBonus,
  rollAttack,
  rollMonsterHitPoints,
  rollWeaponDamage,
} = require('./blows');
const { awardLine, splitAward, cappedAward } = require('./awards');
const {
  rollLight,
  encumbrance,
  slowestMember,
  requiredSleep,
  settleBody,
  applyBodyHitPoints,
} = require('./body');
const { TERRAINS, locationTerrain } = require('./terrain');
const {
  adjustedMiles,
  forcedMiles,
  airMiles,
  stallFeet,
  marchDay,
  lostCheck,
  sailingDay,
} = require('./travel');
const {
  SPECIALISTS,
  MERCENARIES,
  retainerCap,
  maxRetainerLevel,
  startingLoyalty,
  hireReaction,
  canHireRetainer,
  loyaltyCheck,
  specialistCost,
  mercenaryOffer,
} = require('./hirelings');
const {
  VEHICLE_AC,
  TRAPS,
  VEHICLES,
  stockRoom,
  vehicleDamage,
  fieldRepair,
} = require('./prep');
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
  database: process.env.DB_NAME || 'rpghub',
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

async function rulesetParentId(rulesetId) {
  const result = await pool.query('SELECT parent_ruleset_id FROM ruleset WHERE id = $1', [rulesetId]);
  return result.rows[0] ? result.rows[0].parent_ruleset_id : null;
}

async function classAssignmentMessage(rulesetId, classId, quasiclassId) {
  const base = await readClass(classId);
  if (base.error) return base.error;
  const quasi = await readClass(quasiclassId);
  if (quasi.error) return quasi.error;
  const parentId = await rulesetParentId(rulesetId);
  return assignmentError(rulesetId, base.row, quasi.row, parentId);
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
      return res.status(503).json({ error: 'Campaign table does not exist. Run database/schema.sql on your rpghub database (see README).' });
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
      return res.status(503).json({ error: 'Campaign table does not exist. Run database/schema.sql on your rpghub database (see README).' });
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
          `SELECT base.xp + COALESCE(quasi.xp, 0) AS xp
           FROM class_leveling base
           JOIN characters ch ON ch.id = $3
           LEFT JOIN class_leveling quasi
             ON quasi.class_id = ch.quasiclass AND quasi.level = base.level
           WHERE base.class_id = $1 AND base.level = $2`,
          [clid, clvl + 1, req.params.id]
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
      const parentId = await rulesetParentId(row.ruleset_id);
      for (const cc of body.character_classes) {
        if (cc == null || cc.class_id == null || cc.class_id === '') continue;
        const extra = await readClass(cc.class_id);
        if (extra.error) return res.status(400).json({ error: extra.error });
        if (extra.row && extra.row.is_quasi) {
          return res.status(400).json({ error: 'Base class cannot be a quasi-class' });
        }
        if (extra.row && !inCatalog(extra.row, row.ruleset_id, parentId)) {
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

/**
 * A catalog row is visible when it belongs to the asked ruleset, or to that
 * ruleset's parent and the child has no row with the same key.
 * sameKey is SQL that compares child_row to alias. $1 is the asked ruleset id.
 */
function visibleInRuleset(table, alias, sameKey) {
  return `(${alias}.ruleset_id = $1 OR (
    ${alias}.ruleset_id = (SELECT parent_ruleset_id FROM ruleset WHERE id = $1)
    AND NOT EXISTS (
      SELECT 1 FROM ${table} child_row
      WHERE child_row.ruleset_id = $1 AND ${sameKey}
    )
  ))`;
}

/** Stock encounter tables follow the campaign ruleset, then its parent. Child name wins. */
function visibleStockTable(alias) {
  return `(${alias}.ruleset_id = c.ruleset_id OR (
    ${alias}.ruleset_id = (SELECT parent_ruleset_id FROM ruleset WHERE id = c.ruleset_id)
    AND NOT EXISTS (
      SELECT 1 FROM encounter_table child_row
      WHERE child_row.ruleset_id = c.ruleset_id
        AND child_row.campaign_id IS NULL
        AND child_row.name = ${alias}.name
    )
  ))`;
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
      result = await pool.query('SELECT id, name, mechanic, parent_ruleset_id FROM ruleset ORDER BY name');
    } catch (error) {
      if (error.code !== '42703') throw error;
      try {
        result = await pool.query('SELECT id, name, mechanic FROM ruleset ORDER BY name');
      } catch (again) {
        if (again.code !== '42703') throw again;
        console.error('ruleset.mechanic is missing; serving bfrpg until the column is added');
        result = await pool.query('SELECT id, name FROM ruleset ORDER BY name');
      }
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
            WHERE ra.race_id IN (
              SELECT owner.id FROM races owner
              WHERE owner.name = r.name
                AND owner.ruleset_id IN ($1, (SELECT parent_ruleset_id FROM ruleset WHERE id = $1))
            )
            AND ra.ruleset_id IN ($1, (SELECT parent_ruleset_id FROM ruleset WHERE id = $1))
            AND NOT (
              ra.ruleset_id IS DISTINCT FROM $1
              AND EXISTS (
                SELECT 1
                FROM race_abilities ra2
                JOIN abilities a2 ON a2.id = ra2.ability_id
                JOIN races owner2 ON owner2.id = ra2.race_id
                WHERE ra2.ruleset_id = $1
                  AND owner2.name = r.name
                  AND a2.description = a.description
              )
            )),
           '[]'::json
         ) AS abilities
       FROM races r
       WHERE ${visibleInRuleset('races', 'r', 'child_row.name = r.name')}
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
            WHERE ca.class_id IN (
              SELECT owner.id FROM classes owner
              WHERE owner.name = c.name
                AND owner.ruleset_id IN ($1, (SELECT parent_ruleset_id FROM ruleset WHERE id = $1))
            )
            AND ca.ruleset_id IN ($1, (SELECT parent_ruleset_id FROM ruleset WHERE id = $1))
            AND NOT (
              ca.ruleset_id IS DISTINCT FROM $1
              AND EXISTS (
                SELECT 1
                FROM class_abilities ca2
                JOIN abilities a2 ON a2.id = ca2.ability_id
                JOIN classes owner2 ON owner2.id = ca2.class_id
                WHERE ca2.ruleset_id = $1
                  AND owner2.name = c.name
                  AND a2.description = a.description
                  AND ca2.level = ca.level
              )
            )),
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
            WHERE cl.class_id IN (
              SELECT owner.id FROM classes owner
              WHERE owner.name = c.name
                AND owner.ruleset_id IN ($1, (SELECT parent_ruleset_id FROM ruleset WHERE id = $1))
            )
            AND cl.ruleset_id IN ($1, (SELECT parent_ruleset_id FROM ruleset WHERE id = $1))
            AND NOT (
              cl.ruleset_id IS DISTINCT FROM $1
              AND EXISTS (
                SELECT 1
                FROM class_leveling cl2
                JOIN classes owner2 ON owner2.id = cl2.class_id
                WHERE cl2.ruleset_id = $1
                  AND owner2.name = c.name
                  AND cl2.level = cl.level
              )
            )),
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
            WHERE cs.class_id IN (
              SELECT owner.id FROM classes owner
              WHERE owner.name = c.name
                AND owner.ruleset_id IN ($1, (SELECT parent_ruleset_id FROM ruleset WHERE id = $1))
            )
            AND cs.ruleset_id IN ($1, (SELECT parent_ruleset_id FROM ruleset WHERE id = $1))
            AND NOT (
              cs.ruleset_id IS DISTINCT FROM $1
              AND EXISTS (
                SELECT 1
                FROM class_spells cs2
                JOIN classes owner2 ON owner2.id = cs2.class_id
                WHERE cs2.ruleset_id = $1
                  AND owner2.name = c.name
                  AND cs2.char_level = cs.char_level
              )
            )),
           '[]'::json
         ) AS spell_slots
       FROM classes c
       LEFT JOIN classes parent ON parent.id = c.subclass_of
       WHERE ${visibleInRuleset('classes', 'c', 'child_row.name = c.name')}
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
       WHERE ($1::int IS NULL OR ${visibleInRuleset('spells', 'spells', 'child_row.name = spells.name')})
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
       WHERE ($1::int IS NULL OR ${visibleInRuleset(
         'items',
         'i',
         `child_row.category IS NOT DISTINCT FROM i.category
          AND child_row.type IS NOT DISTINCT FROM i.type
          AND child_row.name = i.name
          AND child_row.size IS NOT DISTINCT FROM i.size`
       )})
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

// Keep in step with frontend/src/domain/gameTime.mjs.
// A round is 10 seconds, a turn is 600, a watch is 14400, a day is 86400.
const ROUND_SECONDS = 10;
const TURN_SECONDS = 600;
const WATCH_SECONDS = 14400;
const DAY_SECONDS = 86400;
const PRESENCE_SECONDS = 30;

const CLOCK_STEPS = {
  round: { seconds: ROUND_SECONDS, command: 'new_round', wander: false },
  turn: { seconds: TURN_SECONDS, command: null, wander: true },
  watch: { seconds: WATCH_SECONDS, command: null, wander: true },
  day: { seconds: DAY_SECONDS, command: 'new_day', wander: true },
};

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

function booleanField(value, name) {
  if (typeof value !== 'boolean') throw storedError(`${name} must be true or false`, 400);
  return value;
}

function optionalText(value, name, max) {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (text.length > max) throw storedError(`${name} exceeds ${max} characters`, 400);
  return text;
}

async function loadAdventuring(campaignId) {
  const camp = await pool.query(
    `SELECT COALESCE(b.game_seconds, 0) AS game_seconds,
            COALESCE(b.in_encounter, false) AS in_encounter,
            COALESCE(b.place, 'outside') AS place,
            b.location_id
     FROM campaign c
     LEFT JOIN campaign_board b ON b.campaign_id = c.id
     WHERE c.id = $1`,
    [campaignId]
  );
  if (camp.rows.length === 0) return null;
  const gameSeconds = Number(camp.rows[0].game_seconds);
  const [enemies, characters, marks, locations, tables, wanders, turnBlocks, bodies, hirelings] = await Promise.all([
    pool.query(
      `SELECT e.id, e.name, e.monster_id, e.quantity, e.treasure_type, e.hp,
              m.hit_dice, m.morale, m.morale_engaged, m.armor_class, m.defense_note, m.attack_note
       FROM campaign_enemy e
       LEFT JOIN monster m ON m.id = e.monster_id
       WHERE e.campaign_id = $1
       ORDER BY e.id`,
      [campaignId]
    ),
    pool.query(
      `SELECT c.id, c.name, c."user", c.hp,
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
    pool.query(
      `SELECT id, name, place, check_die, interval_seconds, encounter_table_id, terrain, movement_pct
       FROM campaign_location WHERE campaign_id = $1 ORDER BY name, id`,
      [campaignId]
    ),
    pool.query(
      `SELECT t.id, t.name, t.die, (t.campaign_id IS NOT NULL) AS custom
       FROM encounter_table t
       JOIN campaign c ON c.id = $1
       WHERE t.campaign_id = c.id OR (t.campaign_id IS NULL AND ${visibleStockTable('t')})
       ORDER BY t.name, t.id`,
      [campaignId]
    ),
    pool.query(
      `SELECT id, location_name, at_seconds, check_die, check_roll, table_die, table_roll, label, quantity, accepted
       FROM campaign_wander WHERE campaign_id = $1
       ORDER BY at_seconds DESC, id DESC
       LIMIT 30`,
      [campaignId]
    ),
    pool.query(
      `SELECT character_id, until_seconds
       FROM campaign_turn_block
       WHERE campaign_id = $1 AND until_seconds > $2
       ORDER BY character_id`,
      [campaignId, gameSeconds]
    ),
    pool.query(
      `SELECT c.id, c.name, c.str, c.con, c.chr, c.hp,
              r.name AS race_name,
              cc.food_missed, cc.heal_food, cc.heal_water,
              cc.march_days, cc.march_failed, cc.hire_penalty,
              (SELECT MAX(cls.class_level) FROM character_classes cls WHERE cls.character_id = c.id) AS employer_level,
              it.ac AS armor_ac,
              COALESCE(ci.bonus, 0) AS armor_bonus,
              COALESCE(w.ounces, 0) AS ounces
       FROM characters c
       INNER JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
       LEFT JOIN races r ON r.id = c.race
       LEFT JOIN character_items ci ON ci.id = c.equipped_armor_id AND ci.character_id = c.id
       LEFT JOIN items it ON it.id = ci.item_id
       LEFT JOIN (
         SELECT character_id, SUM(COALESCE(quantity, 1) * COALESCE(i.weight, 0)) AS ounces
         FROM character_items
         JOIN items i ON i.id = character_items.item_id
         WHERE character_id IN (SELECT character_id FROM campaign_character WHERE campaign_id = $1)
         GROUP BY character_id
       ) w ON w.character_id = c.id`,
      [campaignId]
    ),
    pool.query(
      `SELECT id, employer_id, kind, name, detail, level, loyalty, morale, cost_gp, quantity
       FROM campaign_hireling WHERE campaign_id = $1 ORDER BY kind, name, id`,
      [campaignId]
    ),
  ]);
  const tableIds = tables.rows.map((row) => row.id);
  const faces = tableIds.length === 0
    ? { rows: [] }
    : await pool.query(
      `SELECT encounter_table_id, face_lo, face_hi, label, quantity
       FROM encounter_table_row
       WHERE encounter_table_id = ANY($1::int[])
       ORDER BY face_lo, id`,
      [tableIds]
    );
  const bodyById = new Map(bodies.rows.map((row) => [row.id, row]));
  const characterRows = characters.rows.map((row) => {
    const body = bodyById.get(row.id);
    const carried = body ? encumbrance({
      raceName: body.race_name,
      strength: body.str,
      ounces: Number(body.ounces) || 0,
      armorAc: body.armor_ac == null ? null : Number(body.armor_ac),
      armorMagic: Number(body.armor_bonus) > 0,
    }) : null;
    return {
      id: row.id,
      name: row.name,
      user: row.user,
      hp: row.hp == null ? null : Number(row.hp),
      active: row.active === true,
      pounds: carried ? carried.pounds : null,
      light_lb: carried ? carried.light_lb : null,
      heavy_lb: carried ? carried.heavy_lb : null,
      load: carried ? carried.load : null,
      armor: carried ? carried.armor : null,
      move: carried ? carried.move : null,
      turn_feet: carried ? carried.turn_feet : null,
      miles: carried ? carried.miles : null,
      food_missed: body ? Number(body.food_missed) || 0 : 0,
      heal_food: body ? body.heal_food === true : false,
      heal_water: body ? body.heal_water === true : false,
      required_hours: body ? requiredSleep(body.con) : 6,
      march_days: body ? Number(body.march_days) || 0 : 0,
      march_failed: body ? body.march_failed === true : false,
      hire_penalty: body ? Number(body.hire_penalty) || 0 : 0,
      retainer_cap: body ? retainerCap(body.chr) : 4,
      max_retainer_level: body ? maxRetainerLevel(body.employer_level == null ? 1 : Number(body.employer_level)) : 0,
    };
  });
  const slow = slowestMember(characterRows.filter((row) => row.move != null));
  const selected = locations.rows.find((row) => String(row.id) === String(camp.rows[0].location_id));
  const outsidePct = selected && selected.place === 'outside' && selected.movement_pct != null
    ? Number(selected.movement_pct)
    : null;
  const baseMiles = slow ? slow.miles : null;
  const overland = adjustedMiles(baseMiles, outsidePct);
  const rowsByTable = new Map();
  for (const row of faces.rows) {
    if (!rowsByTable.has(row.encounter_table_id)) rowsByTable.set(row.encounter_table_id, []);
    rowsByTable.get(row.encounter_table_id).push({
      face_lo: row.face_lo,
      face_hi: row.face_hi,
      label: row.label,
      quantity: row.quantity,
    });
  }
  return {
    game_seconds: camp.rows[0].game_seconds,
    in_encounter: camp.rows[0].in_encounter,
    place: camp.rows[0].place,
    location_id: camp.rows[0].location_id,
    enemies: enemies.rows,
    characters: characterRows,
    party_move: slow ? slow.move : null,
    party_turn: slow ? slow.turn_feet : null,
    party_miles: slow ? slow.miles : null,
    party_slow: slow ? slow.name : null,
    overland_miles: overland,
    forced_miles: forcedMiles(overland),
    air_miles: airMiles(baseMiles),
    stall_feet: stallFeet(slow ? slow.move : null),
    hirelings: hirelings.rows,
    specialists: SPECIALISTS,
    mercenaries: MERCENARIES,
    marks: marks.rows,
    locations: locations.rows,
    tables: tables.rows.map((row) => ({
      id: row.id,
      name: row.name,
      die: row.die,
      custom: row.custom === true || row.custom === 't',
      rows: rowsByTable.get(row.id) || [],
    })),
    terrains: TERRAINS,
    wanders: wanders.rows,
    turn_blocks: turnBlocks.rows,
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
  const step = CLOCK_STEPS[req.body?.step];
  if (!step) return res.status(400).json({ error: 'step must be round, turn, watch, or day' });
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
       RETURNING game_seconds, in_encounter, location_id, check_seconds`,
      [req.params.campaignId, step.seconds]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const now = Number(updated.rows[0].game_seconds);
    let checks = 0;
    if (step.wander) {
      checks = await applyWander(client, req.params.campaignId, {
        previous: now - step.seconds,
        now,
        inEncounter: updated.rows[0].in_encounter === true,
        locationId: updated.rows[0].location_id,
        checkSeconds: updated.rows[0].check_seconds == null ? null : Number(updated.rows[0].check_seconds),
      });
    }
    let queued = null;
    if (step.command) {
      const inserted = await client.query(
        `INSERT INTO campaign_command (campaign_id, recipient_character_id, type, payload)
         SELECT $1, cc.character_id, $2, NULL
         FROM campaign_character cc
         WHERE cc.campaign_id = $1`,
        [req.params.campaignId, step.command]
      );
      queued = inserted.rowCount;
    }
    await client.query('COMMIT');
    res.json({ game_seconds: now, queued, checks });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    console.error('Error advancing campaign clock:', error);
    res.status(500).json({ error: error.message || 'Failed to advance campaign clock' });
  } finally {
    client.release();
  }
});

function rollDie(sides) {
  return randomInt(1, sides + 1);
}

function optionalAdjustment(value, name, min, max) {
  if (value == null || value === '') return 0;
  const n = integerField(value, name);
  if (n < min || n > max) throw storedError(`${name} must be from ${min} to ${max}`, 400);
  return n;
}

async function openEncounter(campaignId) {
  const camp = await pool.query(
    `SELECT COALESCE(b.in_encounter, false) AS in_encounter,
            COALESCE(b.game_seconds, 0) AS game_seconds
     FROM campaign c
     LEFT JOIN campaign_board b ON b.campaign_id = c.id
     WHERE c.id = $1`,
    [campaignId]
  );
  if (camp.rows.length === 0) return { missing: true };
  if (camp.rows[0].in_encounter !== true) return { closed: true };
  return { game_seconds: Number(camp.rows[0].game_seconds) };
}

function rejectEncounter(res, open) {
  if (open.missing) {
    res.status(404).json({ error: 'Campaign not found' });
    return true;
  }
  if (open.closed) {
    res.status(400).json({ error: 'Start an encounter first' });
    return true;
  }
  return false;
}

async function loadPartyActors(campaignId) {
  const result = await pool.query(
    `SELECT c.id, c.name, c.dex, c.chr,
            EXISTS (
              SELECT 1 FROM abilities a
              WHERE a.description = 'Less likely to be surprised 1 in d6'
                AND (
                  (c.race IS NOT NULL AND EXISTS (
                    SELECT 1 FROM race_abilities ra
                    WHERE ra.race_id = c.race AND ra.ability_id = a.id
                  ))
                  OR EXISTS (
                    SELECT 1 FROM character_abilities ca
                    WHERE ca.character_id = c.id AND ca.ability_id = a.id
                  )
                )
            ) AS less_likely,
            COALESCE((
              SELECT SUM(grant_row.bonus)::int
              FROM (
                SELECT DISTINCT a.id, COALESCE(a.stat_modifier, 0) AS bonus
                FROM abilities a
                JOIN stat s ON s.id = a.stat_id AND s.name = 'Initiative'
                WHERE (c.race IS NOT NULL AND EXISTS (
                        SELECT 1 FROM race_abilities ra
                        WHERE ra.race_id = c.race AND ra.ability_id = a.id
                      ))
                   OR EXISTS (
                        SELECT 1 FROM character_abilities ca
                        WHERE ca.character_id = c.id AND ca.ability_id = a.id
                      )
                   OR EXISTS (
                        SELECT 1 FROM character_classes cc
                        JOIN class_abilities cla
                          ON cla.class_id = cc.class_id AND cla.ability_id = a.id
                        WHERE cc.character_id = c.id
                          AND cla.level <= COALESCE(cc.class_level, 0)
                      )
              ) grant_row
            ), 0) AS initiative_bonus
     FROM characters c
     JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
     ORDER BY c.name, c.id`,
    [campaignId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    dex: row.dex,
    chr: row.chr,
    lessLikely: row.less_likely === true,
    initiativeBonus: Number(row.initiative_bonus) || 0,
  }));
}

async function loadEncounterEnemies(campaignId) {
  const result = await pool.query(
    `SELECT e.id, e.name, m.hit_dice, m.morale, m.morale_engaged
     FROM campaign_enemy e
     LEFT JOIN monster m ON m.id = e.monster_id
     WHERE e.campaign_id = $1
     ORDER BY e.id`,
    [campaignId]
  );
  return result.rows;
}

function combatantRef(raw, name) {
  if (!raw || typeof raw !== 'object') throw storedError(`${name} is required`, 400);
  const side = raw.side;
  if (side !== 'character' && side !== 'enemy') {
    throw storedError(`${name} side must be character or enemy`, 400);
  }
  return { side, id: positiveInt(raw.id, name) };
}

function optionalBounded(value, name, min, max) {
  if (value == null || value === '') return null;
  const n = integerField(value, name);
  if (n < min || n > max) throw storedError(`${name} must be from ${min} to ${max}`, 400);
  return n;
}

function findEquipped(items, id) {
  if (id == null) return null;
  return items.find((item) => String(item.id) === String(id)) || null;
}

async function loadCharacterFighter(campaignId, characterId) {
  const result = await pool.query(
    `SELECT c.id, c.name, c.str, c.dex, c.hp,
            c.equipped_melee_primary_id, c.equipped_melee_secondary_id,
            c.equipped_ranged_id, c.equipped_armor_id, c.equipped_shield_id,
            cc.class_level, lvl.ab
     FROM characters c
     JOIN campaign_character camp ON camp.character_id = c.id AND camp.campaign_id = $1
     LEFT JOIN LATERAL (
       SELECT class_id, class_level
       FROM character_classes
       WHERE character_id = c.id
       ORDER BY sort_order NULLS LAST, class_id
       LIMIT 1
     ) cc ON true
     LEFT JOIN class_leveling lvl ON lvl.class_id = cc.class_id AND lvl.level = cc.class_level
     WHERE c.id = $2`,
    [campaignId, characterId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const items = await pool.query(
    `SELECT ci.id, i.attackbonus, i.damagebonus, i.damage, i.ac, i.ac_melee, i.ac_ranged
     FROM character_items ci
     LEFT JOIN items i ON i.id = ci.item_id
     WHERE ci.character_id = $1`,
    [characterId]
  );
  const packed = items.rows.map((item) => ({
    id: item.id,
    item_attackbonus: item.attackbonus,
    item_damagebonus: item.damagebonus,
    item_damage: item.damage,
    item_ac: item.ac,
    item_ac_melee: item.ac_melee,
    item_ac_ranged: item.ac_ranged,
  }));
  return {
    side: 'character',
    id: row.id,
    name: row.name,
    hp: row.hp == null ? null : Number(row.hp),
    str: row.str,
    dex: row.dex,
    baseAb: row.ab == null || row.ab === '' ? null : Number(row.ab),
    dualWielding: row.equipped_melee_secondary_id != null,
    melee: findEquipped(packed, row.equipped_melee_primary_id),
    ranged: findEquipped(packed, row.equipped_ranged_id),
    sheet: {
      dex: row.dex,
      equipped_armor_id: row.equipped_armor_id,
      equipped_shield_id: row.equipped_shield_id,
      items: packed,
    },
  };
}

async function loadEnemyFighter(campaignId, enemyId) {
  const result = await pool.query(
    `SELECT e.id, e.name, e.hp, m.hit_dice, m.armor_class, m.defense_note, m.attack_note
     FROM campaign_enemy e
     LEFT JOIN monster m ON m.id = e.monster_id
     WHERE e.campaign_id = $1 AND e.id = $2`,
    [campaignId, enemyId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    side: 'enemy',
    id: row.id,
    name: row.name,
    hp: row.hp == null ? null : Number(row.hp),
    hitDice: row.hit_dice,
    armorClass: row.armor_class == null ? null : Number(row.armor_class),
    defenseNote: row.defense_note,
    attackNote: row.attack_note,
  };
}

async function loadFighter(campaignId, ref) {
  if (ref.side === 'character') return loadCharacterFighter(campaignId, ref.id);
  return loadEnemyFighter(campaignId, ref.id);
}

function attackBonusFor(figure, mode, typedBonus) {
  if (figure.side === 'character') {
    const weapon = mode === 'missile' ? figure.ranged : figure.melee;
    return characterAttackBonus({
      baseAb: figure.baseAb,
      mode,
      strength: figure.str,
      dexterity: figure.dex,
      weaponBonus: weapon ? weapon.item_attackbonus : 0,
      dualWielding: mode !== 'missile' && figure.dualWielding,
    });
  }
  const fromDice = monsterAttackBonus(figure.hitDice);
  if (fromDice == null) {
    if (typedBonus == null) return { error: 'that monster has no attack bonus' };
    return { bonus: mode === 'back' ? typedBonus + 2 : typedBonus };
  }
  return { bonus: mode === 'back' ? fromDice + 2 : fromDice };
}

function armorFor(figure, mode, typedAc) {
  if (figure.side === 'character') {
    const ac = armorClass(figure.sheet);
    return mode === 'missile' ? ac.ranged : ac.melee;
  }
  if (Number.isInteger(figure.armorClass)) return figure.armorClass;
  return typedAc;
}

function damageDiceFor(figure, mode) {
  if (figure.side !== 'character') return null;
  const weapon = mode === 'missile' ? figure.ranged : figure.melee;
  if (!weapon) return null;
  return characterDamageDice({
    mode,
    damage: weapon.item_damage,
    damageBonus: weapon.item_damagebonus,
    strength: figure.str,
  });
}

async function writeHitPoints(campaignId, figure, hp) {
  if (figure.side === 'character') {
    await applyStoredCharacterPatch(pool, figure.id, { hp });
    return;
  }
  const updated = await pool.query(
    'UPDATE campaign_enemy SET hp = $1 WHERE id = $2 AND campaign_id = $3',
    [hp, figure.id, campaignId]
  );
  if (updated.rowCount === 0) throw storedError('Enemy not found', 404);
}

async function applyWander(client, campaignId, clock) {
  if (clock.inEncounter || clock.locationId == null) return 0;
  const loc = await client.query(
    `SELECT l.name, l.check_die, l.interval_seconds, t.id AS table_id, t.die
     FROM campaign_location l
     JOIN encounter_table t ON t.id = l.encounter_table_id
     WHERE l.id = $1 AND l.campaign_id = $2`,
    [clock.locationId, campaignId]
  );
  if (loc.rows.length === 0) return 0;
  const location = loc.rows[0];
  const last = clock.checkSeconds == null ? clock.previous : clock.checkSeconds;
  const due = checksDue(last, clock.now, Number(location.interval_seconds));
  if (!due || due.count === 0) return 0;
  const faces = await client.query(
    `SELECT r.face_lo, r.face_hi, r.monster_id, r.label, r.quantity, m.name AS monster_name
     FROM encounter_table_row r
     LEFT JOIN monster m ON m.id = r.monster_id
     WHERE r.encounter_table_id = $1
     ORDER BY r.face_lo, r.id`,
    [location.table_id]
  );
  const rows = faces.rows.map((row) => ({
    face_lo: Number(row.face_lo),
    face_hi: Number(row.face_hi),
    monster_id: row.monster_id,
    label: row.label,
    quantity: row.quantity,
    monster_name: row.monster_name,
  }));
  for (const at of due.at) {
    const checkRoll = rollDie(Number(location.check_die));
    if (!checkHit(checkRoll)) {
      await client.query(
        `INSERT INTO campaign_wander
           (campaign_id, location_id, location_name, at_seconds, check_die, check_roll)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [campaignId, clock.locationId, location.name, at, location.check_die, checkRoll]
      );
      continue;
    }
    const tableRoll = rollDie(Number(location.die));
    const row = matchingRow(rows, tableRoll);
    const label = row ? (row.label || row.monster_name || null) : null;
    await client.query(
      `INSERT INTO campaign_wander
         (campaign_id, location_id, location_name, at_seconds, check_die, check_roll,
          table_die, table_roll, monster_id, label, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        campaignId,
        clock.locationId,
        location.name,
        at,
        location.check_die,
        checkRoll,
        location.die,
        tableRoll,
        row ? row.monster_id : null,
        label,
        row && row.quantity ? row.quantity : null,
      ]
    );
  }
  await client.query(
    'UPDATE campaign_board SET check_seconds = $2 WHERE campaign_id = $1',
    [campaignId, due.nextMark]
  );
  return due.count;
}

function movementField(value) {
  if (value == null || value === '') return null;
  return integerField(value, 'movement_pct');
}

function readLocationFields(body) {
  const name = String(body?.name || '').trim();
  const place = body?.place;
  if (!name || name.length > 80) throw storedError('name must be 1 to 80 characters', 400);
  if (place !== 'outside' && place !== 'inside') throw storedError('place must be outside or inside', 400);
  const checkDie = body?.check_die == null || body.check_die === '' ? 6 : positiveInt(body.check_die, 'check_die');
  if (checkDie < 2 || checkDie > 100) throw storedError('check_die must be from 2 to 100', 400);
  const interval = body?.interval_seconds == null || body.interval_seconds === ''
    ? (place === 'inside' ? INSIDE_INTERVAL : OUTSIDE_INTERVAL)
    : positiveInt(body.interval_seconds, 'interval_seconds');
  const tableId = positiveInt(body?.encounter_table_id, 'encounter_table_id');
  const terrain = locationTerrain(place, body?.terrain, movementField(body?.movement_pct));
  if (terrain.error) throw storedError(terrain.error, 400);
  return {
    name,
    place,
    checkDie,
    interval,
    tableId,
    terrain: terrain.terrain,
    movementPct: terrain.movement_pct,
  };
}

function parseTableRows(die, rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw storedError('A table needs at least one row', 400);
  return rows.map((row, index) => {
    const faceLo = positiveInt(row?.face_lo, 'face_lo');
    const faceHi = positiveInt(row?.face_hi, 'face_hi');
    const label = String(row?.label || '').trim();
    const quantity = row?.quantity == null || String(row.quantity).trim() === '' ? null : String(row.quantity).trim();
    if (faceHi < faceLo) throw storedError(`row ${index + 1} face_hi is below face_lo`, 400);
    if (faceHi > die) throw storedError(`row ${index + 1} face is above the die`, 400);
    if (!label || label.length > 80) throw storedError(`row ${index + 1} label must be 1 to 80 characters`, 400);
    if (quantity && quantity.length > 80) throw storedError(`row ${index + 1} quantity exceeds 80 characters`, 400);
    return { faceLo, faceHi, label, quantity };
  });
}

async function insertTableRows(client, tableId, rows) {
  for (const row of rows) {
    await client.query(
      `INSERT INTO encounter_table_row (encounter_table_id, face_lo, face_hi, label, quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [tableId, row.faceLo, row.faceHi, row.label, row.quantity]
    );
  }
}

async function tableForCampaign(client, campaignId, tableId) {
  const found = await client.query(
    `SELECT t.id, t.campaign_id FROM encounter_table t
     JOIN campaign c ON c.id = $1
     WHERE t.id = $2 AND (t.campaign_id = c.id OR (t.campaign_id IS NULL AND ${visibleStockTable('t')}))`,
    [campaignId, tableId]
  );
  return found.rows[0] || null;
}

app.post('/api/campaigns/:campaignId/adventuring/tables', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'name must be 1 to 80 characters' });
    const die = positiveInt(req.body?.die, 'die');
    if (die < 2 || die > 100) return res.status(400).json({ error: 'die must be from 2 to 100' });
    const parsed = parseTableRows(die, req.body?.rows);
    await client.query('BEGIN');
    const camp = await client.query('SELECT id FROM campaign WHERE id = $1', [req.params.campaignId]);
    if (camp.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const table = await client.query(
      `INSERT INTO encounter_table (name, die, campaign_id)
       VALUES ($1, $2, $3) RETURNING id, name, die`,
      [name, die, req.params.campaignId]
    );
    await insertTableRows(client, table.rows[0].id, parsed);
    await client.query('COMMIT');
    res.status(201).json(table.rows[0]);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(400).json({ error: 'A table with that name already exists' });
    console.error('Error creating encounter table:', error);
    res.status(500).json({ error: error.message || 'Failed to create table' });
  } finally {
    client.release();
  }
});

app.post('/api/campaigns/:campaignId/adventuring/locations', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const fields = readLocationFields(req.body);
    if (!(await tableForCampaign(pool, req.params.campaignId, fields.tableId))) {
      return res.status(400).json({ error: 'Table is not in this campaign' });
    }
    const inserted = await pool.query(
      `INSERT INTO campaign_location
         (campaign_id, name, place, check_die, interval_seconds, encounter_table_id, terrain, movement_pct)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, place, check_die, interval_seconds, encounter_table_id, terrain, movement_pct`,
      [req.params.campaignId, fields.name, fields.place, fields.checkDie, fields.interval, fields.tableId, fields.terrain, fields.movementPct]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(400).json({ error: 'A location with that name already exists' });
    if (error.code === '23514') return res.status(400).json({ error: 'That terrain is not allowed on this location' });
    console.error('Error creating location:', error);
    res.status(500).json({ error: error.message || 'Failed to create location' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/locations/:locationId/select', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const loc = await pool.query(
      'SELECT id, place FROM campaign_location WHERE id = $1 AND campaign_id = $2',
      [req.params.locationId, req.params.campaignId]
    );
    if (loc.rows.length === 0) return res.status(404).json({ error: 'Location not found' });
    const updated = await pool.query(
      `INSERT INTO campaign_board (campaign_id, place, location_id, check_seconds)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (campaign_id) DO UPDATE
       SET place = EXCLUDED.place,
           location_id = EXCLUDED.location_id,
           check_seconds = CASE
             WHEN campaign_board.location_id IS NOT DISTINCT FROM EXCLUDED.location_id
               THEN campaign_board.check_seconds
             ELSE campaign_board.game_seconds
           END
       RETURNING place, location_id, check_seconds, game_seconds`,
      [req.params.campaignId, loc.rows[0].place, loc.rows[0].id]
    );
    res.json(updated.rows[0]);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error selecting location:', error);
    res.status(500).json({ error: error.message || 'Failed to select location' });
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/locations/:locationId', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    await client.query('BEGIN');
    await client.query(
      `UPDATE campaign_board SET check_seconds = NULL
       WHERE campaign_id = $1 AND location_id = $2`,
      [req.params.campaignId, req.params.locationId]
    );
    const deleted = await client.query(
      'DELETE FROM campaign_location WHERE id = $1 AND campaign_id = $2 RETURNING id',
      [req.params.locationId, req.params.campaignId]
    );
    if (deleted.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Location not found' });
    }
    await client.query('COMMIT');
    res.json({ id: deleted.rows[0].id });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    console.error('Error deleting location:', error);
    res.status(500).json({ error: error.message || 'Failed to delete location' });
  } finally {
    client.release();
  }
});

app.patch('/api/campaigns/:campaignId/adventuring/locations/:locationId', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const fields = readLocationFields(req.body);
    await client.query('BEGIN');
    if (!(await tableForCampaign(client, req.params.campaignId, fields.tableId))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Table is not in this campaign' });
    }
    const updated = await client.query(
      `UPDATE campaign_location
       SET name = $3, place = $4, check_die = $5, interval_seconds = $6,
           encounter_table_id = $7, terrain = $8, movement_pct = $9
       WHERE id = $1 AND campaign_id = $2
       RETURNING id, name, place, check_die, interval_seconds, encounter_table_id, terrain, movement_pct`,
      [
        req.params.locationId,
        req.params.campaignId,
        fields.name,
        fields.place,
        fields.checkDie,
        fields.interval,
        fields.tableId,
        fields.terrain,
        fields.movementPct,
      ]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Location not found' });
    }
    await client.query(
      `UPDATE campaign_board SET place = $3
       WHERE campaign_id = $1 AND location_id = $2`,
      [req.params.campaignId, req.params.locationId, fields.place]
    );
    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(400).json({ error: 'A location with that name already exists' });
    if (error.code === '23514') return res.status(400).json({ error: 'That terrain is not allowed on this location' });
    console.error('Error updating location:', error);
    res.status(500).json({ error: error.message || 'Failed to update location' });
  } finally {
    client.release();
  }
});

app.patch('/api/campaigns/:campaignId/adventuring/tables/:tableId', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'name must be 1 to 80 characters' });
    const die = positiveInt(req.body?.die, 'die');
    if (die < 2 || die > 100) return res.status(400).json({ error: 'die must be from 2 to 100' });
    const parsed = parseTableRows(die, req.body?.rows);
    await client.query('BEGIN');
    const existing = await tableForCampaign(client, req.params.campaignId, req.params.tableId);
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Table not found' });
    }
    if (existing.campaign_id == null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Stock tables cannot be changed' });
    }
    const table = await client.query(
      `UPDATE encounter_table SET name = $1, die = $2, modified = now()
       WHERE id = $3 AND campaign_id = $4
       RETURNING id, name, die`,
      [name, die, req.params.tableId, req.params.campaignId]
    );
    if (table.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Table not found' });
    }
    await client.query('DELETE FROM encounter_table_row WHERE encounter_table_id = $1', [req.params.tableId]);
    await insertTableRows(client, table.rows[0].id, parsed);
    await client.query('COMMIT');
    res.json(table.rows[0]);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(400).json({ error: 'A table with that name already exists' });
    console.error('Error updating encounter table:', error);
    res.status(500).json({ error: error.message || 'Failed to update table' });
  } finally {
    client.release();
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/tables/:tableId', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const existing = await tableForCampaign(pool, req.params.campaignId, req.params.tableId);
    if (!existing) return res.status(404).json({ error: 'Table not found' });
    if (existing.campaign_id == null) return res.status(400).json({ error: 'Stock tables cannot be deleted' });
    const deleted = await pool.query(
      'DELETE FROM encounter_table WHERE id = $1 AND campaign_id = $2 RETURNING id',
      [req.params.tableId, req.params.campaignId]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Table not found' });
    res.json({ id: deleted.rows[0].id });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.code === '23503' || error.code === '23001') {
      return res.status(400).json({ error: 'A location still uses that table' });
    }
    console.error('Error deleting encounter table:', error);
    res.status(500).json({ error: error.message || 'Failed to delete table' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/place', async (req, res) => {
  const place = req.body?.place;
  if (place !== 'outside' && place !== 'inside') {
    return res.status(400).json({ error: 'place must be outside or inside' });
  }
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const camp = await pool.query('SELECT id FROM campaign WHERE id = $1', [req.params.campaignId]);
    if (camp.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    const updated = await pool.query(
      `INSERT INTO campaign_board (campaign_id, place)
       VALUES ($1, $2)
       ON CONFLICT (campaign_id) DO UPDATE SET place = EXCLUDED.place
       RETURNING place, game_seconds`,
      [req.params.campaignId, place]
    );
    res.json({ place: updated.rows[0].place, game_seconds: updated.rows[0].game_seconds });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error setting campaign place:', error);
    res.status(500).json({ error: error.message || 'Failed to set place' });
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
         JOIN campaign c ON c.id = $2
         WHERE i.id = $1 AND ${visibleInRuleset(
           'items',
           'i',
           `child_row.category IS NOT DISTINCT FROM i.category
            AND child_row.type IS NOT DISTINCT FROM i.type
            AND child_row.name = i.name
            AND child_row.size IS NOT DISTINCT FROM i.size`
         ).replaceAll('$1', 'c.ruleset_id')}`,
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

async function loadAwardParty(campaignId) {
  const result = await pool.query(
    `SELECT c.id, c.name, COALESCE(c.xp, 0) AS xp,
            COALESCE((
              SELECT SUM((cmd.payload->>'amount')::int)
              FROM campaign_command cmd
              WHERE cmd.campaign_id = $1
                AND cmd.recipient_character_id = c.id
                AND cmd.type = 'give_xp'
                AND cmd.read_at IS NULL
                AND (cmd.payload->>'amount') ~ '^[0-9]+$'
            ), 0) AS pending,
            COALESCE((
              SELECT json_agg(json_build_object(
                'level', base.level,
                'xp', base.xp + COALESCE(quasi.xp, 0)
              ) ORDER BY base.level)
              FROM class_leveling base
              LEFT JOIN class_leveling quasi
                ON quasi.class_id = c.quasiclass AND quasi.level = base.level
              WHERE base.class_id = (
                SELECT cc.class_id FROM character_classes cc
                WHERE cc.character_id = c.id
                ORDER BY cc.sort_order, cc.class_id
                LIMIT 1
              )
            ), '[]'::json) AS leveling
     FROM characters c
     JOIN campaign_character camp ON camp.character_id = c.id AND camp.campaign_id = $1
     ORDER BY c.name, c.id`,
    [campaignId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    xp: Number(row.xp) || 0,
    pending: Number(row.pending) || 0,
    leveling: Array.isArray(row.leveling) ? row.leveling : [],
  }));
}

async function resolveAwardGroups(campaignId, rawGroups) {
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) {
    throw storedError('Add at least one monster or NPC', 400);
  }
  const groups = [];
  for (const raw of rawGroups) {
    const count = positiveInt(raw?.count, 'count');
    let hitDice = raw?.hit_dice == null ? '' : String(raw.hit_dice).trim();
    let name = raw?.name == null ? '' : String(raw.name).trim().slice(0, 80);
    if (raw?.enemy_id != null && String(raw.enemy_id).trim() !== '') {
      const enemyId = positiveInt(raw.enemy_id, 'enemy_id');
      const enemy = await pool.query(
        `SELECT e.name, m.hit_dice
         FROM campaign_enemy e
         LEFT JOIN monster m ON m.id = e.monster_id
         WHERE e.id = $1 AND e.campaign_id = $2`,
        [enemyId, campaignId]
      );
      if (enemy.rows.length === 0) throw storedError('Enemy not found', 404);
      if (!hitDice) hitDice = enemy.rows[0].hit_dice || '';
      if (!name) name = enemy.rows[0].name;
    }
    const level = raw?.level == null || raw.level === '' ? null : optionalBounded(raw.level, 'level', 1, 100);
    const figured = awardLine({
      hitDice,
      level,
      spells: raw?.spells === true,
      count,
    });
    if (figured.error) throw storedError(name ? `${name}: ${figured.error}` : figured.error, 400);
    groups.push({ name: name || hitDice || `level ${level}`, ...figured });
  }
  return groups;
}

function awardShares(total, party, requested) {
  const byId = new Map(requested.map((row) => [row.id, row.retainer === true]));
  const members = [];
  for (const [id, retainer] of byId) {
    const person = party.find((row) => row.id === id);
    if (!person) throw storedError('Character is not in this campaign', 404);
    members.push({ ...person, retainer });
  }
  if (members.length === 0) throw storedError('no one to award', 400);
  const split = splitAward(total, members);
  if (split.error) throw storedError(split.error, 400);
  return {
    full: split.full,
    half: split.half,
    shares: split.shares.map((share) => {
      const person = members.find((row) => row.id === share.id);
      const capped = cappedAward(person.xp, person.pending, person.leveling, share.amount);
      return {
        character_id: share.id,
        name: share.name,
        retainer: share.retainer,
        table: share.amount,
        amount: capped.amount,
        capped: capped.capped,
        ceiling: capped.ceiling,
      };
    }),
  };
}

app.post('/api/campaigns/:campaignId/adventuring/award', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const groups = await resolveAwardGroups(req.params.campaignId, req.body?.groups);
    const total = groups.reduce((sum, group) => sum + group.subtotal, 0);
    const requested = Array.isArray(req.body?.members) ? req.body.members : [];
    const party = await loadAwardParty(req.params.campaignId);
    const shares = awardShares(total, party, requested.map((row) => ({
      id: positiveInt(row?.character_id, 'character_id'),
      retainer: row?.retainer === true,
    })));
    res.json({ total, groups, ...shares });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error tallying experience:', error);
    res.status(500).json({ error: error.message || 'Failed to tally experience' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/award/apply', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    if (!Array.isArray(req.body?.awards) || req.body.awards.length === 0) {
      return res.status(400).json({ error: 'no one to award' });
    }
    const party = await loadAwardParty(req.params.campaignId);
    const rows = [];
    for (const raw of req.body.awards) {
      const characterId = positiveInt(raw?.character_id, 'character_id');
      const person = party.find((row) => row.id === characterId);
      if (!person) return res.status(404).json({ error: 'Character is not in this campaign' });
      const asked = nonNegativeInt(raw?.amount, 'amount');
      const capped = cappedAward(person.xp, person.pending, person.leveling, asked);
      if (capped.error) return res.status(400).json({ error: capped.error });
      rows.push({
        character_id: person.id,
        name: person.name,
        amount: capped.amount,
        capped: capped.capped,
        ceiling: capped.ceiling,
      });
    }
    const giving = rows.filter((row) => row.amount >= 1);
    if (giving.length === 0) return res.status(400).json({ error: 'Nothing to award' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of giving) {
        await client.query(
          `INSERT INTO campaign_command (campaign_id, recipient_character_id, type, payload)
           VALUES ($1, $2, 'give_xp', $3::jsonb)`,
          [req.params.campaignId, row.character_id, JSON.stringify({ amount: row.amount })]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
      throw error;
    } finally {
      client.release();
    }
    res.status(201).json({ queued: giving.length, awards: rows });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error applying experience:', error);
    res.status(500).json({ error: error.message || 'Failed to apply experience' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/treasure', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    let code = req.body?.code == null ? '' : String(req.body.code).trim();
    if (!code && req.body?.enemy_id != null && String(req.body.enemy_id).trim() !== '') {
      const enemyId = positiveInt(req.body.enemy_id, 'enemy_id');
      const enemy = await pool.query(
        'SELECT treasure_type FROM campaign_enemy WHERE id = $1 AND campaign_id = $2',
        [enemyId, req.params.campaignId]
      );
      if (enemy.rows.length === 0) return res.status(404).json({ error: 'Enemy not found' });
      code = enemy.rows[0].treasure_type == null ? '' : String(enemy.rows[0].treasure_type).trim();
      if (!code) return res.status(400).json({ error: 'That enemy has no treasure type' });
    }
    if (!code || code.length > 40) return res.status(400).json({ error: 'code must be 1 to 40 characters' });
    const found = await pool.query(
      `SELECT t.code, t.definition
       FROM treasure_type t
       JOIN campaign c ON c.id = $1
       WHERE lower(t.code) = lower($2)
         AND (
           t.ruleset_id = c.ruleset_id
           OR (
             t.ruleset_id = (SELECT parent_ruleset_id FROM ruleset WHERE id = c.ruleset_id)
             AND NOT EXISTS (
               SELECT 1 FROM treasure_type child_row
               WHERE child_row.ruleset_id = c.ruleset_id
                 AND lower(child_row.code) = lower(t.code)
             )
           )
         )`,
      [req.params.campaignId, code]
    );
    if (found.rows.length === 0) return res.status(400).json({ error: `No treasure type ${code}` });
    if (found.rows.length > 1) return res.status(400).json({ error: `Treasure type ${code} is not unique` });
    const rolled = rollTreasure(found.rows[0].definition, (sides) => randomInt(1, sides + 1));
    if (rolled.error) return res.status(400).json({ error: rolled.error });
    res.json({ code: found.rows[0].code, lines: rolled.lines });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error rolling treasure:', error);
    res.status(500).json({ error: error.message || 'Failed to roll treasure' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/surprise', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const open = await openEncounter(req.params.campaignId);
    if (rejectEncounter(res, open)) return;
    const party = await loadPartyActors(req.params.campaignId);
    const enemies = await loadEncounterEnemies(req.params.campaignId);
    const keenIds = req.body?.less_likely_enemy_ids;
    const keen = new Set();
    if (keenIds != null) {
      if (!Array.isArray(keenIds)) return res.status(400).json({ error: 'less_likely_enemy_ids must be a list' });
      for (const raw of keenIds) keen.add(positiveInt(raw, 'less_likely_enemy_ids'));
    }
    for (const id of keen) {
      if (!enemies.some((enemy) => enemy.id === id)) {
        return res.status(400).json({ error: 'That enemy is not in this encounter' });
      }
    }
    const rolled = rollSurprise({
      party: party.map((actor) => ({ id: actor.id, name: actor.name, lessLikely: actor.lessLikely })),
      enemies: enemies.map((enemy) => ({ id: enemy.id, name: enemy.name, lessLikely: keen.has(enemy.id) })),
      partyAmbushed: req.body?.party_ambush === true,
      enemiesAmbushed: req.body?.enemy_ambush === true,
      rollDie,
    });
    if (rolled.error) return res.status(400).json({ error: rolled.error });
    res.json(rolled);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error rolling surprise:', error);
    res.status(500).json({ error: error.message || 'Failed to roll surprise' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/reaction', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const open = await openEncounter(req.params.campaignId);
    if (rejectEncounter(res, open)) return;
    const characterId = positiveInt(req.body?.character_id, 'character_id');
    const party = await loadPartyActors(req.params.campaignId);
    const lead = party.find((actor) => actor.id === characterId);
    if (!lead) return res.status(404).json({ error: 'Character is not in this campaign' });
    const adjustment = optionalAdjustment(req.body?.adjustment, 'adjustment', -10, 10);
    const rolled = rollReaction({ bonus: abilityModifier(lead.chr), adjustment, rollDie });
    if (rolled.error) return res.status(400).json({ error: rolled.error });
    res.json({ character_id: lead.id, name: lead.name, ...rolled });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error rolling reaction:', error);
    res.status(500).json({ error: error.message || 'Failed to roll reaction' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/initiative', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const open = await openEncounter(req.params.campaignId);
    if (rejectEncounter(res, open)) return;
    const party = await loadPartyActors(req.params.campaignId);
    const enemies = await loadEncounterEnemies(req.params.campaignId);
    const actors = [
      ...party.map((actor) => ({
        id: actor.id,
        name: actor.name,
        side: 'party',
        bonus: abilityModifier(actor.dex) + actor.initiativeBonus,
      })),
      ...enemies.map((enemy) => ({
        id: enemy.id,
        name: enemy.name,
        side: 'enemy',
        bonus: 0,
      })),
    ];
    const rolled = rollInitiative({ actors, rollDie });
    if (rolled.error) return res.status(400).json({ error: rolled.error });
    res.json(rolled);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error rolling initiative:', error);
    res.status(500).json({ error: error.message || 'Failed to roll initiative' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/morale', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const open = await openEncounter(req.params.campaignId);
    if (rejectEncounter(res, open)) return;
    const enemyId = positiveInt(req.body?.enemy_id, 'enemy_id');
    const enemies = await loadEncounterEnemies(req.params.campaignId);
    const enemy = enemies.find((row) => row.id === enemyId);
    if (!enemy) return res.status(404).json({ error: 'Enemy not found' });
    const engaged = req.body?.engaged === true;
    let score = enemy.morale;
    if (engaged) {
      if (enemy.morale_engaged == null) return res.status(400).json({ error: 'That monster has no engaged morale' });
      score = enemy.morale_engaged;
    }
    if (score == null) return res.status(400).json({ error: 'That monster has no morale' });
    const adjustment = optionalAdjustment(req.body?.adjustment, 'adjustment', -2, 2);
    const rolled = rollMorale({ score: Number(score), adjustment, rollDie });
    if (rolled.error) return res.status(400).json({ error: rolled.error });
    res.json({ enemy_id: enemy.id, name: enemy.name, engaged, ...rolled });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error rolling morale:', error);
    res.status(500).json({ error: error.message || 'Failed to roll morale' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/turn', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const open = await openEncounter(req.params.campaignId);
    if (rejectEncounter(res, open)) return;
    const characterId = positiveInt(req.body?.character_id, 'character_id');
    const blocked = await pool.query(
      `SELECT until_seconds FROM campaign_turn_block
       WHERE campaign_id = $1 AND character_id = $2 AND until_seconds > $3`,
      [req.params.campaignId, characterId, open.game_seconds]
    );
    if (blocked.rows.length > 0) {
      return res.status(400).json({ error: 'That cleric cannot turn undead again yet' });
    }
    const cleric = await pool.query(
      `SELECT c.name, cc.class_level
       FROM characters c
       JOIN campaign_character camp ON camp.character_id = c.id AND camp.campaign_id = $1
       JOIN character_classes cc ON cc.character_id = c.id
       JOIN classes cl ON cl.id = cc.class_id
       WHERE c.id = $2 AND lower(cl.name) = 'cleric'
       ORDER BY cc.class_level DESC NULLS LAST
       LIMIT 1`,
      [req.params.campaignId, characterId]
    );
    if (cleric.rows.length === 0) return res.status(400).json({ error: 'That character is not a cleric' });
    const level = Number(cleric.rows[0].class_level);
    if (!Number.isInteger(level) || level < 1) return res.status(400).json({ error: 'That cleric has no level' });
    if (!Array.isArray(req.body?.groups) || req.body.groups.length === 0) {
      return res.status(400).json({ error: 'choose undead to turn' });
    }
    const enemies = await loadEncounterEnemies(req.params.campaignId);
    const seen = new Set();
    const groups = [];
    for (const raw of req.body.groups) {
      const enemyId = positiveInt(raw?.enemy_id, 'enemy_id');
      if (seen.has(enemyId)) return res.status(400).json({ error: 'That enemy is listed twice' });
      seen.add(enemyId);
      const enemy = enemies.find((row) => row.id === enemyId);
      if (!enemy) return res.status(400).json({ error: 'That enemy is not in this encounter' });
      const count = positiveInt(raw?.count, 'count');
      const rawHd = raw?.hit_dice;
      const override = rawHd == null || rawHd === '' ? null : positiveInt(rawHd, 'hit_dice');
      const resolved = resolveUndead(enemy.name, enemy.hit_dice, override);
      if (resolved.error) return res.status(400).json({ error: `${enemy.name}: ${resolved.error}` });
      groups.push({
        id: enemy.id,
        name: enemy.name,
        count,
        column: resolved.column,
        label: resolved.label,
        hitDice: resolved.hitDice,
      });
    }
    const rolled = rollTurn({ level, groups, rollDie });
    if (rolled.error) return res.status(400).json({ error: rolled.error });
    const until = open.game_seconds + TURN_SECONDS;
    if (rolled.block) {
      await pool.query(
        `INSERT INTO campaign_turn_block (campaign_id, character_id, until_seconds)
         VALUES ($1, $2, $3)
         ON CONFLICT (campaign_id, character_id) DO UPDATE SET until_seconds = EXCLUDED.until_seconds`,
        [req.params.campaignId, characterId, until]
      );
    } else {
      await pool.query(
        'DELETE FROM campaign_turn_block WHERE campaign_id = $1 AND character_id = $2',
        [req.params.campaignId, characterId]
      );
    }
    res.json({
      character_id: characterId,
      name: cleric.rows[0].name,
      until_seconds: rolled.block ? until : null,
      ...rolled,
    });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error turning undead:', error);
    res.status(500).json({ error: error.message || 'Failed to turn undead' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/attack', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const open = await openEncounter(req.params.campaignId);
    if (rejectEncounter(res, open)) return;
    const mode = req.body?.mode;
    if (mode !== 'melee' && mode !== 'missile' && mode !== 'back') {
      return res.status(400).json({ error: 'mode must be melee, missile, or back' });
    }
    const attackerRef = combatantRef(req.body?.attacker, 'attacker');
    const defenderRef = combatantRef(req.body?.defender, 'defender');
    if (attackerRef.side === defenderRef.side && attackerRef.id === defenderRef.id) {
      return res.status(400).json({ error: 'The attacker and the defender are the same' });
    }
    const attacker = await loadFighter(req.params.campaignId, attackerRef);
    const defender = await loadFighter(req.params.campaignId, defenderRef);
    if (!attacker) return res.status(404).json({ error: 'Attacker not found' });
    if (!defender) return res.status(404).json({ error: 'Defender not found' });
    const typedBonus = attacker.side === 'enemy' && monsterAttackBonus(attacker.hitDice) == null
      ? optionalBounded(req.body?.attack_bonus, 'attack_bonus', -10, 20)
      : null;
    const bonus = attackBonusFor(attacker, mode, typedBonus);
    if (bonus.error) return res.status(400).json({ error: bonus.error });
    const typedAc = defender.side === 'enemy' && !Number.isInteger(defender.armorClass)
      ? optionalBounded(req.body?.armor_class, 'armor_class', -10, 40)
      : null;
    const defenderAc = armorFor(defender, mode, typedAc);
    if (!Number.isInteger(defenderAc)) {
      const note = defender.defenseNote ? `: ${defender.defenseNote}` : '';
      return res.status(400).json({ error: `No armor class${note}` });
    }
    const adjustment = optionalAdjustment(req.body?.adjustment, 'adjustment', -10, 10);
    const rolled = rollAttack({
      attackBonus: bonus.bonus,
      adjustment,
      armorClass: defenderAc,
      rollDie,
    });
    if (rolled.error) return res.status(400).json({ error: rolled.error });
    res.json({
      attacker: { side: attacker.side, id: attacker.id, name: attacker.name },
      defender: { side: defender.side, id: defender.id, name: defender.name },
      mode,
      attack_note: attacker.attackNote || null,
      damage: damageDiceFor(attacker, mode),
      roll: rolled.roll,
      attack_bonus: rolled.attackBonus,
      adjustment: rolled.adjustment,
      bonus: rolled.bonus,
      total: rolled.total,
      armor_class: rolled.armorClass,
      hit: rolled.hit,
      natural: rolled.natural,
    });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error rolling attack:', error);
    res.status(500).json({ error: error.message || 'Failed to roll attack' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/damage', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const open = await openEncounter(req.params.campaignId);
    if (rejectEncounter(res, open)) return;
    const defenderRef = combatantRef(req.body?.defender, 'defender');
    const defender = await loadFighter(req.params.campaignId, defenderRef);
    if (!defender) return res.status(404).json({ error: 'Defender not found' });
    let amount;
    let faces = null;
    let flat = null;
    if (req.body?.roll === true) {
      const mode = req.body?.mode;
      if (mode !== 'melee' && mode !== 'missile' && mode !== 'back') {
        return res.status(400).json({ error: 'mode must be melee, missile, or back' });
      }
      const attacker = await loadFighter(req.params.campaignId, combatantRef(req.body?.attacker, 'attacker'));
      if (!attacker) return res.status(404).json({ error: 'Attacker not found' });
      const dice = damageDiceFor(attacker, mode);
      if (!dice) return res.status(400).json({ error: 'Enter the damage' });
      const rolled = rollWeaponDamage({ ...dice, rollDie });
      if (rolled.error) return res.status(400).json({ error: rolled.error });
      amount = rolled.amount;
      faces = rolled.faces;
      flat = rolled.flat;
    } else {
      amount = positiveInt(req.body?.amount, 'amount');
    }
    const applied = applyHitPoints(defender.hp, amount);
    if (applied.error) {
      const message = defender.side === 'enemy' && applied.error === 'no hit points'
        ? 'Set hit points on that enemy first'
        : applied.error;
      return res.status(400).json({ error: message });
    }
    await writeHitPoints(req.params.campaignId, defender, applied.hp);
    res.json({
      defender: { side: defender.side, id: defender.id, name: defender.name },
      amount,
      faces,
      flat,
      hp: applied.hp,
      down: applied.down,
    });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error applying damage:', error);
    res.status(500).json({ error: error.message || 'Failed to apply damage' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/enemies/:enemyId/hit-points', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const open = await openEncounter(req.params.campaignId);
    if (rejectEncounter(res, open)) return;
    const enemy = await loadEnemyFighter(req.params.campaignId, positiveInt(req.params.enemyId, 'enemy'));
    if (!enemy) return res.status(404).json({ error: 'Enemy not found' });
    let hp;
    let faces = null;
    let flat = null;
    if (req.body?.roll === true) {
      const rolled = rollMonsterHitPoints(enemy.hitDice, rollDie);
      if (rolled.error) return res.status(400).json({ error: rolled.error });
      hp = rolled.amount;
      faces = rolled.faces;
      flat = rolled.flat;
    } else {
      hp = nonNegativeInt(req.body?.hp, 'hp');
    }
    await writeHitPoints(req.params.campaignId, enemy, hp);
    res.json({ enemy_id: enemy.id, name: enemy.name, hp, faces, flat, down: hp === 0 });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error setting enemy hit points:', error);
    res.status(500).json({ error: error.message || 'Failed to set hit points' });
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

app.post('/api/campaigns/:campaignId/adventuring/accept', async (req, res) => {
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
    const last = await client.query(
      `SELECT w.id, w.table_roll, w.label, w.monster_id, w.quantity, w.accepted, m.treasure_type
       FROM campaign_wander w
       LEFT JOIN monster m ON m.id = w.monster_id
       WHERE w.campaign_id = $1
       ORDER BY w.at_seconds DESC, w.id DESC
       LIMIT 1
       FOR UPDATE OF w`,
      [req.params.campaignId]
    );
    const decision = acceptRoll(last.rows[0] || null);
    if (decision.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: decision.error });
    }
    const enemy = decision.enemy;
    const inserted = await client.query(
      `INSERT INTO campaign_enemy (campaign_id, name, monster_id, quantity, treasure_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, monster_id, quantity, treasure_type`,
      [req.params.campaignId, enemy.name, enemy.monster_id, enemy.quantity, enemy.treasure_type]
    );
    const board = await client.query(
      `INSERT INTO campaign_board (campaign_id, in_encounter)
       VALUES ($1, true)
       ON CONFLICT (campaign_id) DO UPDATE SET in_encounter = true
       RETURNING in_encounter, game_seconds`,
      [req.params.campaignId]
    );
    await client.query('UPDATE campaign_wander SET accepted = true WHERE id = $1', [last.rows[0].id]);
    await client.query('COMMIT');
    res.json({
      accepted: true,
      enemy: inserted.rows[0],
      in_encounter: board.rows[0].in_encounter === true,
      game_seconds: board.rows[0].game_seconds,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    console.error('Error accepting wander roll:', error);
    res.status(500).json({ error: error.message || 'Failed to accept roll' });
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
    const quantity = optionalText(req.body?.quantity, 'quantity', 80);
    const treasureType = optionalText(req.body?.treasure_type, 'treasure_type', 40);
    const inserted = await pool.query(
      `INSERT INTO campaign_enemy (campaign_id, name, quantity, treasure_type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, monster_id, quantity, treasure_type`,
      [req.params.campaignId, name, quantity, treasureType]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
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

function marchPartySql(lock) {
  return `SELECT c.id, c.name, c.hp, c.con, c.wis,
            cc.march_days, cc.march_failed,
            (
              SELECT ca.int_param
              FROM character_classes cls
              JOIN class_abilities ca
                ON ca.class_id = cls.class_id
               AND ca.ability_id = 5
               AND ca.ruleset_id = c.ruleset_id
               AND ca.level <= COALESCE(cls.class_level, 1)
              WHERE cls.character_id = c.id
              ORDER BY cls.sort_order, cls.class_id, ca.level DESC
              LIMIT 1
            ) AS death_ray
     FROM characters c
     INNER JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
     ORDER BY c.name
     ${lock ? 'FOR UPDATE OF c, cc' : ''}`;
}

app.post('/api/campaigns/:campaignId/adventuring/march', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const rest = booleanField(req.body?.rest, 'rest');
    await client.query('BEGIN');
    const found = await client.query(marchPartySql(true), [req.params.campaignId]);
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No characters in this campaign' });
    }
    if (rest) {
      await client.query(
        'UPDATE campaign_character SET march_days = 0, march_failed = false WHERE campaign_id = $1',
        [req.params.campaignId]
      );
      await client.query('COMMIT');
      return res.json({ rested: true });
    }
    const results = [];
    for (const row of found.rows) {
      const day = marchDay({
        days: Number(row.march_days) || 0,
        failed: row.march_failed === true,
        constitution: row.con,
        target: row.death_ray == null ? null : Number(row.death_ray),
      }, () => rollDie(20), () => rollDie(6));
      if (day.error) {
        await client.query('ROLLBACK');
        const message = day.error === 'no Death Ray save' ? `No Death Ray save for ${row.name}` : day.error;
        return res.status(400).json({ error: message });
      }
      const current = row.hp == null ? null : Number(row.hp);
      const applied = applyBodyHitPoints(current, day.damage === 0 ? 0 : -day.damage);
      if (applied.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `${row.name}: ${applied.error}` });
      }
      if (applied.changed) {
        await client.query('UPDATE characters SET hp = $1 WHERE id = $2', [applied.hp, row.id]);
      }
      await client.query(
        `UPDATE campaign_character SET march_days = $3, march_failed = $4
         WHERE campaign_id = $1 AND character_id = $2`,
        [req.params.campaignId, row.id, day.day, day.failed]
      );
      results.push({
        character_id: row.id,
        name: row.name,
        day: day.day,
        damage: day.damage,
        saved: day.saved,
        failed: day.failed,
        hp: applied.hp,
        down: applied.down,
        roll: day.save ? day.save.roll : null,
        total: day.save ? day.save.total : null,
        target: day.save ? day.save.target : null,
      });
    }
    await client.query('COMMIT');
    res.json({ rested: false, results });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error marching:', error);
    res.status(500).json({ error: error.message || 'Failed to march' });
  } finally {
    client.release();
  }
});

app.post('/api/campaigns/:campaignId/adventuring/lost', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const characterId = positiveInt(req.body?.character_id, 'character_id');
    const following = booleanField(req.body?.following, 'following');
    const found = await pool.query(
      `${marchPartySql(false)} `.replace('ORDER BY c.name', 'AND c.id = $2 ORDER BY c.name'),
      [req.params.campaignId, characterId]
    );
    if (found.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    const row = found.rows[0];
    const result = lostCheck({
      following,
      wisdom: row.wis,
      target: row.death_ray == null ? null : Number(row.death_ray),
    }, () => rollDie(20));
    if (result.error) {
      const message = result.error === 'no Death Ray save' ? `No Death Ray save for ${row.name}` : result.error;
      return res.status(400).json({ error: message });
    }
    res.json({
      character_id: row.id,
      name: row.name,
      lost: result.lost,
      skipped: result.skipped,
      roll: result.save ? result.save.roll : null,
      modifier: result.save ? result.save.modifier : null,
      total: result.save ? result.save.total : null,
      target: result.save ? result.save.target : null,
    });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error checking lost:', error);
    res.status(500).json({ error: error.message || 'Failed to check lost' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/weather', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const navigator = booleanField(req.body?.navigator, 'navigator');
    res.json(sailingDay(rollDie(12), rollDie(100), navigator));
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error rolling weather:', error);
    res.status(500).json({ error: error.message || 'Failed to roll weather' });
  }
});

async function loadEmployer(campaignId, characterId) {
  const found = await pool.query(
    `SELECT c.id, c.name, c.chr, cc.hire_penalty,
            (SELECT MAX(class_level) FROM character_classes WHERE character_id = c.id) AS employer_level,
            (SELECT COUNT(*)::int FROM campaign_hireling h
              WHERE h.campaign_id = cc.campaign_id AND h.employer_id = c.id AND h.kind = 'retainer') AS retained
     FROM characters c
     INNER JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
     WHERE c.id = $2`,
    [campaignId, characterId]
  );
  return found.rows[0] || null;
}

app.post('/api/campaigns/:campaignId/adventuring/hire/roll', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const characterId = positiveInt(req.body?.character_id, 'character_id');
    const adjustment = optionalAdjustment(req.body?.adjustment, 'adjustment', -10, 10);
    const employer = await loadEmployer(req.params.campaignId, characterId);
    if (!employer) return res.status(404).json({ error: 'Character not found' });
    const level = employer.employer_level == null ? 1 : Number(employer.employer_level);
    const gate = canHireRetainer({
      employerLevel: level,
      retainerLevel: 1,
      charisma: employer.chr,
      retained: Number(employer.retained) || 0,
    });
    if (gate.error && gate.maxLevel < 1) return res.status(400).json({ error: gate.error });
    if ((Number(employer.retained) || 0) >= gate.cap) return res.status(400).json({ error: gate.error });
    const rolled = hireReaction({
      bonus: retainerCap(employer.chr) - 4,
      penalty: Number(employer.hire_penalty) || 0,
      adjustment,
      rollDie,
    });
    if (rolled.error) return res.status(400).json({ error: rolled.error });
    if (rolled.further === -1) {
      await pool.query(
        'UPDATE campaign_character SET hire_penalty = -1 WHERE campaign_id = $1 AND character_id = $2',
        [req.params.campaignId, characterId]
      );
    }
    res.json({ ...rolled, character_id: characterId, name: employer.name });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error hiring:', error);
    res.status(500).json({ error: error.message || 'Failed to hire' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/hire/clear', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const characterId = positiveInt(req.body?.character_id, 'character_id');
    const updated = await pool.query(
      `UPDATE campaign_character SET hire_penalty = 0
       WHERE campaign_id = $1 AND character_id = $2
       RETURNING character_id`,
      [req.params.campaignId, characterId]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    res.json({ character_id: characterId, hire_penalty: 0 });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error clearing hire penalty:', error);
    res.status(500).json({ error: error.message || 'Failed to clear the penalty' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/hire', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const characterId = positiveInt(req.body?.character_id, 'character_id');
    const kind = req.body?.kind;
    const employer = await loadEmployer(req.params.campaignId, characterId);
    if (!employer) return res.status(404).json({ error: 'Character not found' });
    let name;
    let detail = null;
    let level = null;
    let loyalty = null;
    let morale = null;
    let cost = null;
    let quantity = 1;
    if (kind === 'retainer') {
      const total = integerField(req.body?.total, 'total');
      if (!Number.isInteger(total) || total < 9) return res.status(400).json({ error: 'They have not accepted' });
      name = optionalText(req.body?.name, 'name', 80);
      if (!name) return res.status(400).json({ error: 'name must be 1 to 80 characters' });
      level = positiveInt(req.body?.level, 'level');
      const gate = canHireRetainer({
        employerLevel: employer.employer_level == null ? 1 : Number(employer.employer_level),
        retainerLevel: level,
        charisma: employer.chr,
        retained: Number(employer.retained) || 0,
      });
      if (gate.error) return res.status(400).json({ error: gate.error });
      loyalty = startingLoyalty(employer.chr, total >= 12);
    } else if (kind === 'specialist') {
      const priced = specialistCost(req.body?.role, req.body?.cost == null ? null : integerField(req.body.cost, 'cost'));
      if (priced.error) return res.status(400).json({ error: priced.error });
      name = priced.role;
      cost = priced.cost;
    } else if (kind === 'mercenary') {
      level = req.body?.level == null ? 1 : positiveInt(req.body.level, 'level');
      quantity = req.body?.quantity == null ? 1 : positiveInt(req.body.quantity, 'quantity');
      const offer = mercenaryOffer(req.body?.role, level, quantity);
      if (offer.error) return res.status(400).json({ error: offer.error });
      name = offer.role;
      detail = offer.equipment;
      morale = offer.morale;
      cost = offer.cost;
      level = offer.level;
      quantity = offer.quantity;
    } else {
      return res.status(400).json({ error: 'kind must be retainer, specialist, or mercenary' });
    }
    const inserted = await pool.query(
      `INSERT INTO campaign_hireling
         (campaign_id, employer_id, kind, name, detail, level, loyalty, morale, cost_gp, quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, employer_id, kind, name, detail, level, loyalty, morale, cost_gp, quantity`,
      [req.params.campaignId, characterId, kind, name, detail, level, loyalty, morale, cost, quantity]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error adding hireling:', error);
    res.status(500).json({ error: error.message || 'Failed to add hireling' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/hirelings/:hirelingId/check', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const adjustment = optionalAdjustment(req.body?.adjustment, 'adjustment', -2, 2);
    const combat = booleanField(req.body?.combat, 'combat');
    const end = booleanField(req.body?.end, 'end');
    const found = await pool.query(
      `SELECT id, kind, name, loyalty, morale FROM campaign_hireling
       WHERE id = $1 AND campaign_id = $2`,
      [req.params.hirelingId, req.params.campaignId]
    );
    if (found.rows.length === 0) return res.status(404).json({ error: 'Hireling not found' });
    const row = found.rows[0];
    if (row.kind === 'specialist') return res.status(400).json({ error: 'A specialist has no loyalty or morale' });
    let checked;
    if (row.kind === 'retainer') {
      checked = loyaltyCheck({
        score: Number(row.loyalty),
        adjustment,
        combat,
        rollDie,
      });
    } else {
      checked = rollMorale({ score: Number(row.morale), adjustment, rollDie });
      checked = checked.error ? checked : { ...checked, loyalty: null, result: checked.result === 'holds' ? 'holds' : 'leaves' };
    }
    if (checked.error) return res.status(400).json({ error: checked.error });
    let removed = false;
    if (row.kind === 'retainer' && checked.loyalty !== Number(row.loyalty)) {
      await pool.query('UPDATE campaign_hireling SET loyalty = $1 WHERE id = $2', [checked.loyalty, row.id]);
    }
    if (end && checked.result === 'leaves') {
      await pool.query('DELETE FROM campaign_hireling WHERE id = $1', [row.id]);
      removed = true;
    }
    res.json({
      id: row.id,
      name: row.name,
      kind: row.kind,
      roll: checked.roll,
      target: checked.target,
      result: checked.result,
      loyalty: checked.loyalty,
      removed,
    });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error checking hireling:', error);
    res.status(500).json({ error: error.message || 'Failed to check hireling' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/hire/adventure', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const adjustment = optionalAdjustment(req.body?.adjustment, 'adjustment', -2, 2);
    const found = await pool.query(
      `SELECT id, name, loyalty FROM campaign_hireling
       WHERE campaign_id = $1 AND kind = 'retainer' ORDER BY name, id`,
      [req.params.campaignId]
    );
    if (found.rows.length === 0) return res.status(400).json({ error: 'No retainers' });
    const results = [];
    for (const row of found.rows) {
      const checked = loyaltyCheck({
        score: Number(row.loyalty),
        adjustment,
        combat: false,
        rollDie,
      });
      if (checked.error) return res.status(400).json({ error: checked.error });
      if (checked.result === 'leaves') {
        await pool.query('DELETE FROM campaign_hireling WHERE id = $1', [row.id]);
      }
      results.push({
        id: row.id,
        name: row.name,
        roll: checked.roll,
        target: checked.target,
        result: checked.result,
      });
    }
    res.json({ results });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error ending the adventure:', error);
    res.status(500).json({ error: error.message || 'Failed to check retainers' });
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/hirelings/:hirelingId', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const deleted = await pool.query(
      'DELETE FROM campaign_hireling WHERE id = $1 AND campaign_id = $2 RETURNING id',
      [req.params.hirelingId, req.params.campaignId]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Hireling not found' });
    res.json({ id: deleted.rows[0].id });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error removing hireling:', error);
    res.status(500).json({ error: error.message || 'Failed to remove hireling' });
  }
});

app.get('/api/campaigns/:campaignId/prep', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    res.json({ vehicle_ac: VEHICLE_AC, traps: TRAPS, vehicles: VEHICLES });
  } catch (error) {
    console.error('Error loading prep:', error);
    res.status(500).json({ error: error.message || 'Failed to load prep' });
  }
});

app.post('/api/campaigns/:campaignId/prep/stock', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const stocked = stockRoom(rollDie(100));
    if (stocked.error) return res.status(400).json({ error: stocked.error });
    res.json(stocked);
  } catch (error) {
    console.error('Error stocking a room:', error);
    res.status(500).json({ error: error.message || 'Failed to stock a room' });
  }
});

app.post('/api/campaigns/:campaignId/prep/damage', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const body = req.body || {};
    const result = vehicleDamage({
      listed: integerField(body.listed, 'listed'),
      hardness: integerField(body.hardness, 'hardness'),
      taken: integerField(body.taken, 'taken'),
      amount: integerField(body.amount, 'amount'),
      water: body.water === true,
    });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error applying vehicle damage:', error);
    res.status(500).json({ error: error.message || 'Failed to apply vehicle damage' });
  }
});

app.post('/api/campaigns/:campaignId/prep/repair', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const body = req.body || {};
    const result = fieldRepair({
      listed: integerField(body.listed, 'listed'),
      taken: integerField(body.taken, 'taken'),
      crew: integerField(body.crew, 'crew'),
      water: body.water === true,
      rollDie,
    });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error repairing a vehicle:', error);
    res.status(500).json({ error: error.message || 'Failed to repair a vehicle' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/light', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const source = req.body?.source;
    const rolled = rollLight(source, rollDie);
    if (rolled.error) return res.status(400).json({ error: rolled.error });
    const board = await pool.query(
      'SELECT COALESCE(game_seconds, 0) AS game_seconds FROM campaign_board WHERE campaign_id = $1',
      [req.params.campaignId]
    );
    const atSeconds = board.rows.length === 0 ? 0 : Number(board.rows[0].game_seconds);
    const inserted = await pool.query(
      `INSERT INTO campaign_mark (campaign_id, kind, note, at_seconds, duration_minutes)
       VALUES ($1, 'effect', $2, $3, $4)
       RETURNING id, kind, note, at_seconds, duration_minutes`,
      [req.params.campaignId, rolled.note, atSeconds, rolled.minutes]
    );
    res.status(201).json({ ...rolled, mark: inserted.rows[0] });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error lighting:', error);
    res.status(500).json({ error: error.message || 'Failed to light' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/body', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const characterId = positiveInt(req.body?.character_id, 'character_id');
    const ate = booleanField(req.body?.ate, 'ate');
    const drank = booleanField(req.body?.drank, 'drank');
    const bedrest = booleanField(req.body?.bedrest, 'bedrest');
    const hours = nonNegativeInt(req.body?.hours, 'hours');
    if (hours > 24) return res.status(400).json({ error: 'hours cannot exceed 24' });
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT c.hp, c.con, cc.food_missed, cc.heal_food, cc.heal_water
       FROM characters c
       INNER JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
       WHERE c.id = $2
       FOR UPDATE`,
      [req.params.campaignId, characterId]
    );
    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Character not found' });
    }
    const row = found.rows[0];
    const settled = settleBody({
      foodMissed: Number(row.food_missed) || 0,
      healFood: row.heal_food === true,
      healWater: row.heal_water === true,
    }, {
      ate,
      drank,
      hours,
      bedrest,
      constitution: row.con,
    }, rollDie);
    if (settled.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: settled.error });
    }
    const current = row.hp == null ? null : Number(row.hp);
    const applied = applyBodyHitPoints(current, settled.delta);
    if (applied.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: applied.error });
    }
    if (applied.changed) {
      await client.query('UPDATE characters SET hp = $1 WHERE id = $2', [applied.hp, characterId]);
    }
    await client.query(
      `UPDATE campaign_character
       SET food_missed = $3, heal_food = $4, heal_water = $5
       WHERE campaign_id = $1 AND character_id = $2`,
      [req.params.campaignId, characterId, settled.foodMissed, settled.healFood, settled.healWater]
    );
    await client.query('COMMIT');
    res.json({
      character_id: characterId,
      hp: applied.hp,
      down: applied.down,
      food_missed: settled.foodMissed,
      heal_food: settled.healFood,
      heal_water: settled.healWater,
      food_damage: settled.foodDamage,
      water_damage: settled.waterDamage,
      water_roll: settled.waterRoll,
      healed: settled.healed,
      required_hours: settled.required,
      slept: settled.slept,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error settling the day:', error);
    res.status(500).json({ error: error.message || 'Failed to settle the day' });
  } finally {
    client.release();
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
    console.log(`RPGHub server running on port ${portToUse}`);
    isReady = true;
  });
}

if (require.main === module) {
  startServer();
} else {
  module.exports = { app, startServer };
}
