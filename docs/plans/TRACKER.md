# Tracker

Status words: `todo`, `doing`, `done`, `cut`.

Play-loop files named in `ai/work.md` (`01-play-loop.md`, `03-later-procedures.md`, `04-gm-procedure.md`, `05-site-visit.md`, `06-visit-checks.md`, `07-room-flags.md`, `08-module-notes.md`) are not in this checkout.

## Campaign architecture plan

Source: `docs/plans/GeasGremlin_Cursor_Implementation_Plan_Revised.md`.

| Item | Status | Note |
|---|---|---|
| Phase 0 baseline and lifecycle guard | done | Conclude still wipes the playthrough. The route and body are unchanged. The Session card confirms on the page (`Conclude campaign`, then `Wipe this playthrough`). `window.confirm` does not show in the embedded browser. `npm run test:lifecycle` locks the statements. |
| Phase 1 state and run ownership | todo | Approved. Next session implements Phase 1 only, using the ownership note below. Stop before Phase 2. |
| Ruleset assessment before Phase 2 | todo | Not started. `npm run test:overlay` already fails on this checkout. |
| Phases 2–7 | todo | Not started. |

### Phase 0 note (what is true)

`POST /api/campaigns/:id/situation/end` and `POST /api/campaigns/:id/pause` only set `running` false. `POST /api/campaigns/:id/situation/conclude` (GM, via `withSituation`) runs `resetCampaignRun` and then sets `concluded` true and `running` false. `POST /api/campaigns/:id/start` clears `concluded` and does not restore deleted rows. There is no replay route.

Schema is `database/schema.sql` applied in place. No migration-version table. On 2026-10-30 the configured `geasgremlin` database was PostgreSQL 18.6, `campaign.concluded` existed, 3 campaigns (1 named Feature Walk), 0 concluded, 3 running. The feature-campaign seed was not run.

Pre-existing check failure left as-is: `npm run test:overlay` expects Enhanced to keep 0 spells and 0 abilities; this tree keeps 4 spells (Take Animal Form, Tree Form, Summon Weather, Animal Friendship) and 2 abilities.

### Next session

Start at Phase 1 in `docs/plans/GeasGremlin_Cursor_Implementation_Plan_Revised.md`. Branch `feature/review_feedback_changes`. The WIP stack is `docker compose` from the repo root: http://localhost:8150 and http://192.168.20.146:8150. It uses the existing `geasgremlin` database. Accepting **Wipe this playthrough** deletes that campaign's live playthrough. A frontend change needs `docker compose up -d --build frontend` and a browser refresh.

### Phase 1 ownership (approved, not implemented)

Keep `campaign_id` as the only playthrough owner. A campaign row is both the authored definition and the single run. Do not add `campaign_run_id` until Phase 5. New runtime rows, if approved, use `campaign_id` plus a uniqueness key that can later gain `campaign_run_id` without sharing state across campaigns.

Leave these as the authoritative facts: `campaign_board.game_seconds` (no separate combat-round counter), `campaign_clue.discovered` / `base_discovered`, `campaign_objective.known` / `base_known`, `campaign_encounter.status` / `base_status`, open fight as `campaign_board.in_encounter` plus `campaign_creature.in_fight`, paths as `campaign_transition` rows (no hidden or blocked column), room notes as `campaign_location_flag` (`sprung`, `taken`, `found` only). Do not copy those into a second table. `campaign_location_flag` cannot store `waterwheel.blocked` without overloading that enum.
