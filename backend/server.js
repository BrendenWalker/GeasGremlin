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
const { CAMPAIGN_SHEET_ERROR, authoringRefused, sheetEditRefused } = require('./sheetLock');
const { INSIDE_INTERVAL, OUTSIDE_INTERVAL, checksDue, checkHit, matchingRow, acceptRoll } = require('./wander');
const { MIN_DELTA, MAX_DELTA, adjustedCopper } = require('./shopPrice');
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
const { applyCreatureHitPoints, catalogTreasure, fightCreature, recoverCreature } = require('./creature');
const { nextVisitStamp, visitTurns, arrivedAfterSelect } = require('./visit');
const { readFlag, playerHere } = require('./room-flag');
const { visitCheckDue, emptyCheckResult, currentVisitCheck } = require('./empty-check');
const { TERRAINS, locationTerrain } = require('./terrain');
const { stageById, suggestedNext, stageList } = require('./situation');
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
  const owned = await pool.query(
    `SELECT "user",
            EXISTS (SELECT 1 FROM campaign_character cc WHERE cc.character_id = characters.id) AS on_campaign
     FROM characters WHERE id = $1`,
    [characterId]
  );
  if (owned.rows.length === 0) {
    res.status(404).json({ error: 'Character not found' });
    return null;
  }
  const onCampaign = owned.rows[0].on_campaign === true;
  const owner = String(owned.rows[0].user || '').toLowerCase() === req.user.username.toLowerCase();
  const result = await pool.query(
    `SELECT m.role
     FROM campaign_character cc
     JOIN campaign_member m ON m.campaign_id = cc.campaign_id AND m.user_id = $1 AND m.status = 'accepted'
     WHERE cc.character_id = $2`,
    [req.user.id, characterId]
  );
  if (result.rows.length === 0) {
    if (!owner) {
      res.status(404).json({ error: 'Character not found' });
      return null;
    }
    return { gm: false, owner: true, onCampaign };
  }
  const gm = result.rows.some((row) => row.role === 'gm');
  if (edit && !gm && !owner) {
    res.status(404).json({ error: 'Character not found' });
    return null;
  }
  return { gm, owner, onCampaign };
}

// ==================== CAMPAIGNS ====================

app.get('/api/campaigns', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, r.name AS ruleset_name, m.role,
              (SELECT string_agg(u.username, ', ' ORDER BY u.username)
               FROM campaign_member gm
               JOIN app_user u ON u.id = gm.user_id
               WHERE gm.campaign_id = c.id AND gm.role = 'gm' AND gm.status = 'accepted') AS owner
       FROM campaign c
       JOIN ruleset r ON r.id = c.ruleset_id
       LEFT JOIN campaign_member m
         ON m.campaign_id = c.id AND m.user_id = $1 AND m.status = 'accepted'
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
    const result = await pool.query(
      `SELECT c.*, r.name AS ruleset_name, m.role
       FROM campaign c
       JOIN ruleset r ON r.id = c.ruleset_id
       LEFT JOIN campaign_member m
         ON m.campaign_id = c.id AND m.user_id = $1 AND m.status = 'accepted'
       WHERE c.id = $2`,
      [req.user.id, req.params.id]
    );
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
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.id, true);
    if (!member) return;
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM campaign_creature WHERE campaign_id = $1',
      [req.params.id]
    );
    const result = await client.query('DELETE FROM campaign WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found' });
    }
    await client.query('COMMIT');
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  } finally {
    client.release();
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

app.get('/api/invite-candidates', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id AS campaign_id, ch.id AS character_id, ch.name, u.username
       FROM campaign c
       JOIN campaign_member gm
         ON gm.campaign_id = c.id AND gm.user_id = $1 AND gm.role = 'gm' AND gm.status = 'accepted'
       JOIN characters ch ON ch.ruleset_id = c.ruleset_id
       JOIN app_user u ON lower(u.username) = lower(ch."user")
       WHERE NOT EXISTS (
         SELECT 1 FROM campaign_character cc
         WHERE cc.campaign_id = c.id AND cc.character_id = ch.id
       )
       ORDER BY ch.name, u.username`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing invite candidates:', error);
    res.status(500).json({ error: 'Failed to list characters' });
  }
});

app.post('/api/campaigns/:id/members', async (req, res) => {
  const member = await requireCampaign(req, res, req.params.id, true);
  if (!member) return;
  const characterId = Number(req.body?.character_id);
  if (!Number.isInteger(characterId) || characterId <= 0) {
    return res.status(400).json({ error: 'character_id must be a positive integer' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const camp = await client.query('SELECT ruleset_id FROM campaign WHERE id = $1', [req.params.id]);
    if (!camp.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const found = await client.query(
      `SELECT ch.id, ch.name, ch.ruleset_id, u.id AS user_id, u.username
       FROM characters ch
       JOIN app_user u ON lower(u.username) = lower(ch."user")
       WHERE ch.id = $1`,
      [characterId]
    );
    const row = found.rows[0];
    if (!row || Number(row.ruleset_id) !== Number(camp.rows[0].ruleset_id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'That character cannot join this campaign' });
    }
    const linked = await client.query(
      `INSERT INTO campaign_character (campaign_id, character_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING character_id`,
      [req.params.id, characterId]
    );
    if (linked.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'That character is already in this campaign' });
    }
    let status = 'accepted';
    if (row.user_id !== req.user.id) {
      const invited = await client.query(
        `INSERT INTO campaign_member (campaign_id, user_id, role, status)
         VALUES ($1, $2, 'player', 'invited')
         ON CONFLICT (campaign_id, user_id) DO NOTHING
         RETURNING status`,
        [req.params.id, row.user_id]
      );
      if (invited.rows[0]) {
        status = invited.rows[0].status;
      } else {
        const existing = await client.query(
          'SELECT status FROM campaign_member WHERE campaign_id = $1 AND user_id = $2',
          [req.params.id, row.user_id]
        );
        status = existing.rows[0]?.status || status;
      }
    }
    await client.query('COMMIT');
    res.status(201).json({
      character_id: row.id,
      name: row.name,
      username: row.username,
      status,
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    console.error('Error inviting member:', error);
    res.status(500).json({ error: 'Failed to invite' });
  } finally {
    client.release();
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removed = await client.query(
      `DELETE FROM campaign_member
       WHERE campaign_id = $1 AND user_id = $2 AND status = 'invited'
       RETURNING campaign_id`,
      [req.params.campaignId, req.user.id]
    );
    if (removed.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invite not found' });
    }
    await client.query(
      `DELETE FROM campaign_character cc
       USING characters ch
       WHERE cc.campaign_id = $1
         AND cc.character_id = ch.id
         AND lower(ch."user") = lower($2)`,
      [req.params.campaignId, req.user.username]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    console.error('Error declining invite:', error);
    res.status(500).json({ error: 'Failed to decline invite' });
  } finally {
    client.release();
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

app.delete('/api/campaigns/:campaignId/characters/:characterId', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, false);
    if (!member) return;
    const characterId = Number(req.params.characterId);
    if (!Number.isInteger(characterId) || characterId <= 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const owned = await pool.query('SELECT "user" FROM characters WHERE id = $1', [characterId]);
    if (owned.rows.length === 0) return res.status(404).json({ error: 'Character not found' });
    const owner = String(owned.rows[0].user || '').toLowerCase() === req.user.username.toLowerCase();
    if (member.role !== 'gm' && !owner) return res.status(404).json({ error: 'Character not found' });
    await client.query('BEGIN');
    const removed = await client.query(
      `DELETE FROM campaign_character
       WHERE campaign_id = $1 AND character_id = $2
       RETURNING character_id`,
      [req.params.campaignId, characterId]
    );
    if (removed.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Character not found' });
    }
    await client.query(
      'DELETE FROM campaign_hireling WHERE campaign_id = $1 AND employer_id = $2',
      [req.params.campaignId, characterId]
    );
    await client.query(
      'DELETE FROM campaign_turn_block WHERE campaign_id = $1 AND character_id = $2',
      [req.params.campaignId, characterId]
    );
    await client.query(
      'DELETE FROM campaign_presence WHERE campaign_id = $1 AND character_id = $2',
      [req.params.campaignId, characterId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    console.error('Error removing character from campaign:', error);
    res.status(500).json({ error: 'Failed to remove character' });
  } finally {
    client.release();
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
       (SELECT COALESCE(array_agg(cc.campaign_id), ARRAY[]::int[]) FROM campaign_character cc WHERE cc.character_id = c.id) AS campaign_ids,
       ${CURRENT_HP_SQL} AS current_hp
       FROM characters c
       LEFT JOIN races r ON c.race = r.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (charResult.rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }
    const character = charResult.rows[0];
    character.current_hp = character.current_hp == null ? null : Number(character.current_hp);

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
            i.rof as item_rof, i.category as item_category, ic.name as item_category_name
           FROM character_items ci
           LEFT JOIN items i ON ci.item_id = i.id
           LEFT JOIN item_categories ic ON ic.id = i.category
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

    character.viewer_is_gm = gate.gm;
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
    const member = await requireCampaign(req, res, campaignId, true);
    if (!member) return;
    const {
      name, gender, age, hair, eyes, height, weight, languages, race, class: classId,
      str, int: intVal, wis, dex, con, chr, hp, notes, quasiclass, level, xp, skillpoints, money,
      ruleset_id: rulesetRaw,
    } = req.body;
    const campaignRow = await pool.query('SELECT ruleset_id FROM campaign WHERE id = $1', [campaignId]);
    if (campaignRow.rows.length === 0) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    const campaignRuleset = Number(campaignRow.rows[0].ruleset_id);
    if (!Number.isInteger(campaignRuleset)) {
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
    const client = await pool.connect();
    let newId;
    try {
      await client.query('BEGIN');
      const idResult = await client.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM characters');
      const nextId = idResult.rows[0].next_id;
      const result = await client.query(
        `INSERT INTO characters (id, name, "user", gender, age, hair, eyes, height, weight, languages, race,
         str, "int", wis, dex, con, chr, hp, notes, quasiclass, level, xp, skillpoints, money, ruleset_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
         RETURNING *`,
        [nextId, name || 'Unnamed', req.user.username, gender || null, age ?? null, hair || null, eyes || null, height || null, weight || null, languages || null,
          race ?? null, str ?? null, intVal ?? null, wis ?? null, dex ?? null, con ?? null, chr ?? null,
          hp ?? null, notes || null, quasiclass ?? null, level ?? 1, xp ?? 0, skillpoints ?? null, money ?? null,
          rulesetId]
      );
      newId = result.rows[0].id;
      await client.query(
        'INSERT INTO campaign_character (campaign_id, character_id) VALUES ($1, $2)',
        [campaignId, newId]
      );
      if (classId != null) {
        await client.query(
          `INSERT INTO character_classes (character_id, class_id, class_level, sort_order)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (character_id, class_id) DO UPDATE SET
             class_level = EXCLUDED.class_level, modified = CURRENT_TIMESTAMP`,
          [newId, classId, level ?? 1]
        );
      }
      await client.query(
        `INSERT INTO campaign_member (campaign_id, user_id, role, status)
         VALUES ($1, $2, 'player', 'accepted')
         ON CONFLICT (campaign_id, user_id) DO UPDATE
           SET status = 'accepted'
           WHERE campaign_member.role <> 'gm'`,
        [campaignId, req.user.id]
      );
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
      throw error;
    } finally {
      client.release();
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
    if (sheetEditRefused(gate.gm, gate.onCampaign, req.body)) {
      return res.status(403).json({ error: CAMPAIGN_SHEET_ERROR });
    }
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
      'name', 'user', 'gender', 'age', 'hair', 'eyes', 'height', 'weight', 'languages', 'race',
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
       languages = $9,
       race = $10, str = $11, "int" = $12, wis = $13, dex = $14, con = $15, chr = $16,
       hp = $17, notes = $18, quasiclass = $19, level = $20, xp = $21, skillpoints = $22, money = $23,
       equipped_melee_primary_id = $24, equipped_melee_secondary_id = $25, equipped_ranged_id = $26,
       equipped_armor_id = $27, equipped_shield_id = $28,
       modified = CURRENT_TIMESTAMP
       WHERE id = $29`,
      [merged.name, merged.user, merged.gender, merged.age, merged.hair, merged.eyes, merged.height, merged.weight,
        merged.languages,
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
       (SELECT COALESCE(array_agg(cc2.campaign_id), ARRAY[]::int[]) FROM campaign_character cc2 WHERE cc2.character_id = c.id) AS campaign_ids,
       ${CURRENT_HP_SQL} AS current_hp
       FROM characters c
       LEFT JOIN races r ON c.race = r.id
       WHERE c.id = $1`,
      [id]
    );
    const saved = result.rows[0];
    saved.current_hp = saved.current_hp == null ? null : Number(saved.current_hp);
    res.json(saved);
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

app.post('/api/characters/:id/hit-points', async (req, res) => {
  const client = await pool.connect();
  try {
    const gate = await characterGate(req, res, req.params.id, true);
    if (!gate) return;
    const delta = integerField(req.body?.delta, 'delta');
    if (delta == null) throw storedError('delta must be an integer', 400);
    await client.query('BEGIN');
    const written = await writeCharacterHitPoints(client, req.params.id, delta, delta < 0 ? 'damage' : 'heal');
    await client.query('COMMIT');
    res.json({ hp: written.maximum, current_hp: written.hp, down: written.down });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (res.headersSent) return;
    sendStoredError(res, error, 'Failed to change hit points');
  } finally {
    client.release();
  }
});

// ==================== CHARACTER ITEMS ====================

app.post('/api/characters/:id/items', async (req, res) => {
  try {
    const gate = await characterGate(req, res, req.params.id, true);
    if (!gate) return;
    if (authoringRefused(gate.gm, gate.onCampaign)) {
      return res.status(403).json({ error: CAMPAIGN_SHEET_ERROR });
    }
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
        i.rof as item_rof, i.category as item_category, ic.name as item_category_name
       FROM items i
       LEFT JOIN item_categories ic ON ic.id = i.category
       WHERE i.id = $1`,
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

const CLASS_SPELL_SLOTS = `
  JOIN LATERAL (
    SELECT cs.level1, cs.level2, cs.level3, cs.level4, cs.level5, cs.level6, cs.level7
    FROM class_spells cs
    WHERE cs.class_id = cc.class_id
      AND cs.char_level <= COALESCE(cc.class_level, 1)
    ORDER BY cs.char_level DESC
    LIMIT 1
  ) slots ON true`;

function spellSlotCount(levelSql) {
  return `CASE ${levelSql}
    WHEN 1 THEN slots.level1
    WHEN 2 THEN slots.level2
    WHEN 3 THEN slots.level3
    WHEN 4 THEN slots.level4
    WHEN 5 THEN slots.level5
    WHEN 6 THEN slots.level6
    WHEN 7 THEN slots.level7
    ELSE 0
  END`;
}

app.post('/api/characters/:id/spells', async (req, res) => {
  try {
    const gate = await characterGate(req, res, req.params.id, true);
    if (!gate) return;
    if (authoringRefused(gate.gm, gate.onCampaign)) {
      return res.status(403).json({ error: CAMPAIGN_SHEET_ERROR });
    }
    const characterId = req.params.id;
    const { spell_id, memorized = 0 } = req.body;
    const allowed = await pool.query(
      `SELECT 1
       FROM spell_class sc
       JOIN character_classes cc
         ON cc.character_id = $1 AND cc.class_id = sc.class_id
       JOIN classes cl ON cl.id = cc.class_id AND cl.has_spellbook
       ${CLASS_SPELL_SLOTS}
       WHERE sc.spell_id = $2
         AND ${spellSlotCount('sc.level')} > 0`,
      [characterId, spell_id]
    );
    if (allowed.rowCount === 0) {
      return res.status(400).json({ error: 'Spell is not available at this class level' });
    }
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
    const intend = Number(req.body.intend);
    if (!Number.isInteger(intend) || intend < 0) {
      return res.status(400).json({ error: 'To-memorize count must be a whole number' });
    }
    const grants = await pool.query(
      `SELECT sc.level AS circle, cl.has_spellbook, ${spellSlotCount('sc.level')} AS slots
       FROM spell_class sc
       JOIN character_classes cc ON cc.character_id = $1 AND cc.class_id = sc.class_id
       JOIN classes cl ON cl.id = cc.class_id
       ${CLASS_SPELL_SLOTS}
       WHERE sc.spell_id = $2`,
      [characterId, spellId]
    );
    const open = grants.rows.filter((row) => Number(row.slots) > 0);
    if (open.length === 0) {
      return res.status(400).json({ error: 'Spell is not available at this class level' });
    }
    const circle = Math.min(...open.map((row) => Number(row.circle)));
    const atCircle = open.filter((row) => Number(row.circle) === circle);
    if (!atCircle.some((row) => !row.has_spellbook)) {
      const known = await pool.query(
        'SELECT known FROM character_spells WHERE character_id = $1 AND spell_id = $2',
        [characterId, spellId]
      );
      if (!Number(known.rows[0]?.known)) {
        return res.status(400).json({ error: 'Learn this spell before memorizing it' });
      }
    }
    const capResult = await pool.query(
      `SELECT MAX(${spellSlotCount('$2::int')}) AS slots
       FROM character_classes cc
       ${CLASS_SPELL_SLOTS}
       WHERE cc.character_id = $1
         AND ${spellSlotCount('$2::int')} > 0`,
      [characterId, circle]
    );
    const cap = Number(capResult.rows[0]?.slots) || 0;
    const others = await pool.query(
      `SELECT cs.spell_id, cs.intend, MIN(sc.level) AS circle
       FROM character_spells cs
       JOIN spell_class sc ON sc.spell_id = cs.spell_id
       JOIN character_classes cc ON cc.character_id = cs.character_id AND cc.class_id = sc.class_id
       ${CLASS_SPELL_SLOTS}
       WHERE cs.character_id = $1
         AND cs.spell_id <> $2
         AND ${spellSlotCount('sc.level')} > 0
       GROUP BY cs.spell_id, cs.intend`,
      [characterId, spellId]
    );
    const used = others.rows.reduce((sum, row) => (
      Number(row.circle) === circle ? sum + (Number(row.intend) || 0) : sum
    ), 0);
    if (used + intend > cap) {
      return res.status(400).json({ error: `Only ${cap} spells of this level can be memorized` });
    }
    const result = await pool.query(
      `INSERT INTO character_spells (character_id, spell_id, intend)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id, spell_id) DO UPDATE
       SET intend = EXCLUDED.intend, modified = CURRENT_TIMESTAMP
       RETURNING *`,
      [characterId, spellId, intend]
    );
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
    const spent = await pool.query(
      `UPDATE character_spells
       SET memorized = memorized - 1, modified = CURRENT_TIMESTAMP
       WHERE character_id = $1 AND spell_id = $2 AND memorized > 0
       RETURNING memorized`,
      [characterId, spellId]
    );
    if (spent.rowCount === 0) {
      return res.status(400).json({ error: 'No memorized castings of this spell' });
    }
    res.json({ message: 'Spell cast', spell_level: level, memorized: spent.rows[0].memorized });
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

const ITEM_CATALOG_KEY = `child_row.category IS NOT DISTINCT FROM i.category
  AND child_row.type IS NOT DISTINCT FROM i.type
  AND child_row.name = i.name
  AND child_row.size IS NOT DISTINCT FROM i.size`;

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
      `SELECT s.*,
         COALESCE(
           json_agg(
             json_build_object('class_id', sc.class_id, 'level', sc.level)
             ORDER BY sc.class_id
           ) FILTER (WHERE sc.class_id IS NOT NULL),
           '[]'::json
         ) AS classes
       FROM spells s
       LEFT JOIN spell_class sc ON sc.spell_id = s.id
       WHERE ($1::int IS NULL OR ${visibleInRuleset('spells', 's', 'child_row.name = s.name')})
       GROUP BY s.id
       ORDER BY s.name`,
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
       WHERE ($1::int IS NULL OR ${visibleInRuleset('items', 'i', ITEM_CATALOG_KEY)})
       ORDER BY i.name`,
      [filter.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.get('/api/monsters', async (req, res) => {
  try {
    const filter = readRulesetFilter(req, res);
    if (!filter) return;
    const result = filter.id == null
      ? await pool.query('SELECT id, name, treasure_type FROM monster ORDER BY name, id')
      : await pool.query(
        `SELECT m.id, m.name, m.treasure_type
         FROM monster m
         WHERE ${visibleInRuleset('monster', 'm', 'child_row.name = m.name')}
         ORDER BY m.name, m.id`,
        [filter.id]
      );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching monsters:', error);
    res.status(500).json({ error: 'Failed to fetch monsters' });
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
     WHERE EXISTS (SELECT 1 FROM characters WHERE id = $2)
     RETURNING id, character_id, item_id, quantity, bonus, value`,
    [idResult.rows[0].next_id, characterId, itemId, quantity, bonus, value]
  );
  if (inserted.rowCount === 0) throw storedError('Character not found', 404);
  return inserted.rows[0];
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

async function copyIntendToMemorized(db, campaignId, characterId) {
  if (characterId) {
    await db.query(
      `UPDATE character_spells
       SET memorized = intend, modified = CURRENT_TIMESTAMP
       WHERE character_id = $1`,
      [characterId]
    );
    return;
  }
  await db.query(
    `UPDATE character_spells cs
     SET memorized = cs.intend, modified = CURRENT_TIMESTAMP
     FROM campaign_character cc
     WHERE cs.character_id = cc.character_id
       AND cc.campaign_id = $1`,
    [campaignId]
  );
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
       ORDER BY c.name`,
      [req.user.username]
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
      `SELECT c.id, c.name, c."user", c.hp, ${CURRENT_HP_SQL} AS current_hp
       FROM characters c
       INNER JOIN campaign_character cc ON cc.character_id = c.id AND cc.campaign_id = $1
       ORDER BY c.name`,
      [req.params.campaignId]
    );
    res.json(result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      user: row.user,
      hp: row.hp == null ? null : Number(row.hp),
      current_hp: row.current_hp == null ? null : Number(row.current_hp),
    })));
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
    if ((type || 'none') === 'new_day') {
      await copyIntendToMemorized(pool, campaignId, recipient_character_id ?? null);
    }
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
    `SELECT COALESCE(c.concluded, false) AS concluded,
            COALESCE(b.game_seconds, 0) AS game_seconds,
            b.visit_seconds,
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
  const visitStamp = camp.rows[0].visit_seconds;
  const [enemies, characters, marks, locations, tables, wanders, turnBlocks, bodies, hirelings, visitRows] = await Promise.all([
    pool.query(
      `SELECT e.id, e.name, e.monster_id, e.treasure_type, e.hp, e.base_hp, e.location_id,
              m.hit_dice, m.morale, m.morale_engaged, m.armor_class, m.defense_note, m.attack_note, m.notes
       FROM campaign_creature e
       LEFT JOIN monster m ON m.id = e.monster_id
       WHERE e.campaign_id = $1 AND e.in_fight
       ORDER BY e.id`,
      [campaignId]
    ),
    pool.query(
      `SELECT c.id, c.name, c."user", c.hp, ${CURRENT_HP_SQL} AS current_hp,
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
      `SELECT id, name, place, check_die, interval_seconds, encounter_table_id, terrain, movement_pct, summary, arrived_seconds, site
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
      `SELECT id, location_name, at_seconds, check_die, check_roll, table_die, table_roll, label, quantity, accepted, kind
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
    visitStamp == null
      ? Promise.resolve({ rows: [] })
      : pool.query(
        `SELECT id, location_name, at_seconds, check_die, check_roll, label, kind
         FROM campaign_wander
         WHERE campaign_id = $1 AND kind = 'visit' AND at_seconds >= $2
         ORDER BY at_seconds DESC, id DESC
         LIMIT 1`,
        [campaignId, visitStamp]
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
      current_hp: row.current_hp == null ? null : Number(row.current_hp),
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
  const locationIds = locations.rows.map((row) => row.id);
  const shopRows = locationIds.length === 0
    ? { rows: [] }
    : await pool.query(
      `SELECT s.id, s.location_id, s.name, s.buy_cost_delta, s.sell_cost_delta,
              COALESCE(
                array_agg(sc.item_category_id ORDER BY sc.item_category_id)
                  FILTER (WHERE sc.item_category_id IS NOT NULL),
                '{}'
              ) AS category_ids
       FROM campaign_location_shops s
       LEFT JOIN campaign_location_shop_item_categories sc ON sc.shop_id = s.id
       WHERE s.location_id = ANY($1::int[])
       GROUP BY s.id
       ORDER BY s.name, s.id`,
      [locationIds]
    );
  const shopsByLocation = new Map();
  for (const row of shopRows.rows) {
    const shop = {
      id: row.id,
      name: row.name,
      buy_cost_delta: Number(row.buy_cost_delta),
      sell_cost_delta: Number(row.sell_cost_delta),
      category_ids: (row.category_ids || []).map((id) => Number(id)),
    };
    const placeId = Number(row.location_id);
    if (!shopsByLocation.has(placeId)) shopsByLocation.set(placeId, []);
    shopsByLocation.get(placeId).push(shop);
  }
  const creatureRows = locationIds.length === 0
    ? { rows: [] }
    : await pool.query(
      `SELECT id, location_id, name, monster_id, hp, base_hp, disposition, note, in_fight
       FROM campaign_creature
       WHERE location_id = ANY($1::int[])
       ORDER BY name, id`,
      [locationIds]
    );
  const flagRows = locationIds.length === 0
    ? { rows: [] }
    : await pool.query(
      `SELECT id, location_id, note, state
       FROM campaign_location_flag
       WHERE location_id = ANY($1::int[])
       ORDER BY note, id`,
      [locationIds]
    );
  const creaturesByLocation = new Map();
  for (const row of creatureRows.rows) {
    const creature = {
      id: Number(row.id),
      name: row.name,
      monster_id: row.monster_id == null ? null : Number(row.monster_id),
      hp: row.hp == null ? null : Number(row.hp),
      base_hp: row.base_hp == null ? null : Number(row.base_hp),
      disposition: row.disposition,
      note: row.note,
      in_fight: row.in_fight === true,
    };
    const placeId = Number(row.location_id);
    if (!creaturesByLocation.has(placeId)) creaturesByLocation.set(placeId, []);
    creaturesByLocation.get(placeId).push(creature);
  }
  const flagsByLocation = new Map();
  for (const row of flagRows.rows) {
    const flag = { id: Number(row.id), note: row.note, state: row.state };
    const placeId = Number(row.location_id);
    if (!flagsByLocation.has(placeId)) flagsByLocation.set(placeId, []);
    flagsByLocation.get(placeId).push(flag);
  }
  return {
    game_seconds: camp.rows[0].game_seconds,
    in_encounter: camp.rows[0].in_encounter,
    place: camp.rows[0].place,
    location_id: camp.rows[0].location_id,
    enemies: enemies.rows.map((row) => ({
      ...row,
      hp: row.hp == null ? null : Number(row.hp),
      base_hp: row.base_hp == null ? null : Number(row.base_hp),
      monster_id: row.monster_id == null ? null : Number(row.monster_id),
      location_id: row.location_id == null ? null : Number(row.location_id),
    })),
    characters: characterRows,
    party_move: slow ? slow.move : null,
    party_turn: slow ? slow.turn_feet : null,
    party_miles: slow ? slow.miles : null,
    party_slow: slow ? slow.name : null,
    visit_turns: selected && selected.site
      ? visitTurns(gameSeconds, camp.rows[0].visit_seconds, TURN_SECONDS)
      : null,
    overland_miles: overland,
    forced_miles: forcedMiles(overland),
    air_miles: airMiles(baseMiles),
    stall_feet: stallFeet(slow ? slow.move : null),
    hirelings: hirelings.rows,
    specialists: SPECIALISTS,
    mercenaries: MERCENARIES,
    marks: marks.rows,
    locations: locations.rows.map((row) => ({
      ...row,
      shops: shopsByLocation.get(Number(row.id)) || [],
      creatures: creaturesByLocation.get(Number(row.id)) || [],
      flags: flagsByLocation.get(Number(row.id)) || [],
    })),
    tables: tables.rows.map((row) => ({
      id: row.id,
      name: row.name,
      die: row.die,
      custom: row.custom === true || row.custom === 't',
      rows: rowsByTable.get(row.id) || [],
    })),
    terrains: TERRAINS,
    wanders: wanders.rows,
    visit_check: currentVisitCheck(visitRows.rows, visitStamp == null ? null : Number(visitStamp)),
    turn_blocks: turnBlocks.rows,
    situation: await loadSituation(campaignId, camp.rows[0].concluded === true),
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
    const previous = now - step.seconds;
    // Drop effects that were already expired before this tick. Ones that end on this tick stay for the red row.
    await client.query(
      `DELETE FROM campaign_mark
       WHERE campaign_id = $1
         AND kind = 'effect'
         AND (at_seconds::bigint + duration_minutes::bigint * 60) <= $2::bigint`,
      [req.params.campaignId, previous]
    );
    let checks = 0;
    let visit = null;
    if (step.wander) {
      const clock = {
        previous: now - step.seconds,
        now,
        inEncounter: updated.rows[0].in_encounter === true,
        locationId: updated.rows[0].location_id,
        checkSeconds: updated.rows[0].check_seconds == null ? null : Number(updated.rows[0].check_seconds),
      };
      checks = await applyWander(client, req.params.campaignId, clock);
      visit = await applyVisitCheck(client, req.params.campaignId, clock);
    }
    let queued = null;
    if (step.command === 'new_day') {
      await copyIntendToMemorized(client, req.params.campaignId, null);
    }
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
    res.json({ game_seconds: now, queued, checks, visit });
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
     FROM campaign_creature e
     LEFT JOIN monster m ON m.id = e.monster_id
     WHERE e.campaign_id = $1 AND e.in_fight
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
    `SELECT c.id, c.name, c.str, c.dex, ${CURRENT_HP_SQL} AS hp,
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
    `SELECT e.id, e.name, e.hp, e.base_hp,
            m.hit_dice, m.armor_class, m.defense_note, m.attack_note
     FROM campaign_creature e
     LEFT JOIN monster m ON m.id = e.monster_id
     WHERE e.campaign_id = $1 AND e.id = $2 AND e.in_fight`,
    [campaignId, enemyId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    side: 'enemy',
    id: row.id,
    name: row.name,
    hp: row.hp == null ? null : Number(row.hp),
    baseHp: row.base_hp == null ? null : Number(row.base_hp),
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

const CURRENT_HP_SQL = `CASE WHEN c.hp IS NULL THEN NULL
  ELSE LEAST(GREATEST(c.hp + COALESCE((
    SELECT SUM(e.value)
    FROM character_effects e
    JOIN stat s ON s.id = e.effect AND s.name = 'HP'
    WHERE e.character_id = c.id
  ), 0), 0), c.hp)
END`;

function settleHitNote(settled) {
  if (settled.delta > 0) return 'rest';
  if (settled.foodDamage > 0 && settled.waterDamage > 0) return 'hunger, thirst';
  if (settled.foodDamage > 0) return 'hunger';
  if (settled.waterDamage > 0) return 'thirst';
  return 'rest';
}

async function writeCharacterHitPoints(client, characterId, delta, note) {
  if (!Number.isInteger(delta)) throw storedError('delta must be an integer', 400);
  const locked = await client.query(
    'SELECT hp FROM characters WHERE id = $1 FOR UPDATE',
    [characterId]
  );
  if (locked.rows.length === 0) throw storedError('Character not found', 404);
  const maximum = locked.rows[0].hp == null ? null : Number(locked.rows[0].hp);
  if (!Number.isInteger(maximum)) {
    if (delta === 0) return { hp: null, maximum: null, down: false, changed: false };
    throw storedError('set hit points first', 400);
  }
  const stat = await client.query(`SELECT id FROM stat WHERE name = 'HP' ORDER BY id LIMIT 1`);
  if (stat.rows.length === 0) throw storedError('HP stat is missing', 500);
  const effectId = Number(stat.rows[0].id);
  const sum = await client.query(
    `SELECT COALESCE(SUM(value), 0) AS wound
     FROM character_effects
     WHERE character_id = $1 AND effect = $2`,
    [characterId, effectId]
  );
  const wound = Number(sum.rows[0].wound) || 0;
  const current = Number.isInteger(maximum) ? Math.min(maximum, Math.max(0, maximum + wound)) : null;
  const applied = applyBodyHitPoints(current, delta, maximum);
  if (applied.error) throw storedError(applied.error, 400);
  const clear = async () => {
    await client.query(
      'DELETE FROM character_effects WHERE character_id = $1 AND effect = $2',
      [characterId, effectId]
    );
  };
  if (delta !== 0 && applied.full) {
    await clear();
  } else if (applied.changed) {
    if (current === maximum) await clear();
    if (!note) throw storedError('hit point note is missing', 500);
    const next = await client.query(
      'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM character_effects WHERE character_id = $1',
      [characterId]
    );
    await client.query(
      `INSERT INTO character_effects (id, character_id, effect, note, value, duration)
       VALUES ($1, $2, $3, $4, $5, -1)`,
      [next.rows[0].next_id, characterId, effectId, note, applied.applied]
    );
  }
  return { hp: applied.hp, maximum, down: applied.down, changed: applied.changed };
}

async function writeHitPoints(campaignId, figure, hp) {
  if (figure.side === 'character') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const written = await writeCharacterHitPoints(client, figure.id, hp - figure.hp, 'damage');
      await client.query('COMMIT');
      return written.hp;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
      throw error;
    } finally {
      client.release();
    }
  }
  const linked = applyCreatureHitPoints(figure.baseHp, hp);
  if (linked.error) throw storedError(linked.error, 400);
  const updated = await pool.query(
    `UPDATE campaign_creature SET hp = $1, base_hp = $2
     WHERE id = $3 AND campaign_id = $4 AND in_fight
     RETURNING hp`,
    [linked.hp, linked.baseHp, figure.id, campaignId]
  );
  if (updated.rows.length === 0) throw storedError('Enemy not found', 404);
  return updated.rows[0].hp == null ? null : Number(updated.rows[0].hp);
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

async function applyVisitCheck(client, campaignId, clock) {
  if (clock.inEncounter || clock.locationId == null) return null;
  const loc = await client.query(
    `SELECT l.name, l.check_die, l.interval_seconds, b.visit_seconds
     FROM campaign_location l
     JOIN campaign_board b ON b.campaign_id = l.campaign_id AND b.location_id = l.id
     WHERE l.id = $1 AND l.campaign_id = $2`,
    [clock.locationId, campaignId]
  );
  if (loc.rows.length === 0) return null;
  const location = loc.rows[0];
  if (location.visit_seconds == null) return null;
  const stamp = Number(location.visit_seconds);
  const fired = await client.query(
    `SELECT 1 FROM campaign_wander
     WHERE campaign_id = $1 AND kind = 'visit' AND at_seconds >= $2
     LIMIT 1`,
    [campaignId, stamp]
  );
  const interval = Number(location.interval_seconds);
  if (!visitCheckDue(stamp, clock.now, interval, fired.rows.length > 0, clock.inEncounter)) return null;
  const creatures = await client.query(
    `SELECT id, name, monster_id, hp, disposition
     FROM campaign_creature
     WHERE location_id = $1`,
    [clock.locationId]
  );
  const checkDie = Number(location.check_die);
  const checkRoll = rollDie(checkDie);
  const result = emptyCheckResult(creatures.rows, checkRoll);
  await client.query(
    `INSERT INTO campaign_wander
       (campaign_id, location_id, location_name, at_seconds, check_die, check_roll, monster_id, label, kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'visit')`,
    [
      campaignId,
      clock.locationId,
      location.name,
      stamp + interval,
      checkDie,
      checkRoll,
      result.monster_id,
      result.name,
    ]
  );
  return {
    outcome: result.outcome,
    name: result.name,
    check_die: checkDie,
    check_roll: checkRoll,
  };
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
    summary: optionalText(body?.summary, 'summary', 4000),
    site: optionalText(body?.site, 'site', 80),
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
         (campaign_id, name, place, check_die, interval_seconds, encounter_table_id, terrain, movement_pct, summary, site)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, place, check_die, interval_seconds, encounter_table_id, terrain, movement_pct, summary, arrived_seconds, site`,
      [req.params.campaignId, fields.name, fields.place, fields.checkDie, fields.interval, fields.tableId, fields.terrain, fields.movementPct, fields.summary, fields.site]
    );
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(400).json({ error: 'A location with that name already exists' });
    if (error.code === '23514') {
      const message = error.constraint === 'campaign_location_site_check'
        ? 'Site must be a name'
        : 'That terrain is not allowed on this location';
      return res.status(400).json({ error: message });
    }
    console.error('Error creating location:', error);
    res.status(500).json({ error: error.message || 'Failed to create location' });
  }
});

async function selectCampaignLocation(client, campaignId, locationId) {
  const loc = await client.query(
    'SELECT id, place, site, arrived_seconds FROM campaign_location WHERE id = $1 AND campaign_id = $2',
    [locationId, campaignId]
  );
  if (loc.rows.length === 0) throw storedError('Location not found', 404);
  const board = await client.query(
    `SELECT COALESCE(b.game_seconds, 0) AS game_seconds, b.visit_seconds, l.site
     FROM campaign_board b
     LEFT JOIN campaign_location l ON l.id = b.location_id
     WHERE b.campaign_id = $1`,
    [campaignId]
  );
  const gameSeconds = board.rows.length === 0 ? 0 : Number(board.rows[0].game_seconds);
  const visitSeconds = nextVisitStamp(
    board.rows.length === 0 ? null : board.rows[0].site,
    loc.rows[0].site,
    gameSeconds,
    board.rows.length === 0 ? null : board.rows[0].visit_seconds
  );
  const updated = await client.query(
    `INSERT INTO campaign_board (campaign_id, place, location_id, check_seconds, visit_seconds)
     VALUES ($1, $2, $3, 0, $4)
     ON CONFLICT (campaign_id) DO UPDATE
     SET place = EXCLUDED.place,
         location_id = EXCLUDED.location_id,
         check_seconds = CASE
           WHEN campaign_board.location_id IS NOT DISTINCT FROM EXCLUDED.location_id
             THEN campaign_board.check_seconds
           ELSE campaign_board.game_seconds
         END,
         visit_seconds = EXCLUDED.visit_seconds
     RETURNING place, location_id, check_seconds, game_seconds, visit_seconds`,
    [campaignId, loc.rows[0].place, loc.rows[0].id, visitSeconds]
  );
  await client.query(
    `UPDATE campaign_location
     SET arrived_seconds = $3
     WHERE id = $1 AND campaign_id = $2 AND arrived_seconds IS NULL`,
    [locationId, campaignId, arrivedAfterSelect(loc.rows[0].arrived_seconds, Number(updated.rows[0].game_seconds))]
  );
  return updated.rows[0];
}

app.post('/api/campaigns/:campaignId/adventuring/locations/:locationId/select', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    await client.query('BEGIN');
    const updated = await selectCampaignLocation(client, req.params.campaignId, req.params.locationId);
    await client.query('COMMIT');
    res.json(updated);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error selecting location:', error);
    res.status(500).json({ error: error.message || 'Failed to select location' });
  } finally {
    client.release();
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/locations/:locationId', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    await client.query('BEGIN');
    await client.query(
      `UPDATE campaign_board SET check_seconds = NULL, visit_seconds = NULL
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
    if (error.code === '23503' || error.code === '23001') {
      const message = error.constraint === 'campaign_creature_location_fkey'
        ? 'Creatures still use this location'
        : 'A situation or lead still uses this location';
      return res.status(400).json({ error: message });
    }
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
    const prior = await client.query(
      `SELECT l.site, b.location_id, b.visit_seconds, COALESCE(b.game_seconds, 0) AS game_seconds
       FROM campaign_location l
       LEFT JOIN campaign_board b ON b.campaign_id = l.campaign_id
       WHERE l.id = $1 AND l.campaign_id = $2`,
      [req.params.locationId, req.params.campaignId]
    );
    if (!(await tableForCampaign(client, req.params.campaignId, fields.tableId))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Table is not in this campaign' });
    }
    const updated = await client.query(
      `UPDATE campaign_location
       SET name = $3, place = $4, check_die = $5, interval_seconds = $6,
           encounter_table_id = $7, terrain = $8, movement_pct = $9, summary = $10, site = $11
       WHERE id = $1 AND campaign_id = $2
       RETURNING id, name, place, check_die, interval_seconds, encounter_table_id, terrain, movement_pct, summary, arrived_seconds, site`,
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
        fields.summary,
        fields.site,
      ]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Location not found' });
    }
    const standing = prior.rows[0];
    if (standing && standing.location_id != null && String(standing.location_id) === String(req.params.locationId)) {
      const stamp = nextVisitStamp(
        standing.site,
        fields.site,
        Number(standing.game_seconds),
        standing.visit_seconds
      );
      await client.query(
        'UPDATE campaign_board SET visit_seconds = $2 WHERE campaign_id = $1',
        [req.params.campaignId, stamp]
      );
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
    if (error.code === '23514') {
      const message = error.constraint === 'campaign_location_site_check'
        ? 'Site must be a name'
        : 'That terrain is not allowed on this location';
      return res.status(400).json({ error: message });
    }
    console.error('Error updating location:', error);
    res.status(500).json({ error: error.message || 'Failed to update location' });
  } finally {
    client.release();
  }
});

const CREATURE_BATCH_MAX = 100;

function creatureCount(body) {
  const raw = body?.count != null && body.count !== '' ? body.count : body?.quantity;
  if (raw == null || raw === '') return 1;
  if (typeof raw === 'string' && !/^\d+$/.test(raw.trim())) {
    throw storedError('count must be a positive integer', 400);
  }
  const count = positiveInt(raw, 'count');
  if (count > CREATURE_BATCH_MAX) throw storedError(`count must be from 1 to ${CREATURE_BATCH_MAX}`, 400);
  return count;
}

function creatureTotals(body) {
  if (Array.isArray(body?.hit_points)) {
    if (body.hit_points.length < 1 || body.hit_points.length > CREATURE_BATCH_MAX) {
      throw storedError(`hit_points must be 1 to ${CREATURE_BATCH_MAX} totals`, 400);
    }
    return body.hit_points.map((value, index) => positiveInt(value, `hit_points ${index + 1}`));
  }
  const hp = positiveInt(body?.hp, 'hp');
  const count = body?.count == null || body?.count === '' ? 1 : positiveInt(body.count, 'count');
  if (count > CREATURE_BATCH_MAX) throw storedError(`count must be from 1 to ${CREATURE_BATCH_MAX}`, 400);
  return Array(count).fill(hp);
}

async function monsterForCreature(client, campaignId, name, monsterId) {
  const camp = await client.query('SELECT ruleset_id FROM campaign WHERE id = $1', [campaignId]);
  if (camp.rows.length === 0) throw storedError('Campaign not found', 404);
  const rulesetId = camp.rows[0].ruleset_id;
  const visible = visibleInRuleset('monster', 'm', 'child_row.name = m.name');
  if (monsterId != null) {
    const found = await client.query(
      `SELECT m.id, m.name, m.treasure_type FROM monster m WHERE m.id = $2 AND ${visible}`,
      [rulesetId, monsterId]
    );
    if (found.rows.length === 0) throw storedError('Monster is not in this campaign', 400);
    return found.rows[0];
  }
  const found = await client.query(
    `SELECT m.id, m.name, m.treasure_type FROM monster m WHERE m.name = $2 AND ${visible}
     ORDER BY CASE WHEN m.ruleset_id = $1 THEN 0 ELSE 1 END, m.id
     LIMIT 1`,
    [rulesetId, name]
  );
  return found.rows.length === 0 ? null : found.rows[0];
}

app.post('/api/campaigns/:campaignId/adventuring/locations/:locationId/creatures', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const name = requiredName(req.body?.name, 'name');
    const totals = creatureTotals(req.body);
    const note = optionalText(req.body?.note, 'note', 400);
    const requestedMonster = req.body?.monster_id == null || req.body?.monster_id === ''
      ? null
      : positiveInt(req.body.monster_id, 'monster_id');
    await client.query('BEGIN');
    const loc = await client.query(
      'SELECT id FROM campaign_location WHERE id = $1 AND campaign_id = $2',
      [req.params.locationId, req.params.campaignId]
    );
    if (loc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Location not found' });
    }
    const monster = await monsterForCreature(client, req.params.campaignId, name, requestedMonster);
    const ids = [];
    for (const total of totals) {
      const inserted = await client.query(
        `INSERT INTO campaign_creature
           (campaign_id, location_id, name, monster_id, treasure_type, hp, base_hp, disposition, base_disposition, note)
         VALUES ($1, $2, $3, $4, $5, $6, $6, 'present', 'present', $7)
         RETURNING id`,
        [
          req.params.campaignId,
          loc.rows[0].id,
          name,
          monster ? monster.id : null,
          catalogTreasure(monster),
          total,
          note,
        ]
      );
      ids.push(Number(inserted.rows[0].id));
    }
    await client.query('COMMIT');
    res.status(201).json({ location_id: Number(loc.rows[0].id), name, count: ids.length, ids });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error stocking creatures:', error);
    res.status(500).json({ error: error.message || 'Failed to stock creatures' });
  } finally {
    client.release();
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/locations/:locationId/creatures/:creatureId', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const found = await pool.query(
      `SELECT id, in_fight FROM campaign_creature
       WHERE campaign_id = $1 AND location_id = $2 AND id = $3`,
      [req.params.campaignId, req.params.locationId, req.params.creatureId]
    );
    if (found.rows.length === 0) return res.status(404).json({ error: 'Creature not found' });
    if (found.rows[0].in_fight === true) return res.status(400).json({ error: 'That creature is in the fight' });
    const deleted = await pool.query(
      'DELETE FROM campaign_creature WHERE id = $1 AND campaign_id = $2 RETURNING id',
      [found.rows[0].id, req.params.campaignId]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Creature not found' });
    res.json({ id: Number(deleted.rows[0].id) });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.code === '23503' || error.code === '23001') return res.status(400).json({ error: 'That creature is in the fight' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error removing creature:', error);
    res.status(500).json({ error: error.message || 'Failed to remove creature' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/locations/:locationId/flags', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const fields = readFlag(req.body?.note, req.body?.state);
    if (fields.error) return res.status(400).json({ error: fields.error });
    const loc = await pool.query(
      'SELECT id FROM campaign_location WHERE id = $1 AND campaign_id = $2',
      [req.params.locationId, req.params.campaignId]
    );
    if (loc.rows.length === 0) return res.status(404).json({ error: 'Location not found' });
    const saved = await pool.query(
      `INSERT INTO campaign_location_flag (location_id, note, state)
       VALUES ($1, $2, $3)
       ON CONFLICT (location_id, note) DO UPDATE SET state = EXCLUDED.state
       RETURNING id, note, state`,
      [loc.rows[0].id, fields.note, fields.state]
    );
    const row = saved.rows[0];
    res.json({
      id: Number(row.id),
      location_id: Number(loc.rows[0].id),
      note: row.note,
      state: row.state,
    });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error setting room flag:', error);
    res.status(500).json({ error: error.message || 'Failed to set flag' });
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/locations/:locationId/flags/:flagId', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const deleted = await pool.query(
      `DELETE FROM campaign_location_flag f
       USING campaign_location l
       WHERE f.location_id = l.id AND l.campaign_id = $1 AND l.id = $2 AND f.id = $3
       RETURNING f.id`,
      [req.params.campaignId, req.params.locationId, req.params.flagId]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Flag not found' });
    res.json({ id: Number(deleted.rows[0].id) });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error clearing room flag:', error);
    res.status(500).json({ error: error.message || 'Failed to clear flag' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/creatures/take', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const name = requiredName(req.body?.name, 'name');
    const count = positiveInt(req.body?.count, 'count');
    if (count > CREATURE_BATCH_MAX) throw storedError(`count must be from 1 to ${CREATURE_BATCH_MAX}`, 400);
    await client.query('BEGIN');
    const board = await client.query(
      `SELECT COALESCE(b.in_encounter, false) AS in_encounter, b.location_id
       FROM campaign c
       LEFT JOIN campaign_board b ON b.campaign_id = c.id
       WHERE c.id = $1`,
      [req.params.campaignId]
    );
    if (board.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Campaign not found' });
    }
    if (board.rows[0].in_encounter !== true) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Start an encounter first' });
    }
    if (board.rows[0].location_id == null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Select a location first' });
    }
    const picked = await client.query(
      `SELECT c.id, c.name, c.hp, c.disposition
       FROM campaign_creature c
       WHERE c.location_id = $1 AND c.name = $2 AND c.hp > 0 AND c.in_fight = false
       ORDER BY CASE WHEN c.disposition = 'present' THEN 0 ELSE 1 END, c.id
       LIMIT $3
       FOR UPDATE OF c`,
      [board.rows[0].location_id, name, count]
    );
    if (picked.rows.length < count) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Only ${picked.rows.length} living ${name} remain` });
    }
    const enemies = [];
    for (const row of picked.rows) {
      const updated = await client.query(
        `UPDATE campaign_creature
         SET in_fight = true, disposition = 'present'
         WHERE id = $1
         RETURNING id, name, hp`,
        [row.id]
      );
      enemies.push({
        id: Number(updated.rows[0].id),
        name: updated.rows[0].name,
        hp: Number(updated.rows[0].hp),
      });
    }
    await client.query('COMMIT');
    res.status(201).json({ added: enemies.length, enemies });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(400).json({ error: 'That creature is already in the fight' });
    console.error('Error taking creatures:', error);
    res.status(500).json({ error: error.message || 'Failed to take creatures' });
  } finally {
    client.release();
  }
});

const COPPER_MAX = 2147483647;

function readShopFields(body) {
  const name = String(body?.name || '').trim();
  if (!name || name.length > 80) throw storedError('name must be 1 to 80 characters', 400);
  const buy = integerField(body?.buy_cost_delta, 'buy_cost_delta');
  const sell = integerField(body?.sell_cost_delta, 'sell_cost_delta');
  if (buy == null || sell == null) throw storedError('buy_cost_delta and sell_cost_delta are required', 400);
  if (buy < MIN_DELTA || buy > MAX_DELTA || sell < MIN_DELTA || sell > MAX_DELTA) {
    throw storedError(`price percent must be from ${MIN_DELTA} to ${MAX_DELTA}`, 400);
  }
  if (!Array.isArray(body?.category_ids) || body.category_ids.length === 0) {
    throw storedError('A shop needs at least one category', 400);
  }
  const categoryIds = [];
  for (const raw of body.category_ids) {
    const id = positiveInt(raw, 'category_id');
    if (!categoryIds.includes(id)) categoryIds.push(id);
  }
  return { name, buy, sell, categoryIds };
}

function shopPayload(row, categoryIds) {
  return {
    id: row.id,
    location_id: row.location_id,
    name: row.name,
    buy_cost_delta: Number(row.buy_cost_delta),
    sell_cost_delta: Number(row.sell_cost_delta),
    category_ids: categoryIds,
  };
}

function copperLine(unit, quantity) {
  if (!Number.isInteger(unit) || unit < 0 || !Number.isInteger(quantity) || quantity < 1) return null;
  const total = unit * quantity;
  if (!Number.isSafeInteger(total) || total > COPPER_MAX) return null;
  return total;
}

function equippedItemIds(row) {
  return [
    row.equipped_melee_primary_id,
    row.equipped_melee_secondary_id,
    row.equipped_ranged_id,
    row.equipped_armor_id,
    row.equipped_shield_id,
  ].filter((id) => id != null).map((id) => Number(id));
}

async function replaceShopCategories(client, shopId, categoryIds) {
  const found = await client.query(
    'SELECT id FROM item_categories WHERE id = ANY($1::int[])',
    [categoryIds]
  );
  if (found.rows.length !== categoryIds.length) throw storedError('Unknown category', 400);
  await client.query(
    'DELETE FROM campaign_location_shop_item_categories WHERE shop_id = $1',
    [shopId]
  );
  for (const categoryId of categoryIds) {
    await client.query(
      `INSERT INTO campaign_location_shop_item_categories (shop_id, item_category_id)
       VALUES ($1, $2)`,
      [shopId, categoryId]
    );
  }
}

function shopWriteError(res, error, fallback) {
  if (adventuringMissing(res, error)) return;
  if (error.status) return res.status(error.status).json({ error: error.message });
  if (error.code === '23505') return res.status(400).json({ error: 'A shop with that name already exists' });
  if (error.code === '23514') {
    return res.status(400).json({ error: `price percent must be from ${MIN_DELTA} to ${MAX_DELTA}` });
  }
  console.error(fallback, error);
  return res.status(500).json({ error: error.message || fallback });
}

app.post('/api/campaigns/:campaignId/adventuring/locations/:locationId/shops', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const fields = readShopFields(req.body);
    await client.query('BEGIN');
    const loc = await client.query(
      'SELECT id FROM campaign_location WHERE id = $1 AND campaign_id = $2',
      [req.params.locationId, req.params.campaignId]
    );
    if (loc.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Location not found' });
    }
    const inserted = await client.query(
      `INSERT INTO campaign_location_shops (location_id, name, buy_cost_delta, sell_cost_delta)
       VALUES ($1, $2, $3, $4)
       RETURNING id, location_id, name, buy_cost_delta, sell_cost_delta`,
      [req.params.locationId, fields.name, fields.buy, fields.sell]
    );
    await replaceShopCategories(client, inserted.rows[0].id, fields.categoryIds);
    await client.query('COMMIT');
    res.status(201).json(shopPayload(inserted.rows[0], fields.categoryIds));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (res.headersSent) return;
    shopWriteError(res, error, 'Failed to create shop');
  } finally {
    client.release();
  }
});

app.patch('/api/campaigns/:campaignId/adventuring/locations/:locationId/shops/:shopId', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const fields = readShopFields(req.body);
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE campaign_location_shops s
       SET name = $1, buy_cost_delta = $2, sell_cost_delta = $3
       FROM campaign_location l
       WHERE s.id = $4 AND s.location_id = l.id AND l.id = $5 AND l.campaign_id = $6
       RETURNING s.id, s.location_id, s.name, s.buy_cost_delta, s.sell_cost_delta`,
      [fields.name, fields.buy, fields.sell, req.params.shopId, req.params.locationId, req.params.campaignId]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Shop not found' });
    }
    await replaceShopCategories(client, updated.rows[0].id, fields.categoryIds);
    await client.query('COMMIT');
    res.json(shopPayload(updated.rows[0], fields.categoryIds));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (res.headersSent) return;
    shopWriteError(res, error, 'Failed to update shop');
  } finally {
    client.release();
  }
});

app.delete('/api/campaigns/:campaignId/adventuring/locations/:locationId/shops/:shopId', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    const deleted = await pool.query(
      `DELETE FROM campaign_location_shops s
       USING campaign_location l
       WHERE s.id = $1 AND s.location_id = l.id AND l.id = $2 AND l.campaign_id = $3
       RETURNING s.id`,
      [req.params.shopId, req.params.locationId, req.params.campaignId]
    );
    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Shop not found' });
    res.json({ id: deleted.rows[0].id });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error deleting shop:', error);
    res.status(500).json({ error: error.message || 'Failed to delete shop' });
  }
});

async function requireShopCharacter(req, res) {
  const gate = await characterGate(req, res, req.params.characterId, true);
  if (!gate) return null;
  const member = await pool.query(
    'SELECT 1 FROM campaign_character WHERE campaign_id = $1 AND character_id = $2',
    [req.params.campaignId, req.params.characterId]
  );
  if (member.rows.length === 0) {
    res.status(404).json({ error: 'Character not found' });
    return null;
  }
  return gate;
}

async function catalogItem(client, rulesetId, itemId) {
  const result = await client.query(
    `SELECT i.id, i.name, i.category, i.price
     FROM items i
     WHERE i.id = $2 AND i.price IS NOT NULL AND ${visibleInRuleset('items', 'i', ITEM_CATALOG_KEY)}`,
    [rulesetId, itemId]
  );
  return result.rows[0] || null;
}

async function shopOnBoard(client, campaignId, shopId) {
  await client.query(
    'SELECT location_id FROM campaign_board WHERE campaign_id = $1 FOR UPDATE',
    [campaignId]
  );
  const found = await client.query(
    `SELECT s.id, s.buy_cost_delta, s.sell_cost_delta, c.ruleset_id
     FROM campaign_location_shops s
     JOIN campaign_location l ON l.id = s.location_id AND l.campaign_id = $2
     JOIN campaign c ON c.id = l.campaign_id
     JOIN campaign_board b ON b.campaign_id = c.id AND b.location_id = l.id
     WHERE s.id = $1`,
    [shopId, campaignId]
  );
  if (found.rows.length === 0) throw storedError('Shop not found', 404);
  const categories = await client.query(
    'SELECT item_category_id FROM campaign_location_shop_item_categories WHERE shop_id = $1',
    [shopId]
  );
  return {
    buy: Number(found.rows[0].buy_cost_delta),
    sell: Number(found.rows[0].sell_cost_delta),
    rulesetId: found.rows[0].ruleset_id,
    categoryIds: categories.rows.map((row) => Number(row.item_category_id)),
  };
}

async function lockCharacter(client, characterId) {
  const locked = await client.query(
    `SELECT id, COALESCE(money, 0) AS money,
            equipped_melee_primary_id, equipped_melee_secondary_id,
            equipped_ranged_id, equipped_armor_id, equipped_shield_id
     FROM characters WHERE id = $1 FOR UPDATE`,
    [characterId]
  );
  if (locked.rows.length === 0) throw storedError('Character not found', 404);
  return locked.rows[0];
}

async function listCharacterShops(campaignId, characterId) {
  const placed = await pool.query(
    `SELECT b.location_id, l.name AS location_name, c.ruleset_id, COALESCE(ch.money, 0) AS money
     FROM characters ch
     JOIN campaign c ON c.id = $1
     LEFT JOIN campaign_board b ON b.campaign_id = c.id
     LEFT JOIN campaign_location l ON l.id = b.location_id AND l.campaign_id = c.id
     WHERE ch.id = $2`,
    [campaignId, characterId]
  );
  if (placed.rows.length === 0) throw storedError('Character not found', 404);
  const here = placed.rows[0];
  const money = Number(here.money);
  if (here.location_id == null) {
    return { location_id: null, location_name: null, money, shops: [] };
  }
  const shopRows = await pool.query(
    `SELECT s.id, s.name, s.buy_cost_delta, s.sell_cost_delta,
            ic.id AS category_id, ic.name AS category_name
     FROM campaign_location_shops s
     LEFT JOIN campaign_location_shop_item_categories sc ON sc.shop_id = s.id
     LEFT JOIN item_categories ic ON ic.id = sc.item_category_id
     WHERE s.location_id = $1
     ORDER BY s.name, s.id, ic.name`,
    [here.location_id]
  );
  const shops = [];
  const byId = new Map();
  const categorySet = new Set();
  for (const row of shopRows.rows) {
    let shop = byId.get(row.id);
    if (!shop) {
      shop = {
        id: row.id,
        name: row.name,
        buy_cost_delta: Number(row.buy_cost_delta),
        sell_cost_delta: Number(row.sell_cost_delta),
        categories: [],
        items: [],
        sellable: [],
      };
      byId.set(row.id, shop);
      shops.push(shop);
    }
    if (row.category_id != null) {
      shop.categories.push({ id: Number(row.category_id), name: row.category_name });
      categorySet.add(Number(row.category_id));
    }
  }
  const categoryIds = [...categorySet];
  const catalog = categoryIds.length === 0
    ? { rows: [] }
    : await pool.query(
      `SELECT i.id, i.name, i.category AS category_id, i.price
       FROM items i
       WHERE i.price IS NOT NULL
         AND i.category = ANY($2::int[])
         AND ${visibleInRuleset('items', 'i', ITEM_CATALOG_KEY)}
       ORDER BY i.name, i.id`,
      [here.ruleset_id, categoryIds]
    );
  const held = categoryIds.length === 0
    ? { rows: [] }
    : await pool.query(
      `SELECT ci.id, ci.item_id, ci.quantity, ci.bonus, ci.value, ci.name AS custom_name,
              i.name AS item_name, i.price, i.category AS category_id
       FROM character_items ci
       JOIN items i ON i.id = ci.item_id
       WHERE ci.character_id = $2
         AND i.price IS NOT NULL
         AND i.category = ANY($3::int[])
         AND ${visibleInRuleset('items', 'i', ITEM_CATALOG_KEY)}`,
      [here.ruleset_id, characterId, categoryIds]
    );
  const wornRow = await pool.query(
    `SELECT equipped_melee_primary_id, equipped_melee_secondary_id,
            equipped_ranged_id, equipped_armor_id, equipped_shield_id
     FROM characters WHERE id = $1`,
    [characterId]
  );
  const worn = new Set(equippedItemIds(wornRow.rows[0] || {}));
  for (const shop of shops) {
    const cats = new Set(shop.categories.map((cat) => cat.id));
    shop.items = catalog.rows
      .filter((item) => cats.has(Number(item.category_id)))
      .map((item) => ({
        id: item.id,
        name: item.name,
        category_id: Number(item.category_id),
        price: Number(item.price),
        buy_price: adjustedCopper(Number(item.price), shop.buy_cost_delta),
      }))
      .filter((item) => item.buy_price != null);
    shop.sellable = held.rows
      .filter((row) => cats.has(Number(row.category_id)) && !worn.has(Number(row.id)))
      .filter((row) => (Number(row.bonus) || 0) === 0 && (Number(row.value) || 0) === 0)
      .map((row) => ({
        character_item_id: row.id,
        item_id: row.item_id,
        name: row.custom_name || row.item_name,
        quantity: Number(row.quantity) || 0,
        sell_price: adjustedCopper(Number(row.price), shop.sell_cost_delta),
      }))
      .filter((row) => row.sell_price != null && row.quantity > 0);
  }
  return {
    location_id: here.location_id,
    location_name: here.location_name,
    money,
    shops,
  };
}

app.get('/api/campaigns/:campaignId/characters/:characterId/shops', async (req, res) => {
  try {
    const gate = await requireShopCharacter(req, res);
    if (!gate) return;
    res.json(await listCharacterShops(req.params.campaignId, req.params.characterId));
  } catch (error) {
    if (res.headersSent) return;
    if (adventuringMissing(res, error)) return;
    sendStoredError(res, error, 'Failed to list shops');
  }
});

app.post('/api/campaigns/:campaignId/characters/:characterId/shops/:shopId/buy', async (req, res) => {
  const client = await pool.connect();
  try {
    const gate = await requireShopCharacter(req, res);
    if (!gate) return;
    const quantity = positiveInt(req.body?.quantity, 'quantity');
    const itemId = positiveInt(req.body?.item_id, 'item_id');
    await client.query('BEGIN');
    const character = await lockCharacter(client, req.params.characterId);
    const shop = await shopOnBoard(client, req.params.campaignId, req.params.shopId);
    const item = await catalogItem(client, shop.rulesetId, itemId);
    if (!item || !shop.categoryIds.includes(Number(item.category))) {
      throw storedError('This shop does not sell that', 400);
    }
    const unit = adjustedCopper(Number(item.price), shop.buy);
    const total = copperLine(unit, quantity);
    if (unit == null || total == null) throw storedError('That costs too much', 400);
    const money = Number(character.money);
    if (money < total) throw storedError('Not enough money', 400);
    const nextMoney = money - total;
    await client.query(
      'UPDATE characters SET money = $1, modified = CURRENT_TIMESTAMP WHERE id = $2',
      [nextMoney, character.id]
    );
    const stack = await client.query(
      `SELECT id, quantity FROM character_items
       WHERE character_id = $1 AND item_id = $2
         AND COALESCE(bonus, 0) = 0 AND COALESCE(value, 0) = 0
         AND name IS NULL AND description IS NULL
       ORDER BY id
       LIMIT 1
       FOR UPDATE`,
      [character.id, item.id]
    );
    let stored;
    if (stack.rows.length > 0) {
      const nextQty = (Number(stack.rows[0].quantity) || 0) + quantity;
      if (nextQty > COPPER_MAX) throw storedError('That quantity is too large', 400);
      const updated = await client.query(
        `UPDATE character_items SET quantity = $1, modified = CURRENT_TIMESTAMP
         WHERE id = $2 AND character_id = $3
         RETURNING id, quantity`,
        [nextQty, stack.rows[0].id, character.id]
      );
      stored = updated.rows[0];
    } else {
      stored = await insertStoredItem(client, character.id, { item_id: item.id, quantity });
    }
    await client.query('COMMIT');
    res.json({
      money: nextMoney,
      item_id: item.id,
      character_item_id: stored.id,
      quantity: Number(stored.quantity),
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (res.headersSent) return;
    if (adventuringMissing(res, error)) return;
    sendStoredError(res, error, 'Failed to buy');
  } finally {
    client.release();
  }
});

app.post('/api/campaigns/:campaignId/characters/:characterId/shops/:shopId/sell', async (req, res) => {
  const client = await pool.connect();
  try {
    const gate = await requireShopCharacter(req, res);
    if (!gate) return;
    const quantity = positiveInt(req.body?.quantity, 'quantity');
    const characterItemId = positiveInt(req.body?.character_item_id, 'character_item_id');
    await client.query('BEGIN');
    const character = await lockCharacter(client, req.params.characterId);
    const shop = await shopOnBoard(client, req.params.campaignId, req.params.shopId);
    const held = await client.query(
      `SELECT ci.id, ci.item_id, ci.quantity, ci.bonus, ci.value, i.price, i.category
       FROM character_items ci
       LEFT JOIN items i ON i.id = ci.item_id
       WHERE ci.id = $1 AND ci.character_id = $2
       FOR UPDATE OF ci`,
      [characterItemId, character.id]
    );
    if (held.rows.length === 0) throw storedError('Item is not on this character', 404);
    const row = held.rows[0];
    if (equippedItemIds(character).includes(Number(row.id))) {
      throw storedError('Unequip that before selling it', 400);
    }
    const plain = (Number(row.bonus) || 0) === 0 && (Number(row.value) || 0) === 0;
    const listed = row.item_id != null && plain
      ? await catalogItem(client, shop.rulesetId, row.item_id)
      : null;
    if (!listed || !shop.categoryIds.includes(Number(listed.category))) {
      throw storedError('This shop does not buy that', 400);
    }
    const unit = adjustedCopper(Number(listed.price), shop.sell);
    const total = copperLine(unit, quantity);
    if (unit == null || total == null) throw storedError('That payment is too large', 400);
    const owned = Number(row.quantity) || 0;
    if (quantity > owned) throw storedError('Not enough of that item', 400);
    const money = Number(character.money);
    if (money > COPPER_MAX - total) throw storedError('That payment is too large', 400);
    const nextMoney = money + total;
    await client.query(
      'UPDATE characters SET money = $1, modified = CURRENT_TIMESTAMP WHERE id = $2',
      [nextMoney, character.id]
    );
    let left = 0;
    if (owned === quantity) {
      await client.query(
        'DELETE FROM character_items WHERE id = $1 AND character_id = $2',
        [row.id, character.id]
      );
    } else {
      left = owned - quantity;
      await client.query(
        `UPDATE character_items SET quantity = $1, modified = CURRENT_TIMESTAMP
         WHERE id = $2 AND character_id = $3`,
        [left, row.id, character.id]
      );
    }
    await client.query('COMMIT');
    res.json({ money: nextMoney, character_item_id: row.id, quantity: left });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (res.headersSent) return;
    if (adventuringMissing(res, error)) return;
    sendStoredError(res, error, 'Failed to sell');
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
         FROM campaign_creature e
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
        'SELECT treasure_type FROM campaign_creature WHERE id = $1 AND campaign_id = $2',
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
    const stored = await writeHitPoints(req.params.campaignId, defender, applied.hp);
    res.json({
      defender: { side: defender.side, id: defender.id, name: defender.name },
      amount,
      faces,
      flat,
      hp: stored,
      down: stored === 0,
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
      if (enemy.baseHp != null) return res.status(400).json({ error: 'That creature already has hit points' });
      const rolled = rollMonsterHitPoints(enemy.hitDice, rollDie);
      if (rolled.error) return res.status(400).json({ error: rolled.error });
      hp = rolled.amount;
      faces = rolled.faces;
      flat = rolled.flat;
    } else {
      hp = nonNegativeInt(req.body?.hp, 'hp');
    }
    const stored = await writeHitPoints(req.params.campaignId, enemy, hp);
    res.json({ enemy_id: enemy.id, name: enemy.name, hp: stored, faces, flat, down: stored === 0 });
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
    await client.query(
      'UPDATE campaign_creature SET in_fight = false WHERE campaign_id = $1 AND in_fight',
      [req.params.campaignId]
    );
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
      `SELECT w.id, w.kind, w.table_roll, w.label, w.monster_id, w.quantity, w.accepted, m.treasure_type
       FROM campaign_wander w
       LEFT JOIN monster m ON m.id = w.monster_id
       WHERE w.campaign_id = $1 AND w.kind = 'wander'
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
    const inserted = [];
    for (let i = 0; i < enemy.count; i += 1) {
      const row = await client.query(
        `INSERT INTO campaign_creature
           (campaign_id, name, monster_id, treasure_type, disposition, base_disposition, in_fight)
         VALUES ($1, $2, $3, $4, 'present', 'present', true)
         RETURNING id, name, monster_id, treasure_type, hp`,
        [req.params.campaignId, enemy.name, enemy.monster_id, enemy.treasure_type]
      );
      inserted.push(row.rows[0]);
    }
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
      enemy: inserted[0],
      enemies: inserted,
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
    const requestedMonster = req.body?.monster_id == null || req.body?.monster_id === ''
      ? null
      : positiveInt(req.body.monster_id, 'monster_id');
    const count = creatureCount(req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const monster = requestedMonster == null
        ? null
        : await monsterForCreature(client, req.params.campaignId, '', requestedMonster);
      const fields = fightCreature(monster, req.body?.name);
      if (fields.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: fields.error });
      }
      const ids = [];
      for (let i = 0; i < count; i += 1) {
        const inserted = await client.query(
          `INSERT INTO campaign_creature
             (campaign_id, name, monster_id, treasure_type, disposition, base_disposition, in_fight)
           VALUES ($1, $2, $3, $4, 'present', 'present', true)
           RETURNING id, name, monster_id, treasure_type, hp, base_hp`,
          [req.params.campaignId, fields.name, fields.monster_id, fields.treasure_type]
        );
        ids.push(inserted.rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json({ id: ids[0].id, count: ids.length, enemies: ids });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
      throw error;
    } finally {
      client.release();
    }
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
    const found = await pool.query(
      'SELECT id FROM campaign_creature WHERE id = $1 AND campaign_id = $2',
      [req.params.enemyId, req.params.campaignId]
    );
    if (found.rows.length === 0) return res.status(404).json({ error: 'Enemy not found' });
    const linked = await pool.query(
      'SELECT 1 FROM campaign_encounter_member WHERE creature_id = $1',
      [found.rows[0].id]
    );
    if (linked.rows.length > 0) {
      await pool.query(
        'UPDATE campaign_creature SET in_fight = false WHERE id = $1 AND campaign_id = $2',
        [found.rows[0].id, req.params.campaignId]
      );
      return res.json({ id: Number(found.rows[0].id), in_fight: false });
    }
    const deleted = await pool.query(
      'DELETE FROM campaign_creature WHERE id = $1 AND campaign_id = $2 RETURNING id',
      [found.rows[0].id, req.params.campaignId]
    );
    res.json({ id: Number(deleted.rows[0].id) });
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error removing enemy:', error);
    res.status(500).json({ error: error.message || 'Failed to remove enemy' });
  }
});

app.post('/api/campaigns/:campaignId/adventuring/enemies/:enemyId/flee', async (req, res) => {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    await client.query('BEGIN');
    const enemy = await client.query(
      `UPDATE campaign_creature
       SET disposition = 'fled', in_fight = false
       WHERE id = $1 AND campaign_id = $2 AND in_fight
       RETURNING id`,
      [req.params.enemyId, req.params.campaignId]
    );
    if (enemy.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Enemy not found' });
    }
    await client.query('COMMIT');
    res.json({ id: Number(enemy.rows[0].id), disposition: 'fled' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    if (adventuringMissing(res, error)) return;
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Error fleeing:', error);
    res.status(500).json({ error: error.message || 'Failed to flee' });
  } finally {
    client.release();
  }
});

async function healCampaignCreatures(client, campaignId, points) {
  const creatures = await client.query(
    `SELECT c.id, c.hp, c.base_hp
     FROM campaign_creature c
     WHERE c.campaign_id = $1
     FOR UPDATE OF c`,
    [campaignId]
  );
  let creaturesHealed = 0;
  for (const row of creatures.rows) {
    if (row.hp == null || row.base_hp == null) continue;
    const next = recoverCreature(
      { hp: Number(row.hp), baseHp: Number(row.base_hp) },
      points
    );
    if (next.error) return { error: next.error };
    if (!next.changed) continue;
    await client.query('UPDATE campaign_creature SET hp = $1 WHERE id = $2', [next.hp, row.id]);
    creaturesHealed += 1;
  }
  return { creaturesHealed };
}

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
      const healedCreatures = await healCampaignCreatures(client, req.params.campaignId, 1);
      if (healedCreatures.error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: healedCreatures.error });
      }
      await client.query('COMMIT');
      return res.json({ rested: true, creatures_healed: healedCreatures.creaturesHealed });
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
      let applied;
      try {
        applied = await writeCharacterHitPoints(
          client,
          row.id,
          day.damage === 0 ? 0 : -day.damage,
          'march'
        );
      } catch (error) {
        await client.query('ROLLBACK');
        if (!error.status) throw error;
        const message = error.message === 'set hit points first' ? `${row.name}: ${error.message}` : error.message;
        return res.status(error.status).json({ error: message });
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
    let applied;
    try {
      applied = await writeCharacterHitPoints(client, characterId, settled.delta, settleHitNote(settled));
    } catch (error) {
      await client.query('ROLLBACK');
      if (!error.status) throw error;
      return res.status(error.status).json({ error: error.message });
    }
    await client.query(
      `UPDATE campaign_character
       SET food_missed = $3, heal_food = $4, heal_water = $5
       WHERE campaign_id = $1 AND character_id = $2`,
      [req.params.campaignId, characterId, settled.foodMissed, settled.healFood, settled.healWater]
    );
    const healedCreatures = settled.healed > 0
      ? await healCampaignCreatures(client, req.params.campaignId, settled.healed)
      : { creaturesHealed: 0 };
    if (healedCreatures.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: healedCreatures.error });
    }
    await copyIntendToMemorized(client, req.params.campaignId, characterId);
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
      creatures_healed: healedCreatures.creaturesHealed,
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

const PROSE_MAX = 4000;
const ENCOUNTER_KINDS = new Set(['combat', 'social', 'hazard', 'trap', 'puzzle', 'environment', 'discovery']);
const LOG_KINDS = new Set(['decision', 'consequence', 'discovery']);
const OBJECTIVE_STATUSES = new Set(['open', 'resolved']);

function requiredName(value, label) {
  const text = String(value || '').trim();
  if (!text || text.length > 80) throw storedError(`${label} must be 1 to 80 characters`, 400);
  return text;
}

function requiredProse(value, label) {
  const text = optionalText(value, label, PROSE_MAX);
  if (!text) throw storedError(`${label} is required`, 400);
  return text;
}

function stageField(value) {
  const stage = stageById(value);
  if (!stage) throw storedError('stage is not a procedure stage', 400);
  return stage.id;
}

function oneOf(value, allowed, label) {
  if (!allowed.has(value)) throw storedError(`${label} is not allowed`, 400);
  return value;
}

function linksBy(rows, parent, child) {
  const map = new Map();
  for (const row of rows) {
    const id = Number(row[parent]);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(Number(row[child]));
  }
  return map;
}

function situationError(res, error, fallback) {
  if (res.headersSent) return;
  if (adventuringMissing(res, error)) return;
  if (error.status) return res.status(error.status).json({ error: error.message });
  if (error.code === '23503') return res.status(400).json({ error: 'That record is still in use' });
  if (error.code === '23514') return res.status(400).json({ error: 'That value is not allowed' });
  if (error.code === '23505') return res.status(400).json({ error: 'Another situation is already active' });
  console.error(fallback, error);
  res.status(500).json({ error: error.message || fallback });
}

async function withSituation(req, res, fallback, handler) {
  const client = await pool.connect();
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, true);
    if (!member) return;
    await client.query('BEGIN');
    const payload = await handler(client, req);
    await client.query('COMMIT');
    if (res.headersSent) return;
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'statusCode')) {
      res.status(payload.statusCode).json(payload.body);
      return;
    }
    res.json(payload == null ? { ok: true } : payload);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connection already failed */ }
    situationError(res, error, fallback);
  } finally {
    client.release();
  }
}

async function ownedLocation(client, campaignId, locationId) {
  if (locationId == null || locationId === '') return null;
  const id = positiveInt(locationId, 'location_id');
  const found = await client.query(
    'SELECT id, arrived_seconds FROM campaign_location WHERE id = $1 AND campaign_id = $2',
    [id, campaignId]
  );
  if (found.rows.length === 0) throw storedError('Location not found', 404);
  return found.rows[0];
}

async function ownedSituation(client, campaignId, situationId) {
  if (situationId == null || situationId === '') return null;
  const id = positiveInt(situationId, 'situation_id');
  const found = await client.query(
    'SELECT id, location_id, status, stage FROM campaign_situation WHERE id = $1 AND campaign_id = $2',
    [id, campaignId]
  );
  if (found.rows.length === 0) throw storedError('Situation not found', 404);
  return found.rows[0];
}

async function ownedEncounter(client, campaignId, encounterId) {
  const id = positiveInt(encounterId, 'encounter_id');
  const found = await client.query(
    'SELECT id, kind, status FROM campaign_encounter WHERE id = $1 AND campaign_id = $2',
    [id, campaignId]
  );
  if (found.rows.length === 0) throw storedError('Encounter not found', 404);
  return found.rows[0];
}

async function setActiveStage(client, campaignId, stage) {
  const updated = await client.query(
    `UPDATE campaign_situation SET stage = $2
     WHERE campaign_id = $1 AND status = 'active'
     RETURNING id`,
    [campaignId, stage]
  );
  return updated.rows[0] || null;
}

async function activateSituation(client, campaignId, situationId) {
  const situation = await ownedSituation(client, campaignId, situationId);
  if (!situation) throw storedError('Situation not found', 404);
  await client.query(
    `UPDATE campaign_situation SET status = 'planned'
     WHERE campaign_id = $1 AND status = 'active' AND id <> $2`,
    [campaignId, situation.id]
  );
  await client.query(
    `UPDATE campaign_situation SET status = 'active' WHERE id = $1 AND campaign_id = $2`,
    [situation.id, campaignId]
  );
  await client.query(
    'UPDATE campaign SET concluded = false, modified = CURRENT_TIMESTAMP WHERE id = $1',
    [campaignId]
  );
  if (situation.location_id != null) {
    await selectCampaignLocation(client, campaignId, situation.location_id);
  }
  return { id: Number(situation.id) };
}

async function arriveAtLocation(client, campaignId, locationId) {
  const selected = await selectCampaignLocation(client, campaignId, locationId);
  await setActiveStage(client, campaignId, 'location_intro');
  return selected;
}

async function clockSeconds(client, campaignId) {
  const board = await client.query(
    'SELECT COALESCE(game_seconds, 0) AS game_seconds FROM campaign_board WHERE campaign_id = $1',
    [campaignId]
  );
  return board.rows.length === 0 ? 0 : Number(board.rows[0].game_seconds);
}

async function loadSituation(campaignId, concluded) {
  const [situations, objectives, npcs, npcLinks, clues, clueLinks, encounters, members, transitions, logs] = await Promise.all([
    pool.query(
      `SELECT id, location_id, title, stage, description, status
       FROM campaign_situation WHERE campaign_id = $1 ORDER BY id`,
      [campaignId]
    ),
    pool.query(
      `SELECT id, situation_id, body, known, status
       FROM campaign_objective WHERE campaign_id = $1 ORDER BY id`,
      [campaignId]
    ),
    pool.query(
      `SELECT id, location_id, name, motivation, knowledge, attitude
       FROM campaign_npc WHERE campaign_id = $1 ORDER BY name, id`,
      [campaignId]
    ),
    pool.query(
      `SELECT sn.situation_id, sn.npc_id
       FROM campaign_situation_npc sn
       JOIN campaign_situation s ON s.id = sn.situation_id
       WHERE s.campaign_id = $1`,
      [campaignId]
    ),
    pool.query(
      `SELECT id, location_id, body, discovered
       FROM campaign_clue WHERE campaign_id = $1 ORDER BY id`,
      [campaignId]
    ),
    pool.query(
      `SELECT sc.situation_id, sc.clue_id
       FROM campaign_situation_clue sc
       JOIN campaign_situation s ON s.id = sc.situation_id
       WHERE s.campaign_id = $1`,
      [campaignId]
    ),
    pool.query(
      `SELECT id, situation_id, location_id, title, kind, purpose, notes, status
       FROM campaign_encounter WHERE campaign_id = $1 ORDER BY id`,
      [campaignId]
    ),
    pool.query(
      `SELECT c.id, m.encounter_id, c.name, c.treasure_type, c.hp
       FROM campaign_encounter_member m
       JOIN campaign_creature c ON c.id = m.creature_id
       JOIN campaign_encounter e ON e.id = m.encounter_id
       WHERE e.campaign_id = $1
       ORDER BY c.id`,
      [campaignId]
    ),
    pool.query(
      `SELECT id, situation_id, to_location_id, reason
       FROM campaign_transition WHERE campaign_id = $1 ORDER BY id`,
      [campaignId]
    ),
    pool.query(
      `SELECT id, situation_id, at_seconds, kind, body
       FROM (
         SELECT id, situation_id, at_seconds, kind, body
         FROM campaign_log WHERE campaign_id = $1
         ORDER BY id DESC
         LIMIT 40
       ) recent
       ORDER BY id`,
      [campaignId]
    ),
  ]);
  const npcIds = linksBy(npcLinks.rows, 'situation_id', 'npc_id');
  const clueIds = linksBy(clueLinks.rows, 'situation_id', 'clue_id');
  const membersByEncounter = new Map();
  for (const row of members.rows) {
    const id = Number(row.encounter_id);
    if (!membersByEncounter.has(id)) membersByEncounter.set(id, []);
    membersByEncounter.get(id).push({
      id: Number(row.id),
      name: row.name,
      treasure_type: row.treasure_type,
      hp: row.hp == null ? null : Number(row.hp),
    });
  }
  const encounterRows = encounters.rows.map((row) => ({
    id: Number(row.id),
    situation_id: row.situation_id == null ? null : Number(row.situation_id),
    location_id: row.location_id == null ? null : Number(row.location_id),
    title: row.title,
    kind: row.kind,
    purpose: row.purpose,
    notes: row.notes,
    status: row.status,
    members: membersByEncounter.get(Number(row.id)) || [],
  }));
  const transitionRows = transitions.rows.map((row) => ({
    id: Number(row.id),
    situation_id: row.situation_id == null ? null : Number(row.situation_id),
    to_location_id: Number(row.to_location_id),
    reason: row.reason,
  }));
  const rows = situations.rows.map((row) => {
    const id = Number(row.id);
    return {
      id,
      location_id: row.location_id == null ? null : Number(row.location_id),
      title: row.title,
      stage: row.stage,
      description: row.description,
      status: row.status,
      npc_ids: npcIds.get(id) || [],
      clue_ids: clueIds.get(id) || [],
      encounter_ids: encounterRows.filter((item) => item.situation_id === id).map((item) => item.id),
      transition_ids: transitionRows.filter((item) => item.situation_id === id).map((item) => item.id),
    };
  });
  const active = rows.find((row) => row.status === 'active') || null;
  if (active) {
    const stage = stageById(active.stage);
    active.prompt = stage ? stage.prompt.slice() : [];
    active.suggested_next = suggestedNext(active.stage) || [];
  }
  return {
    concluded,
    stages: stageList(),
    active,
    situations: rows,
    objectives: objectives.rows.map((row) => ({
      id: Number(row.id),
      situation_id: row.situation_id == null ? null : Number(row.situation_id),
      body: row.body,
      known: row.known === true,
      status: row.status,
    })),
    npcs: npcs.rows.map((row) => ({
      id: Number(row.id),
      location_id: row.location_id == null ? null : Number(row.location_id),
      name: row.name,
      motivation: row.motivation,
      knowledge: row.knowledge,
      attitude: row.attitude,
    })),
    clues: clues.rows.map((row) => ({
      id: Number(row.id),
      location_id: row.location_id == null ? null : Number(row.location_id),
      body: row.body,
      discovered: row.discovered === true,
    })),
    encounters: encounterRows,
    transitions: transitionRows,
    log: logs.rows.map((row) => ({
      id: Number(row.id),
      situation_id: row.situation_id == null ? null : Number(row.situation_id),
      at_seconds: Number(row.at_seconds),
      kind: row.kind,
      body: row.body,
    })),
  };
}

app.post('/api/campaigns/:campaignId/situation', (req, res) => withSituation(req, res, 'Failed to create situation', async (client, request) => {
  const title = requiredName(request.body?.title, 'title');
  const description = optionalText(request.body?.description, 'description', PROSE_MAX);
  const stage = request.body?.stage == null || request.body.stage === '' ? 'setup' : stageField(request.body.stage);
  const loc = await ownedLocation(client, request.params.campaignId, request.body?.location_id);
  const activate = request.body?.activate == null ? false : booleanField(request.body.activate, 'activate');
  const inserted = await client.query(
    `INSERT INTO campaign_situation (campaign_id, location_id, title, stage, description, status)
     VALUES ($1, $2, $3, $4, $5, 'planned')
     RETURNING id`,
    [request.params.campaignId, loc ? loc.id : null, title, stage, description]
  );
  if (activate) await activateSituation(client, request.params.campaignId, inserted.rows[0].id);
  return { statusCode: 201, body: { id: Number(inserted.rows[0].id) } };
}));

app.patch('/api/campaigns/:campaignId/situation/:situationId', (req, res) => withSituation(req, res, 'Failed to update situation', async (client, request) => {
  const situation = await ownedSituation(client, request.params.campaignId, request.params.situationId);
  if (!situation) throw storedError('Situation not found', 404);
  const body = request.body || {};
  const sets = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    values.push(requiredName(body.title, 'title'));
    sets.push(`title = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    values.push(optionalText(body.description, 'description', PROSE_MAX));
    sets.push(`description = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'location_id')) {
    const loc = await ownedLocation(client, request.params.campaignId, body.location_id);
    values.push(loc ? loc.id : null);
    sets.push(`location_id = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'stage')) {
    values.push(stageField(body.stage));
    sets.push(`stage = $${values.length}`);
  }
  if (sets.length === 0) throw storedError('Nothing to change', 400);
  values.push(situation.id, request.params.campaignId);
  const updated = await client.query(
    `UPDATE campaign_situation SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND campaign_id = $${values.length}
     RETURNING id`,
    values
  );
  return { id: Number(updated.rows[0].id) };
}));

app.post('/api/campaigns/:campaignId/situation/:situationId/activate', (req, res) => withSituation(req, res, 'Failed to activate situation', async (client, request) => (
  activateSituation(client, request.params.campaignId, request.params.situationId)
)));

app.post('/api/campaigns/:campaignId/situation/:situationId/resolve', (req, res) => withSituation(req, res, 'Failed to resolve situation', async (client, request) => {
  const updated = await client.query(
    `UPDATE campaign_situation SET status = 'resolved'
     WHERE id = $1 AND campaign_id = $2
     RETURNING id`,
    [positiveInt(request.params.situationId, 'situation_id'), request.params.campaignId]
  );
  if (updated.rows.length === 0) throw storedError('Situation not found', 404);
  return { id: Number(updated.rows[0].id) };
}));

app.delete('/api/campaigns/:campaignId/situation/:situationId', (req, res) => withSituation(req, res, 'Failed to delete situation', async (client, request) => {
  const deleted = await client.query(
    'DELETE FROM campaign_situation WHERE id = $1 AND campaign_id = $2 RETURNING id',
    [positiveInt(request.params.situationId, 'situation_id'), request.params.campaignId]
  );
  if (deleted.rows.length === 0) throw storedError('Situation not found', 404);
  return { id: Number(deleted.rows[0].id) };
}));

app.post('/api/campaigns/:campaignId/situation/objectives', (req, res) => withSituation(req, res, 'Failed to add objective', async (client, request) => {
  const body = requiredProse(request.body?.body, 'body');
  const known = request.body?.known == null ? false : booleanField(request.body.known, 'known');
  const status = request.body?.status == null || request.body.status === ''
    ? 'open'
    : oneOf(request.body.status, OBJECTIVE_STATUSES, 'status');
  const situation = await ownedSituation(client, request.params.campaignId, request.body?.situation_id);
  const inserted = await client.query(
    `INSERT INTO campaign_objective (campaign_id, situation_id, body, known, base_known, status, base_status)
     VALUES ($1, $2, $3, $4, $4, $5, $5)
     RETURNING id`,
    [request.params.campaignId, situation ? situation.id : null, body, known, status]
  );
  return { statusCode: 201, body: { id: Number(inserted.rows[0].id) } };
}));

app.patch('/api/campaigns/:campaignId/situation/objectives/:objectiveId', (req, res) => withSituation(req, res, 'Failed to update objective', async (client, request) => {
  const id = positiveInt(request.params.objectiveId, 'objective_id');
  const body = request.body || {};
  const sets = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(body, 'body')) {
    values.push(requiredProse(body.body, 'body'));
    sets.push(`body = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'known')) {
    values.push(booleanField(body.known, 'known'));
    sets.push(`known = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    values.push(oneOf(body.status, OBJECTIVE_STATUSES, 'status'));
    sets.push(`status = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'situation_id')) {
    const situation = await ownedSituation(client, request.params.campaignId, body.situation_id);
    values.push(situation ? situation.id : null);
    sets.push(`situation_id = $${values.length}`);
  }
  if (sets.length === 0) throw storedError('Nothing to change', 400);
  values.push(id, request.params.campaignId);
  const updated = await client.query(
    `UPDATE campaign_objective SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND campaign_id = $${values.length}
     RETURNING id`,
    values
  );
  if (updated.rows.length === 0) throw storedError('Objective not found', 404);
  return { id: Number(updated.rows[0].id) };
}));

app.delete('/api/campaigns/:campaignId/situation/objectives/:objectiveId', (req, res) => withSituation(req, res, 'Failed to delete objective', async (client, request) => {
  const deleted = await client.query(
    'DELETE FROM campaign_objective WHERE id = $1 AND campaign_id = $2 RETURNING id',
    [positiveInt(request.params.objectiveId, 'objective_id'), request.params.campaignId]
  );
  if (deleted.rows.length === 0) throw storedError('Objective not found', 404);
  return { id: Number(deleted.rows[0].id) };
}));

app.post('/api/campaigns/:campaignId/situation/npcs', (req, res) => withSituation(req, res, 'Failed to add NPC', async (client, request) => {
  const name = requiredName(request.body?.name, 'name');
  const motivation = optionalText(request.body?.motivation, 'motivation', PROSE_MAX);
  const knowledge = optionalText(request.body?.knowledge, 'knowledge', PROSE_MAX);
  const attitude = optionalText(request.body?.attitude, 'attitude', 80);
  const loc = await ownedLocation(client, request.params.campaignId, request.body?.location_id);
  const inserted = await client.query(
    `INSERT INTO campaign_npc (campaign_id, location_id, name, motivation, knowledge, attitude)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [request.params.campaignId, loc ? loc.id : null, name, motivation, knowledge, attitude]
  );
  const situation = await ownedSituation(client, request.params.campaignId, request.body?.situation_id);
  if (situation) {
    await client.query(
      'INSERT INTO campaign_situation_npc (situation_id, npc_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [situation.id, inserted.rows[0].id]
    );
  }
  return { statusCode: 201, body: { id: Number(inserted.rows[0].id) } };
}));

app.patch('/api/campaigns/:campaignId/situation/npcs/:npcId', (req, res) => withSituation(req, res, 'Failed to update NPC', async (client, request) => {
  const id = positiveInt(request.params.npcId, 'npc_id');
  const body = request.body || {};
  const sets = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    values.push(requiredName(body.name, 'name'));
    sets.push(`name = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'motivation')) {
    values.push(optionalText(body.motivation, 'motivation', PROSE_MAX));
    sets.push(`motivation = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'knowledge')) {
    values.push(optionalText(body.knowledge, 'knowledge', PROSE_MAX));
    sets.push(`knowledge = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'attitude')) {
    values.push(optionalText(body.attitude, 'attitude', 80));
    sets.push(`attitude = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'location_id')) {
    const loc = await ownedLocation(client, request.params.campaignId, body.location_id);
    values.push(loc ? loc.id : null);
    sets.push(`location_id = $${values.length}`);
  }
  if (sets.length === 0) throw storedError('Nothing to change', 400);
  values.push(id, request.params.campaignId);
  const updated = await client.query(
    `UPDATE campaign_npc SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND campaign_id = $${values.length}
     RETURNING id`,
    values
  );
  if (updated.rows.length === 0) throw storedError('NPC not found', 404);
  return { id: Number(updated.rows[0].id) };
}));

app.delete('/api/campaigns/:campaignId/situation/npcs/:npcId', (req, res) => withSituation(req, res, 'Failed to delete NPC', async (client, request) => {
  const deleted = await client.query(
    'DELETE FROM campaign_npc WHERE id = $1 AND campaign_id = $2 RETURNING id',
    [positiveInt(request.params.npcId, 'npc_id'), request.params.campaignId]
  );
  if (deleted.rows.length === 0) throw storedError('NPC not found', 404);
  return { id: Number(deleted.rows[0].id) };
}));

app.post('/api/campaigns/:campaignId/situation/:situationId/npcs', (req, res) => withSituation(req, res, 'Failed to link NPC', async (client, request) => {
  const situation = await ownedSituation(client, request.params.campaignId, request.params.situationId);
  if (!situation) throw storedError('Situation not found', 404);
  const npcId = positiveInt(request.body?.npc_id, 'npc_id');
  const npc = await client.query(
    'SELECT id FROM campaign_npc WHERE id = $1 AND campaign_id = $2',
    [npcId, request.params.campaignId]
  );
  if (npc.rows.length === 0) throw storedError('NPC not found', 404);
  await client.query(
    'INSERT INTO campaign_situation_npc (situation_id, npc_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [situation.id, npcId]
  );
  return { situation_id: Number(situation.id), npc_id: npcId };
}));

app.delete('/api/campaigns/:campaignId/situation/:situationId/npcs/:npcId', (req, res) => withSituation(req, res, 'Failed to unlink NPC', async (client, request) => {
  const deleted = await client.query(
    `DELETE FROM campaign_situation_npc sn
     USING campaign_situation s
     WHERE sn.situation_id = s.id AND s.campaign_id = $1 AND sn.situation_id = $2 AND sn.npc_id = $3
     RETURNING sn.npc_id`,
    [
      request.params.campaignId,
      positiveInt(request.params.situationId, 'situation_id'),
      positiveInt(request.params.npcId, 'npc_id'),
    ]
  );
  if (deleted.rows.length === 0) throw storedError('NPC link not found', 404);
  return { npc_id: Number(deleted.rows[0].npc_id) };
}));

app.post('/api/campaigns/:campaignId/situation/clues', (req, res) => withSituation(req, res, 'Failed to add clue', async (client, request) => {
  const body = requiredProse(request.body?.body, 'body');
  const discovered = request.body?.discovered == null ? false : booleanField(request.body.discovered, 'discovered');
  const loc = await ownedLocation(client, request.params.campaignId, request.body?.location_id);
  const inserted = await client.query(
    `INSERT INTO campaign_clue (campaign_id, location_id, body, discovered, base_discovered)
     VALUES ($1, $2, $3, $4, $4)
     RETURNING id`,
    [request.params.campaignId, loc ? loc.id : null, body, discovered]
  );
  const situation = await ownedSituation(client, request.params.campaignId, request.body?.situation_id);
  if (situation) {
    await client.query(
      'INSERT INTO campaign_situation_clue (situation_id, clue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [situation.id, inserted.rows[0].id]
    );
  }
  return { statusCode: 201, body: { id: Number(inserted.rows[0].id) } };
}));

app.patch('/api/campaigns/:campaignId/situation/clues/:clueId', (req, res) => withSituation(req, res, 'Failed to update clue', async (client, request) => {
  const id = positiveInt(request.params.clueId, 'clue_id');
  const body = request.body || {};
  const sets = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(body, 'body')) {
    values.push(requiredProse(body.body, 'body'));
    sets.push(`body = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'discovered')) {
    values.push(booleanField(body.discovered, 'discovered'));
    sets.push(`discovered = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'location_id')) {
    const loc = await ownedLocation(client, request.params.campaignId, body.location_id);
    values.push(loc ? loc.id : null);
    sets.push(`location_id = $${values.length}`);
  }
  if (sets.length === 0) throw storedError('Nothing to change', 400);
  values.push(id, request.params.campaignId);
  const updated = await client.query(
    `UPDATE campaign_clue SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND campaign_id = $${values.length}
     RETURNING id`,
    values
  );
  if (updated.rows.length === 0) throw storedError('Clue not found', 404);
  return { id: Number(updated.rows[0].id) };
}));

app.delete('/api/campaigns/:campaignId/situation/clues/:clueId', (req, res) => withSituation(req, res, 'Failed to delete clue', async (client, request) => {
  const deleted = await client.query(
    'DELETE FROM campaign_clue WHERE id = $1 AND campaign_id = $2 RETURNING id',
    [positiveInt(request.params.clueId, 'clue_id'), request.params.campaignId]
  );
  if (deleted.rows.length === 0) throw storedError('Clue not found', 404);
  return { id: Number(deleted.rows[0].id) };
}));

app.post('/api/campaigns/:campaignId/situation/encounters', (req, res) => withSituation(req, res, 'Failed to add encounter', async (client, request) => {
  const title = requiredName(request.body?.title, 'title');
  const kind = oneOf(request.body?.kind, ENCOUNTER_KINDS, 'kind');
  const purpose = optionalText(request.body?.purpose, 'purpose', PROSE_MAX);
  const notes = optionalText(request.body?.notes, 'notes', PROSE_MAX);
  const situation = await ownedSituation(client, request.params.campaignId, request.body?.situation_id);
  const loc = await ownedLocation(client, request.params.campaignId, request.body?.location_id);
  const inserted = await client.query(
    `INSERT INTO campaign_encounter
       (campaign_id, situation_id, location_id, title, kind, purpose, notes, status, base_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'prepared', 'prepared')
     RETURNING id`,
    [request.params.campaignId, situation ? situation.id : null, loc ? loc.id : null, title, kind, purpose, notes]
  );
  return { statusCode: 201, body: { id: Number(inserted.rows[0].id) } };
}));

app.patch('/api/campaigns/:campaignId/situation/encounters/:encounterId', (req, res) => withSituation(req, res, 'Failed to update encounter', async (client, request) => {
  const encounter = await ownedEncounter(client, request.params.campaignId, request.params.encounterId);
  const body = request.body || {};
  const sets = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    values.push(requiredName(body.title, 'title'));
    sets.push(`title = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'kind')) {
    values.push(oneOf(body.kind, ENCOUNTER_KINDS, 'kind'));
    sets.push(`kind = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'purpose')) {
    values.push(optionalText(body.purpose, 'purpose', PROSE_MAX));
    sets.push(`purpose = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    values.push(optionalText(body.notes, 'notes', PROSE_MAX));
    sets.push(`notes = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'situation_id')) {
    const situation = await ownedSituation(client, request.params.campaignId, body.situation_id);
    values.push(situation ? situation.id : null);
    sets.push(`situation_id = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'location_id')) {
    const loc = await ownedLocation(client, request.params.campaignId, body.location_id);
    values.push(loc ? loc.id : null);
    sets.push(`location_id = $${values.length}`);
  }
  if (sets.length === 0) throw storedError('Nothing to change', 400);
  values.push(encounter.id, request.params.campaignId);
  const updated = await client.query(
    `UPDATE campaign_encounter SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND campaign_id = $${values.length}
     RETURNING id`,
    values
  );
  return { id: Number(updated.rows[0].id) };
}));

app.delete('/api/campaigns/:campaignId/situation/encounters/:encounterId', (req, res) => withSituation(req, res, 'Failed to delete encounter', async (client, request) => {
  const deleted = await client.query(
    'DELETE FROM campaign_encounter WHERE id = $1 AND campaign_id = $2 RETURNING id',
    [positiveInt(request.params.encounterId, 'encounter_id'), request.params.campaignId]
  );
  if (deleted.rows.length === 0) throw storedError('Encounter not found', 404);
  return { id: Number(deleted.rows[0].id) };
}));

app.post('/api/campaigns/:campaignId/situation/encounters/:encounterId/members', (req, res) => withSituation(req, res, 'Failed to add encounter member', async (client, request) => {
  const encounter = await ownedEncounter(client, request.params.campaignId, request.params.encounterId);
  const name = requiredName(request.body?.name, 'name');
  const count = creatureCount(request.body);
  const treasure = optionalText(request.body?.treasure_type, 'treasure_type', 40);
  const requestedMonster = request.body?.monster_id == null || request.body.monster_id === ''
    ? null
    : positiveInt(request.body.monster_id, 'monster_id');
  const monster = await monsterForCreature(client, request.params.campaignId, name, requestedMonster);
  const monsterId = monster ? monster.id : null;
  const place = await client.query(
    'SELECT location_id FROM campaign_encounter WHERE id = $1',
    [encounter.id]
  );
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const inserted = await client.query(
      `INSERT INTO campaign_creature
         (campaign_id, location_id, name, monster_id, treasure_type, disposition, base_disposition, in_fight)
       VALUES ($1, $2, $3, $4, $5, 'present', 'present', false)
       RETURNING id`,
      [request.params.campaignId, place.rows[0].location_id, name, monsterId, treasure]
    );
    const creatureId = Number(inserted.rows[0].id);
    await client.query(
      'INSERT INTO campaign_encounter_member (encounter_id, creature_id) VALUES ($1, $2)',
      [encounter.id, creatureId]
    );
    ids.push(creatureId);
  }
  return { statusCode: 201, body: { id: ids[0], ids } };
}));

app.patch('/api/campaigns/:campaignId/situation/encounters/:encounterId/members/:memberId', (req, res) => withSituation(req, res, 'Failed to update encounter member', async (client, request) => {
  const encounter = await ownedEncounter(client, request.params.campaignId, request.params.encounterId);
  const creatureId = positiveInt(request.params.memberId, 'member_id');
  const linked = await client.query(
    `SELECT m.creature_id
     FROM campaign_encounter_member m
     WHERE m.encounter_id = $1 AND m.creature_id = $2`,
    [encounter.id, creatureId]
  );
  if (linked.rows.length === 0) throw storedError('Member not found', 404);
  const body = request.body || {};
  const sets = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    values.push(requiredName(body.name, 'name'));
    sets.push(`name = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'treasure_type')) {
    values.push(optionalText(body.treasure_type, 'treasure_type', 40));
    sets.push(`treasure_type = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'monster_id')) {
    const requested = body.monster_id == null || body.monster_id === ''
      ? null
      : positiveInt(body.monster_id, 'monster_id');
    let monsterId = null;
    if (requested != null) {
      const nameRow = await client.query('SELECT name FROM campaign_creature WHERE id = $1', [creatureId]);
      const monster = await monsterForCreature(
        client,
        request.params.campaignId,
        nameRow.rows[0].name,
        requested
      );
      monsterId = monster.id;
    }
    values.push(monsterId);
    sets.push(`monster_id = $${values.length}`);
  }
  if (sets.length === 0) throw storedError('Nothing to change', 400);
  values.push(creatureId, request.params.campaignId);
  const updated = await client.query(
    `UPDATE campaign_creature SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND campaign_id = $${values.length}
     RETURNING id`,
    values
  );
  if (updated.rows.length === 0) throw storedError('Member not found', 404);
  return { id: Number(updated.rows[0].id) };
}));

app.delete('/api/campaigns/:campaignId/situation/encounters/:encounterId/members/:memberId', (req, res) => withSituation(req, res, 'Failed to remove encounter member', async (client, request) => {
  const creatureId = positiveInt(request.params.memberId, 'member_id');
  const deleted = await client.query(
    `DELETE FROM campaign_encounter_member m
     USING campaign_encounter e
     WHERE m.encounter_id = e.id AND e.campaign_id = $1 AND e.id = $2 AND m.creature_id = $3
     RETURNING m.creature_id`,
    [
      request.params.campaignId,
      positiveInt(request.params.encounterId, 'encounter_id'),
      creatureId,
    ]
  );
  if (deleted.rows.length === 0) throw storedError('Member not found', 404);
  const other = await client.query(
    'SELECT 1 FROM campaign_encounter_member WHERE creature_id = $1',
    [creatureId]
  );
  const creature = await client.query(
    'SELECT in_fight FROM campaign_creature WHERE id = $1 AND campaign_id = $2',
    [creatureId, request.params.campaignId]
  );
  if (other.rows.length === 0 && creature.rows.length > 0 && creature.rows[0].in_fight !== true) {
    await client.query('DELETE FROM campaign_creature WHERE id = $1', [creatureId]);
  }
  return { id: creatureId };
}));

app.post('/api/campaigns/:campaignId/situation/encounters/:encounterId/open', (req, res) => withSituation(req, res, 'Failed to open encounter', async (client, request) => {
  const encounter = await client.query(
    `SELECT id, kind, status FROM campaign_encounter
     WHERE id = $1 AND campaign_id = $2
     FOR UPDATE`,
    [positiveInt(request.params.encounterId, 'encounter_id'), request.params.campaignId]
  );
  if (encounter.rows.length === 0) throw storedError('Encounter not found', 404);
  const row = encounter.rows[0];
  if (row.status === 'resolved') throw storedError('That encounter is not prepared', 400);
  if (row.status !== 'prepared' && row.status !== 'opened') {
    throw storedError('That encounter is not prepared', 400);
  }
  const members = await client.query(
    'SELECT creature_id FROM campaign_encounter_member WHERE encounter_id = $1',
    [row.id]
  );
  const openFight = row.kind === 'combat' || members.rows.length > 0;
  if (openFight) {
    await client.query(
      `INSERT INTO campaign_board (campaign_id, in_encounter)
       VALUES ($1, true)
       ON CONFLICT (campaign_id) DO UPDATE SET in_encounter = true`,
      [request.params.campaignId]
    );
    await client.query(
      `UPDATE campaign_creature c
       SET in_fight = true
       FROM campaign_encounter_member m
       WHERE m.encounter_id = $1 AND m.creature_id = c.id`,
      [row.id]
    );
  }
  if (row.status === 'prepared') {
    await client.query(
      `UPDATE campaign_encounter SET status = 'opened' WHERE id = $1`,
      [row.id]
    );
  }
  await setActiveStage(client, request.params.campaignId, 'encounter');
  return { id: Number(row.id), in_encounter: openFight };
}));

app.post('/api/campaigns/:campaignId/situation/encounters/:encounterId/resolve', (req, res) => withSituation(req, res, 'Failed to resolve encounter', async (client, request) => {
  const updated = await client.query(
    `UPDATE campaign_encounter SET status = 'resolved'
     WHERE id = $1 AND campaign_id = $2
     RETURNING id`,
    [positiveInt(request.params.encounterId, 'encounter_id'), request.params.campaignId]
  );
  if (updated.rows.length === 0) throw storedError('Encounter not found', 404);
  return { id: Number(updated.rows[0].id) };
}));

app.post('/api/campaigns/:campaignId/situation/transitions', (req, res) => withSituation(req, res, 'Failed to add lead', async (client, request) => {
  const loc = await ownedLocation(client, request.params.campaignId, request.body?.to_location_id);
  if (!loc) throw storedError('to_location_id is required', 400);
  const reason = optionalText(request.body?.reason, 'reason', PROSE_MAX);
  const situation = await ownedSituation(client, request.params.campaignId, request.body?.situation_id);
  const inserted = await client.query(
    `INSERT INTO campaign_transition (campaign_id, situation_id, to_location_id, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [request.params.campaignId, situation ? situation.id : null, loc.id, reason]
  );
  return { statusCode: 201, body: { id: Number(inserted.rows[0].id) } };
}));

app.patch('/api/campaigns/:campaignId/situation/transitions/:transitionId', (req, res) => withSituation(req, res, 'Failed to update lead', async (client, request) => {
  const id = positiveInt(request.params.transitionId, 'transition_id');
  const body = request.body || {};
  const sets = [];
  const values = [];
  if (Object.prototype.hasOwnProperty.call(body, 'to_location_id')) {
    const loc = await ownedLocation(client, request.params.campaignId, body.to_location_id);
    if (!loc) throw storedError('to_location_id is required', 400);
    values.push(loc.id);
    sets.push(`to_location_id = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'reason')) {
    values.push(optionalText(body.reason, 'reason', PROSE_MAX));
    sets.push(`reason = $${values.length}`);
  }
  if (sets.length === 0) throw storedError('Nothing to change', 400);
  values.push(id, request.params.campaignId);
  const updated = await client.query(
    `UPDATE campaign_transition SET ${sets.join(', ')}
     WHERE id = $${values.length - 1} AND campaign_id = $${values.length}
     RETURNING id`,
    values
  );
  if (updated.rows.length === 0) throw storedError('Lead not found', 404);
  return { id: Number(updated.rows[0].id) };
}));

app.delete('/api/campaigns/:campaignId/situation/transitions/:transitionId', (req, res) => withSituation(req, res, 'Failed to delete lead', async (client, request) => {
  const deleted = await client.query(
    'DELETE FROM campaign_transition WHERE id = $1 AND campaign_id = $2 RETURNING id',
    [positiveInt(request.params.transitionId, 'transition_id'), request.params.campaignId]
  );
  if (deleted.rows.length === 0) throw storedError('Lead not found', 404);
  return { id: Number(deleted.rows[0].id) };
}));

app.post('/api/campaigns/:campaignId/situation/transitions/:transitionId/arrive', (req, res) => withSituation(req, res, 'Failed to arrive', async (client, request) => {
  const lead = await client.query(
    'SELECT id, to_location_id FROM campaign_transition WHERE id = $1 AND campaign_id = $2',
    [positiveInt(request.params.transitionId, 'transition_id'), request.params.campaignId]
  );
  if (lead.rows.length === 0) throw storedError('Lead not found', 404);
  const selected = await arriveAtLocation(client, request.params.campaignId, lead.rows[0].to_location_id);
  return { location_id: selected.location_id, place: selected.place };
}));

app.post('/api/campaigns/:campaignId/situation/return', (req, res) => withSituation(req, res, 'Failed to return', async (client, request) => {
  const loc = await ownedLocation(client, request.params.campaignId, request.body?.location_id);
  if (!loc) throw storedError('location_id is required', 400);
  if (loc.arrived_seconds == null) throw storedError('The party has not been there', 400);
  const selected = await arriveAtLocation(client, request.params.campaignId, loc.id);
  return { location_id: selected.location_id, place: selected.place };
}));

app.post('/api/campaigns/:campaignId/situation/log', (req, res) => withSituation(req, res, 'Failed to record log', async (client, request) => {
  const kind = oneOf(request.body?.kind, LOG_KINDS, 'kind');
  const body = requiredProse(request.body?.body, 'body');
  const situation = await ownedSituation(client, request.params.campaignId, request.body?.situation_id);
  const at = await clockSeconds(client, request.params.campaignId);
  const inserted = await client.query(
    `INSERT INTO campaign_log (campaign_id, situation_id, at_seconds, kind, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [request.params.campaignId, situation ? situation.id : null, at, kind, body]
  );
  return { statusCode: 201, body: { id: Number(inserted.rows[0].id) } };
}));

app.post('/api/campaigns/:campaignId/situation/rest', (req, res) => withSituation(req, res, 'Failed to rest', async (client, request) => {
  const updated = await setActiveStage(client, request.params.campaignId, 'rest_or_session_end');
  if (!updated) throw storedError('No active situation', 400);
  return { id: Number(updated.id) };
}));

app.post('/api/campaigns/:campaignId/situation/end', (req, res) => withSituation(req, res, 'Failed to end session', async (client, request) => {
  const current = await client.query('SELECT id, concluded FROM campaign WHERE id = $1', [request.params.campaignId]);
  if (current.rows.length === 0) throw storedError('Campaign not found', 404);
  await setActiveStage(client, request.params.campaignId, 'rest_or_session_end');
  const updated = await client.query(
    `UPDATE campaign SET running = false, modified = CURRENT_TIMESTAMP WHERE id = $1 RETURNING running, concluded`,
    [request.params.campaignId]
  );
  return { running: updated.rows[0].running === true, concluded: updated.rows[0].concluded === true };
}));

async function resetCampaignRun(client, campaignId) {
  await client.query(
    `UPDATE campaign_creature
     SET hp = base_hp, disposition = base_disposition, in_fight = false
     WHERE campaign_id = $1`,
    [campaignId]
  );
  await client.query(
    'UPDATE campaign_encounter SET status = base_status WHERE campaign_id = $1',
    [campaignId]
  );
  await client.query(
    'UPDATE campaign_clue SET discovered = base_discovered WHERE campaign_id = $1',
    [campaignId]
  );
  await client.query(
    'UPDATE campaign_objective SET known = base_known, status = base_status WHERE campaign_id = $1',
    [campaignId]
  );
  await client.query(
    `UPDATE campaign_situation SET status = 'planned', stage = 'setup' WHERE campaign_id = $1`,
    [campaignId]
  );
  await client.query(
    `UPDATE campaign_board
     SET game_seconds = 0, in_encounter = false, place = 'outside',
         location_id = NULL, check_seconds = NULL, visit_seconds = NULL
     WHERE campaign_id = $1`,
    [campaignId]
  );
  await client.query(
    'UPDATE campaign_location SET arrived_seconds = NULL WHERE campaign_id = $1',
    [campaignId]
  );
  await client.query(
    `UPDATE campaign_character
     SET food_missed = 0, heal_food = false, heal_water = false,
         march_days = 0, march_failed = false, hire_penalty = 0
     WHERE campaign_id = $1`,
    [campaignId]
  );
  await client.query('DELETE FROM campaign_wander WHERE campaign_id = $1', [campaignId]);
  await client.query('DELETE FROM campaign_log WHERE campaign_id = $1', [campaignId]);
  await client.query('DELETE FROM campaign_mark WHERE campaign_id = $1', [campaignId]);
  await client.query('DELETE FROM campaign_turn_block WHERE campaign_id = $1', [campaignId]);
  await client.query('DELETE FROM campaign_presence WHERE campaign_id = $1', [campaignId]);
  await client.query(
    `DELETE FROM campaign_location_flag f
     USING campaign_location l
     WHERE f.location_id = l.id AND l.campaign_id = $1`,
    [campaignId]
  );
  await client.query('DELETE FROM campaign_command WHERE campaign_id = $1', [campaignId]);
  await client.query('DELETE FROM campaign_hireling WHERE campaign_id = $1', [campaignId]);
}

app.post('/api/campaigns/:campaignId/situation/conclude', (req, res) => withSituation(req, res, 'Failed to conclude campaign', async (client, request) => {
  const current = await client.query('SELECT id FROM campaign WHERE id = $1', [request.params.campaignId]);
  if (current.rows.length === 0) throw storedError('Campaign not found', 404);
  await resetCampaignRun(client, request.params.campaignId);
  const updated = await client.query(
    `UPDATE campaign SET concluded = true, running = false, modified = CURRENT_TIMESTAMP
     WHERE id = $1 RETURNING running, concluded`,
    [request.params.campaignId]
  );
  return { running: updated.rows[0].running === true, concluded: updated.rows[0].concluded === true };
}));

app.get('/api/campaigns/:campaignId/here', async (req, res) => {
  try {
    const member = await requireCampaign(req, res, req.params.campaignId, false);
    if (!member) return;
    const here = await pool.query(
      `SELECT l.name AS location_name
       FROM campaign c
       LEFT JOIN campaign_board b ON b.campaign_id = c.id
       LEFT JOIN campaign_location l ON l.id = b.location_id AND l.campaign_id = c.id
       WHERE c.id = $1`,
      [req.params.campaignId]
    );
    if (here.rows.length === 0) return res.status(404).json({ error: 'Campaign not found' });
    const objectives = await pool.query(
      `SELECT id, body, status
       FROM campaign_objective
       WHERE campaign_id = $1 AND known = true
       ORDER BY id`,
      [req.params.campaignId]
    );
    res.json(playerHere({
      location_name: here.rows[0].location_name,
      objectives: objectives.rows,
    }));
  } catch (error) {
    if (adventuringMissing(res, error)) return;
    console.error('Error reading here:', error);
    res.status(500).json({ error: error.message || 'Failed to read here' });
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
