# Follow-up: bring the catalogs up to r142

Status: `todo`. Depends on the empty catalog tables from [01-play-loop.md](01-play-loop.md) for monsters, treasure types, and encounter tables. The class, race, spell, and item corrections can be diffed before those tables exist. Do not start a full `import-ruleset` replace while any character still uses the ruleset. That path deletes the catalog and then aborts.

r142 is the source of truth where it differs from the edition Core was built from. Enhanced is a different ruleset. It receives a correction only when the row is still the shared core rule.

## Core

Compare `GameSystems/BasicFantasy_Core` to r142 and record only verified drifts.

- Part 2. Races, classes, hit dice, saving throws, attack bonus, thief abilities, equipment, weapons, armor, costs.
- Part 3. Spell names, range, duration, and effect text.
- Part 6. Monster rows into the new `monster` table. This is new data, not a diff. Core has no monster file today.
- Part 7. Treasure types and the magic-item generation steps into `treasure_type`.
- Part 8. Stock encounter tables (dungeon by level, wilderness by terrain, city) into `encounter_table`.

Patch the existing JSON rows in place. Add the new JSON files beside them. Load monsters, treasure types, and encounter tables through the catalog-only importer. Load class, race, spell, and item corrections with an in-place update, not a delete-and-insert of the whole ruleset.

Leave a short drift list in this file as the work proceeds: what changed, which JSON file, and the r142 page. An empty list means the pass has not started, not that nothing differs.

## Enhanced, same change only

After a Core correction is verified, look for the same row in `GameSystems/BasicFantasy_Enhanced`.

Apply the same edit when the Enhanced row is the shared rule: same name, and the text is the core wording rather than an Enhanced-only rewrite.

Leave the row alone when Enhanced already states a different rule on purpose (extra classes, extra spells, a changed base class). Note that skip in the drift list so the next session does not "fix" it.

Do not delete Enhanced material that r142 never contained. Do not copy the Core catalog over Enhanced.

## Done when

- Core JSON matches r142 for Parts 2 and 3 on every verified row, with the drift list filled in.
- Core has monster, treasure-type, and stock encounter-table files loaded by the catalog-only importer.
- Each applied Core correction has either landed on the matching Enhanced row or a written skip reason.
- Round-trip still passes for both rulesets.
- A database that already has characters is updated without a full catalog replace.
