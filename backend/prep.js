/**
 * Dungeon stocking, trap notes, and vehicle damage from Basic Fantasy RPG r142.
 * Printed pages 13, 60, and 196–197. These help write an adventure.
 * A stocking roll is not stored and does not open an encounter.
 *
 * ponytail: a trap pick fills a note. It does not roll the trap.
 * Field repair stops at 90% of the listed hit points. The last tenth needs a shipwright or a wagonmaker, and that is not built.
 * Crew is capped at 200. A large galley lists 160.
 */

const VEHICLE_AC = 11;

const STOCKING = [
  { lo: 1, hi: 16, contents: 'Empty' },
  { lo: 17, hi: 20, contents: 'Unguarded Treasure' },
  { lo: 21, hi: 60, contents: 'Monster' },
  { lo: 61, hi: 84, contents: 'Monster with Treasure' },
  { lo: 85, hi: 88, contents: 'Special' },
  { lo: 89, hi: 96, contents: 'Trap' },
  { lo: 97, hi: 100, contents: 'Trap with Treasure' },
];

const TRAPS = [
  { name: 'Alarm', note: 'Save vs Spells or be deafened for 1d8 turns. Check for wandering monsters. If one is indicated, it arrives in 2d10 rounds.' },
  { name: 'Arrow Trap', note: 'A hidden crossbow attacks at +1 and deals 1d6+1 damage.' },
  { name: 'Chute', note: 'Save vs Death Ray, with the Dexterity bonus, or tumble to a lower level. A chute usually deals little or no damage.' },
  { name: 'Falling stones', note: 'Save vs Paralysis or Petrify, with the Dexterity bonus, or take 1d10 damage.' },
  { name: 'Flashing Light', note: 'Save vs Spells or be blinded for 1d8 turns. Anyone looking directly at the light is affected.' },
  { name: 'Monster-Attracting Spray', note: 'A harmless spray doubles wandering-monster chances for 1d6 hours, or until it is washed off.' },
  { name: 'Oil Slick', note: 'Save vs Death Ray, with the Dexterity bonus, or fall prone. The oil is flammable.' },
  { name: 'Pit Trap', note: 'Save vs Death Ray, with the Dexterity bonus, or fall. Damage follows the distance. Spikes, acid, creatures, or water are optional.' },
  { name: 'Poison Dart', note: 'Attacks at +1 for 1d4 damage. Save vs Poison or die.' },
  { name: 'Poison Gas', note: 'Save vs Poison or die. Flammable gas may deal 1d6, with a save vs Dragon Breath to avoid that damage.' },
  { name: 'Poison Needle', note: 'A needle in a lock or keyhole. Save vs Poison or die.' },
  { name: 'Portcullis', note: 'A falling gate blocks the passage. Save vs Death Ray or take 3d6 damage.' },
  { name: 'Rolling Boulder', note: 'Save vs Death Ray, with the Dexterity bonus, or take 2d6 damage.' },
  { name: 'Blade Trap', note: 'Attacks at +1 for 1d8 damage. A large blade may hit everyone along a 10 or 20 foot line.' },
  { name: 'Triggered Spell', note: 'A spell of the GM\'s choice, targeting the character who triggered it.' },
];

const VEHICLES = [
  { name: 'Chariot', movement: "60' (10')", hardness: 10, hp: 10, cost: 400, water: false },
  { name: 'Coach', movement: "40' (15')", hardness: 6, hp: 12, cost: 1500, water: false },
  { name: 'Wagon', movement: "20' (15')", hardness: 6, hp: 16, cost: 500, water: false },
  { name: 'Canoe', movement: "40' (5')", miles: '30', crew: 1, hardness: 4, hp: 4, cost: 50, water: true },
  { name: 'Caravel', movement: "20' (20')", miles: '42', crew: 10, hardness: 8, hp: 75, cost: 10000, water: true },
  { name: 'Carrack', movement: "30' (30')", miles: '48', crew: 20, hardness: 10, hp: 120, cost: 20000, water: true },
  { name: 'Galley, Small', movement: "20' (20')", miles: '36/24', crew: 90, hardness: 8, hp: 75, cost: 15000, water: true },
  { name: 'Galley, Large', movement: "30' (25')", miles: '42/24', crew: 160, hardness: 10, hp: 120, cost: 30000, water: true },
  { name: 'Longship', movement: "30' (25')", miles: '42/24', crew: 70, hardness: 9, hp: 110, cost: 25000, water: true },
  { name: 'Raft/Barge', movement: "40' (10')", miles: '18', crew: 2, hardness: 6, hp: 12, cost: 100, water: true },
  { name: 'Riverboat', movement: "20' (20')", miles: '30', crew: 10, hardness: 8, hp: 30, cost: 3500, water: true },
  { name: 'Rowboat', movement: "30' (10')", miles: '24', crew: 1, hardness: 6, hp: 8, cost: 60, water: true },
  { name: 'Sailboat', movement: "40' (15')", miles: '36', crew: 1, hardness: 7, hp: 20, cost: 2000, water: true },
];

function stockRoom(roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) return { error: 'bad roll' };
  const row = STOCKING.find((band) => roll >= band.lo && roll <= band.hi);
  return { roll, contents: row.contents };
}

function vehicleCondition(listed, taken, water) {
  if (taken >= listed * 2) return water ? 'sunk' : 'immobilized';
  if (taken >= listed) return 'half speed';
  return 'sound';
}

function vehicleDamage({ listed, hardness, taken, amount, water }) {
  if (!Number.isInteger(listed) || listed < 1) return { error: 'hit points must be a positive integer' };
  if (!Number.isInteger(hardness) || hardness < 0) return { error: 'hardness must be a non-negative integer' };
  if (!Number.isInteger(taken) || taken < 0) return { error: 'damage taken must be a non-negative integer' };
  if (!Number.isInteger(amount) || amount < 0) return { error: 'damage must be a non-negative integer' };
  const excess = Math.max(0, amount - hardness);
  const next = taken + excess;
  return {
    excess,
    taken: next,
    remaining: Math.max(0, listed - next),
    condition: vehicleCondition(listed, next, water === true),
  };
}

function fieldRepair({ listed, taken, crew, water, rollDie }) {
  if (!Number.isInteger(listed) || listed < 1) return { error: 'hit points must be a positive integer' };
  if (!Number.isInteger(taken) || taken < 0) return { error: 'damage taken must be a non-negative integer' };
  if (!Number.isInteger(crew) || crew < 1 || crew > 200) return { error: 'crew must be from 1 to 200' };
  let gained = 0;
  for (let i = 0; i < crew; i += 1) {
    const face = rollDie(4);
    if (!Number.isInteger(face) || face < 1 || face > 4) return { error: 'bad roll' };
    gained += face;
  }
  const cap = Math.floor((listed * 9) / 10);
  const floorTaken = listed - cap;
  if (taken <= floorTaken) return { gained, taken, restored: 0, cap, remaining: Math.max(0, listed - taken), condition: vehicleCondition(listed, taken, water === true) };
  const next = Math.max(floorTaken, taken - gained);
  return {
    gained,
    taken: next,
    restored: taken - next,
    cap,
    remaining: Math.max(0, listed - next),
    condition: vehicleCondition(listed, next, water === true),
  };
}

module.exports = {
  VEHICLE_AC,
  STOCKING,
  TRAPS,
  VEHICLES,
  stockRoom,
  vehicleDamage,
  fieldRepair,
};
