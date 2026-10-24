# Follow-up: procedures held out of the first pass

Encounter dice, resolving blows, awards, the body, wilderness travel, hirelings, and prep tools are `done`. The player-facing encounter table stays `cut`. These are real r142 procedures. Pick one group, set it to `doing` in [TRACKER.md](TRACKER.md), and leave the rest.

Each item says what it needs from the first pass. None of them start combat by themselves. The GM still opens the encounter.

## Encounter dice

Needs monster rows (hit dice, morale, and the turn-undead column) and the open encounter from slice 4.

- [x] `done` Surprise. 1d6 for each side, surprised on 1–2. An ambush is surprised on 1–4. Some creatures, such as elves, reduce the range by 1. A surprised side skips one round.
  - One d6 per side on the open encounter. Ambush is 1–4. The "less likely to be surprised" ability, and a per-enemy mark, reduce that range by 1. A surprised character skips one round. The clock does not move.
- [x] `done` Reaction. When the reaction is not obvious, 2d6 plus the lead character's Charisma bonus.
  - 2d6 plus the lead character's Charisma modifier and a GM adjustment from −10 to +10. 2 or less is Immediate Attack, 3–7 Unfavorable, 8–11 Favorable, 12 or more Very Favorable.
- [x] `done` Initiative order. Each round, 1d6 plus Dexterity bonus. High acts first. Equals act together. The GM may roll once for identical monsters. This is an ordered list, not a map.
  - Each character rolls 1d6 plus Dexterity and any Initiative ability. Each enemy row rolls once. Higher totals come first. Equal totals are one line and act together.
- [x] `done` Morale. 2d6 against the monster's morale at first opposition and again at half strength. A score of 12 never fails. Adjustments stay within +2 to −2 and never touch 12.
  - The GM chooses when to check. 2d6 equal to or under the score holds; over it, the row flees. A 12 ignores adjustment and holds. The engaged figure is a separate check when the monster has one.
- [x] `done` Turning undead. Cleric level against undead type on the r142 table. A failed roll blocks another attempt for one turn. Turned undead flee.
  - Cleric level against the r142 table, named type first, otherwise hit dice. One d20, then 2d6 hit dice from the weakest type. A failed check is stored until one turn later. A D result reports damage and does not write hit points. Turned undead flee.

## Resolving blows

Needs the dice above, plus the character sheet's armor class, hit points, and attack bonus. One store of hit points: the sheet. Do not add a second pool on the encounter.

- [x] `done` Attack resolution. d20 plus attack bonus against armor class. A natural 20 hits. A natural 1 misses. Missile, melee, and back attack use the rules already on the sheet where those numbers exist.
  - On the open encounter, 1d20 plus the sheet melee or missile bonus, or the monster hit-dice bonus, against armor class. Natural 1 misses. Natural 20 hits. Back adds 2 to the melee bonus. A GM adjustment from −10 to +10 covers range and cover. Sneak attack is class text and is not a sheet number, so it is not applied. The clock does not move.
- [x] `done` Damage application. Apply the roll to the character sheet or to the enemy row. At 0 hit points the figure is down. Subduing, brawling, and wrestling stay out until this is dull.
  - The number is subtracted from `characters.hp` or `campaign_enemy.hp`. A hit is at least 1. At 0 the figure is down and the row stays. Enemy hit points are rolled from hit dice onto that row, or typed. Characters have no second pool. Subduing, brawling, and wrestling are not here.

## Awards

Needs monster hit dice, including asterisks, and the party list.

- [x] `done` Experience from hit dice. Use the r142 XP table. Each asterisk adds the special-ability bonus once. NPCs count as their level.
  - A checked enemy, or a typed NPC, uses the r142 table. Each asterisk adds the special bonus once. A level replaces hit dice when the level is higher. Spells add one special bonus. The tally does not write XP.
- [x] `done` Split. Divide by party members. A retainer takes a half share, so four characters and one retainer are 4½ shares.
  - Each character is one share and each retainer is half a share. The amounts are rounded down. The GM unchecks anyone who does not share.
- [x] `done` One level per adventure. Extra XP stops one point short of a second level gain. The flat party-XP button stays for awards that are not on the table.
  - The cap is one point short of two levels above the XP already on the sheet. Queued XP counts toward that cap. Apply sends one `give_xp` per character. The party XP button is unchanged.

## The body, using the clock

Needs the watch, turn, and day steps.

- [x] `done` Light. Torch 1d4+4 turns. Lantern oil 1d6+18 turns. A timed mark is enough if the duration is computed in seconds.
  - Light a torch or lantern rolls that duration and stores an effect on `campaign_mark`. The row shows turns left. The tick that reaches the end leaves it highlighted, and the next tick removes it. A turn is 10 minutes. Lighting does not move the clock.
- [x] `done` Rations and water. One day of food and one quart of water. Food damage starts after two missed days. Water damage starts after one, 1d4 per day. Healing stops until they eat or drink.
  - Settle day on a character writes `campaign_character.food_missed`, `heal_food`, and `heal_water`. Hunger deals 1 hit point from the third missed day. Thirst deals 1d4 from the first. Eating or drinking clears its own block. Hit points stay on `characters.hp`. The clock does not move.
- [x] `done` Daily healing. 1 hit point per day of sleep. Full bedrest adds 1. Required sleep is 6 hours minus the Constitution bonus.
  - The same settle adds 1 hit point when they slept at least that long and neither block is set. Bedrest adds 1. A short night adds nothing. There is no maximum on the sheet, so healing does not cap.
- [x] `done` Encumbrance and movement. Light and heavy load from Strength and race. Armor sets the dungeon move. The group moves at the slowest member. Wilderness miles per day come from that move.
  - The character list shows carried pounds, the light and heavy limits, the armor band, and feet per round. Catalog weight is sixteenths of a pound. The group line is the slowest member, with feet per turn and base miles per day. Terrain is not applied. Over the heavy limit still uses the heavy rate.

## Wilderness travel

Needs the outside watch and a location with terrain. This is not a map.

- [x] `done` Overland distance. Miles per day from movement, times the terrain factor. Outside locations already store `terrain` and `movement_pct`. This item still computes the miles. A forced march is 12 hours and +50% distance, with 1d6 damage on each day after the first unless a Death Ray save with Constitution bonus succeeds. One failure ends the saves. A day of rest resets it.
  - The selected outside location's stored percent adjusts the group's miles. Stock percents are Clear 0, Road +33, Forest/Hills/Desert −33, and Jungle/Swamp/Mountains −67. Forced march adds half again and writes `march_days`. The first day deals no damage. Later days roll a Death Ray save with the Constitution bonus, or skip it after one failure, and write the hit points. Rest clears the count and the failure. The clock does not move.
- [x] `done` Becoming lost. Off a road or river, a secret Death Ray save adjusted by the leader's Wisdom. The GM decides what failure means.
  - The GM picks the leader. Following a road or river skips the roll. Otherwise it is a Death Ray save plus the Wisdom bonus, shown only on this page. Nothing else changes.
- [x] `done` Sailing weather. Wind direction and strength for the day. Travel distances are a 12-hour day, or 24 with a navigator who does not stop at night.
  - One d12 and one d100. The result names the direction, the wind, and the sailing and tacking factors. A navigator who stays out makes it 24 hours and ×2. A gale names 2d8 per hour and does not roll it.
- [x] `done` Air travel. Overland rate doubled, terrain ignored. Most winged creatures must keep one-third of their move to stay aloft.
  - By air is twice the base miles, with no terrain percent. Stay aloft is one-third of the slowest move, rounded up.

## Hirelings

Needs reaction and morale, and a character to employ them.

- [x] `done` Retainers. Reaction at 2d6 plus Charisma to hire. Loyalty starts at 7 plus Charisma. Cap is 4 plus Charisma. Level is at most half the employer's. End-of-adventure loyalty check after treasure is split.
  - Roll hire uses the retainer table, not the encounter reaction. A total of 2 or less sets `hire_penalty` to −1 until a different town. Acceptance stores a `campaign_hireling` with loyalty 7 plus Charisma, plus 1 when the total is 12 or more. The cap and the half-level limit are checked. A loyalty roll of 2 in combat raises loyalty by 1. Loyalty 12 can still fail if the adjustment drops the target. End of adventure rolls each retainer and removes the ones who leave. The clock does not move.
- [x] `done` Specialists and mercenaries. Hire costs and the fact that they do not enter dungeons the way retainers do. No loyalty track beyond the book's morale for mercenaries.
  - The monthly cost is the book's figure, times level and quantity for mercenaries. It is shown and not deducted. The row says they do not enter a dungeon. A mercenary morale check uses the listed score. A specialist has no check.

## Prep tools

Needs the stock tables from the r142 catalog follow-up. These help write an adventure. They are not the play loop.

- [x] `done` Dungeon stocking. The d% room table: empty, treasure, monster, monster with treasure, special, trap, trap with treasure.
  - Stock a room rolls d% on Configuration and reports the band. The roll is not stored, does not add a monster, and does not open an encounter.
- [x] `done` Trap helper. The named traps in Part 8 (pit, dart, gas, and the rest) as a picker that fills a note. Not a trap engine.
  - Picking a trap fills an editable note. The note is not saved and the trap is not rolled.
- [x] `done` Vehicles. Attacks against AC 11, hardness subtracted from damage, field repair 1d4 hit points per crew member per hour up to 90%.
  - The catalog is on Adventuring, after Travel. It shows AC 11, hardness, and listed hit points. Damage past hardness adds to damage taken. One listed total is half speed. Twice that immobilizes a wagon and sinks a ship. Field repair rolls 1d4 per crew member and stops at 90% of the listed hit points. Vehicle hit points are not stored.

## Shown to players

- [ ] `cut` Player-facing encounter table. Players do not see encounter tables, other tables, or GM rolls. The table stays on the GM board. Adventuring and Configuration are GM-only, and a player request for that board returns 404.
