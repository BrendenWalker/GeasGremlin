# First pass: running the game

Status lives in [TRACKER.md](TRACKER.md). This file is the design. r142 Parts 4, 5, 7, and 8 are the procedures. This pass builds the loop a GM clicks. It does not fill in the monster book and it does not resolve attacks.

## Clock

One clock, `campaign_board.game_seconds`. Day 1 starts at 0.

- Outside (wilderness): one watch, 4 hours, 14400 seconds.
- Inside (dungeon): one turn, 10 minutes, 600 seconds. Sixty rounds.
- In combat: one round, 10 seconds. Already implemented.
- Rest: Next Day stays 86400 seconds. Six watches are one day. Twenty-four turns are one watch.

`place` on the board is `outside` or `inside`, default `outside`. The primary button is Next Round while an encounter is open, Next Turn while inside, Next Watch while outside. The other steps stay as secondary buttons. Entering combat does not reset the clock.

Constants live in `frontend/src/domain/gameTime.mjs` and `backend/server.js`. `gameTime.check.mjs` asserts 60 rounds equal a turn and 24 turns equal a watch.

## Catalog shape, empty

New tables, no stock numbers in this pass. GM-authored rows are enough to try the loop. Filling them from r142 is [02-r142-catalog.md](02-r142-catalog.md).

- `monster`: name, hit dice, armor class, morale, treasure type, movement, number appearing.
- `treasure_type`: code plus a JSON definition of the percent-and-dice columns.
- `encounter_table` / `encounter_table_row`: die, inclusive face range, monster reference or a plain label, quantity note.

A stock table has `ruleset_id` set. A custom table has `campaign_id` set. Never both. Import of these tables is a separate path from `import-ruleset`. It must not delete classes, spells, or items, and it must not use the character-count abort that guards a full replace. It aborts if a campaign enemy or location still points at a monster being replaced.

## Location and wander check

`campaign_location` has a name, `place`, a check die (default d6, success at 1 or below), an interval, and a table. An outside location may also store a terrain and a movement adjustment percent from -100 to 200. Selecting it sets the board's `place`. Inside defaults to a check every 3 turns (1800 seconds). Outside defaults to a check every watch (14400 seconds). The percent is not applied to travel.

A watch, turn, or day tick runs the check when a location is set, no encounter is open, and enough seconds have passed. A hit stores the table result. A miss stores a miss. The last-check mark moves forward by whole intervals, so Next Day catches every check it crossed and does not skip any. A round tick does not check. The result does not start the encounter.

## Encounter and loot

`campaign_enemy` gains an optional monster id, a quantity, and a treasure-type code. Typed names still work. Accepting the last roll inserts those rows and opens the encounter if needed.

A treasure roll returns a draft. Confirm uses the existing party-item and party-XP commands. A missing treasure-type row is an error, not an invented table.

## Check

- `node frontend/src/domain/gameTime.check.mjs` and one node assert for the roll helpers.
- Ruleset round-trip still passes for Core and Enhanced.
- In the browser: advance a watch outside, a turn inside, a round in an encounter, and a day for rest. Create a location, force a check, accept it, and confirm a loot draft does not apply until the GM says so.
