# Tracker

Status words: `todo`, `doing`, `done`, `cut`.

Play-loop files named in `ai/work.md` (`01-play-loop.md`, `03-later-procedures.md`, `04-gm-procedure.md`, `05-site-visit.md`, `06-visit-checks.md`, `07-room-flags.md`, `08-module-notes.md`) are not in this checkout.

## Campaign architecture plan

Source: `docs/plans/GeasGremlin_Cursor_Implementation_Plan_Revised.md`.

| Item | Status | Note |
|---|---|---|
| Phase 0 baseline and lifecycle guard | done | Conclude still wipes the playthrough. The route and body are unchanged. The Session card confirms on the page (`Conclude campaign`, then `Wipe this playthrough`). `window.confirm` does not show in the embedded browser. `npm run test:lifecycle` locks the statements. |
| Phase 1 state and run ownership | done | `campaign_id` owns `campaign_state_value`. Wheel starts blocked, slab starts in place, on the location card. Water flowing is derived and not stored. Conclude restores those two values and still wipes the rest of the playthrough. No `campaign_run_id`. Manual checks accepted 2026-10-30. Stopped before Phase 2. The work is uncommitted on `feature/review_feedback_changes`. |
| Ruleset assessment before Phase 2 | done | `docs/plans/ruleset-integration-assessment.md`. Enhanced stays one curated overlay on Core. Phase 2 may orchestrate campaign facts only. It must not reimplement book numbers or add a second parent. `npm run test:overlay` expects the four Enhanced spells and two abilities. |
| Phase 2 conditions and preview | done | One GM-confirmed preview. The wheel unblocked and Rising water still prepared asks to open that encounter. Apply uses the existing encounter open. Water flowing stays derived. No new rules table. `npm run test:play-state` passes. Stopped before Phase 3. |
| Phase 3 connections and discovery | done | The chalk door is a one-way path on `campaign_transition`. It starts secret and open. Finding it does not block it. Players do not receive an undiscovered exit. `npm run test:path-way` passes. Stopped before Phase 4. |
| Phase 4 stair hazard | todo | Handoff is below. One GM-confirmed damage on the existing Bad air encounter. Not started. |
| Phases 5–7 | todo | Not started. |

### Phase 0 note (what is true)

`POST /api/campaigns/:id/situation/end` and `POST /api/campaigns/:id/pause` only set `running` false. `POST /api/campaigns/:id/situation/conclude` (GM, via `withSituation`) runs `resetCampaignRun` and then sets `concluded` true and `running` false. `POST /api/campaigns/:id/start` clears `concluded` and does not restore deleted rows. There is no replay route.

Schema is `database/schema.sql` applied in place. No migration-version table. On 2026-10-30 the configured `geasgremlin` database was PostgreSQL 18.6, `campaign.concluded` existed, 3 campaigns (1 named Feature Walk), 0 concluded, 3 running. The feature-campaign seed was not run.

`npm run test:overlay` now expects the four Enhanced spells (Take Animal Form, Tree Form, Summon Weather, Animal Friendship) and the two abilities (Detect Traps, Control Animals). The old asserts of 0 spells and 0 abilities were stale.

### Ruleset assessment note (what is true)

Enhanced is one curated overlay on Core (`parent_ruleset` `Basic Fantasy Core`, `mechanic` `bfrpg`, one hop). Supplements are the contents of that ruleset, not a picker. The contract is `docs/plans/ruleset-integration-assessment.md`. Phase 2, when approved, writes the existing wheel and slab facts through `playState.js` and does not calculate armor class, attacks, saves, spell slots, or the clock. `npm run test:overlay` expects the four Enhanced spells and two abilities.

### Phase 2 note (what is true)

One preview, not a rules table. `risingWaterPreview` in `backend/playState.js` proposes opening the encounter titled Rising water when the wheel is unblocked, that encounter is still `prepared`, its kind is `environment`, and it has no members. The slab is not read. Water flowing stays the derived value in that module and is not stored. Apply is `POST /api/campaigns/:id/adventuring/preview/apply`. It locks the wheel, checks the preview again, and calls `openPreparedEncounter` in `backend/preparedEncounter.js`, the same function as `POST /api/campaigns/:id/situation/encounters/:encounterId/open`. An environment with no members does not start a fight. A second apply changes nothing. Reject is `POST /api/campaigns/:id/adventuring/preview/reject` and writes nothing. Putting the bone back leaves the encounter opened. The Location tab shows the question beside the object facts, or under the selected place when that place has none. Leave it hides the question until the wheel is blocked and freed again. A reload asks again, because the decline is not stored. Players do not receive the proposal. `npm run test:play-state` rolls back its own campaigns. `npm run test:overlay` still expects the four Enhanced spells and two abilities.

On 2026-10-30, after this change, Feature Walk (id 21) was still running and not concluded. Millbridge (location 62) was selected. The wheel was blocked and the slab was in place, both at version 1. Rising water (id 28) was environment, prepared, and had no members. Campaigns `test` (id 9) and `Core` (id 10) were running, not concluded, and had no fact rows. The feature-campaign seed was not run. Those rows were not wiped.

### Phase 3 note (what is true)

The path row is the path. `discovered` and `base_discovered`, and `blocked` and `base_blocked`, are columns on `campaign_transition`. There is no second path table. An ordinary path stays known and open. The chalk door from Cistern Heart to Cistern Gate is one way, starts undiscovered, and starts open. Marking it found writes one discovery line and leaves `blocked` alone. Doing that again writes nothing. Blocking it does not hide it again. A known open path is taken with Go To and writes no log line. A secret or blocked path refuses that take. Go anyway still arrives and writes a decision. A one-way path still has no way back. The player view at `GET /api/campaigns/:id/here` lists a known exit's destination, reason, and whether it is blocked. An undiscovered path is left out, including its destination. The gate does not list the chalk door. Concluding restores both columns from their base values and does not delete the row. `npm run test:path-way` rolls back its own campaign.

On 2026-10-30, after this change, Feature Walk (id 21) was still running and not concluded. Millbridge (location 62) was selected, outside. The chalk door (transition 13) was one way, undiscovered, and open, both base columns false. The other six paths were known and open. The log was empty. The wheel was blocked and the slab was in place. Rising water was prepared. The feature-campaign seed was not run.

### Next session — Phase 4 handoff

Phase 3 is done. Do not start Phase 5 from this note.

Phase 4 is one GM-confirmed damage for a turn of searching the stair. The walkthrough is the rule. The plan's Situation model is not, and the matrix row that asks for a roll is not. `docs/campaign-feature-walkthrough.md` says open the existing Bad air encounter when they search the flight. The seed line on that encounter says each turn they search there costs 1 damage unless they retreat for a turn first, and it says not to roll and not to set a flag. Rising water stays the Phase 2 preview. Do not turn it into a situation.

- Bad air is the prepared hazard at Cistern Stair. Read that row again before relying on it. It has no members. Opening it uses `openPreparedEncounter` in `backend/preparedEncounter.js`, the same function as `POST /api/campaigns/:id/situation/encounters/:encounterId/open`. A hazard with no members does not start a fight. The GM opens it when they search. The clock does not open it.
- The clock stays `campaign_board.game_seconds`. There is no second clock. The only trigger is `POST /api/campaigns/:id/adventuring/tick` with `step` `turn`, while the selected location is that stair, `in_encounter` is false, and Bad air is `opened`. A round, a watch, and a day do not propose it. One watch click is not 24 search damages. A turn while the encounter is still `prepared` or `resolved`, or while the party is on another place, proposes nothing. Wander checks and the visit check on that same tick stay as they are. Do not skip them and do not run them twice.
- The proposal is 1 damage, not a die. Show it on the Location tab the way Rising water is shown. Apply calls `writeCharacterHitPoints` in `backend/server.js` with delta `-1` and note `bad air`, once for each character in the campaign whose current hit points are above 0. Hit points live on the character. The line names no single victim, so the point lands on each of those characters. It does not damage creatures or hirelings. It does not roll. Reject writes nothing, including no hit-point row and no log line. The turn has already moved. That declined turn is the retreat. Do not store the decline and do not add a retreat checkbox. The next turn on the stair asks again.
- Apply is idempotent for that `game_seconds`. Doing it again for the same turn changes nothing. A later turn can ask again. A log line at that clock value is enough to recognize the turn. Opening the encounter does not itself deal the damage. Leaving the stair does not resolve the encounter. Resolving it is the existing resolve button, and then the tick stops asking. The question is raised by the turn tick and held on the page until apply or leave-it. A reload drops an unanswered question. It does not deal the damage, and it does not invent a search the tick did not just take.
- Players do not receive the proposal. Applied damage stays on the character sheet. Conclude already restores the encounter to its base status and deletes the log. It must not refund those hit points.

Do not add `campaign_situation`, `campaign_run_id`, `campaign_automation_rule`, or a JSON rules language. The encounter status is the situation. One preview and the existing hit-point write are the slice. Do not copy the clock, clues, objectives, encounters, paths, or room flags into another table. Do not calculate armor class, attacks, saves, spell slots, or the clock. Do not re-run the feature-campaign seed against the live database. Do not wipe Feature Walk to test. Tests roll back their own campaigns.

The diff is uncommitted on `feature/review_feedback_changes`. `npm run test:play-state`, `npm run test:path-way`, `npm run test:wander`, and `npm run test:overlay` still have to pass. The new check rolls back its own campaign.

The WIP stack is `docker compose` from the repo root: http://localhost:8150 and http://192.168.20.146:8150. It uses the existing `geasgremlin` database. Accepting **Wipe this playthrough** deletes that campaign's live playthrough. The conclude warning is on the page (`Conclude campaign`, then `Wipe this playthrough`) because `window.confirm` does not show in the embedded browser. A frontend change needs `docker compose up -d --build frontend` and a browser refresh. A backend change needs the same for `backend`.

At the last read, Feature Walk (id 21) was running and not concluded. Millbridge (location 62) was selected, outside. The chalk door (transition 13) was one way, undiscovered, and open. The wheel was blocked and the slab was in place. Rising water was prepared. The log was empty. Campaigns `test` (id 9) and `Core` (id 10) were running and not concluded. Read those rows again before writing.

### Next session — Phase 2 handoff

This handoff was followed. Phase 2 is done. Do not start Phase 3 from this note.

Phase 2 is one GM-confirmed preview for the water puzzle. The walkthrough is the rule. The plan's example matrix is not. `docs/campaign-feature-walkthrough.md` says open the existing Rising water encounter once the wheel is free. The seed line on Cistern Heart says water reaches town only after both the bone and the slab are dealt with. Those are two different facts.

- `waterwheel` / `blocked` starts true. `burial_slab` / `removed` starts false. Writes stay on `backend/playState.js`, with the expected version. `campaign_id` is the only owner.
- Water flowing stays derived in `playState.js`: true only when the wheel is unblocked and the slab is removed. It is not a row and not a checkbox.
- When a preview sees the wheel unblocked and the encounter named Rising water still `prepared`, it proposes opening that encounter. The slab does not gate this. Clearing the slab first still proposes the open when the wheel is later unblocked.
- Apply uses the same status change as `POST /api/campaigns/:id/situation/encounters/:encounterId/open`. Rising water is kind `environment` with no members, so the open must not start a fight. A second apply is a no-op. Re-blocking the wheel does not resolve the encounter. The walkthrough does not say to.
- GM review is required. A rejected preview writes nothing.

Do not add `campaign_run_id`, `campaign_situation`, `campaign_automation_rule`, or a JSON rules language. One pure check and the existing encounter open are the slice. A second rule is what would justify a table. Do not copy the clock, clues, objectives, encounters, or room flags into another table. Do not calculate armor class, attacks, saves, spell slots, or the clock. Do not add a ruleset parent or a supplement composer. Do not re-run the feature-campaign seed against the live database. Confirm the Rising water row is already there before relying on it.

The diff is uncommitted on `feature/review_feedback_changes`. `npm run test:overlay` passes and locks the four Enhanced spells and two abilities. `npm run test:play-state` rolls back its own campaigns.

The WIP stack is `docker compose` from the repo root: http://localhost:8150 and http://192.168.20.146:8150. It uses the existing `geasgremlin` database. Accepting **Wipe this playthrough** deletes that campaign's live playthrough, and it also puts the wheel and slab back to their authored values. The conclude warning is on the page (`Conclude campaign`, then `Wipe this playthrough`) because `window.confirm` does not show in the embedded browser. A frontend change needs `docker compose up -d --build frontend` and a browser refresh. A backend change needs the same for `backend`.

At the last handoff, Feature Walk (id 21) was running and not concluded, with no place selected. The wheel was blocked and the slab was in place, both at version 1. Campaigns `test` (id 9) and `Core` (id 10) were running, not concluded, and had no fact rows. Read those rows again before writing. Do not wipe Feature Walk to test.

### Phase 1 note (what is true)

`campaign_id` is the only playthrough owner. `campaign_state_value` stores object `waterwheel` / `blocked` (authored true) and object `burial_slab` / `removed` (authored false). The unique key is `(campaign_id, subject_type, subject_key, state_key)`. There is no `campaign_run_id`. Water flowing is calculated when both rows exist and is not stored. The GM reads and writes them at `GET` and `POST /api/campaigns/:id/adventuring/state`, and the location card on Home shows the checkbox for the selected place. A matching value does not write a second log line. A stale version is refused. Players do not receive the rows. `npm run test:play-state` rolls back its own campaigns.

On 2026-10-30 the live `geasgremlin` database gained those two rows on Feature Walk only, at the authored values. The other campaigns had neither location name, so they gained no rows. At handoff, Feature Walk (id 21) is running and not concluded, with no place selected. The wheel is blocked and the slab is in place, both at version 1. Campaigns `test` (id 9) and `Core` (id 10) are running, not concluded, and have no fact rows.

These stay the authoritative facts: `campaign_board.game_seconds` (no separate combat-round counter), `campaign_clue.discovered` / `base_discovered`, `campaign_objective.known` / `base_known`, `campaign_encounter.status` / `base_status`, open fight as `campaign_board.in_encounter` plus `campaign_creature.in_fight`, paths as `campaign_transition` rows (`discovered` / `base_discovered` and `blocked` / `base_blocked` on that row), room notes as `campaign_location_flag` (`sprung`, `taken`, `found` only). Do not copy those into a second table.
