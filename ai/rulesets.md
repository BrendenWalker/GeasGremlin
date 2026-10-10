# Rulesets

Basic Fantasy RPG Rules r142 is the source of truth for the core rules where the checked-in JSON differs from that book. `GameSystems/BasicFantasy_Core` was built from an earlier edition.

`GameSystems/BasicFantasy_Enhanced` is a separate ruleset. Apply a core correction there only when that row is still the shared rule. Leave Enhanced-only classes and spells alone. Do not copy the Core catalog over Enhanced.

A full `import-ruleset` replace deletes that ruleset's classes, races, spells, abilities, and items. `assertReplaceAllowed` in [backend/scripts/import-ruleset.js](../backend/scripts/import-ruleset.js) aborts the replace while any character still uses the ruleset. Do not clear characters to make a replace succeed. Update a live catalog in place, or use a catalog-only path that does not delete classes and spells.

The play-loop plan for the r142 pass is [docs/plans/02-r142-catalog.md](../docs/plans/02-r142-catalog.md).
