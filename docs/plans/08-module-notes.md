# Deadlines and standing notes

Status lives in [TRACKER.md](TRACKER.md). This session records where midnight, day and night text, and rumors go. It does not add a text engine, a charge counter, or a coin ledger.

## Already true

`campaign_mark` is an effect (`at_seconds` plus `duration_minutes`) or an event (`at_seconds` only). Adventuring already adds both. Lighting a torch stores an effect. An event is a note at a clock time the GM types. The tick that ends an effect leaves it highlighted, and the next tick removes it. An event is not that path. Clock effects stay on `campaign_mark`. Decisions stay on `campaign_log`.

`campaign_location.summary` is GM-only standing text. A day wording and a night wording can both sit there. Nothing in the client chooses one from the clock.

`campaign_clue.discovered` means the party has already heard or found it. Configuration creates and deletes the wording. Adventuring, with `SituationPanel` in `play`, toggles Discovered. Players do not receive clues.

## Outcome

Confirm the event mark and the discovered toggle still work. Then add three lines to [ai/modules.md](../../ai/modules.md):

- Midnight, including Gwelayn, is one event mark. The note names the deadline.
- Day and night text both stay in the location summary. The GM reads the wording that fits the clock.
- A rumor is a clue. `discovered` means already heard.

Spell charges and the fort's 10% coin tax stay GM notes, in the summary or a clue body. Do not add a column for either.

If Adventuring can already place an event mark and mark a clue discovered, stop after `modules.md`. Do not add a button that repeats those two.

## Reuse

`addAdventuringMark` with `kind: 'event'`. The discovered toggle when `SituationPanel` `mode` is `play`. `summary`.

## Do not build

A renderer that swaps summary text by time of day. A spell-charge counter. A tax ledger. A rumor table. A second clock so midnight can tick on its own.

## Check

No new script when the only edit is `modules.md`.

In the browser: add an event mark at a later clock time and see it on the board. Toggle a clue to discovered on Adventuring, then back. The player sheet still shows neither the clue nor the summary.

`modules.md` then names the mark, the summary, and the clue for those three facts, and it says charges and the coin tax stay notes.
