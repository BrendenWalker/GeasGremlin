/**
 * Light, rations, sleep, and encumbrance from Basic Fantasy RPG r142.
 * Printed pages 42–44 and 59. A torch or lantern is a timed mark.
 * Settling food, water, and sleep does not move the clock.
 *
 * ponytail: catalog item weight is sixteenths of a pound (leather 240 is 15 lb).
 * A custom weight typed as whole pounds is read the same way.
 * Over the heavy load still uses the heavy movement column. The book has no third rate.
 * Healing is not capped. The sheet has no maximum hit points.
 * Miles per day are the base rate. Terrain is a later step.
 */

const TURN_MINUTES = 10;
const OUNCES_PER_POUND = 16;

const LIGHT = {
  torch: { die: 4, plus: 4, label: 'Torch' },
  lantern: { die: 6, plus: 18, label: 'Lantern oil' },
};

const MOVE = {
  none: { light: 40, heavy: 30 },
  leather: { light: 30, heavy: 20 },
  metal: { light: 20, heavy: 10 },
};

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

function lightDuration(source, roll) {
  const spec = LIGHT[source];
  if (!spec) return { error: 'light is a torch or lantern oil' };
  if (!Number.isInteger(roll) || roll < 1 || roll > spec.die) return { error: 'bad roll' };
  const turns = roll + spec.plus;
  return {
    source,
    roll,
    turns,
    minutes: turns * TURN_MINUTES,
    note: `${spec.label} (${turns} turns)`,
  };
}

function rollLight(source, rollDie) {
  const spec = LIGHT[source];
  if (!spec) return { error: 'light is a torch or lantern oil' };
  return lightDuration(source, rollDie(spec.die));
}

function isHalfling(raceName) {
  return String(raceName || '').toLowerCase().includes('halfling');
}

function carryLimit(base, modifier) {
  const pct = modifier > 0 ? modifier * 10 : modifier * 20;
  return Math.round((base * (100 + pct)) / 100 / 5) * 5;
}

function carryingCapacity(raceName, strength) {
  const modifier = abilityModifier(strength);
  const half = isHalfling(raceName);
  return {
    light: carryLimit(half ? 50 : 60, modifier),
    heavy: carryLimit(half ? 100 : 150, modifier),
  };
}

function armorBand(ac) {
  if (!Number.isInteger(ac) || ac < 12) return 'none';
  if (ac >= 15) return 'metal';
  return 'leather';
}

function wornBand(ac, magic) {
  const raw = armorBand(ac);
  if (!magic) return raw;
  if (raw === 'metal') return 'leather';
  if (raw === 'leather') return 'none';
  return raw;
}

function armorLabel(ac, magic) {
  const raw = armorBand(ac);
  if (magic && raw === 'metal') return 'magic metal';
  if (magic && raw === 'leather') return 'magic leather';
  if (raw === 'none') return 'no armor';
  if (raw === 'leather') return 'leather';
  return 'metal';
}

function formatPounds(ounces) {
  const n = Number(ounces);
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n % OUNCES_PER_POUND === 0) return String(n / OUNCES_PER_POUND);
  return (n / OUNCES_PER_POUND).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function encumbrance({ raceName, strength, ounces, armorAc, armorMagic }) {
  const caps = carryingCapacity(raceName, strength);
  const carried = Number(ounces) || 0;
  let load = 'light';
  if (carried > caps.heavy * OUNCES_PER_POUND) load = 'over';
  else if (carried > caps.light * OUNCES_PER_POUND) load = 'heavy';
  const band = wornBand(armorAc, armorMagic === true);
  const pace = load === 'light' ? 'light' : 'heavy';
  const move = MOVE[band][pace];
  return {
    pounds: formatPounds(carried),
    light_lb: caps.light,
    heavy_lb: caps.heavy,
    load,
    armor: armorLabel(armorAc, armorMagic === true),
    move,
    turn_feet: move * 3,
    miles: (move * 3) / 5,
  };
}

function slowestMember(members) {
  if (!members || members.length === 0) return null;
  return members.reduce((best, member) => (member.move < best.move ? member : best));
}

function requiredSleep(constitution) {
  return Math.max(0, 6 - abilityModifier(constitution));
}

function settleBody(state, choice, rollDie) {
  let foodMissed = state.foodMissed;
  let healFood = state.healFood === true;
  let healWater = state.healWater === true;
  let foodDamage = 0;
  let waterDamage = 0;
  let waterRoll = null;
  if (choice.ate) {
    foodMissed = 0;
    healFood = false;
  } else {
    foodMissed += 1;
    if (foodMissed >= 3) {
      foodDamage = 1;
      healFood = true;
    }
  }
  if (choice.drank) {
    healWater = false;
  } else {
    waterRoll = rollDie(4);
    if (!Number.isInteger(waterRoll) || waterRoll < 1 || waterRoll > 4) return { error: 'bad roll' };
    waterDamage = waterRoll;
    healWater = true;
  }
  const required = requiredSleep(choice.constitution);
  const hours = choice.hours;
  if (!Number.isInteger(hours) || hours < 0) return { error: 'hours must be a non-negative integer' };
  const slept = hours >= required;
  const healed = !healFood && !healWater && slept ? 1 + (choice.bedrest ? 1 : 0) : 0;
  return {
    foodMissed,
    healFood,
    healWater,
    foodDamage,
    waterDamage,
    waterRoll,
    healed,
    required,
    slept,
    delta: healed - foodDamage - waterDamage,
  };
}

function applyBodyHitPoints(current, delta) {
  if (delta === 0) return { hp: current, down: current === 0, changed: false };
  if (!Number.isInteger(current) || current < 0) return { error: 'set hit points first' };
  const hp = Math.max(0, current + delta);
  return { hp, down: hp === 0, changed: true };
}

module.exports = {
  LIGHT,
  abilityModifier,
  lightDuration,
  rollLight,
  carryingCapacity,
  encumbrance,
  slowestMember,
  requiredSleep,
  settleBody,
  applyBodyHitPoints,
  formatPounds,
};
