// Suggested next stages are hints. The GM can set any stage.
// Entering a stage does not open a fight, move the clock, or change location.

const STAGES = [
  {
    id: 'setup',
    label: 'Setup',
    prompt: [
      'Establish where the characters are and why they are together.',
      'The players can accept the premise or ask what they already know.',
      'Record the starting location, the shared objective, and who matters.',
    ],
    next: ['location_intro'],
  },
  {
    id: 'location_intro',
    label: 'Location',
    prompt: [
      'Describe what the characters can see, hear, and notice right now.',
      'The players can look, ask, or move toward something obvious.',
      'Record the place. Leave the next step up to them.',
    ],
    next: ['exploration'],
  },
  {
    id: 'exploration',
    label: 'Explore',
    prompt: [
      'The characters are investigating, talking, or moving through this place.',
      'Answer what they try. Use the rules when the outcome is uncertain.',
      'Record the decision and what changed. Stay here until the situation shifts.',
    ],
    next: ['exploration', 'encounter', 'resolution', 'transition'],
  },
  {
    id: 'encounter',
    label: 'Encounter',
    prompt: [
      'A challenge is in front of them. It does not have to be a fight.',
      'The players can fight, talk, sneak, or leave.',
      'Record the outcome when it is settled. This stage does not start a fight.',
    ],
    next: ['exploration', 'resolution', 'transition'],
  },
  {
    id: 'resolution',
    label: 'Resolve',
    prompt: [
      'The current challenge or objective has an outcome.',
      'The players can press on, turn back, or use what they learned.',
      'Record consequences, discoveries, and anything still unresolved.',
    ],
    next: ['exploration', 'transition', 'rest_or_session_end', 'conclusion'],
  },
  {
    id: 'transition',
    label: 'Travel',
    prompt: [
      'They are going somewhere else, or deciding whether to.',
      'Summarize a quiet journey. Play it when the road has a choice or a danger.',
      'Record the destination. Arriving is a separate step.',
    ],
    next: ['location_intro'],
  },
  {
    id: 'rest_or_session_end',
    label: 'Rest',
    prompt: [
      'The session can pause, or the party can rest, heal, and count rewards.',
      'Use the clock, settle day, and awards already on this board.',
      'Ending the session does not finish the campaign.',
    ],
    next: ['exploration', 'setup', 'transition', 'conclusion'],
  },
  {
    id: 'conclusion',
    label: 'Conclude',
    prompt: [
      'The adventure can end, or another scenario can start.',
      'The players can say what their characters do next.',
      'Conclude the campaign only when you mean to. A new active situation clears that.',
    ],
    next: [],
  },
];

function stageById(id) {
  return STAGES.find((stage) => stage.id === id) || null;
}

function suggestedNext(stage) {
  const found = stageById(stage);
  if (!found) return null;
  return found.next.slice();
}

function stageList() {
  return STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    prompt: stage.prompt.slice(),
    next: stage.next.slice(),
  }));
}

module.exports = { STAGES, stageById, suggestedNext, stageList };
