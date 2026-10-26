# Play-loop tracker

Resume here. Rules source of truth is Basic Fantasy RPG Rules r142. Core JSON was built from an earlier edition.

Status words: `todo`, `doing`, `done`, `cut`.

When you pick something up, set it to `doing` and add a one-line note under it. When you stop, leave the note describing what is true in the tree, not what you intended.

The first pass, the r142 catalog, and later procedures are in the tree.

## Now

- [x] `done` One creature roster. Each individual is a `campaign_creature`. Encounter membership is a link. Concluding restores base hit points and disposition, and deletes hirelings.
  - `campaign_enemy` is gone. `in_fight` is the open fight. `base_hp` replaces `max_hp`. A plain integer wander quantity inserts that many creatures. Dice still inserts one. A march rest and a settled day that heals add those same points to every living creature, capped at `base_hp`. Dead stay dead. `node creature.check.js` and `node wander.check.js` pass.

- [x] `done` Location creatures. A place keeps each creature's hit points after the fight ends.
  - `campaign_creature` stores name, optional monster, hp, max hp, and present or fled. The open fight links with `figure_id` and damage writes both. Ending the fight deletes fight rows only. A rest on the march gives each living creature +1, capped at max. Dead stay dead. `node creature.check.js` passes.

GM procedure. Design: [04-gm-procedure.md](04-gm-procedure.md).

- [x] `done` Situation authoring. Detail edits live on Configuration. Adventuring plays the situation.
  - Configuration creates, edits, and deletes a situation and its objectives, NPCs, clues, prepared encounters, and leads. A new situation stays planned. Adventuring activates one, sets the stage, flags objectives known and clues discovered, opens and resolves prepared encounters, arrives and returns, and writes the log. It does not change the wording.

- [x] `done` GM procedure. A situation on the existing board.
  - A situation, its objectives, NPCs, clues, prepared encounters, leads, and log live on the existing board. Stage changes do not open a fight. Players see the place and known objectives. `node situation.check.js` passes.

- [x] `done` Module instructions. A Basic Fantasy module fills the existing situation rows.
  - `ai/modules.md` maps a module onto locations, situations, objectives, NPCs, clues, prepared encounters, and leads. The catalog, the clock, and the open fight stay where they are.

First pass. Design: [01-play-loop.md](01-play-loop.md).

- [x] `done` Monster notes. The prose under each r142 heading is on the monster.
  - `monster.notes` holds that prose, including a shared essay where the book groups the row. The GM encounter shows it closed, on a catalog enemy. Enhanced was not copied.

- [x] `done` Location shops. A location can sell item categories at a buy and sell percent.
  - `campaign_location_shops` and `campaign_location_shop_item_categories` store a named shop, independent buy and sell percents from -100 to 1000, and the categories it sells. The GM edits that on Configuration after the location exists. A character on the play sheet buys and sells those categories at the board's selected location. Prices stay copper. Equipped rows and rows with a bonus or value other than 0 are refused. The clock does not move.

- [x] `done` Slice 0. Monster, treasure-type, and encounter-table tables. Catalog-only import that does not wipe classes.
  - `monster`, `treasure_type`, `encounter_table`, and `encounter_table_row` are in the schema. `import-catalog` replaces those rows for an existing ruleset and does not delete classes, spells, or items. It aborts when a campaign enemy, a campaign location, or a custom encounter row still points at a monster being replaced. No stock numbers. `campaign_enemy.monster_id` exists so that abort can see a catalog pointer.
- [x] `done` Slice 1. Watch (4 hours), turn (10 minutes), round (10 seconds). Primary button follows outside, inside, or in combat. Next Day stays rest.
  - `campaign_board.place` is `outside` or `inside`, default `outside`. A watch is 14400 seconds, a turn is 600, a round is 10, and Next Day is still 86400. The primary button is Next Round in an encounter, Next Turn inside, and Next Watch outside. Opening an encounter does not move the clock. Watch and turn do not queue sheet commands. Round and day still do.
- [x] `done` Slice 3. Locations with place, check, interval, and table. Wander roll on watch, turn, or day when no encounter is open.
  - `campaign_location` stores place, check die (default 6, a hit is 1 or below), interval (inside 1800, outside 14400), and an encounter table. Selecting a location sets the board place and starts the interval at the current clock. `campaign_board.check_seconds` is the last mark. Watch, turn, and day roll when a location is selected and no encounter is open, and Next Day catches every interval it crossed. A round does not check. The roll is stored on `campaign_wander` and does not open the encounter.
- [x] `done` Slice 4. Accept a roll onto the open encounter. Enemy row can carry monster, quantity, and treasure type.
  - `campaign_enemy` stores an optional quantity note and treasure-type code. A typed name still works with those fields empty. Accept copies the last wander hit (name, monster, quantity, and the monster's treasure type) into the encounter and opens it. The clock does not move. A miss cannot be accepted, and the same hit cannot be accepted twice.
- [x] `done` Configuration tab. Location and encounter-table editing moves off Adventuring. Outside locations store terrain and a signed movement percent.
  - GM nav has Configuration after Adventuring. That page creates, edits, and deletes locations and campaign encounter tables. Stock tables stay read-only. Adventuring only selects a location. Outside, `terrain` and `movement_pct` are both empty or both set (Clear 0, Road +33, Forest/Hills/Desert -33, Jungle/Swamp/Mountains -67, any integer from -100 to 200). Inside leaves both empty. The percent is stored. Overland miles use it.
- [x] `done` Slice 5. Treasure roll is an editable draft. Apply only through the existing party give commands.
  - Rolling a treasure type returns a draft of percent-and-dice columns. A missing type is an error. The draft can be edited. Apply sends it through the party `give_xp` and `give_item` commands. The roll itself writes nothing.
- [x] `done` r142 catalog. [02-r142-catalog.md](02-r142-catalog.md). Update Core, then the same correction on Enhanced where that row is still the shared rule.
  - Core monsters, treasure types, and stock encounter tables are loaded. Class progression, saves, thief skills, and spell text match r142 where a row was checked. Cleric and Magic-User 7th-level slots are cleared. Level 0 and level 7 spell filings stay. Item prices, character money, and transfers are copper pieces (100 per gp). Core race and class descriptions match r142. Enhanced inherits Core rows it does not replace.

## Next

Module leftovers. One session each. Site visit before the empty checks. Room flags and deadlines have no dependency. The creature roster stays the location-creatures item.

- [x] `done` Site visit. [05-site-visit.md](05-site-visit.md). Turns since the party entered this site, from the clock. Leaving for the fort clears the stamp.
  - `campaign_location.site` is the shared label. `campaign_board.visit_seconds` is `game_seconds` at entry and does not tick. Whole turns are that difference divided by 600. The same label keeps the stamp. A different label, or none, clears it, and the next entry starts at 0. `arrived_seconds` stays. Players do not receive the count. `node visit.check.js` passes.
- [x] `done` Visit checks. [06-visit-checks.md](06-visit-checks.md). An empty-room check fires once per visit and names a living creature. Needs the site visit stamp.
  - A turn, watch, or day rolls the location check die once `game_seconds` is one interval past the site stamp. The same stamp does not roll again. A hit stores the first living creature at that location, present before fled, on `campaign_wander` as kind `visit`. It does not insert a creature or open the fight. A hit with nobody living stores nothing to meet. The interval wander still rolls. `node empty-check.check.js` passes.
- [x] `done` Room flags. [07-room-flags.md](07-room-flags.md). A sprung pit, a taken chest, or a found secret stays on the place after the fight ends.
  - `campaign_location_flag` stores a short note and a state of sprung, taken, or found on the location. The GM sets and clears it on Configuration and Adventuring. Deleting the location deletes the flags. Ending the fight does not. Players do not receive them, and `GET /campaigns/:id/here` leaves them out. `node room-flag.check.js` passes.
- [ ] `todo` Deadlines and standing notes. [08-module-notes.md](08-module-notes.md). Midnight, day and night text, and rumors use marks, summaries, and clues.

- [x] `done` Later procedures. [03-later-procedures.md](03-later-procedures.md). The list held back from the first pass.
  - Room stock and trap notes stay on Configuration. Vehicle damage and field repair to 90% are on Adventuring, after Travel. None of them are stored, and none open an encounter. Players do not see tables or GM rolls. The player-facing encounter table stays cut.

## Cut on purpose

These came up in the r142 review and are not queued.

- A second clock beside `game_seconds`.
- Client-side encounter rolls, or encounter tables hardcoded in the UI.
- One table column on the board and no location row.
- A second combatant table beside `campaign_creature`. The open fight is `in_fight` on that roster.
- Auto-starting combat when the wander die hits.
- Auto-depositing generated loot.
- A map or coordinates on a location.
- A full ruleset replace while characters still use that ruleset.
- Replacing Enhanced with the core book.
