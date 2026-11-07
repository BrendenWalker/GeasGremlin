/**
 * A named destination that groups locations in one campaign.
 */

function storedError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function optionalText(value, name, max) {
  if (value == null || String(value).trim() === '') return null;
  const text = String(value).trim();
  if (text.length > max) throw storedError(`${name} exceeds ${max} characters`, 400);
  return text;
}

function readPlace(body) {
  const name = String(body?.name || '').trim();
  if (!name || name.length > 80) throw storedError('name must be 1 to 80 characters', 400);
  const placeType = optionalText(body?.place_type, 'place_type', 30);
  return {
    name,
    description: optionalText(body?.description, 'description', 4000),
    placeType,
    gmText: optionalText(body?.gm_text, 'gm_text', 4000),
  };
}

function placeIdField(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw storedError('place_id must be a positive integer', 400);
  return n;
}

module.exports = {
  readPlace,
  placeIdField,
};
