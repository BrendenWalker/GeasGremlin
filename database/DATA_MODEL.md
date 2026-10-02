# RPGHub data model (conceptual)

Canonical physical DDL lives in [`schema.sql`](schema.sql). This document classifies **what each table is for** when reasoning about imports, APIs, and permissions. It is tool-agnostic documentation (not tied to any editor or AI product).

## Two axes (do not confuse them)

1. **`ruleset_id`** — which ruleset’s vocabulary and data partition this row belongs to (multi-ruleset scoping).
2. **Lifecycle / ownership** — reference “book” data loaded with a ruleset versus player- or GM-authored instances.

Having **`ruleset_id`** does **not** mean “ruleset import catalog.” For example, **`characters`** carry **`ruleset_id`** but are **user-owned** content keyed to a ruleset’s classes, spells, and items.

## Registry

| Table      | Role |
|-----------|------|
| `ruleset` | Defines named rulesets (`id`, `name`, …). Other tables reference `ruleset_id`. |

## Shared lookups (no `ruleset_id`)

Global category/type lists shared across rulesets in this schema:

- `ability_categories`
- `item_categories`
- `item_types`

Queries usually join these from catalog tables via FKs; they are not “owned” by a single campaign or user row.

## Ruleset catalog (reference data per ruleset)

Imported or authored **definition** data for a game system. Typically read-heavy; writes often bulk import or admin tooling. All listed tables include **`ruleset_id`** (FK to `ruleset`, `ON DELETE RESTRICT`).

**Core definitions**

- `classes`
- `races`
- `spells`
- `abilities`
- `items`

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
- One JSON file per catalog table (`CLASSES.json`, `RACES.json`, `SPELLS.json`, `ABILITIES.json`, `ITEMS.json`, junctions, plus shared `ABILITY_CATEGORIES.json` / `ITEM_CATEGORIES.json` / `ITEM_TYPES.json`).
- `PENDING_CHANGES.json` is ignored by the importer.

**Import** ([`backend/scripts/import-ruleset.js`](../backend/scripts/import-ruleset.js))

```bash
cd backend
npm run import-ruleset -- --dir ../GameSystems/BasicFantasy_Enhanced
```

Mechanics:

- Single transaction; `--dry-run` runs the same path then `ROLLBACK`.
- **Replace** (not upsert): after ensuring the `ruleset` row, deletes that ruleset’s junctions and catalog (`classes`, `races`, `spells`, `abilities`, `items`), then inserts from JSON. Shared lookups (`ability_categories`, `item_categories`, `item_types`) are matched by **name** and are not wiped.
- Aborts if any `characters` rows still have that `ruleset_id` (instance data would block or orphan under `ON DELETE RESTRICT`).
- Destination PKs are newly allocated (prefer a free source id when available); JSON/Firebird `ID` values exist only to remap references during the import.
- All writes use parameterized queries.

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

- `campaign` — GM/session container; **`ruleset_id`** picks which rule definitions apply.
- `campaign_character` — many-to-many between campaigns and characters.

**Characters and sheets**

- `characters` — **player/GM-owned** rows; **`ruleset_id`** selects which catalog IDs are valid in context.
- `character_classes` — one row per (character, class), with per-class `class_level` and `sort_order` (primary = lowest `sort_order`, then `class_id`); replaces a single `class` column on `characters`.
- `character_abilities`, `character_effects`, `character_items`, `character_spells`, `character_spells_cast` — instance state; scoped by `character_id` (and thus indirectly by ruleset through the character).

**Realtime / messaging (app layer)**

- `campaign_command`
- `character_transfer`

## Summary pitfall for automation

Treat **`characters`** as **user-owned instance data**, not ruleset reference import data—even though it has **`ruleset_id`**.

## Maintenance

When you add or rename tables in **`schema.sql`**, update this file so the taxonomy stays accurate. A database table that mirrors this classification is optional and easy to let drift; this markdown is the lightweight source of truth for humans and any tooling that reads the repo.
