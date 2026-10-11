/**
 * Monster experience from Basic Fantasy RPG r142, printed page 49.
 * A tally returns shares. It does not write XP or move the clock.
 * Applying a share uses the existing per-character give_xp command.
 *
 * The flat party-XP button stays for awards that are not on this table.
 */

const XP_BASE = [
  0,
  25, 75, 145, 240, 360, 500, 670, 875, 1075, 1300,
  1575, 1875, 2175, 2500, 2850, 3250, 3600, 4000, 4500, 5250,
  6000, 6750, 7500, 8250, 9000,
];

const XP_SPECIAL = [
  0,
  12, 25, 30, 40, 45, 55, 65, 70, 75, 90,
  95, 100, 110, 115, 125, 135, 145, 160, 175, 200,
  225, 250, 275, 300, 325,
];

function xpBand(hd) {
  if (hd < 1) return { base: 10, special: 3 };
  if (hd <= 25) return { base: XP_BASE[hd], special: XP_SPECIAL[hd] };
  const extra = hd - 25;
  return { base: 9000 + (750 * extra), special: 325 + (25 * extra) };
}

/** Asterisks count. A range has no single value. 1−1 and fractions are less than 1 HD. */
function parseAwardDice(hitDice) {
  const source = String(hitDice || '').trim();
  if (!source) return null;
  if (/\bto\b/i.test(source)) return { error: 'hit dice are a range' };
  const asterisks = (source.match(/\*/g) || []).length;
  if (/^1\s*-\s*1(?!\d)/.test(source) || /^\d+\s*\/\s*\d+/.test(source)) {
    return { hd: 0, asterisks };
  }
  const match = source.match(/^(\d+)/);
  if (!match) return { error: 'no hit dice' };
  const hd = Number(match[1]);
  if (hd < 1 || hd > 100) return { error: 'no hit dice' };
  return { hd, asterisks };
}

/**
 * One defeated group. Hit dice and a character level both count; the larger is the row.
 * spells adds one special-ability bonus, for a cleric or magic-user who can cast.
 */
function awardLine({ hitDice, level, spells, count }) {
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    return { error: 'count must be from 1 to 1000' };
  }
  const parsed = parseAwardDice(hitDice);
  if (parsed && parsed.error) return parsed;
  let levelNum = null;
  if (level != null && level !== '') {
    levelNum = Number(level);
    if (!Number.isInteger(levelNum) || levelNum < 1 || levelNum > 100) {
      return { error: 'level must be from 1 to 100' };
    }
  }
  if (!parsed && levelNum == null) return { error: 'no hit dice' };
  let hd = parsed ? parsed.hd : levelNum;
  if (levelNum != null && levelNum > hd) hd = levelNum;
  let asterisks = parsed ? parsed.asterisks : 0;
  if (spells === true) asterisks += 1;
  const band = xpBand(hd);
  const each = band.base + (band.special * asterisks);
  return { hd, asterisks, each, subtotal: each * count };
}

/** Full members count as 1 share. Each retainer counts as 1/2. Shares are truncated. */
function splitAward(total, members) {
  if (!Number.isInteger(total) || total < 0) return { error: 'experience must be a non-negative integer' };
  if (!Array.isArray(members) || members.length === 0) return { error: 'no one to award' };
  let units = 0;
  for (const member of members) units += member.retainer === true ? 1 : 2;
  const full = Math.floor((total * 2) / units);
  const half = Math.floor(full / 2);
  return {
    full,
    half,
    shares: members.map((member) => ({
      id: member.id,
      name: member.name,
      retainer: member.retainer === true,
      amount: member.retainer === true ? half : full,
    })),
  };
}

function levelForXp(leveling, xp) {
  const rows = [...(leveling || [])]
    .filter((row) => Number.isInteger(Number(row.level)) && Number.isInteger(Number(row.xp)))
    .sort((a, b) => Number(a.level) - Number(b.level));
  if (rows.length === 0) return null;
  let level = Number(rows[0].level);
  for (const row of rows) {
    if (Number(row.xp) <= xp) level = Number(row.level);
  }
  return level;
}

function xpAtLevel(leveling, level) {
  const row = (leveling || []).find((entry) => Number(entry.level) === Number(level));
  if (!row || row.xp == null || row.xp === '') return null;
  const xp = Number(row.xp);
  return Number.isInteger(xp) ? xp : null;
}

/**
 * One level from this adventure. The ceiling is one point short of two levels up,
 * measured from the level of the XP already on the sheet. Pending awards count
 * toward that ceiling so a second tally cannot buy the next level.
 */
function cappedAward(storedXp, pendingXp, leveling, amount) {
  const stored = Number.isInteger(storedXp) && storedXp > 0 ? storedXp : 0;
  const pending = Number.isInteger(pendingXp) && pendingXp > 0 ? pendingXp : 0;
  if (!Number.isInteger(amount) || amount < 0) return { error: 'experience must be a non-negative integer' };
  const level = levelForXp(leveling, stored);
  const stop = level == null ? null : xpAtLevel(leveling, level + 2);
  if (stop == null) return { amount, capped: false, ceiling: null };
  const room = stop - 1 - stored - pending;
  if (room < amount) return { amount: Math.max(0, room), capped: true, ceiling: stop - 1 };
  return { amount, capped: false, ceiling: null };
}

module.exports = {
  awardLine,
  splitAward,
  cappedAward,
  parseAwardDice,
  xpBand,
};
