/**
 * Turns since the party entered this site.
 * The stamp is game_seconds at entry. It does not tick.
 * A turn is 600 seconds, the same step as Next Turn.
 * arrived_seconds is a separate first-select mark. This module does not write it.
 */

function siteLabel(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function nextVisitStamp(previousSite, nextSite, gameSeconds, stamp) {
  const next = siteLabel(nextSite);
  if (next == null) return null;
  const previous = siteLabel(previousSite);
  if (previous === next && stamp != null && stamp !== '') return Number(stamp);
  return Number(gameSeconds);
}

function visitTurns(gameSeconds, stamp, turnSeconds = 600) {
  if (stamp == null || stamp === '') return null;
  const turn = Number(turnSeconds);
  if (!Number.isInteger(turn) || turn < 1) return null;
  return Math.floor((Number(gameSeconds) - Number(stamp)) / turn);
}

function arrivedAfterSelect(arrivedSeconds, gameSeconds) {
  if (arrivedSeconds == null || arrivedSeconds === '') return Number(gameSeconds);
  return Number(arrivedSeconds);
}

module.exports = {
  siteLabel,
  nextVisitStamp,
  visitTurns,
  arrivedAfterSelect,
};
