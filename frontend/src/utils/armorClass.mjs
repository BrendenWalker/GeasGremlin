import { abilityModifier } from './hitPoints.mjs';

/** Basic Fantasy unarmored ascending AC, before Dexterity. */
const UNARMORED_AC = 11;

function whole(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function findItem(items, id) {
  if (id == null || id === '') return null;
  return items.find((item) => String(item.id) === String(id)) || null;
}

/**
 * Worn armor stores ascending AC (12 and up). A smaller AC is a bonus, as with barding.
 * Shields store ac_melee / ac_ranged bonuses. Null ranged bonus is +0 (buckler).
 */
function piece(item) {
  const ac = whole(item.item_ac ?? item.ac);
  const melee = whole(item.item_ac_melee ?? item.ac_melee) ?? 0;
  const ranged = whole(item.item_ac_ranged ?? item.ac_ranged);
  if (ac != null && ac >= UNARMORED_AC) return { base: ac, melee: 0, ranged: 0 };
  const flat = ac ?? 0;
  return { base: null, melee: flat + melee, ranged: flat + (ranged ?? 0) };
}

/** Melee and ranged AC from equipped armor, shield, and Dexterity. */
export function armorClass(character) {
  const items = character?.items || [];
  const armor = findItem(items, character?.equipped_armor_id);
  const shield = findItem(items, character?.equipped_shield_id);
  const worn = piece(armor || {});
  const guard = shield && String(shield.id) !== String(armor?.id) ? piece(shield) : { base: null, melee: 0, ranged: 0 };
  const dex = abilityModifier(character?.dex);
  const base = worn.base ?? UNARMORED_AC;
  return {
    melee: base + dex + worn.melee + guard.melee,
    ranged: base + dex + worn.ranged + guard.ranged,
  };
}

export function formatArmorClass(ac) {
  if (!ac || ac.melee == null) return '—';
  if (ac.melee === ac.ranged) return String(ac.melee);
  return `${ac.melee} (${ac.ranged} vs missiles)`;
}
