# Play-loop tracker

Resume here. Rules source of truth is Basic Fantasy RPG Rules r142. Core JSON was built from an earlier edition.

Status words: `todo`, `doing`, `done`, `cut`.

When you pick something up, set it to `doing` and add a one-line note under it. When you stop, leave the note describing what is true in the tree, not what you intended.

Nothing below is started.

## Now

First pass. Design: [01-play-loop.md](01-play-loop.md).

- [ ] `todo` Slice 0. Monster, treasure-type, and encounter-table tables. Catalog-only import that does not wipe classes.
- [ ] `todo` Slice 1. Watch (4 hours), turn (10 minutes), round (10 seconds). Primary button follows outside, inside, or in combat. Next Day stays rest.
- [ ] `todo` Slice 3. Locations with place, check, interval, and table. Wander roll on watch, turn, or day when no encounter is open.
- [ ] `todo` Slice 4. Accept a roll onto the open encounter. Enemy row can carry monster, quantity, and treasure type.
- [ ] `todo` Slice 5. Treasure roll is an editable draft. Apply only through the existing party give commands.

## Next

- [ ] `todo` r142 catalog. [02-r142-catalog.md](02-r142-catalog.md). Update Core, then the same correction on Enhanced where that row is still the shared rule.
- [ ] `todo` Later procedures. [03-later-procedures.md](03-later-procedures.md). The list held back from the first pass.

## Cut on purpose

These came up in the r142 review and are not queued.

- A second clock beside `game_seconds`.
- Client-side encounter rolls, or encounter tables hardcoded in the UI.
- One table column on the board and no location row.
- A combatant list beside `campaign_enemy`.
- Auto-starting combat when the wander die hits.
- Auto-depositing generated loot.
- A map or coordinates on a location.
- A full ruleset replace while characters still use that ruleset.
- Replacing Enhanced with the core book.
