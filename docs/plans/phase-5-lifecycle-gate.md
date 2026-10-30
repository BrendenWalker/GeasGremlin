# Phase 5 lifecycle gate

Design gate for Phase 5 of `docs/plans/GeasGremlin_Cursor_Implementation_Plan_Revised.md`. Written 2026-10-30 from this checkout and a read of the live `geasgremlin` database. The log-archive slice below was approved and added the same day. No `campaign_run_id`.

## Decision

The campaign row stays the playthrough. The authored default stays the `base_*` column on the same row. Conclude already copies those columns back and then deletes the log.

The gap is that deletion. After conclude, that play's history is gone, and the clock is 0 again, so a later play cannot share the same log table without mixing two clocks.

The slice, when approved, copies `campaign_log` into one new archive table inside the existing conclude transaction, then runs today's wipe unchanged. It does not add `campaign_run_id`. It does not fork locations, paths, encounters, clues, or character sheets. It does not restore hit points.

Phases 6 and 7 are not part of this slice.

## What was inspected

- `backend/campaignLifecycle.js` (`RESET_STEPS`, `PRESERVED_TABLES`, `resetCampaignRun`, `endCampaignSession`, `concludeCampaignRun`).
- Routes in `backend/server.js`: `POST /api/campaigns/:id/start`, `POST /api/campaigns/:id/pause`, `POST /api/campaigns/:id/situation/end`, `POST /api/campaigns/:id/situation/conclude`. Conclude and end go through `withSituation` (GM, one transaction).
- Session card in `frontend/src/pages/AdventuringPage.jsx` and the copy in `frontend/src/domain/concludeConfirm.mjs`.
- `database/schema.sql` for `campaign_log` and the dropped `campaign_situation` tables. There is no migration-version table. Schema is applied in place.
- `database/DATA_MODEL.md` campaign section.
- Live rows on 2026-10-30. PostgreSQL 18.6. The feature-campaign seed was not run. Nothing was wiped.

## Three operations

| Action | Route | What it writes |
|---|---|---|
| Start session | `POST /api/campaigns/:id/start` | GM: `running = true`, `concluded = false`. Does not restore deleted rows. A non-GM joins only when the campaign is already running. |
| End session | `POST /api/campaigns/:id/situation/end` | `running = false`. Leaves `concluded` and every play row. |
| Pause from the hub | `POST /api/campaigns/:id/pause` | GM: `running = false`. Same pause, different route. |
| Conclude | `POST /api/campaigns/:id/situation/conclude` | `resetCampaignRun`, then `concluded = true`, `running = false`. |

There is no replay route. The Session card asks on the page (`Conclude campaign`, then `Wipe this playthrough`) because `window.confirm` does not show in the embedded browser.

`docs/plans/04-gm-procedure.md` is not in this checkout. `ai/work.md` still names it. The code above is the contract.

## What conclude restores

In-place updates, same row, same `campaign_id`:

- `campaign_creature`: `hp = base_hp`, `disposition = base_disposition`, `in_fight = false`
- `campaign_encounter`: `status = base_status`
- `campaign_clue`: `discovered = base_discovered`
- `campaign_objective`: `known = base_known`, `status = base_status`
- `campaign_board`: clock 0, `in_encounter` false, `place` outside, selected location cleared, visit stamps cleared
- `campaign_location`: `arrived_seconds` cleared
- `campaign_state_value`: `value_json = base_value_json`, version 1. The row stays.
- `campaign_transition`: `discovered` and `blocked` from their base columns. The row stays.
- `campaign_character`: hunger, thirst, forced march, and hire penalty cleared

## What conclude deletes

`campaign_wander`, `campaign_log`, `campaign_mark`, `campaign_turn_block`, `campaign_presence`, `campaign_location_flag`, `campaign_command`, `campaign_hireling`.

## What conclude leaves

The campaign, membership, locations, paths, NPCs, shops, encounter rows, clues, objectives, creatures, object-fact rows, and the ruleset.

Character sheets stay: maximum hit points, XP, gold, items, spells, and `character_effects`. Bad air damage is an HP effect with note `bad air`. Phase 4 required that conclude not refund it. This gate keeps that.

`schema.sql` already dropped `campaign_situation`. Do not bring it back as the run model.

## Where definition and play still share a row

That sharing is the current design, and this slice leaves it.

- A new path, clue, objective, or encounter inserts the submitted value into both the play column and the base column. A row added during play becomes part of the default the next wipe restores.
- A patch of `discovered` or `blocked` writes the play column only. Conclude puts the base back.
- The first creature total writes `hp` and `base_hp`. Later damage writes `hp` only. An in-fight edit can write `base_hp` again (`writeHitPoints` in `backend/server.js`).
- Deleting a location, path, or encounter deletes the default. Conclude cannot recreate it.

## Live rows at this reading

Do not wipe these. Do not re-run the feature-campaign seed.

| Campaign | Running | Concluded | Clock | Place |
|---|---|---|---|---|
| `test` (id 9) | yes | no | 16200 | none selected |
| `Core` (id 10) | yes | no | 119520 | none selected |
| Feature Walk (id 21) | yes | no | 2400 | Cistern Stair (location 65), inside |

Feature Walk only: wheel blocked and slab in place, both version 1. Rising water (id 28) is environment, prepared, no reliance on members in this read. Bad air (id 26) is hazard, opened, base status prepared. The chalk door (transition 13) is one way, undiscovered, and open. The log has two consequence lines, at 1200 and 1800, both `Bad air costs 1 damage.` Characters 8–11 each have three HP effects noted `bad air`, value -1. `test` and `Core` have no object-fact rows and no log rows. Their clocks are not zero.

The Phase 4 handoff (Millbridge, clock 0, empty log, Bad air prepared) is no longer the live campaign.

## Proposed slice, after approval

One table, created in `database/schema.sql` the same way `campaign.concluded` was added. No migration-version table, so there is no down migration. Dropping the table is the reverse. Existing campaigns gain no rows until the next conclude. No backfill.

```text
campaign_log_archive (
  id,
  campaign_id,
  play_no,
  at_seconds,
  location_id,
  kind,
  body,
  archived_at
)
```

`play_no` is one greater than the highest `play_no` already stored for that campaign, starting at 1. `location_id` is copied as a number and has no foreign key, so a later delete of the place does not change the archive. Kind stays `decision`, `consequence`, or `discovery`.

`concludeCampaignRun` inserts those copies, then calls `resetCampaignRun`, then sets `concluded`. One transaction, same as today. An empty log inserts nothing. The wipe still runs.

`POST /api/campaigns/:id/situation/conclude` keeps its name, its GM check, and its response (`running` false, `concluded` true). The Session card keeps the two-step confirmation. Start, pause, and end session stay as they are.

A GM read of past plays is a later route on that table. It is not in this slice. Players do not receive the archive. The archive is not loaded back into the live log. A new playthrough is the same campaign after the wipe.

`npm run test:lifecycle` keeps its current asserts and gains one: the archive insert is in `concludeCampaignRun`, before `resetCampaignRun`. A DB-backed check rolls back its own campaign, copies a log line, concludes, and reads the copy after the live log is gone. `npm run test:play-state`, `npm run test:path-way`, `npm run test:bad-air`, `npm run test:wander`, and `npm run test:overlay` still have to pass.

## Left out on purpose

- `campaign_run_id` on the live tables, and a second copy of locations, paths, encounters, clues, the clock, or object facts.
- Archiving wander rows, marks, room flags, commands, presence, or hirelings. Those are scratch. The log is the history the walkthrough keeps.
- Copying `character_effects` into the archive. The sheet already keeps them, and conclude must not refund them.
- A replay that writes an archive back onto the live rows.
- Freezing `base_*` against edits made during play.
- Phases 6 and 7.

## Applied

`campaign_log_archive` is in `database/schema.sql` and was created on the live `geasgremlin` database. `concludeCampaignRun` locks the campaign row, copies the log, then runs `resetCampaignRun`. `npm run test:lifecycle` rolls back its own campaigns. Feature Walk was not concluded. There is still no route that reads the archive.
