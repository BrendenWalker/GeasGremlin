# Follow-up: procedures held out of the first pass

Status: `todo` for every item. These are real r142 procedures. They waited because the first pass has no monster numbers and no attack resolver. Pick one group, set it to `doing` in [TRACKER.md](TRACKER.md), and leave the rest.

Each item says what it needs from the first pass. None of them start combat by themselves. The GM still opens the encounter.

## Encounter dice

Needs monster rows (hit dice, morale, and the turn-undead column) and the open encounter from slice 4.

- [ ] `todo` Surprise. 1d6 for each side, surprised on 1–2. An ambush is surprised on 1–4. Some creatures, such as elves, reduce the range by 1. A surprised side skips one round.
- [ ] `todo` Reaction. When the reaction is not obvious, 2d6 plus the lead character's Charisma bonus.
- [ ] `todo` Initiative order. Each round, 1d6 plus Dexterity bonus. High acts first. Equals act together. The GM may roll once for identical monsters. This is an ordered list, not a map.
- [ ] `todo` Morale. 2d6 against the monster's morale at first opposition and again at half strength. A score of 12 never fails. Adjustments stay within +2 to −2 and never touch 12.
- [ ] `todo` Turning undead. Cleric level against undead type on the r142 table. A failed roll blocks another attempt for one turn. Turned undead flee.

## Resolving blows

Needs the dice above, plus the character sheet's armor class, hit points, and attack bonus. One store of hit points: the sheet. Do not add a second pool on the encounter.

- [ ] `todo` Attack resolution. d20 plus attack bonus against armor class. A natural 20 hits. A natural 1 misses. Missile, melee, and back attack use the rules already on the sheet where those numbers exist.
- [ ] `todo` Damage application. Apply the roll to the character sheet or to the enemy row. At 0 hit points the figure is down. Subduing, brawling, and wrestling stay out until this is dull.

## Awards

Needs monster hit dice, including asterisks, and the party list.

- [ ] `todo` Experience from hit dice. Use the r142 XP table. Each asterisk adds the special-ability bonus once. NPCs count as their level.
- [ ] `todo` Split. Divide by party members. A retainer takes a half share, so four characters and one retainer are 4½ shares.
- [ ] `todo` One level per adventure. Extra XP stops one point short of a second level gain. The flat party-XP button stays for awards that are not on the table.

## The body, using the clock

Needs the watch, turn, and day steps.

- [ ] `todo` Light. Torch 1d4+4 turns. Lantern oil 1d6+18 turns. A timed mark is enough if the duration is computed in seconds.
- [ ] `todo` Rations and water. One day of food and one quart of water. Food damage starts after two missed days. Water damage starts after one, 1d4 per day. Healing stops until they eat or drink.
- [ ] `todo` Daily healing. 1 hit point per day of sleep. Full bedrest adds 1. Required sleep is 6 hours minus the Constitution bonus.
- [ ] `todo` Encumbrance and movement. Light and heavy load from Strength and race. Armor sets the dungeon move. The group moves at the slowest member. Wilderness miles per day come from that move.

## Wilderness travel

Needs the outside watch and a location with terrain. This is not a map.

- [ ] `todo` Overland distance. Miles per day from movement, times the terrain factor. Outside locations already store `terrain` and `movement_pct`. This item still computes the miles. A forced march is 12 hours and +50% distance, with 1d6 damage on each day after the first unless a Death Ray save with Constitution bonus succeeds. One failure ends the saves. A day of rest resets it.
- [ ] `todo` Becoming lost. Off a road or river, a secret Death Ray save adjusted by the leader's Wisdom. The GM decides what failure means.
- [ ] `todo` Sailing weather. Wind direction and strength for the day. Travel distances are a 12-hour day, or 24 with a navigator who does not stop at night.
- [ ] `todo` Air travel. Overland rate doubled, terrain ignored. Most winged creatures must keep one-third of their move to stay aloft.

## Hirelings

Needs reaction and morale, and a character to employ them.

- [ ] `todo` Retainers. Reaction at 2d6 plus Charisma to hire. Loyalty starts at 7 plus Charisma. Cap is 4 plus Charisma. Level is at most half the employer's. End-of-adventure loyalty check after treasure is split.
- [ ] `todo` Specialists and mercenaries. Hire costs and the fact that they do not enter dungeons the way retainers do. No loyalty track beyond the book's morale for mercenaries.

## Prep tools

Needs the stock tables from the r142 catalog follow-up. These help write an adventure. They are not the play loop.

- [ ] `todo` Dungeon stocking. The d% room table: empty, treasure, monster, monster with treasure, special, trap, trap with treasure.
- [ ] `todo` Trap helper. The named traps in Part 8 (pit, dart, gas, and the rest) as a picker that fills a note. Not a trap engine.
- [ ] `todo` Vehicles. Attacks against AC 11, hardness subtracted from damage, field repair 1d4 hit points per crew member per hour up to 90%.

## Shown to players

- [ ] `cut` Player-facing encounter table. The table stays on the GM board. A player client that can read it can reroll by refreshing, and it spoils the dungeon. Reopen this only with a reason that beats that.
