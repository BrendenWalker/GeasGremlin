import { markStatus } from './gameTime.mjs';

const TORCH = 'Torch (';
const LANTERN = 'Lantern oil (';

// ponytail: a burning light is only a Torch or Lantern oil mark still inside its duration.
// The Darkvision spell and the Light spell are not marks.
// Upgrade path: a mark with a source kind, then this prefix match goes away.

export function ambientLine({ ambientLight, marks, nowSeconds, characters }) {
  const pct = Number(ambientLight);
  const shown = Number.isInteger(pct) ? pct : 0;
  const names = (characters || [])
    .filter((row) => row?.darkvision === true)
    .map((row) => String(row.name || '').trim())
    .filter(Boolean);
  const seeNote = names.length ? `Darkvision: ${names.join(', ')}.` : 'No darkvision.';
  return `Ambient light ${shown}%. ${lightNote(burningLight(marks, nowSeconds))} ${seeNote}`;
}

function burningLight(marks, nowSeconds) {
  let torch = false;
  let lantern = false;
  for (const mark of marks || []) {
    if (markStatus(mark, nowSeconds) !== 'active') continue;
    const note = String(mark?.note || '');
    if (note.startsWith(TORCH)) torch = true;
    else if (note.startsWith(LANTERN)) lantern = true;
  }
  if (torch && lantern) return 'both';
  if (torch) return 'torch';
  if (lantern) return 'lantern';
  return 'none';
}

function lightNote(kind) {
  if (kind === 'both') return 'Torch and lantern burning.';
  if (kind === 'torch') return 'Torch burning.';
  if (kind === 'lantern') return 'Lantern burning.';
  return 'No torch or lantern burning.';
}
