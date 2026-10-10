# Play-loop tracker

Resume here. Rules source of truth is Basic Fantasy RPG Rules r142. Core JSON was built from an earlier edition.

Status words: `todo`, `doing`, `done`, `cut`.

When you pick something up, set it to `doing` and add a one-line note under it. When you stop, leave the note describing what is true in the tree, not what you intended.

The first pass is in the tree. Next is the r142 catalog.

## Now

First pass. Design: [01-play-loop.md](01-play-loop.md).

- [x] `done` Slice 0. Monster, treasure-type, and encounter-table tables. Catalog-only import that does not wipe classes.
  - `monster`, `treasure_type`, `encounter_table`, and `encounter_table_row` are in the schema. `import-catalog` replaces those rows for an existing ruleset and does not delete classes, spells, or items. It aborts when a campaign enemy, a campaign location, or a custom encounter row still points at a monster being replaced. No stock numbers. `campaign_enemy.monster_id` exists so that abort can see a catalog pointer.
- [x] `done` Slice 1. Watch (4 hours), turn (10 minutes), round (10 seconds). Primary button follows outside, inside, or in combat. Next Day stays rest.
  - `campaign_board.place` is `outside` or `inside`, default `outside`. A watch is 14400 seconds, a turn is 600, a round is 10, and Next Day is still 86400. The primary button is Next Round in an encounter, Next Turn inside, and Next Watch outside. Opening an encounter does not move the clock. Watch and turn do not queue sheet commands. Round and day still do.
- [x] `done` Slice 3. Locations with place, check, interval, and table. Wander roll on watch, turn, or day when no encounter is open.
  - `campaign_location` stores place, check die (default 6, a hit is 1 or below), interval (inside 1800, outside 14400), and an encounter table. Selecting a location sets the board place and starts the interval at the current clock. `campaign_board.check_seconds` is the last mark. Watch, turn, and day roll when a location is selected and no encounter is open, and Next Day catches every interval it crossed. A round does not check. The roll is stored on `campaign_wander` and does not open the encounter.
- [x] `done` Slice 4. Accept a roll onto the open encounter. Enemy row can carry monster, quantity, and treasure type.
  - `campaign_enemy` stores an optional quantity note and treasure-type code. A typed name still works with those fields empty. Accept copies the last wander hit (name, monster, quantity, and the monster's treasure type) into the encounter and opens it. The clock does not move. A miss cannot be accepted, and the same hit cannot be accepted twice.
- [x] `done` Configuration tab. Location and encounter-table editing moves off Adventuring. Outside locations store terrain and a signed movement percent.
  - GM nav has Configuration after Adventuring. That page creates, edits, and deletes locations and campaign encounter tables. Stock tables stay read-only. Adventuring only selects a location. Outside, `terrain` and `movement_pct` are both empty or both set (Clear/Road 0, Forest/Hills/Desert -33, Jungle/Swamp/Mountains -50, any integer from -100 to 200). Inside leaves both empty. The percent is stored and shown. It does not change travel.
- [x] `done` Slice 5. Treasure roll is an editable draft. Apply only through the existing party give commands.
  - Rolling a treasure type returns a draft of percent-and-dice columns. A missing type is an error. The draft can be edited. Apply sends it through the party `give_xp` and `give_item` commands. The roll itself writes nothing.

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
