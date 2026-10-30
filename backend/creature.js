/**
 * Hit points on one campaign creature.
 * The first total writes hp and base_hp. Later damage writes hp only.
 * A rest adds the same points to every living creature, capped at base_hp.
 * Dead stay dead. Being in the fight does not skip the rest.
 *
 * ponytail: the caller passes the points. A march rest passes 1. A settled day
 * passes that character's heal, which is 1, or 2 with bed rest. Full refill
 * and bringing back the dead are not this function.
 */

function applyCreatureHitPoints(baseHp, hp) {
  if (!Number.isInteger(hp) || hp < 0) return { error: 'hit points must be a non-negative integer' };
  if (baseHp == null) {
    if (hp === 0) return { hp: 0, baseHp: null };
    return { hp, baseHp: hp };
  }
  if (!Number.isInteger(baseHp) || baseHp < 1) return { error: 'base hit points must be a positive integer' };
  if (hp > baseHp) return { hp: baseHp, baseHp };
  return { hp, baseHp };
}

function catalogTreasure(monster) {
  if (!monster || monster.treasure_type == null) return null;
  const treasure = String(monster.treasure_type).trim();
  return treasure === '' ? null : treasure;
}

function fightCreature(monster, name) {
  if (monster) {
    const catalogName = String(monster.name || '').trim();
    if (!catalogName || catalogName.length > 80) return { error: 'name must be 1 to 80 characters' };
    return {
      name: catalogName,
      monster_id: monster.id,
      treasure_type: catalogTreasure(monster),
    };
  }
  const trimmed = String(name == null ? '' : name).trim();
  if (!trimmed || trimmed.length > 80) return { error: 'name must be 1 to 80 characters' };
  return { name: trimmed, monster_id: null, treasure_type: null };
}

function recoverCreature(creature, points) {
  const gain = points == null ? 1 : points;
  if (!Number.isInteger(gain) || gain < 0) return { error: 'hit points must be a non-negative integer' };
  if (!creature || !Number.isInteger(creature.hp) || !Number.isInteger(creature.baseHp)) {
    return { error: 'set hit points first' };
  }
  if (creature.hp < 0 || creature.baseHp < 1 || creature.hp > creature.baseHp) {
    return { error: 'set hit points first' };
  }
  if (gain === 0 || creature.hp === 0 || creature.hp >= creature.baseHp) {
    return { hp: creature.hp, changed: false };
  }
  const hp = Math.min(creature.baseHp, creature.hp + gain);
  return { hp, changed: hp !== creature.hp };
}

module.exports = {
  applyCreatureHitPoints,
  catalogTreasure,
  fightCreature,
  recoverCreature,
};
