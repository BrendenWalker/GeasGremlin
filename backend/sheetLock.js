/**
 * A character on a campaign is edited by a GM of that campaign.
 * Play writes stay open: equipment, notes, spell intent, casts.
 * Hit points during play use the hit-points route. The stored hp column is the maximum.
 */

const SHEET_KEYS = [
  'name', 'user', 'gender', 'age', 'hair', 'eyes', 'height', 'weight', 'languages',
  'race', 'str', 'int', 'wis', 'dex', 'con', 'chr', 'hp', 'quasiclass', 'level', 'xp',
  'skillpoints', 'money', 'class', 'character_classes',
];

const CAMPAIGN_SHEET_ERROR = 'A character in a campaign is edited by the GM';

function authoringRefused(gm, onCampaign) {
  return gm !== true && onCampaign === true;
}

function sheetEditRefused(gm, onCampaign, body) {
  if (!authoringRefused(gm, onCampaign)) return false;
  if (body == null || typeof body !== 'object') return false;
  return SHEET_KEYS.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

module.exports = {
  SHEET_KEYS,
  CAMPAIGN_SHEET_ERROR,
  authoringRefused,
  sheetEditRefused,
};
