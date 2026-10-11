# Follow-up: bring the catalogs up to r142

Status: `done`. Depends on the empty catalog tables from [01-play-loop.md](01-play-loop.md) for monsters, treasure types, and encounter tables. The class, race, spell, and item corrections can be diffed before those tables exist. Do not start a full `import-ruleset` replace while any character still uses the ruleset. That path deletes the catalog and then aborts.

r142 is the source of truth where it differs from the edition Core was built from. Enhanced is a different ruleset. It receives a correction only when the row is still the shared core rule.

## Core

Compare `GameSystems/BasicFantasy_Core` to r142 and record only verified drifts.

- Part 2. Races, classes, hit dice, saving throws, attack bonus, thief abilities, equipment, weapons, armor, costs.
- Part 3. Spell names, range, duration, and effect text.
- Part 6. Monster rows into the new `monster` table. This is new data, not a diff. Core file is `MONSTERS.json`. See the drift list.
- Part 7. Treasure types and the magic-item generation steps into `treasure_type`.
- Part 8. Stock encounter tables (dungeon by level, wilderness by terrain, city) into `encounter_table`.

Patch the existing JSON rows in place. Add the new JSON files beside them. Load monsters, treasure types, and encounter tables through the catalog-only importer. Load class, race, spell, and item corrections with an in-place update, not a delete-and-insert of the whole ruleset.

Leave a short drift list in this file as the work proceeds: what changed, which JSON file, and the r142 page. An empty list means the pass has not started, not that nothing differs.

## Enhanced, same change only

Current Enhanced contents are [../enhanced-ruleset.md](../enhanced-ruleset.md). Drift notes below that say Enhanced has no spell rows describe this pass. Enhanced now has its own spell and ability rows.

After a Core correction is verified, look for the same row in `GameSystems/BasicFantasy_Enhanced`.

Apply the same edit when the Enhanced row is the shared rule: same name, and the text is the core wording rather than an Enhanced-only rewrite.

Leave the row alone when Enhanced already states a different rule on purpose (extra classes, extra spells, a changed base class). Note that skip in the drift list so the next session does not "fix" it.

Do not delete Enhanced material that r142 never contained. Do not copy the Core catalog over Enhanced.

## Drift

- Core `GameSystems/BasicFantasy_Core/MONSTERS.json`, r142 PDF pages 67–166. 263 rows, loaded into `monster` for Basic Fantasy Core by `import-catalog`. Enhanced was not touched. Treasure type `None` is null. Saving throws and XP are not columns.
- Core `GameSystems/BasicFantasy_Core/TREASURE_TYPES.json`, r142 PDF pages 168–172 (printed 164–168). 30 rows: lair A–O, individual P–V, unguarded levels `1`, `2`, `3`, `4-5`, `6-7`, `8+`, plus lookup rows `GEMS` and `MAGIC`. Loaded into `treasure_type` for Basic Fantasy Core by `import-catalog`. Enhanced was not touched. A 100s column is `multiplier` 100. A printed xN in that column is one multiplier, N times 100, because the roller rejects two. Gem and jewelry counts are separate columns. The magic phrase is stored on `magic` and is not rolled. `GEMS` and `MAGIC` are the generation tables; a roll of either returns no lines. Type H has no single percent in r142. Its dice sit on `tables` and the age footnote sits on `note`, and a roll of H returns no lines. Item explanations after the generation tables were not copied.

What the new columns hold:

- `defense_note` is the armor-class text: silver, magic, unarmored plus the second AC, or the whole sentence when there is no integer (Insect Swarm p. 118, Yellow Mold p. 165). A range stays in the note when the row is not split (Hydra is armor class 16, note `16 to 23`).
- `hitdie_note` is the extra hit-die wording (`1d4 hit points`, `hit point`, `variable`). The attack bonus that the book prints after hit dice goes in `attack_note`.
- `attack_note` is the attack line plus that attack bonus. It is not an attack resolver.
- `morale` is the first printed figure. `morale_engaged` is the second. The monster text says when the second figure applies (after engaged, a bull, the queen, fire or acid, and so on). It is not one rule for every row. `N/A` is null.
- Hellhound is five rows, 3 through 7 hit dice, each `n**`, armor class 11 plus hit dice (14 through 18). Breath cone length is in the attack note.
- Cattle, Cattle Aurochs, and Cattle Bison all have number appearing `Wild 10d12`.
- Dragon age tables are not separate rows. One row uses the printed stat-block hit dice. "See X" lines and prose-only leaders (a 1-in-10 warrior) are not rows.

- Core `CLASS_LEVELING.json` and the save and thief rows in `CLASS_ABILITIES.json` match r142. PDF pages 11–13 (printed 7–9) for experience, hit dice, and the + after level 9. Page 13 for thief percentages. Page 57 (printed 53) for attack bonus. Page 65 (printed 61) for saving throws. No JSON change.
- Core `CLASS_SPELLS.json` columns 1–6 match those same class tables. `LEVEL7` for Cleric levels 14–20 and Magic-User levels 13–20 was a slot the book does not print. Those values are now null, and the live Core rows were updated in place. r142 spell lists, PDF pages 19–20 (printed 15–16), stop at 6th level. Enhanced Druid, Illusionist, and Necromancer keep 7th-level slots. Those classes are not in r142.
- Nineteen `SPELL_CLASS.json` rows still file spells at level 7, and twenty rows still file level 0. They are not on the r142 lists (PDF pages 19–20). The rows were left in place. A character may know one. Enhanced 7th-level slots were not cleared.

- Core `ITEMS.json` weapon, armor, and common-gear prices match r142. PDF pages 14–15 (printed 10–11). Leather is 20 gp and AC 13, chain 60 and 15, plate 300 and 17, shield 7 gp. `Tent, Small (one man)` was 3 gp. The book is 5 gp.
- Core vehicle notes, PDF page 17 (printed 13), were corrected to the book: chariot move 60' (10'), coach 40' (15'), wagon 20' (15') and hardness 6/16, caravel hardness 8 and 42 miles, carrack 48 miles, small galley 36/24 miles and move 20' (20'), large galley 42/24 and move 30' (25'), sailboat 36 miles, raft 18 miles, rowboat 24 miles, drakkar hardness 9/110, 42/24 miles, and cargo 10 tons. The land notes still put hardness in the "Miles per day" pair. Chariot 10/10 and coach 6/12 already matched. Chariot War, Chariot Racing, Longship Karfi/Skei, and Cog are not the book rows. A plain lantern at 5 gp and a 128-page spellbook at 25 gp are not rows.
- Every stored money figure is copper pieces. 100 copper is 1 gp and 10 copper is 1 sp, which is the r142 rate. Item prices had been stored at half of that (50 per gp). They are doubled, including the land and water vehicles. Leather is 2000, the tent is 500, the rowboat is 6000, and the common chariot is 40000. The live Core rows were updated in place. Enhanced has no item file and no item rows. The items list and the add-item picker show coins from the copper price. Character `money` and transfer `gold_cp` were already copper and were not doubled.

- Core `RACES.json` and `CLASSES.json` descriptions, r142 PDF pages 9–13 (printed 5–9). Ability minimums and maximums already matched and were not edited. Dwarves may be Clerics, Fighters, or Thieves, and they detect stonework traps. Elves may be any of the four classes and may combine Fighter/Magic-User or Magic-User/Thief; those combination rules are on the Elf description because there is no combination-class row. Halflings hide in their preferred forest terrain, not only outdoors. The human description includes women at five feet nine inches and 145 pounds. Cleric turning points at page 57. Fighters approach head-on, weapon in hand, and are the best at fighting. The Magic-User's first spellbook comes from their master. The Thief description now includes the ability explanations and the sneak attack; the percentage table stays on the ability rows. The sentence that points at that table was not copied. Enhanced has no copies of these four races or four classes. The live Core rows were updated in place.

- Core `SPELLS.json`, r142 PDF pages 21–45 (printed 17–41). 91 spells whose range, duration, or description still differed were updated in the JSON and in the live Core rows, matched by ruleset name and the old spell name. 11 already matched and were not edited. `ESP` is now `Mind Reading`. `Cure Blindness` and `Feeblemind` gained the reversible-spell star. Animate Dead range is 30'. Confusion range is 280'+10'/ level. Lightning Bolt range is 100'+10'/level. Lower Water range is 20'/level. Remove Curse* range is 30' and duration is instantaneous. Wall of Fire duration stays 1 round/level (or special). Enhanced has no spell rows, so it inherits the Core text.
- Three core spells were missing from `SPELLS.json` and from the live Core rows. They are now `Cure Light Wounds*` (Cleric 1), `Remove Fear*` (Cleric 1, range touch (120'), duration instantaneous (2 turns)), and `Cure Serious Wounds*` (Cleric 4).
- `Remove Curse*` was filed only as Cleric 1. r142 lists it as Cleric 3 and Magic-User 4. `SPELL_CLASS.json` and the live Core filings were updated. `Read Magic` stays Magic-User 1. The description header says that, and the printed lists on pages 19–20 do not include it.
- Level 0 filings left in place, 20 rows. Stars already in the file were kept: Animate Tool, Call to Worship, Clean*, Cure Minor Wounds, Flare, Flavor*, Guidance*, Inscribe, Irritate, Knot*, Mage Hand, Meal Blessing, Mend, Open/Close, Predict Weather, Summon Vermin*, Transfigure, Virtue, Ward*, Water to Wine.
- Level 7 filings left in place, 19 rows and 17 names. Astral Projection and Gate are filed for both Cleric and Magic User. The other fifteen are Cure Deafness, Earthquake, Fire Storm, Greater Teleport, Holy Word, Longevity, Mass Invisibility, Phase Door, Power Word Stun, Resurrection, Reveal Magic, Sword, Wind Walk, Wychlamp Aura, and Control Weather.
- Core `ENCOUNTER_TABLES.json` and `ENCOUNTER_TABLE_ROWS.json`, r142 PDF pages 184–186 (printed 180–182). 17 tables, 229 rows, loaded into Basic Fantasy Core by `import-catalog` from a directory that did not contain `MONSTERS.json`. Enhanced was not given a copy. Dungeon levels 1, 2, 3, 4-5, 6-7, and 8+ are 1d12. The nine wilderness terrains are the 2d8 table, stored as die 16 with faces 2–16. City day and city night are the 2d6 table, stored as die 12 with faces 2–12. The wander roll is still one die of that size. A name with no single monster row is a label: NPC parties, Hellhound (five hit-die rows), Elephant (two species), and the two Roc size rolls. Toad, Giant uses the Frog, Giant row. Alicorn uses Unicorn, Alicorn. Giant Rat uses Rat, Giant. The design notes after the city table were not copied.

The round-trip was not run. A full ruleset replace still aborts while characters use the ruleset.

## Done when

- Core JSON matches r142 for Parts 2 and 3 on every verified row, with the drift list filled in.
- Core has monster, treasure-type, and stock encounter-table files loaded by the catalog-only importer.
- Each applied Core correction has either landed on the matching Enhanced row or a written skip reason.
- Round-trip still passes for both rulesets.
- A database that already has characters is updated without a full catalog replace.
