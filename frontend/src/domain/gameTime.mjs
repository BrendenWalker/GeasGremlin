export const ROUND_SECONDS = 10;
export const TURN_SECONDS = 600;
export const WATCH_SECONDS = 14400;
export const DAY_SECONDS = 86400;

/** Next Round in an encounter, Next Turn inside, Next Watch outside. */
export function primaryStep(place, inEncounter) {
  if (inEncounter) return 'round';
  if (place === 'inside') return 'turn';
  return 'watch';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatGameTime(seconds) {
  const parts = splitGameTime(seconds);
  if (!parts) return null;
  return `Day ${parts.day} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

export function splitGameTime(seconds) {
  const total = Number(seconds);
  if (!Number.isInteger(total) || total < 0) return null;
  const day = Math.floor(total / DAY_SECONDS) + 1;
  const rem = total % DAY_SECONDS;
  return {
    day,
    hour: Math.floor(rem / 3600),
    minute: Math.floor((rem % 3600) / 60),
    second: rem % 60,
  };
}

export function clockToSeconds(day, hour, minute, second) {
  if (![day, hour, minute, second].every((n) => Number.isInteger(n))) return null;
  if (day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return (day - 1) * DAY_SECONDS + hour * 3600 + minute * 60 + second;
}

export function effectEndSeconds(atSeconds, durationMinutes) {
  if (!Number.isInteger(atSeconds) || atSeconds < 0) return null;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) return null;
  return atSeconds + durationMinutes * 60;
}

/** upcoming, active, or due. An effect is due once its end second is reached. */
export function markStatus(mark, nowSeconds) {
  const at = Number(mark?.at_seconds);
  const now = Number(nowSeconds);
  if (!Number.isInteger(at) || !Number.isInteger(now)) return null;
  if (mark.kind === 'event') return at <= now ? 'due' : 'upcoming';
  if (mark.kind !== 'effect') return null;
  const end = effectEndSeconds(at, Number(mark.duration_minutes));
  if (end == null) return null;
  if (now < at) return 'upcoming';
  if (now < end) return 'active';
  return 'due';
}
