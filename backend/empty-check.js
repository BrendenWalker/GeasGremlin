/**
 * An empty-room check fires once per site visit.
 * The visit stamp is the mark. One location interval after that mark, the
 * location's check die is rolled. The same stamp does not roll again.
 * A hit names a living creature already at the location. It does not add one.
 * Dead rows (hp 0) are skipped. Present comes before fled.
 * The check die is the only roll. There is no second die for which creature.
 */

const { checkHit } = require('./wander');

function visitCheckDue(stamp, now, intervalSeconds, fired, inEncounter) {
  if (inEncounter === true) return false;
  if (fired === true) return false;
  if (stamp == null || stamp === '') return false;
  const start = Number(stamp);
  const at = Number(now);
  const interval = Number(intervalSeconds);
  if (!Number.isInteger(start) || start < 0) return false;
  if (!Number.isInteger(at) || at < start) return false;
  if (!Number.isInteger(interval) || interval < 1) return false;
  return at - start >= interval;
}

function visitAlreadyFired(rows, stamp) {
  if (stamp == null || stamp === '') return false;
  const start = Number(stamp);
  if (!Number.isInteger(start)) return false;
  return (rows || []).some((row) => row && row.kind === 'visit' && Number(row.at_seconds) >= start);
}

function livingHitPoints(creature) {
  const hp = Number(creature?.hp);
  return Number.isInteger(hp) ? hp : 0;
}

function namedCreature(creatures) {
  const living = (creatures || []).filter((creature) => {
    const name = String(creature?.name || '').trim();
    return name !== '' && livingHitPoints(creature) > 0;
  });
  const present = living.filter((creature) => creature.disposition !== 'fled');
  const pool = (present.length > 0 ? present : living).slice().sort((a, b) => Number(a.id) - Number(b.id));
  return pool[0] || null;
}

function monsterPointer(creature) {
  if (creature.monster_id == null || creature.monster_id === '') return null;
  const id = Number(creature.monster_id);
  return Number.isInteger(id) ? id : null;
}

function emptyCheckResult(creatures, roll) {
  if (!checkHit(roll)) return { outcome: 'miss', name: null, monster_id: null };
  const named = namedCreature(creatures);
  if (!named) return { outcome: 'none', name: null, monster_id: null };
  return {
    outcome: 'named',
    name: String(named.name).trim(),
    monster_id: monsterPointer(named),
  };
}

function currentVisitCheck(rows, stamp) {
  if (stamp == null || stamp === '') return null;
  const start = Number(stamp);
  if (!Number.isInteger(start)) return null;
  let found = null;
  for (const row of rows || []) {
    if (!row || row.kind !== 'visit') continue;
    const at = Number(row.at_seconds);
    if (!Number.isInteger(at) || at < start) continue;
    const id = Number(row.id) || 0;
    if (!found || at > found.at || (at === found.at && id > found.id)) found = { at, id, row };
  }
  if (!found) return null;
  const row = found.row;
  const name = row.label ? String(row.label) : null;
  let outcome = 'miss';
  if (name) outcome = 'named';
  else if (checkHit(Number(row.check_roll))) outcome = 'none';
  return {
    outcome,
    name,
    check_die: Number(row.check_die),
    check_roll: Number(row.check_roll),
    at_seconds: found.at,
    location_name: row.location_name,
  };
}

module.exports = {
  visitCheckDue,
  visitAlreadyFired,
  emptyCheckResult,
  currentVisitCheck,
};
