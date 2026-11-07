# Ruleset integration assessment

Gate before Phase 2 of `docs/plans/GeasGremlin_Cursor_Implementation_Plan_Revised.md`. Written 2026-10-30 from this checkout. Phase 2 was not started.

## Decision

Basic Fantasy Enhanced is a **curated fixed ruleset**. It is one overlay on Basic Fantasy Core. The supplements in `docs/enhanced-ruleset.md` are the contents of that one ruleset. They are not switches a campaign can turn on one at a time.

Independently composable supplements are not a product requirement. Do not build a second parent, a supplement picker, or a second mechanics engine. A composition redesign needs a separate approval.

`campaign_id` stays the only playthrough owner. This assessment does not add `campaign_run_id` and does not copy the clock, clues, objectives, encounters, or room flags.

## What was inspected

- `ai/rulesets.md`, `docs/enhanced-ruleset.md`, `database/DATA_MODEL.md`, `database/schema.sql` (`ruleset`, `ruleset_parent_guard`).
- `GameSystems/BasicFantasy_Core/gamesystem.json` and `GameSystems/BasicFantasy_Enhanced/gamesystem.json`, plus the Enhanced class, spell, and ability files.
- `backend/overlay.js`, `backend/overlay.check.js`, `backend/scripts/import-ruleset.js` (`parent_ruleset`, `resolveMapped`).
- Catalog reads in `backend/server.js` (`visibleInRuleset`, class abilities, leveling, spell slots).
- Combat and time: `backend/blows.js`, `backend/encounterDice.js`, `backend/body.js`, `backend/travel.js`, `frontend/src/utils/armorClass.mjs`, `frontend/src/domain/character.mjs`, `frontend/src/domain/gameTime.mjs`, and the tick, attack, march, and spell routes in `backend/server.js`.
- Playthrough facts: `backend/playState.js`.

`backend/overlay.check.js` locks the four Enhanced spells and two abilities by id and name. `npm run test:overlay` passes after that update.

## Inheritance and override precedence

One hop. `gamesystem.json` `parent_ruleset` is a ruleset name. Core has none. Enhanced names `Basic Fantasy Core`. Import refuses a parent that already has a parent, and refuses to give a parent to a ruleset that already has children. The database trigger `ruleset_parent_guard` matches that. `mechanic` on both files is `bfrpg`. There is no other mechanic.

A child stores rows that add to the parent, or that replace a parent row with the same key. A matching row is not stored again. `backend/overlay.js` is the file-side planner. Keys:

| Table | Key |
|---|---|
| Class, race, spell | name |
| Ability | description |
| Item | category, type, name, size |
| Class ability | class name, ability description, level |
| Class leveling | class name, level |
| Class spells | class name, character level |
| Race ability | race name, ability description |
| Spell filing | class name, spell name |

A junction whose payload differs from the parent keeps the child entity even when the entity text matches, because the junction needs its own id. Import may also point a child junction at a parent class, race, spell, or ability id when the child folder has no entity of its own (`resolveMapped`). Enhanced does that for Thief (`CLASS_ID` 4, sneak attack at levels 1 and 9) and for racial thief percentages on Core races, including Dwarf (`RACE_ID` 1). Those junction rows belong to the Enhanced ruleset. The class or race row stays on Core.

A catalog list for one ruleset returns that ruleset's rows plus parent rows the child does not replace. `visibleInRuleset` in `backend/server.js` is that rule for classes, races, spells, items, monsters, and stock encounter tables. Class abilities, leveling, and spell slots on `GET /api/classes` use the same idea: same class name, child ruleset or parent ruleset, and a child row with the same key hides the parent row.

`GET /api/classes/:id/leveling` does not do that. It returns `class_leveling` for that id only.

Enhanced's own classes are Druid, Illusionist, Necromancer, Scout, Ranger, Paladin, Assassin, and the quasi-classes Archer, Barbarian, Bard, Holy Character, Sage, Confessor, Hunter, and Monk. Fighter, Cleric, and the other Core classes are inherited, not copied. Enhanced spells are Take Animal Form, Tree Form, Summon Weather, and Animal Friendship (ids 1001–1004). Enhanced abilities are Detect Traps (101) and Control Animals (102). Core still has Animal Friendship, Assume Animal Form, and Weather Summoning under other names and ids. Same-name replacement does not apply to those. Leave them.

Monsters, items, and treasure codes are inherited. Enhanced has no `ITEMS.json` and no `MONSTERS.json`.

## How the book numbers are calculated today

There is no ruleset service object. Each check is a function. The closed family is `bfrpg`.

| Book number | Who calculates it | Who applies it |
|---|---|---|
| Ability modifier | `encounterDice.js`, and the same bands again in `body.js` and `frontend/src/utils/hitPoints.mjs` | Callers |
| Armor class | `blows.js` `armorClass` and `frontend/src/utils/armorClass.mjs` (same rule) | Attack route uses `blows.js`. The sheet uses the frontend copy. |
| Character attack bonus | `blows.js` `characterAttackBonus` | Attack route. The sheet string is `character.mjs` `meleeAttackBonus` / `rangedAttackBonus`. |
| Monster attack bonus | `blows.js` `monsterAttackBonus` from hit dice | Attack route. A monster with no single bonus can take a typed bonus. |
| Hit or miss | `blows.js` `resolveAttack` (natural 1 misses, natural 20 hits) | Attack route. The roll does not move the clock. |
| Damage dice | `blows.js` `characterDamageDice` | Attack route. Sneak attack is class text. The roll does not apply it. |
| Saving throw targets on the sheet | `character.mjs` `savingThrowTargets` from class and race ability rows | Print sheet only. |
| Death Ray on a forced march or a lost check | `travel.js` `deathRaySave`, given a target | March and lost routes. The target comes from `server.js` `marchPartySql`. |
| Turn undead | `encounterDice.js` | Encounter route. A block stores `campaign_turn_block.until_seconds` as the clock plus 600. It is not a second clock. |
| Surprise and initiative | `encounterDice.js`, plus initiative from ability `stat_modifier` in `loadPartyActors` | Encounter route. |
| Spell slots | Class `spell_slots` on the class list. Cast spends `character_spells.memorized`. | Spell routes. A day tick copies `intend` into `memorized`. |
| Hit points | `characters.hp` is the maximum. Current is that plus HP rows in `character_effects`. | Damage, healing, hunger, thirst, rest. |
| Light duration | `body.js` | A timed mark on `campaign_mark`, not a second clock. |
| Clock | `campaign_board.game_seconds` | `POST /api/campaigns/:id/adventuring/tick`. Round is 10 seconds, turn 600, watch 14400, day 86400. |

Quasi-class experience is added to the base class row for the same level (`overlaidExperience`, and the character `next_level_xp` query). Hit dice and attack bonus stay on the base row. `classAssignment.js` only checks that the base and the quasi-class are in the character's ruleset or its parent.

## Time

`POST .../adventuring/tick` adds one step to `campaign_board.game_seconds`. A round does not check for wanderers. A turn, watch, or day does, and may add one visit check. A round queues `new_round`. A day queues `new_day` and refreshes memorized spells. Expired `campaign_mark` rows of kind `effect` are deleted. The tick does not roll attacks, saves, or narrative conditions.

Combat rounds are not counted separately. Opening a fight does not move the clock.

## Conditions and resources

"Condition" in the campaign plan is narrative (wheel, slab, rising water). Nothing in the ruleset catalog evaluates that.

What exists instead:

- `character_effects` are sheet deltas. Combat hit points read the HP stat. The attack route does not add those rows to Strength, Dexterity, or armor class.
- `campaign_mark` kind `effect` is a timed note. The tick drops it when its minutes have run out. It does not change armor class or an attack bonus.
- Spell text that says "save vs. Spells" or "+1 to attacks" stays prose. No caster applies Bless, Bane, or a spell duration to a roll.
- Room flags stay `sprung`, `taken`, and `found`.
- Object facts stay the two `campaign_state_value` rows. Water flowing is derived in `playState.js` and is not stored.

Resources that already have an owner:

- Spell castings: `character_spells.memorized`.
- Hit points: maximum on `characters.hp`, wounds on `character_effects`.
- Food, water, forced march, hire penalty: `campaign_character`.
- Money: `characters.money`.
- Creature hit points for this playthrough: `campaign_creature.hp` / `base_hp`.

## Conflicts to leave alone in Phase 2

1. **The overlay check matches the catalog.** `backend/overlay.check.js` expects spell ids 1001–1004 (Take Animal Form, Tree Form, Summon Weather, Animal Friendship) and ability ids 101–102 (Detect Traps, Control Animals). Items stay at 0. Leave those rows in the ruleset.

2. **Forced-march Death Ray does not use the sheet rule.** `savingThrowTargets` takes the class row at or below this level and adds race adjustments, from the merged class list. `marchPartySql` reads `class_abilities.int_param` where `ability_id = 5` and `ca.ruleset_id = characters.ruleset_id`. Ability 5 in the Core file is `%d : Death Ray or Poison`. Those rows live on the Core ruleset. An Enhanced character whose class is inherited Core Fighter has `characters.ruleset_id` of Enhanced, so this lookup misses the parent row and `travel.js` returns `no Death Ray save`. It also ignores the race adjustment the sheet adds. Phase 2 must not copy `ability_id = 5` into a condition.

3. **Two attack-bonus stories.** The sheet's off-hand uses Dexterity and a floor (`character.mjs`). `characterAttackBonus` has one melee path: dual wielding subtracts 2 and still uses Strength. There is no off-hand mode on the roll. A campaign effect must call `blows.js` for a roll and must not copy the sheet string.

4. **Leveling inheritance is only on the class list.** `GET /api/classes?ruleset_id=` merges parent `class_leveling` by class name. `GET /api/classes/:id/leveling` and `loadCharacterFighter` join `class_leveling` on the character's class id only. That matches today's files, because Enhanced does not replace Fighter or Thief with a second class row, and the new classes store their own tracks. A later override that keeps a child class and omits identical leveling rows would show an attack bonus on the class list and none on the roll.

5. **Initiative and surprise follow the entity id.** `loadPartyActors` does not filter `ruleset_id`. Catalog lists do. The current Enhanced grants on Core races are thief percentages with a null `stat_modifier`, so they do not change the initiative sum. Do not treat that query as the overlay rule.

6. **Ability modifier is written three times** (`encounterDice.js`, `body.js`, `hitPoints.mjs`). The bands match. Do not add a fourth in campaign automation.

## Interface contract

Phase 2's condition evaluator orchestrates campaign state. It calls the existing playthrough writes. It does not calculate armor class, attack bonuses, saving throws, spell slots, hit points, light, or the clock.

Allowed for the water puzzle, and only through the code that already owns the fact:

- Read and write `campaign_state_value` with `backend/playState.js` (`waterwheel` / `blocked`, `burial_slab` / `removed`, expected version). Water flowing stays the derived value in that module.
- Record the GM decision on `campaign_log` the way that module already does.
- Leave `campaign_board.game_seconds`, clues, objectives, encounters, room flags, and paths on their own tables.

Not allowed in the evaluator, including as a "small" copy:

- A formula for armor class, attack, damage, saves, turn undead, surprise, encumbrance, or spell slots.
- A new `mechanic` value, a second parent, or a supplement list on the campaign.
- `eval`, SQL from campaign JSON, or a ruleset id inside a condition.
- Spending `memorized`, writing `character_effects`, or advancing the clock as a side effect of the water rule. Those stay on their current routes.
- Storing water flowing, a combat-round counter, or a second copy of a fact that already has an owner.

If a later phase needs a book number, it calls the function that already owns it and passes the number in. It does not reimplement it. The calls are:

- Attack and armor: `backend/blows.js` (`armorClass`, `characterAttackBonus`, `monsterAttackBonus`, `resolveAttack`, `characterDamageDice`).
- Death Ray roll, only after a target taken from the same rows the sheet uses: `backend/travel.js` `deathRaySave`. Do not use `marchPartySql`'s `ability_id = 5` lookup as the target source until that lookup is fixed on purpose.
- Sheet save targets, if a server route must show them: move `savingThrowTargets` to a shared module first. Do not paste the five-stat loop into the evaluator.
- Turn undead and surprise: `backend/encounterDice.js`.
- Light, rations, carry: `backend/body.js`.
- Clock: the existing tick route. Phase 4 may run narrative rules after a tick. It may not add a clock.

Preview and apply, when Phase 2 is approved, stay on campaign facts. A preview shows which facts would change and why. It does not offer a new armor class.

## Recommendation

Approve Phase 2 only as narrative bookkeeping for the wheel and the slab, on top of `playState.js`, with GM review as the default. Do not approve a ruleset composition change. Do not approve a mechanics pass in the same slice.

`npm run test:overlay` locks the four spells and two abilities. The pure checks that already lock the book numbers (`test:blows`, `test:travel`, the character and game-time checks) stay the regression net. A check that made the march lookup inherit the parent would be a mechanics fix. That fix does not belong to this gate.
