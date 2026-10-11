/**
 * Encounter dice from Basic Fantasy RPG r142, printed pages 50 and 57–58.
 * Rolls return a result. They do not move the clock or open an encounter.
 *
 * ponytail: a D turning result reports one damage total and does not write hit
 * points. The damage action on the open encounter applies that number.
 */

const TURN_COLUMNS = [
  { type: 'Skeleton', hd: '1 Hit Die' },
  { type: 'Zombie', hd: '2 Hit Dice' },
  { type: 'Ghoul', hd: '3 Hit Dice' },
  { type: 'Wight', hd: '4 Hit Dice' },
  { type: 'Wraith', hd: '5 Hit Dice' },
  { type: 'Mummy', hd: '6 Hit Dice' },
  { type: 'Spectre', hd: '7 Hit Dice' },
  { type: 'Vampire', hd: '8 Hit Dice' },
  { type: 'Ghost', hd: '9+ Hit Dice' },
];

// Cleric level 1 is row 0. Nine columns, weakest first. T turns, D damages, No cannot.
const TURN_TABLE = [
  [13, 17, 19, 'No', 'No', 'No', 'No', 'No', 'No'],
  [11, 15, 18, 20, 'No', 'No', 'No', 'No', 'No'],
  [9, 13, 17, 19, 'No', 'No', 'No', 'No', 'No'],
  [7, 11, 15, 18, 20, 'No', 'No', 'No', 'No'],
  [5, 9, 13, 17, 19, 'No', 'No', 'No', 'No'],
  [3, 7, 11, 15, 18, 20, 'No', 'No', 'No'],
  [2, 5, 9, 13, 17, 19, 'No', 'No', 'No'],
  ['T', 3, 7, 11, 15, 18, 20, 'No', 'No'],
  ['T', 2, 5, 9, 13, 17, 19, 'No', 'No'],
  ['T', 'T', 3, 7, 11, 15, 18, 20, 'No'],
  ['D', 'T', 2, 5, 9, 13, 17, 19, 'No'],
  ['D', 'T', 'T', 3, 7, 11, 15, 18, 20],
  ['D', 'D', 'T', 2, 5, 9, 13, 17, 19],
  ['D', 'D', 'T', 'T', 3, 7, 11, 15, 18],
  ['D', 'D', 'D', 'T', 2, 5, 9, 13, 17],
  ['D', 'D', 'D', 'T', 'T', 3, 7, 11, 15],
  ['D', 'D', 'D', 'D', 'T', 2, 5, 9, 13],
  ['D', 'D', 'D', 'D', 'T', 'T', 3, 7, 11],
  ['D', 'D', 'D', 'D', 'D', 'T', 2, 5, 9],
  ['D', 'D', 'D', 'D', 'D', 'T', 'T', 3, 7],
];

function abilityModifier(score) {
  if (score == null || score === '') return 0;
  const n = Number(score);
  if (!Number.isInteger(n)) return 0;
  if (n <= 3) return -3;
  if (n <= 5) return -2;
  if (n <= 8) return -1;
  if (n <= 12) return 0;
  if (n <= 15) return 1;
  if (n <= 17) return 2;
  return 3;
}

function takeDie(rollDie, sides) {
  if (typeof rollDie !== 'function') return { error: 'Roll needs a die' };
  const face = rollDie(sides);
  if (!Number.isInteger(face) || face < 1 || face > sides) {
    return { error: `die roll must be from 1 to ${sides}` };
  }
  return { face };
}

function surpriseRange(ambushed, lessLikely) {
  const base = ambushed ? 4 : 2;
  const range = base - (lessLikely ? 1 : 0);
  return range < 0 ? 0 : range;
}

function rollSide(members, ambushed, rollDie) {
  if (members.length === 0) return { roll: null, actors: [], skips: false };
  const rolled = takeDie(rollDie, 6);
  if (rolled.error) return rolled;
  const actors = members.map((member) => {
    const range = surpriseRange(ambushed === true, member.lessLikely === true);
    const surprised = range > 0 && rolled.face <= range;
    return {
      id: member.id,
      name: member.name,
      range,
      surprised,
      skips: surprised,
    };
  });
  return {
    roll: rolled.face,
    actors,
    skips: actors.every((actor) => actor.surprised),
  };
}

function rollSurprise({ party, enemies, partyAmbushed, enemiesAmbushed, rollDie }) {
  const partyMembers = Array.isArray(party) ? party : null;
  const enemyMembers = Array.isArray(enemies) ? enemies : null;
  if (!partyMembers || !enemyMembers) return { error: 'surprise needs a party and enemies' };
  if (partyMembers.length === 0 && enemyMembers.length === 0) return { error: 'nobody to surprise' };
  const partySide = rollSide(partyMembers, partyAmbushed, rollDie);
  if (partySide.error) return partySide;
  const enemySide = rollSide(enemyMembers, enemiesAmbushed, rollDie);
  if (enemySide.error) return enemySide;
  return { party: partySide, enemies: enemySide };
}

function reactionResult(total) {
  if (total <= 2) return 'Immediate Attack';
  if (total <= 7) return 'Unfavorable';
  if (total <= 11) return 'Favorable';
  return 'Very Favorable';
}

function rollReaction({ bonus, adjustment, rollDie }) {
  if (!Number.isInteger(bonus)) return { error: 'charisma bonus must be an integer' };
  if (!Number.isInteger(adjustment) || adjustment < -10 || adjustment > 10) {
    return { error: 'reaction adjustment must be from -10 to 10' };
  }
  const first = takeDie(rollDie, 6);
  if (first.error) return first;
  const second = takeDie(rollDie, 6);
  if (second.error) return second;
  const dice = first.face + second.face;
  const total = dice + bonus + adjustment;
  return {
    faces: [first.face, second.face],
    dice,
    bonus,
    adjustment,
    total,
    result: reactionResult(total),
  };
}

function rollInitiative({ actors, rollDie }) {
  if (!Array.isArray(actors) || actors.length === 0) return { error: 'nobody to order' };
  const rolled = [];
  for (const actor of actors) {
    const face = takeDie(rollDie, 6);
    if (face.error) return face;
    const bonus = actor.bonus == null ? 0 : actor.bonus;
    if (!Number.isInteger(bonus)) return { error: 'initiative bonus must be an integer' };
    rolled.push({
      id: actor.id,
      name: actor.name,
      side: actor.side,
      roll: face.face,
      bonus,
      total: face.face + bonus,
    });
  }
  rolled.sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)) || a.id - b.id);
  const order = [];
  for (const actor of rolled) {
    const last = order[order.length - 1];
    if (last && last.total === actor.total) {
      last.actors.push(actor);
      last.together = true;
    } else {
      order.push({ total: actor.total, together: false, actors: [actor] });
    }
  }
  return { order };
}

function rollMorale({ score, adjustment, rollDie }) {
  if (!Number.isInteger(score) || score < 2 || score > 12) return { error: 'morale must be from 2 to 12' };
  if (!Number.isInteger(adjustment) || adjustment < -2 || adjustment > 2) {
    return { error: 'morale adjustment must be from -2 to 2' };
  }
  const first = takeDie(rollDie, 6);
  if (first.error) return first;
  const second = takeDie(rollDie, 6);
  if (second.error) return second;
  const applied = score === 12 ? 0 : adjustment;
  const target = score + applied;
  const roll = first.face + second.face;
  return {
    score,
    adjustment: applied,
    faces: [first.face, second.face],
    roll,
    target,
    result: roll <= target ? 'holds' : 'flees',
  };
}

function hitDiceCount(text) {
  const source = String(text ?? '').trim();
  if (!source || /\bto\b/i.test(source)) return null;
  const half = source.match(/^(\d+)\s*\/\s*(\d+)/);
  if (half) {
    const numerator = Number(half[1]);
    const denominator = Number(half[2]);
    if (denominator === 0 || numerator <= 0) return null;
    const value = numerator / denominator;
    return value < 1 ? 1 : Math.floor(value);
  }
  const match = source.match(/^(\d+)/);
  if (!match) return null;
  const count = Number(match[1]);
  return count >= 1 ? count : null;
}

function turnTarget(level, column) {
  if (!Number.isInteger(level) || level < 1 || level > 20) return null;
  if (!Number.isInteger(column) || column < 0 || column > 8) return null;
  return TURN_TABLE[level - 1][column];
}

function resolveUndead(name, hitDiceText, override) {
  const cleaned = String(name || '').trim().toLowerCase();
  const named = TURN_COLUMNS.findIndex((column) => column.type.toLowerCase() === cleaned);
  const hitDice = override != null ? override : hitDiceCount(hitDiceText);
  if (!Number.isInteger(hitDice) || hitDice < 1 || hitDice > 100) {
    return { error: 'hit dice must be from 1 to 100' };
  }
  if (named >= 0) {
    return { column: named, hitDice, label: TURN_COLUMNS[named].type };
  }
  const column = hitDice >= 9 ? 8 : hitDice - 1;
  return { column, hitDice, label: TURN_COLUMNS[column].hd };
}

function checkPassed(target, roll) {
  if (target === 'T' || target === 'D') return true;
  if (target === 'No') return false;
  return roll >= target;
}

function rollTurn({ level, groups, rollDie }) {
  if (!Number.isInteger(level) || level < 1) return { error: 'cleric level must be a positive integer' };
  if (!Array.isArray(groups) || groups.length === 0) return { error: 'choose undead to turn' };
  const tableLevel = Math.min(level, 20);
  const prepared = [];
  for (const group of groups) {
    if (!Number.isInteger(group.count) || group.count < 1 || group.count > 100) {
      return { error: 'undead count must be from 1 to 100' };
    }
    if (!Number.isInteger(group.column) || group.column < 0 || group.column > 8) {
      return { error: 'undead column is missing' };
    }
    if (!Number.isInteger(group.hitDice) || group.hitDice < 1 || group.hitDice > 100) {
      return { error: 'hit dice must be from 1 to 100' };
    }
    prepared.push({
      id: group.id,
      name: group.name,
      column: group.column,
      label: group.label,
      count: group.count,
      hitDice: group.hitDice,
      turned: 0,
      checked: false,
      passed: false,
      target: null,
    });
  }
  prepared.sort((a, b) => a.column - b.column || a.id - b.id);
  const d20 = takeDie(rollDie, 20);
  if (d20.error) return d20;
  const columns = [];
  for (const group of prepared) {
    if (!columns.includes(group.column)) columns.push(group.column);
  }
  let failed = false;
  let anyPassed = false;
  for (const column of columns) {
    const target = TURN_TABLE[tableLevel - 1][column];
    const passed = !failed && checkPassed(target, d20.face);
    for (const group of prepared) {
      if (group.column !== column) continue;
      group.target = target;
      group.checked = !failed;
      group.passed = passed;
    }
    if (!passed) failed = true;
    else anyPassed = true;
  }
  let hd = null;
  if (anyPassed) {
    const first = takeDie(rollDie, 6);
    if (first.error) return first;
    const second = takeDie(rollDie, 6);
    if (second.error) return second;
    hd = { faces: [first.face, second.face], total: first.face + second.face };
    let budget = hd.total;
    let coveredOne = false;
    for (const group of prepared) {
      if (!group.passed) continue;
      for (let i = 0; i < group.count; i += 1) {
        if (budget >= group.hitDice) {
          budget -= group.hitDice;
          group.turned += 1;
          coveredOne = true;
        } else if (!coveredOne) {
          group.turned += 1;
          coveredOne = true;
          budget = 0;
        } else {
          budget = -1;
          break;
        }
      }
      if (budget < 0) break;
    }
  }
  const damaged = prepared.some((group) => group.turned > 0 && group.target === 'D');
  let damage = null;
  if (damaged) {
    const faces = [];
    for (let i = 0; i < tableLevel; i += 1) {
      const face = takeDie(rollDie, 8);
      if (face.error) return face;
      faces.push(face.face);
    }
    damage = { faces, total: faces.reduce((sum, face) => sum + face, 0) };
  }
  const short = prepared.some((group) => group.passed && group.turned < group.count);
  return {
    level,
    tableLevel,
    roll: d20.face,
    hd,
    damage,
    block: failed,
    retry: !failed && short,
    groups: prepared,
  };
}

module.exports = {
  TURN_COLUMNS,
  abilityModifier,
  surpriseRange,
  rollSurprise,
  reactionResult,
  rollReaction,
  rollInitiative,
  rollMorale,
  hitDiceCount,
  turnTarget,
  resolveUndead,
  rollTurn,
};
