# GeasGremlin data model (conceptual)

Canonical physical DDL lives in [`schema.sql`](schema.sql). This document classifies **what each table is for** when reasoning about imports, APIs, and permissions. It is tool-agnostic documentation (not tied to any editor or AI product).

## Two axes (do not confuse them)

1. **`ruleset_id`** — which ruleset’s vocabulary and data partition this row belongs to (multi-ruleset scoping).
2. **Lifecycle / ownership** — reference “book” data loaded with a ruleset versus player- or GM-authored instances.

Having **`ruleset_id`** does **not** mean “ruleset import catalog.” For example, **`characters`** carry **`ruleset_id`** but are **user-owned** content keyed to a ruleset’s classes, spells, and items.

## Registry

| Table      | Role |
|-----------|------|
| `ruleset` | Defines named rulesets (`id`, `name`, `mechanic`, `parent_ruleset_id`, …). `mechanic` selects a closed rules family (`bfrpg` today). `parent_ruleset_id` is an optional one-hop overlay parent. A child adds rows and replaces parent rows with the same key. A parent cannot itself have a parent, and a ruleset that already has children cannot gain a parent. Other tables reference `ruleset_id`. |

## Shared lookups (no `ruleset_id`)

Global category/type lists shared across rulesets in this schema:

- `ability_categories`
- `stat` — adjustable character values (STR, AC, saves, thief skills, XP, Hit Die, …). `category` references `ability_categories`. An ability may point at one stat; `abilities.stat_modifier` is a fixed catalog delta only. The grant number stays on `class_abilities.int_param` or `race_abilities.int_param`, and the granted instance stays on `character_abilities.mod`. Class hit die (`d%d Hit Die`, level 1) and XP adjustment (`%d%% XP`, race or class) are abilities. Score columns on `characters` (`str`, `int`, `wis`, `dex`, `con`, `chr`, `hp`) stay stored until a later derivation pass.
- `item_categories`
- `item_types`

Queries usually join these from catalog tables via FKs; they are not “owned” by a single campaign or user row.

## Ruleset catalog (reference data per ruleset)

Imported or authored **definition** data for a game system. Typically read-heavy; writes often bulk import or admin tooling. Listed tables include **`ruleset_id`** (FK to `ruleset`, `ON DELETE RESTRICT`), except a custom `encounter_table`, which sets `campaign_id` instead.

**Core definitions**

- `classes` — `is_quasi` marks a quasi-class. It is layered on a base class the player chooses. The base is a `character_classes` row. Hit die comes from that base. The overlay id is `characters.quasiclass`. `has_spellbook` means the class must learn a spell before it can be memorized. Other casters prepare from the full list for circles they have slots for.
- `races`
- `spells`
- `abilities` — definition text plus an optional link to `stat` (`stat_id`, `stat_modifier`). Category is no longer stored on the ability.
- `items` — `price` is copper pieces, the same unit as character `money`. 100 copper is 1 gp, 10 copper is 1 sp. Display turns that into coins.
- `monster` — name, hit dice, armor class, morale (2–12 or empty), treasure-type code, movement, number appearing. `hitdie_note`, `defense_note`, and `attack_note` hold the book's extra words (silver, magic, unarmored, attack bonus, the attack line). `notes` is the prose under that monster's heading. `morale_engaged` is the second printed morale figure. Armor class may be empty when the book gives only a sentence and `defense_note` is set. Saving throws and XP are not stored. No stock numbers in this pass.
- `treasure_type` — `code` plus `definition` (jsonb object of the percent-and-dice columns, stored as given). `magic`, `note`, and `tables` on that object are stored and not rolled. A child ruleset inherits a parent code it does not replace.

**Encounter tables**

- `encounter_table` — `die` (2–100) and a name. A stock table sets `ruleset_id` and leaves `campaign_id` null. A custom table sets `campaign_id` and leaves `ruleset_id` null. Never both.
- `encounter_table_row` — inclusive `face_lo` / `face_hi`, a `monster_id`, a plain `label`, or both, plus an optional quantity note. Faces above the table's die are rejected by the importer.

**Junctions / progression tied to class or race definitions**

- `class_abilities`
- `class_leveling`
- `class_spells`
- `race_abilities`
- `spell_class` (class ↔ spell, no extra `ruleset_id` column; consistency comes from `class_id` / `spell_id` pointing at ruleset-scoped rows)

When listing or editing catalog data, filters should include **`ruleset_id`** (see composite unique keys in `schema.sql`).

## GameSystems JSON catalogs (canonical source)

Reference “book” data for a game system is stored as JSON under [`GameSystems/<System>/`](../GameSystems/). Examples: `BasicFantasy_Core`, `BasicFantasy_Enhanced`.

**Folder contents**

- `gamesystem.json` — required metadata: `name` (maps to `ruleset.name`), optional `parent_ruleset` (another ruleset's `name`; one hop only), optional `description` (accepted in the file; not stored until `ruleset` gains a description column).
- One JSON file per catalog table (`CLASSES.json`, `RACES.json`, `SPELLS.json`, `ABILITIES.json`, `ITEMS.json`, junctions, plus shared `ABILITY_CATEGORIES.json` / `STATS.json` / `ITEM_CATEGORIES.json` / `ITEM_TYPES.json`).
- `PENDING_CHANGES.json` is ignored by the importer.
- `MONSTERS.json`, `TREASURE_TYPES.json`, `ENCOUNTER_TABLES.json`, and `ENCOUNTER_TABLE_ROWS.json` are not part of this replace. `import-ruleset` ignores them.

**Import** ([`backend/scripts/import-ruleset.js`](../backend/scripts/import-ruleset.js))

```bash
cd backend
npm run import-ruleset -- --dir ../GameSystems/BasicFantasy_Core
npm run import-ruleset -- --dir ../GameSystems/BasicFantasy_Enhanced
```

Mechanics:

- Single transaction; `--dry-run` runs the same path then `ROLLBACK`.
- **Replace** (not upsert): after ensuring the `ruleset` row, deletes that ruleset’s junctions and catalog (`classes`, `races`, `spells`, `abilities`, `items`), then inserts from JSON. Shared lookups (`ability_categories`, `stat`, `item_categories`, `item_types`) are matched by **name** and are not wiped.
- Aborts if any `characters` rows still have that `ruleset_id` (instance data would block or orphan under `ON DELETE RESTRICT`).
- Destination PKs are newly allocated (prefer a free source id when available); JSON/Firebird `ID` values exist only to remap references during the import.
- All writes use parameterized queries.

**Play catalog** ([`backend/scripts/import-catalog.js`](../backend/scripts/import-catalog.js))

```bash
cd backend
npm run import-catalog -- --dir ../GameSystems/BasicFantasy_Core
```

Separate transaction from the ruleset replace. It does not delete classes, spells, abilities, or items, and it does not use the character-count abort. The ruleset row must already exist.

Each of the four JSON files is optional. A missing file leaves that table alone. A present file, including `[]`, replaces that ruleset's rows. Encounter rows require the tables file in the same run. Custom encounter tables (`campaign_id` set) are left in place.

Before deleting monsters, the import aborts if a `campaign_creature.monster_id`, a `campaign_location` monster reference (when that table exists), or a custom encounter row still points at one of them. A stock encounter row blocks a monster-only file; pass the encounter tables in the same run to replace them together. `--dry-run` rolls the transaction back.

**Export** ([`backend/scripts/export-ruleset.js`](../backend/scripts/export-ruleset.js))

```bash
cd backend
npm run export-ruleset -- --ruleset-name "Basic Fantasy Enhanced"
# optional: --from-ruleset-id <id> --output ../GameSystems/BasicFantasy_Enhanced
```

Writes `gamesystem.json` plus one table JSON file per catalog/junction the importer knows. Default output is `GameSystems/<slug>/`. Omits `ruleset_id` (import binds via `gamesystem.json` `name`) and does not delete `PENDING_CHANGES.json` if present. Shared lookup tables are exported in full (not only rows referenced by the ruleset) so unused categories/types still round-trip on a fresh DB.

CI (`.github/workflows/ruleset-roundtrip.yml`) and `npm run test:ruleset-roundtrip` import each catalog, export to a temp dir, and semantically compare (ignore `modified`, gamesystem `description`, `PENDING_CHANGES.json`, and source-only fields the importer/exporter do not round-trip).

Multiple rulesets (e.g. Core and Enhanced) can coexist: each gets its own `ruleset_id` and distinct catalog ids. Enhanced's `parent_ruleset` is Core. Its folder stores only rows that add to or override Core. Import Core first. A child junction may reference a parent class, race, spell, or ability by the source id in the parent JSON; import resolves that id to the parent row. Catalog lists for the child return the child's rows plus parent rows the child does not replace. Missing parent rows are inherited. What the Enhanced folder contains is [docs/enhanced-ruleset.md](../docs/enhanced-ruleset.md).

## Legacy SQL snapshots (`database/rulesets/*.sql`)

Older catalog-only PostgreSQL upsert scripts may still exist under `database/rulesets/`. They are **not** the preferred publish path (string handling corrupted apostrophes in some dumps). Prefer JSON import/export above.

## Ruleset-scoped instance and user data

Created during play or setup; not bulk “book import” in the same sense as classes/spells.

**Campaign and membership**

- `campaign` — GM/session container; **`ruleset_id`** picks which rule definitions apply. **`running`** is set true by the GM to open a session and false to pause it. More than one campaign may be running. **`concluded`** is set when the GM concludes the campaign. That conclude restores creature hit points and disposition, encounter status, clue and objective flags, and the board, and it deletes wander rows, the log, marks, flags, commands, and hirelings. Character sheets stay. Pausing a session does not set it. Starting a session does not clear it. Activating a situation clears it. Any logged-in user can see a campaign. Only the GM creates a character in it. That create does not change an existing GM row. A GM invite links an existing sheet of the same ruleset and, when that owner is not already a member, writes an invited player row. Declining that invite removes the owner's sheets from the campaign. It does not delete the sheet. Removing one character deletes that campaign's link, presence, turn block, and hirelings for that character. The sheet and the membership stay. Sheets, play, and GM actions still require an accepted membership.
- `campaign_board` — one row per campaign once play starts. **`game_seconds`** is the in-game clock (day 1 starts at 0). A round is 10 seconds, a turn is 600, a watch is 14400, and a day is 86400. Sixty rounds are a turn, twenty-four turns are a watch, and six watches are a day. **`place`** is `outside` or `inside`, default `outside`. **`in_encounter`** is true while the GM has an encounter open. Opening an encounter does not change `place` or the clock. **`location_id`** is the selected location. **`check_seconds`** is the last wander mark; it moves forward by whole intervals. **`visit_seconds`** is `game_seconds` when the party entered the current site. It does not tick. Whole turns are that difference divided by 600, rounded down. The same site label leaves it. A different label, or none, clears it, and the next labeled entry starts at 0. Deleting the selected location clears it. Players do not receive the count. Missing row means clock 0, outside, and no encounter.
- `campaign_location` — a named place in one campaign. **`place`** is `outside` or `inside`. **`check_die`** defaults to 6, and a roll of 1 or below is a hit. **`interval_seconds`** defaults to 1800 inside (3 turns) and 14400 outside (one watch). **`encounter_table_id`** points at a stock table for this ruleset or a custom table for this campaign. Outside, **`terrain`** and **`movement_pct`** are both empty or both set. The terrain is Clear, Road, Forest, Hills, Desert, Jungle, Swamp, or Mountains. The percent is an integer from -100 to 200. Inside, both are empty. The percent is stored and shown. Overland miles are the group's base miles times that percent. Stock choices are Clear 0, Road +33, Forest, Hills, and Desert −33, and Jungle, Swamp, and Mountains −67. A location keeps the percent it already stored. **`summary`** is the standing description the GM reads. Players do not receive it. **`arrived_seconds`** is the clock the first time the location was selected. Later selects leave it. Empty means the party has not been there. **`site`** is an optional label, at most 80 characters, shared by the places of one visit. Empty means the place is outside every site. Players do not receive it. It is not a parent location.
- `campaign_location_shops` — a shop at one location. **`buy_cost_delta`** and **`sell_cost_delta`** are percents added to the listed copper price, each from -100 to 1000. 0 is the list price. Buy is what the character pays. Sell is what the shop pays. The two numbers are independent. Deleting the location deletes its shops.
- `campaign_location_flag` — a short note on one location. **`state`** is `sprung`, `taken`, or `found`. The GM sets it and clears it. Setting the same note again replaces the state. Deleting the location deletes the row. Ending the encounter does not. A sentence secret stays `campaign_clue`. Players do not receive the row, and `GET /campaigns/:id/here` does not include it.
- `campaign_location_shop_item_categories` — the item categories one shop buys and sells. A shop has at least one. It sells every priced catalog item in those categories for the campaign ruleset. It does not keep a stock count. Deleting a shop deletes these rows. An item category that a shop still uses cannot be deleted.
- `campaign_wander` — one row per check. **`kind`** is `wander` or `visit`. A wander row is one check the clock crossed. A wander miss stores the check roll and no table roll. A wander hit stores the table roll and the matching row (monster, label, quantity). **`accepted`** is set when the GM accepts that wander hit onto the encounter. A visit row is the empty-room check for the current site stamp. It is due once `game_seconds` is at least one selected-location interval past `visit_seconds`, on a turn, watch, or day. A round does not check. An open fight does not check. The same stamp does not add a second visit row. Clearing the stamp lets the next visit add one. The check die is the location's. A roll above 1 is a miss. A hit stores the name of one living creature already at that location (present before fled, lowest id, hit points above 0) and does not insert a creature, a stock row, or a table row. A hit with no living creature stores the roll and no label: nothing to meet. A visit row has no table roll and is not accepted onto the fight. The fight stays closed. The repeating wander check still runs on its interval. Players do not receive these rows.
- `campaign_character` — many-to-many between campaigns and characters. **`food_missed`** is consecutive days without a day's food. Damage starts at 3. **`heal_food`** and **`heal_water`** are set when that lack stops normal healing. Eating or drinking clears its own flag. A hit-point change is an HP effect. **`characters.hp`** stays the maximum. **`march_days`** is forced-march days since the last rest. **`march_failed`** means the Death Ray save has already failed, so later forced days skip the save. A rest clears both. **`hire_penalty`** is 0, or −1 after a retainer refusal that poisons further hire rolls in this region. A different town sets it back to 0.
- `campaign_hireling` — an NPC hired in this campaign. Concluding the campaign deletes these rows. **`kind`** is `retainer`, `specialist`, or `mercenary`. A retainer has **`level`** and **`loyalty`** and no morale. A mercenary has **`morale`**, **`level`**, and **`cost_gp`** per month for the **`quantity`**. A specialist has **`cost_gp`** and neither score. **`detail`** is equipment or a note. Specialists and mercenaries do not enter a dungeon. The cost is shown and not deducted.
- `campaign_creature` — one individual in the campaign. A room creature has **`location_id`**. A creature added to the open fight, a named person, or an accepted wanderer leaves it empty. **`hp`** is this run. **`base_hp`** is the printed or rolled total a reset restores, and healing caps there. A march rest and a settled day that heals add those same points to every living creature. Dead stay at 0. Both stay empty until a total is rolled or typed. 0 means defeated, and that row is not drawn into a fight again. **`disposition`** is this run, `present` or `fled`. **`base_disposition`** is the reset value. **`in_fight`** is the open fight. Ending the fight clears it and leaves hit points. **`treasure_type`** is the catalog monster's treasure line, or a code a prepared member stored. **`monster_id`** is set when a location stock or a prepared member matches the catalog by name, and when the open fight adds a catalog monster. A named person added to that fight leaves both empty. Stocking a location copies the catalog treasure line and does not ask for one. **`note`** is a short GM note. There is no quantity: three goblins are three rows. The open-fight count inserts that many rows. Deleting the location is refused while a creature still points at it. Deleting the campaign removes the creatures first. Replacing that ruleset's monsters aborts while any row still points at one. Players do not receive these rows. A party rest on the march gives each living creature that is not in the fight 1 hit point, capped at `base_hp`. It does not refill a defeated row. Accepting the last wander hit inserts one creature per plain integer in the quantity note, or one creature when the note is dice, and opens the fight. It does not move the clock. A miss cannot be accepted. The original note stays on `campaign_wander`. A treasure roll reads `treasure_type` for this ruleset and returns a draft. It does not write coins, items, or XP. Applying that draft uses the party `give_xp` and `give_item` commands. A code with no treasure-type row is an error. Character hit points stay on `characters.hp`.
- `campaign_turn_block` — one row per cleric who failed a turning roll. **`until_seconds`** is the clock when that cleric may try again, one turn (600 seconds) after the failure. A later success deletes the row. Surprise, reaction, initiative, and morale are not stored.
- `campaign_mark` — a timed effect (`at_seconds` start plus `duration_minutes`) or an event (`at_seconds` only).
- `campaign_presence` — last time a character's owner had that sheet open in the campaign. Active means `seen_at` within 30 seconds.
- `campaign_situation` — one scene in the GM procedure. **`stage`** is `setup`, `location_intro`, `exploration`, `encounter`, `resolution`, `transition`, `rest_or_session_end`, or `conclusion`. **`status`** is `planned`, `active`, or `resolved`. At most one row per campaign is active. Setting the stage does not open a fight, move the clock, or select a location. **`description`** is GM-only. Deleting the location is refused while a situation still points at it.
- `campaign_objective` — a line of unfinished business. **`known`** is the only part a player can see, including after it is resolved. **`base_known`** and **`base_status`** are what a reset restores. **`situation_id`** null is a campaign objective. Deleting the situation deletes these rows.
- `campaign_npc` — a story NPC: name, motivation, knowledge, and attitude. Hirelings stay on `campaign_hireling`. Players do not receive these rows. Deleting the location clears **`location_id`**.
- `campaign_situation_npc` — which NPCs are in a situation. Deleting either side drops the link only.
- `campaign_clue` — GM-only text. **`discovered`** is bookkeeping for this run. **`base_discovered`** is what a reset restores. Players do not receive it.
- `campaign_situation_clue` — which clues are in a situation. Deleting either side drops the link only.
- `campaign_encounter` — a prepared scene, not the open fight. **`kind`** is `combat`, `social`, `hazard`, `trap`, `puzzle`, `environment`, or `discovery`. **`status`** is this run: `prepared`, `opened`, or `resolved`. **`base_status`** is what a reset restores. Opening a combat scene, or any scene that has members, marks those creatures `in_fight` and sets `in_encounter`. Opening an already opened scene does that again. It does not roll hit points or move the clock. A social scene with no members does not open the fight. Resolving the row does not end the open fight.
- `campaign_encounter_member` — `encounter_id` and `creature_id` only. Deleting the scene deletes the link. Deleting the creature deletes the link. The creature stays when the scene is deleted.
- `campaign_transition` — a lead to **`to_location_id`**. Arriving selects that location and sets the active stage to `location_intro`. It does not resolve the current situation. Deleting the destination is refused while a lead still points at it.
- `campaign_log` — a decision, consequence, or discovery at **`at_seconds`**. Clock effects stay on `campaign_mark`. Players do not receive the log.

**Characters and sheets**

- `characters` — **player/GM-owned** rows; **`ruleset_id`** selects which catalog IDs are valid in context. `money` is copper pieces. Optional identity text is `gender`, `age`, `hair`, `eyes`, `height`, `weight`, and `languages`. Movement is not stored. **`hp`** is the maximum. Creation, the sheet editor, and level-up write it. Damage and healing do not.
- `character_classes` — one row per (character, class), with per-class `class_level` and `sort_order` (primary = lowest `sort_order`, then `class_id`); replaces a single `class` column on `characters`. A quasi-class is not a row here. It is `characters.quasiclass`, and the primary row is the base class the player chose.
- `character_abilities`, `character_effects`, `character_items`, `character_spells`, `character_spells_cast` — instance state; scoped by `character_id` (and thus indirectly by ruleset through the character). `character_abilities` is the granted ability on a character. Level-up does not copy class abilities onto it yet, and character score columns are not derived from those rows. On `character_spells`, `memorized` is how many times that spell can still be cast. `intend` is how many to prepare at the next rest. Settle day and a new day copy `intend` into `memorized`. Casting spends one `memorized`. An HP change is a `character_effects` row whose `effect` is the stat named HP. `value` is the clamped delta, negative for damage and positive for healing. `duration` is -1. `note` is the reason (`hunger`, `thirst`, `rest`, `march`, `damage`, or `heal`). Current hit points are `characters.hp` plus those rows, clamped from 0 through that maximum. When the result is the maximum, those rows are deleted. Level-up and the sheet editor change the maximum and leave the rows.

**Realtime / messaging (app layer)**

- `campaign_command`
- `character_transfer` — `gold_cp` is copper pieces.

## Summary pitfall for automation

Treat **`characters`** as **user-owned instance data**, not ruleset reference import data—even though it has **`ruleset_id`**.

## Maintenance

When you add or rename tables in **`schema.sql`**, update this file so the taxonomy stays accurate. A database table that mirrors this classification is optional and easy to let drift; this markdown is the lightweight source of truth for humans and any tooling that reads the repo.
