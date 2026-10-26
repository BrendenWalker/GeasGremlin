import { commandWrite } from './character.mjs';

export const NOTICE_LIMIT = 4;

const EPHEMERAL = new Set(['error', 'warn', 'info']);

export function pushNotice(notices, notice) {
  const source = notice?.source;
  if (!source) return notices || [];
  const kept = (notices || []).filter((row) => row.source !== source);
  if (!notice.text) return kept;
  return [{
    id: notice.id,
    source,
    tone: notice.tone,
    text: notice.text,
  }, ...kept].slice(0, NOTICE_LIMIT);
}

export function clearEphemeral(notices) {
  return (notices || []).filter((row) => !EPHEMERAL.has(row.tone));
}

export function dismissNotice(notices, id) {
  return (notices || []).filter((row) => row.id !== id);
}

export function commandReceipt(characterName, command, itemName) {
  const name = characterName || 'the character';
  const type = command?.type;
  const payload = command?.payload || {};
  if (type === 'give_xp') {
    const amount = Number(payload.amount);
    if (!Number.isInteger(amount)) return null;
    return `The GM gave ${name} ${amount} XP.`;
  }
  if (type === 'give_gold') {
    const amount = Number(payload.amount_cp);
    if (!Number.isInteger(amount)) return null;
    return `The GM gave ${name} ${amount} cp.`;
  }
  if (type === 'give_item') {
    return `The GM gave ${name} ${itemName || 'an item'}.`;
  }
  if (type === 'new_day') return `The GM started a new day for ${name}.`;
  if (type === 'new_round') return `The GM started a new round for ${name}.`;
  return null;
}

export function levelUpCommands(character, classRows, commands) {
  const waiting = [];
  for (const command of commands || []) {
    if (command?.type !== 'give_xp') continue;
    const write = commandWrite(character, classRows, command);
    if (write?.needsRolls?.length) waiting.push(command);
  }
  return waiting;
}

export function transferText(fromName, toName, transfer) {
  let payload = transfer?.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  const bits = [];
  const gold = Number(transfer?.gold_cp) || 0;
  if (gold > 0) bits.push(`${gold} cp`);
  const items = Array.isArray(payload?.items) ? payload.items.length : 0;
  if (items > 0) bits.push(`${items} item${items === 1 ? '' : 's'}`);
  if (bits.length === 0) return null;
  return `${fromName} sent ${toName} ${bits.join(' and ')}`;
}

export function sheetPath(character, pathname) {
  const ids = character?.campaign_ids || [];
  const play = String(pathname || '').match(/^\/play\/(\d+)/);
  const id = character?.id;
  if (play && ids.some((campaignId) => String(campaignId) === play[1])) {
    return `/play/${play[1]}/characters/${id}`;
  }
  if (ids.length > 0) return `/play/${ids[0]}/characters/${id}`;
  return `/characters/${id}`;
}

export function orderWaiting(rows) {
  return [...(rows || [])].sort((a, b) => {
    const at = a.at || '';
    const bt = b.at || '';
    if (at !== bt) return at < bt ? -1 : 1;
    return String(a.key).localeCompare(String(b.key));
  });
}
