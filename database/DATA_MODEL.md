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

## Bundled ruleset SQL snapshots (`database/rulesets/*.sql`)

The repo can ship **catalog-only** PostgreSQL scripts that upsert reference data for a named ruleset. They are **not** migrations: re-running the same file is safe and is the intended way to publish updates to that ruleset’s book data.

**What they contain**

- The `ruleset` row (by name), plus every catalog table scoped by that ruleset: `classes`, `races`, `spells`, `abilities`, `items`, `class_abilities`, `class_leveling`, `class_spells`, `race_abilities`, and `spell_class` rows whose class and spell IDs belong to that ruleset.
- A **subset** of shared lookups (`ability_categories`, `item_categories`, `item_types`)—only rows referenced by exported abilities or items—so the file is self-contained.

**What they omit**

- Campaigns, characters, and all `character_*` tables (user/instance data). See “Summary pitfall for automation” below.

**Mechanics**

- Wrapped in a single transaction (`BEGIN` / `COMMIT`).
- `ruleset_id` in catalog rows is resolved with `SELECT id FROM public.ruleset WHERE name = …` so the script does not depend on a fixed serial id for the ruleset row.
- The `ruleset` row upserts on unique `name`. Shared lookups upsert on primary key `id`. Core catalog rows (`classes`, `races`, `spells`, `abilities`, `items`) upsert on primary key `id` so numeric IDs stay stable for junction tables (`spell_class`, `class_abilities`, …). Junction rows upsert on their primary keys defined in [`schema.sql`](schema.sql).
- Regeneration ([`backend/scripts/export-ruleset.js`](../backend/scripts/export-ruleset.js)): if the target ruleset name is missing from the database, catalog is still read from `ruleset_id` matching `Default`, then `1`, or from `--from-ruleset-id`; the generated file inserts the target ruleset name first so applying it defines **Basic Fantasy Enhanced** (or `--ruleset-name`) and associates every catalog row.

**Maintenance**

If you change unique constraints or column sets in **`schema.sql`**, update [`backend/scripts/export-ruleset.js`](../backend/scripts/export-ruleset.js) so generated SQL matches (conflict targets and column lists). Regenerate affected files with `npm run export-ruleset` in `backend/`.

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
