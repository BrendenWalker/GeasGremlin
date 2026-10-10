# RPGHub data model (conceptual)

Canonical physical DDL lives in [`schema.sql`](schema.sql). This document classifies **what each table is for** when reasoning about imports, APIs, and permissions. It is tool-agnostic documentation (not tied to any editor or AI product).

## Two axes (do not confuse them)

1. **`ruleset_id`** — which ruleset’s vocabulary and data partition this row belongs to (multi-ruleset scoping).
2. **Lifecycle / ownership** — reference “book” data loaded with a ruleset versus player- or GM-authored instances.

Having **`ruleset_id`** does **not** mean “ruleset import catalog.” For example, **`characters`** carry **`ruleset_id`** but are **user-owned** content keyed to a ruleset’s classes, spells, and items.

## Registry

| Table      | Role |
|-----------|------|
| `ruleset` | Defines named rulesets (`id`, `name`, `mechanic`, …). `mechanic` selects a closed rules family (`bfrpg` today). Other tables reference `ruleset_id`. |

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

- `classes` — `is_quasi` marks a quasi-class. It is layered on a base class the player chooses. The base is a `character_classes` row. Hit die comes from that base. The overlay id is `characters.quasiclass`.
- `races`
- `spells`
- `abilities` — definition text plus an optional link to `stat` (`stat_id`, `stat_modifier`). Category is no longer stored on the ability.
- `items`
- `monster` — name, hit dice, armor class, morale (2–12 or empty), treasure-type code, movement, number appearing. No attacks and no stock numbers in this pass.
- `treasure_type` — `code` plus `definition` (jsonb object of the percent-and-dice columns, stored as given).

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

- `gamesystem.json` — required metadata: `name` (maps to `ruleset.name`), optional `description` (accepted in the file; not stored until `ruleset` gains a description column).
- One JSON file per catalog table (`CLASSES.json`, `RACES.json`, `SPELLS.json`, `ABILITIES.json`, `ITEMS.json`, junctions, plus shared `ABILITY_CATEGORIES.json` / `STATS.json` / `ITEM_CATEGORIES.json` / `ITEM_TYPES.json`).
- `PENDING_CHANGES.json` is ignored by the importer.
- `MONSTERS.json`, `TREASURE_TYPES.json`, `ENCOUNTER_TABLES.json`, and `ENCOUNTER_TABLE_ROWS.json` are not part of this replace. `import-ruleset` ignores them.

**Import** ([`backend/scripts/import-ruleset.js`](../backend/scripts/import-ruleset.js))

```bash
cd backend
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

Before deleting monsters, the import aborts if a `campaign_enemy.monster_id`, a `campaign_location` monster reference (when that table exists), or a custom encounter row still points at one of them. A stock encounter row blocks a monster-only file; pass the encounter tables in the same run to replace them together. `--dry-run` rolls the transaction back.

**Export** ([`backend/scripts/export-ruleset.js`](../backend/scripts/export-ruleset.js))

```bash
cd backend
npm run export-ruleset -- --ruleset-name "Basic Fantasy Enhanced"
# optional: --from-ruleset-id <id> --output ../GameSystems/BasicFantasy_Enhanced
```

Writes `gamesystem.json` plus one table JSON file per catalog/junction the importer knows. Default output is `GameSystems/<slug>/`. Omits `ruleset_id` (import binds via `gamesystem.json` `name`) and does not delete `PENDING_CHANGES.json` if present. Shared lookup tables are exported in full (not only rows referenced by the ruleset) so unused categories/types still round-trip on a fresh DB.

CI (`.github/workflows/ruleset-roundtrip.yml`) and `npm run test:ruleset-roundtrip` import each catalog, export to a temp dir, and semantically compare (ignore `modified`, gamesystem `description`, `PENDING_CHANGES.json`, and source-only fields the importer/exporter do not round-trip).

Multiple rulesets (e.g. Core and Enhanced) can coexist: each gets its own `ruleset_id` and distinct catalog ids.

## Legacy SQL snapshots (`database/rulesets/*.sql`)

Older catalog-only PostgreSQL upsert scripts may still exist under `database/rulesets/`. They are **not** the preferred publish path (string handling corrupted apostrophes in some dumps). Prefer JSON import/export above.

## Ruleset-scoped instance and user data

Created during play or setup; not bulk “book import” in the same sense as classes/spells.

**Campaign and membership**

- `campaign` — GM/session container; **`ruleset_id`** picks which rule definitions apply. **`running`** is set true by the GM to open a session and false to pause it. More than one campaign may be running.
- `campaign_board` — one row per campaign once play starts. **`game_seconds`** is the in-game clock (day 1 starts at 0). A round is 10 seconds, a turn is 600, a watch is 14400, and a day is 86400. Sixty rounds are a turn, twenty-four turns are a watch, and six watches are a day. **`place`** is `outside` or `inside`, default `outside`. **`in_encounter`** is true while the GM has an encounter open. Opening an encounter does not change `place` or the clock. **`location_id`** is the selected location. **`check_seconds`** is the last wander mark; it moves forward by whole intervals. Missing row means clock 0, outside, and no encounter.
- `campaign_location` — a named place in one campaign. **`place`** is `outside` or `inside`. **`check_die`** defaults to 6, and a roll of 1 or below is a hit. **`interval_seconds`** defaults to 1800 inside (3 turns) and 14400 outside (one watch). **`encounter_table_id`** points at a stock table for this ruleset or a custom table for this campaign. Outside, **`terrain`** and **`movement_pct`** are both empty or both set. The terrain is Clear, Road, Forest, Hills, Desert, Jungle, Swamp, or Mountains. The percent is an integer from -100 to 200. Inside, both are empty. The percent is stored and shown. It does not change travel.
- `campaign_wander` — one row per check the clock crossed. A miss stores the check roll and no table roll. A hit stores the table roll and the matching row (monster, label, quantity). The roll does not open an encounter. **`accepted`** is set when the GM accepts that hit onto the encounter.
- `campaign_character` — many-to-many between campaigns and characters.
- `campaign_enemy` — enemies in the current encounter. Cleared when the encounter ends. `monster_id` is set when the row came from the catalog and null when the name was typed. **`quantity`** is an optional note. **`treasure_type`** is an optional code copied from the monster or typed by the GM. Replacing that ruleset's monsters aborts while any row still points at one. Accepting the last wander hit inserts one enemy and opens the encounter. It does not move the clock. A miss cannot be accepted. A treasure roll reads `treasure_type` for this ruleset and returns a draft. It does not write coins, items, or XP. Applying that draft uses the party `give_xp` and `give_item` commands. A code with no treasure-type row is an error.
- `campaign_mark` — a timed effect (`at_seconds` start plus `duration_minutes`) or an event (`at_seconds` only).
- `campaign_presence` — last time a character's owner had that sheet open in the campaign. Active means `seen_at` within 30 seconds.

**Characters and sheets**

- `characters` — **player/GM-owned** rows; **`ruleset_id`** selects which catalog IDs are valid in context.
- `character_classes` — one row per (character, class), with per-class `class_level` and `sort_order` (primary = lowest `sort_order`, then `class_id`); replaces a single `class` column on `characters`. A quasi-class is not a row here. It is `characters.quasiclass`, and the primary row is the base class the player chose.
- `character_abilities`, `character_effects`, `character_items`, `character_spells`, `character_spells_cast` — instance state; scoped by `character_id` (and thus indirectly by ruleset through the character). `character_abilities` is the granted ability on a character. Level-up does not copy class abilities onto it yet, and character score columns are not derived from those rows.

**Realtime / messaging (app layer)**

- `campaign_command`
- `character_transfer`

## Summary pitfall for automation

Treat **`characters`** as **user-owned instance data**, not ruleset reference import data—even though it has **`ruleset_id`**.

## Maintenance

When you add or rename tables in **`schema.sql`**, update this file so the taxonomy stays accurate. A database table that mirrors this classification is optional and easy to let drift; this markdown is the lightweight source of truth for humans and any tooling that reads the repo.
