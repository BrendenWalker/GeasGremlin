# Handoff: close the r142 catalog

Resume from [TRACKER.md](TRACKER.md) and [02-r142-catalog.md](02-r142-catalog.md). This file is the close-out. Do not redo the slices already in the drift list.

r142 PDF: `C:\Users\bkw\Documents\Basic Fantasy Docs\Core Rules\Basic-Fantasy-RPG-Rules-r142.pdf` (208 pages). Printed page = PDF page minus 4. PowerShell mangles `python -c` when the script contains quotes or braces. Write a `.py` file and run that. `pymupdf` is installed.

The live ruleset name is `Basic Fantasy Core`. Look it up by name. Do not hardcode an id. Repo-root `.env` holds the database settings. Do not print them. Node scripts should load `dotenv` the same way as `backend/scripts/import-catalog.js`.

Nothing in this pass is committed. Do not commit unless asked.

## Already true

Monsters (263) and treasure types (30) are loaded for Core. Class experience, hit dice, attack bonus, saves, thief percentages, and spell slots 1–6 match the book. Cleric and Magic-User 7th-level slots are null in `CLASS_SPELLS.json` and in the live Core rows. Enhanced Druid, Illusionist, and Necromancer keep theirs.

Item prices, character `money`, and transfer `gold_cp` are copper pieces. 100 copper is 1 gp. 10 copper is 1 sp. Display converts. Leather is 2000. The small tent is 500. The rowboat is 6000. The common chariot is 40000. Do not put any price back on the old 50-per-gp scale, and do not store a price in gold.

Race and class descriptions match PDF pages 9–13. Elf combination classes are on the Elf description. There is no combination-class row. The thief ability explanations are on the Thief description. The percentage table stays on the ability rows.

Enhanced has no `ITEMS.json` and no copies of the four core races or four core classes. It does have its own `SPELLS.json` and `ABILITIES.json` for rows the supplements add. Current contents are [../enhanced-ruleset.md](../enhanced-ruleset.md). A catalog read inherits a parent row the child does not replace. Apply a Core correction to Enhanced only when that Enhanced row is still the old shared text. Leave Enhanced-only classes, races, and spells alone. Do not replace an Enhanced spell with a Core spell of the same name.

## Do not

- Run `import-ruleset`, or `npm run test:ruleset-roundtrip`, against this database. Both replace classes, races, spells, abilities, and items, then abort while any character still uses the ruleset. Do not delete characters to make that succeed.
- Point `import-catalog --dir` at `GameSystems/BasicFantasy_Core`. That folder contains `MONSTERS.json`. A present monster file replaces monsters and aborts if a campaign enemy, location, or custom encounter row still points at one.
- Reformat `ITEMS.json` or `SPELLS.json`. They are large, use a space before the colon, and escape slashes.
- Change the land-vehicle note label "Miles per day". On those rows that pair is hardness. Chariot 10/10 and coach 6/12 already match the book.

## 1. Spell text

Part 3. Lists are PDF pages 19–20 (printed 15–16). Descriptions are alphabetical on PDF pages 21–45 (printed 17–41). Part 4 starts on PDF page 46.

`SPELLS.json` has 293 spells. Level lives on `SPELL_CLASS.json`, not on the spell. Compare name, range, duration, and description with the book. Patch only verified drifts, in the JSON and in the live `spells` row, matched by ruleset name and spell name, and only where the current text is still the old Core text.

`SPELL_CLASS` filings that are not on the r142 lists:

- Level 0, 20 rows: Animate Tool, Call to Worship, Clean, Cure Minor Wounds, Flare, Flavor, Guidance, Inscribe, Irritate, Knot, Mage Hand, Meal Blessing, Mend, Open/Close, Predict Weather, Summon Vermin, Transfigure, Virtue, Ward, Water to Wine. Names with a star in the file keep the star.
- Level 7, 19 rows, 17 names. Astral Projection and Gate are filed for both Cleric (class 1) and Magic User (class 3). The other fifteen are Cure Deafness, Earthquake, Fire Storm, Greater Teleport, Holy Word, Longevity, Mass Invisibility, Phase Door, Power Word Stun, Resurrection, Reveal Magic, Sword, Wind Walk, Wychlamp Aura, and Control Weather.

Do not delete those spell rows. A character may know one. Leave the filings, and write that in the drift list. Do not clear Enhanced 7th-level slots.

A plain lantern (5 gp, 2 lb) and a 128-page spellbook (25 gp, 1 lb) are still not item rows. That is a known Part 2 gap, not part of the spell pass. Add them only if you are closing that gap on purpose. Store the price in copper (500 and 2500).

## 2. Stock encounter tables

Part 8 starts on PDF page 184 (printed 180). Dungeon wandering monsters are on that page. Wilderness encounters follow on 185, and the wilderness roll table is on 186. City encounters follow that. Read the pages and stop at the last table. Do not copy the design essays after the tables.

Add `ENCOUNTER_TABLES.json` and `ENCOUNTER_TABLE_ROWS.json` beside the other Core files. Shape, from `backend/scripts/catalogImport.js`:

- Table: `ID`, `NAME`, `DIE` (2–100).
- Row: `ID`, `ENCOUNTER_TABLE_ID`, `FACE_LO`, `FACE_HI`, optional `MONSTER_ID`, optional `LABEL`, optional `QUANTITY`. Faces are inclusive. `FACE_HI` cannot exceed the table die. A row needs a monster id or a label. Label and quantity are at most 80 characters.

`MONSTER_ID` must be the live `monster.id` for Core. Those ids were taken from `MONSTERS.json` when the monster table was empty, so the JSON id should still be the database id. Confirm one monster by name before trusting that. A name the book prints that is not a monster row gets a label, not a made-up id.

Load from a temp directory that contains only `gamesystem.json`, `ENCOUNTER_TABLES.json`, and `ENCOUNTER_TABLE_ROWS.json`. Dry-run, then commit:

```bash
cd backend
node scripts/import-catalog.js --dir <temp> --dry-run
node scripts/import-catalog.js --dir <temp>
```

Enhanced inherits a Core stock table whose name it does not replace. Do not copy the tables into Enhanced.

`npm run test:catalog-import` checks the importer shape and does not need the live catalog. It is the check to run. Do not run the ruleset round-trip.

## When you stop

Add a drift bullet to `02-r142-catalog.md`: what changed, which file, which PDF page. Replace the tracker line under the r142 item with what is true in the tree. If both slices are loaded and the level 0 and level 7 filings are recorded, set that item to `done`.
