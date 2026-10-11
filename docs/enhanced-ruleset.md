# Basic Fantasy Enhanced

Overlay on Basic Fantasy Core. `gamesystem.json` sets `parent_ruleset` to `Basic Fantasy Core`. A catalog read returns these rows plus Core rows this folder does not replace. Do not copy the Core catalog over this folder.

Incorporated supplements are the PDFs in [`GameSystems/BasicFantasy_Enhanced/sources/`](../GameSystems/BasicFantasy_Enhanced/sources/). Those releases are the source for the rows below. The library at `C:\Users\bkw\Documents\Basic Fantasy Docs` is wider. A newer file there is not in the ruleset until it is copied into `sources/` and the JSON is updated.

This note names what is stored. It does not re-check every table cell against the PDF. The JSON is the catalog.

## Full classes

Each has 20 `CLASS_LEVELING` rows with hit dice and attack bonus.

| Class | Supplement | Spell filings |
| --- | --- | --- |
| Druid | Druid r14 | 60 spells, levels 0–7. Slots from character level 2. |
| Illusionist | Illusionist r9 | 70 spells, levels 0–7. Slots from character level 1. |
| Necromancer | Necromancer r12 | 67 spells, levels 0–7. Slots from character level 1. |
| Scout | Scouts r5 | None. Wilderness thief skills, including Detect Traps and Tracking. |
| Ranger | Rangers and Paladins r4 | None. Wilderness Move Silently, Hide, and Tracking. |
| Paladin | Rangers and Paladins r4 | 9 level-0 orisons. Slots from character level 10. |
| Assassin | Assassins r6 | None. Poison, Assassinate, and Waylay, plus thief skills. |

Druid's class ability is Control Animals.

## Quasi-classes

From Quasi-Classes r8. `IS_QUASI` is true. Each has its own 20-row experience track on `CLASS_LEVELING`. Hit dice and attack bonus on that track are empty. The track is added to the base class.

Archer, Barbarian, Bard, Confessor, Holy Character, Hunter, and Sage share the lower track: level 2 is 500 XP, level 20 is 425000. Monk uses the higher track: level 2 is 1000 XP, level 20 is 850000.

Hunter also stores wilderness Hide, Move Silently, and Tracking. The other quasi-classes keep their rules on the class description.

The supplement calls Holy Character a paladin and Hunter a ranger. This folder also has the full Paladin and Ranger classes. Those are separate rows. Do not collapse them.

## Races

Gnome, from Gnomes r7. Half-Elf, Half-Orc, and Half-Ogre, from Half Humans r5. Bisren, Canein, Chelonian, Faun, and Phaerim, from New Races r3.

## Rows that exist only here

`SPELLS.json` has four spells, ids 1001–1004. Druid files all four.

- Take Animal Form
- Tree Form
- Summon Weather
- Animal Friendship

Core still has older text under other ids: Animal Friendship (103), Assume Animal Form (105), and Weather Summoning (131). Enhanced does not file those three. Druid still files Core's Tree (265). That spell is not Tree Form. Leave the Core rows. Do not rename the Enhanced spells back to the Core names.

`ABILITIES.json` has two rows: Detect Traps (101) and Control Animals (102).

Every other Enhanced spell filing uses a Core spell id. The level-0 orisons and cantrips are the 0 Level Spells r5 list. Their text stays on Core.

## Core rows this folder adds

Thief, class 4, sneak attack: level 1 is +4 and damage x2, level 9 is +4 and damage x3.

Racial thief percentages for Dwarf, Elf, Halfling, Gnome, Half-Elf, Half-Orc, Half-Ogre, and Bisren. The Dwarf, Elf, Halfling, Gnome, and half-human figures are the racial table in Thief Options r3. The rest of that supplement is not stored: armor penalties, ability-score adjustments, the extra sneak-attack scaling, and the absolute limit.

`STATS.json` matches Core. `ITEM_TYPES.json`, `ITEM_CATEGORIES.json`, and `ABILITY_CATEGORIES.json` match Core aside from timestamps. There is no `ITEMS.json`, no `MONSTERS.json`, and no encounter tables. Those are inherited.

## Incorporated PDFs

- `BF-Druid-Supplement-r14.pdf`
- `BF-Illusionist-Supplement-r9.pdf`
- `BF-Necromancer-Supplement-r12.pdf`
- `BF-Scouts-Supplement-r5.pdf`
- `BF-Rangers-and-Paladins-r4.pdf`
- `BF-Assassins-Supplement-r6.pdf`
- `BF-Quasi-Classes-Supplement-r8.pdf`
- `BF-Gnomes-Supplement-r7.pdf`
- `BF-Half-Humans-Supplement-r5.pdf`
- `BF-New-Races-Supplement-r3.pdf`
- `BF-Thief-Options-Supplement-r3.pdf` (racial table only)
- `BF-0-Level-Spells-Supplement-r5.pdf` (filings; spell text stays on Core)

r142 remains the Core book. r132 is the older edition.

## Not in the overlay

Character options still only in the library:

- `Character Creation/Classes/BF-Barbarian-Supplement-r4.pdf`. A full class, with rage. The Barbarian row here is the quasi-class.
- `Character Creation/Classes/BF-Spellcrafters-Supplement-r10.pdf`
- `Character Creation/Classes/BF-Magic-User-Options-Supplement-r4.pdf` and `Character Creation/BF-Cleric-Options-Supplement-r7.pdf`. Menus of variants, not one class.
- The rest of Thief Options r3, listed above.
- `Character Creation/Races/BF-Monsters-as-Player-Characters-Supplement-r4.pdf`. Bugbear, Caveman, Centaur, Gnoll, Goblin, Hobgoblin, Kobold, Lizard Man, Ogre, Orc, Troglodyte, and combination-class rules. The copy at the library root is the same file.
- `!NEW` races: Felisians r4, the Carven r5, Drakkanor r2, Wanderwoods r2. Voidspanners r1 is a fantasy-space setting.
- `Character Creation/BF-Background-Skills-r2.pdf` and `Character Creation/BF-Secondary-Skills-Supplement-r2.pdf`
- `Character Creation/BF-New-Spells-Supplement-r9.pdf`. Seventh-level lists for Cleric and Magic-User. Core slots for those two classes were cleared to match r142. Enhanced casters keep 7th-level slots. Do not put those slots back on Cleric or Magic-User unless that decision is reopened on purpose.
- `Core Rules/BF-Alignment-Supplement-2006.0.pdf` and `Core Rules/BF-Alignment-Creators-Kit-r1.pdf`. Paladin text mentions nine alignments and does not store one.

Play procedures and gear:

- `!NEW/Basic-Fantasy-Adventuring-Supplement-r8.pdf`. Weather, terrain, wilderness chases, foraging, camping, sleeping in armor, poison.
- `Core Rules/BF-Combat-Options-Supplement-r4.pdf` and `!NEW/BF-Combat-with-Floor-Plans-r7.pdf`
- Equipment: Emporium r24, Armor and Shields r3, Equipment Packs r1, Sentient Weapons r3, Spell Channeling Items r1, Soulforged Armor r1. Necromancer prose names sickle, scythe, spade, and scimitar. There is no item file for them.
- `Monsters/Basic-Fantasy-Field-Guide-1-r41.pdf`, Field Guide 2 r42, Field Guide 3 r21, and `Monsters/BF-Monster-Conversion-Supplement-2006.2.pdf`. Monsters stay on Core.

Leave these out of the ruleset: adventure modules, solo adventures, play-by-post, the Jessica campaign, character sheets, and grid paper. `!NEW/Glain-Companion-r4.odt` is a personal compilation and overlaps supplements already here. `House Rules/` was not checked against the JSON. `!NEW/BF-Dispute-R3.pdf` is a three-page social roll.
