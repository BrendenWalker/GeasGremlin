import assert from 'node:assert/strict';
import { ambientLine } from './sight.mjs';

const torch = (at, minutes, note = 'Torch (5 turns)') => ({
  kind: 'effect',
  note,
  at_seconds: at,
  duration_minutes: minutes,
});

const lantern = (at, minutes) => torch(at, minutes, 'Lantern oil (24 turns)');

const elf = { name: 'Elandra', darkvision: true, active: false };
const human = { name: 'Bram', darkvision: false, active: true };

assert.equal(
  ambientLine({
    ambientLight: 0,
    marks: [torch(1000, 50), torch(0, 10), { kind: 'effect', note: 'Torchbearer', at_seconds: 0, duration_minutes: 50 }],
    nowSeconds: 600,
    characters: [human],
  }),
  'Ambient light 0%. No torch or lantern burning. No darkvision.'
);

assert.equal(
  ambientLine({
    ambientLight: 0,
    marks: [torch(0, 50)],
    nowSeconds: 0,
    characters: [],
  }),
  'Ambient light 0%. Torch burning. No darkvision.'
);

assert.equal(
  ambientLine({
    ambientLight: 12,
    marks: [lantern(0, 180)],
    nowSeconds: 0,
    characters: [elf],
  }),
  'Ambient light 12%. Lantern burning. Darkvision: Elandra.'
);

assert.equal(
  ambientLine({
    ambientLight: 40,
    marks: [torch(0, 50), lantern(0, 180)],
    nowSeconds: 0,
    characters: [human, elf],
  }),
  'Ambient light 40%. Torch and lantern burning. Darkvision: Elandra.'
);
