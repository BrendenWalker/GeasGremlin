/**
 * A short fact on a location. The open fight does not own it.
 * Sprung, taken, and found are the states. A sentence secret stays a clue.
 */

const { playerExits } = require('./pathWay');

const FLAG_STATES = ['sprung', 'taken', 'found'];
const NOTE_MAX = 80;

function readFlag(note, state) {
  const text = String(note ?? '').trim();
  if (!text || text.length > NOTE_MAX) return { error: 'note must be 1 to 80 characters' };
  const word = String(state ?? '').trim().toLowerCase();
  if (!FLAG_STATES.includes(word)) return { error: 'state must be sprung, taken, or found' };
  return { note: text, state: word };
}

function playerHere(row) {
  return {
    location_name: row?.location_name ?? null,
    objectives: (row?.objectives || []).map((item) => ({
      id: Number(item.id),
      body: item.body,
      status: item.status,
    })),
    exits: playerExits(row?.paths, row?.location_id),
  };
}

function placeAfterFight(place) {
  return {
    in_encounter: false,
    enemies: [],
    flags: (place?.flags || []).map((flag) => ({
      id: flag.id,
      note: flag.note,
      state: flag.state,
    })),
  };
}

module.exports = {
  FLAG_STATES,
  NOTE_MAX,
  readFlag,
  playerHere,
  placeAfterFight,
};
