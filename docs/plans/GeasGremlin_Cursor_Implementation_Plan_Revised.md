# GeasGremlin — Consolidated Campaign Architecture Implementation Plan (Revised)

**Audience:** Cursor coding agent and project maintainer  
**Status:** Proposed implementation plan; not an authorization to perform an unreviewed wholesale rewrite  
**Scope:** Campaign content, runtime state, narrative causality, authoring UX, lifecycle safety, and ruleset integration validation. Preserve the Basic Fantasy RPG (Core/Enhanced) rules infrastructure.

**Source:** Consolidates the original architecture review, the campaign resource design, the first Cursor plan, and the subsequent gap analysis. Findings from static inspection are hypotheses to verify against the current checkout; this is not a claim of completed integration testing.

## 0. Instructions to Cursor

Implement this as **small, reviewable, test-backed vertical slices**, not a single refactor. Before coding:

1. Read `AGENTS.md`, `CLAUDE.md`, `ai/README.md`, `ai/repository.md`, `ai/rulesets.md`, `ai/work.md`, and `docs/plans/TRACKER.md` in the *current checkout*. Follow their instructions over assumptions in this document.
2. Inspect the actual schema, API handlers, frontend components, existing tests, and seed scripts. This plan was prepared from a repository snapshot; names and implementation details may have changed.
3. Produce a brief inventory mapping the proposed concepts to existing tables, routes, modules, and UI. Identify reusable behavior before introducing anything new.
4. Complete **Phase 0** first: inventory, baseline validation, and destructive-operation safeguards. Do not silently fix unrelated failures.
5. Implement **Phase 0 only** initially, report results, and request approval before Phase 1. Repeat the approval gate for every phase.
6. Complete the **ruleset integration assessment before Phase 2**. Do not implement a second mechanics engine in campaign automation.
7. Do not delete or reinterpret existing campaign records, change the meaning of `conclude`, or migrate historical state without an explicit, tested migration and user approval.

### Non-goals

- No microservices, generic graph database, general scripting language, arbitrary JavaScript in campaign data, or complete RPG engine rewrite.
- No requirement to implement multi-ruleset composition beyond the current Core/Enhanced design; **assessment and documented decision are required**, but a redesign is not.
- No forced plot progression or assumption that players complete encounters in an authored order.
- No attempt to model every descriptive prop as a persisted resource.

## 1. Product goals and architectural invariants

GeasGremlin should make it easy for a GM to answer: **What exists here? What's happening and why? What changes if the players act unexpectedly?** It should automatically manage deterministic bookkeeping and offer GM-visible, overridable narrative consequences.

Preserve these distinctions:

| Concept | Meaning | Example |
|---|---|---|
| Definition | Authored possibility | A door connects Gate and Heart |
| Runtime state | What is true in this playthrough | Door discovered but still locked |
| Event occurrence | What happened | Party discovered the door on turn 12 |
| Situation | Ongoing or potential circumstance | Water is rising in the lower passage |
| Thread | GM's narrative organizing lens | Millbridge water crisis |
| Knowledge | Who knows a fact | Party knows the secret door exists |

**Invariants:** Every persistent resource has a stable ID; ruleset catalogs are not duplicated into campaign instances unnecessarily; campaign data cannot execute arbitrary code; every state-changing action is authorized and auditable; derived values are not stored as independent truth without a clear reason; GM overrides are possible and logged; all automation is bounded, deterministic where possible, and safe to retry.

## 2. Proposed bounded contexts (logical, not services)

1. **Rules** — existing rulesets, catalog definitions, modifiers, calculations; remain ruleset-owned.
2. **Content** — authored places, connections, actors, objects, situations, clues/facts, threads, triggers.
3. **Run** — a particular playthrough: clock, positions, resource state, active situations, knowledge, party.
4. **Events** — recorded occurrences, causation, applied effects, GM overrides.
5. **Presentation** — GM world/story/resource/automation/play views and permission-filtered player views.

Prefer strongly typed domain records and explicit foreign keys. A common resource identifier/reference format is useful; a universal `resource(type, json)` table is **not** the recommended default.

### Core resource vocabulary

- **Place / Location:** containment hierarchy (`parent_location_id`) distinct from movement connections. Reuse `campaign_location` where practical.
- **Connection:** directed/bidirectional navigation between locations; authored existence distinct from discovered/usable state. Reuse or evolve `campaign_transition`.
- **Actor:** stable individual identity, distinct from creature/stat-block template; reuse existing character, NPC, creature, and hireling models. Avoid merging them prematurely.
- **Object:** tracked interactable (wheel, slab, chest, door), not every prose detail. Introduce only where an explicit object is needed for interactions/state.
- **Situation:** persistent circumstance with activation/resolution semantics; combat encounters can reference situations without immediately being replaced.
- **Fact/Knowledge:** world truth and who has learned it; start with party-level knowledge and existing clues, not a universal epistemic graph.
- **Event:** immutable occurrence record plus controlled effects.
- **Thread:** optional GM-only grouping of related resources and possible outcomes; **organizational**, not executable logic.

### Suggested minimal persistence additions

Names are illustrative; Cursor must reconcile with current schema and migration conventions.

```text
campaign_state_value
  id, campaign_id [or run_id when available], subject_type, subject_id,
  key, value_json, version, updated_at
  UNIQUE(scope, subject_type, subject_id, key)

campaign_event_occurrence
  id, campaign_id [or run_id], event_type, source_type, source_id,
  actor_id nullable, payload_json, campaign_time, created_at,
  idempotency_key UNIQUE within run, caused_by_event_id nullable

campaign_automation_rule
  id, campaign_id, name, enabled, trigger_type, trigger_json,
  condition_json, effects_json, approval_mode, priority

campaign_situation [later phase]
  id, campaign_id, name, description, gm_notes, location_id nullable,
  authored_status/default_status, activation_json nullable

campaign_thread [later phase]
  id, campaign_id, title, premise, gm_notes
campaign_thread_resource [later phase]
  thread_id, resource_type, resource_id, role
```

Use proper JSON constraints and application validation; prefer `JSONB` if PostgreSQL is the active datastore. Validate referenced IDs and ownership rather than trusting a polymorphic reference blindly. For commonly queried relationships, prefer typed foreign keys or explicit join tables. If state scope is ambiguous, resolve it in the design note **before** migration.

## 3. Conditions, effects, and execution semantics

Implement a **versioned, declarative DSL** with a small allowlist. No `eval`, arbitrary SQL, or user-provided code.

Example (illustrative):

```json
{
  "version": 1,
  "trigger": {"type": "state_changed", "subject": "object:waterwheel", "key": "blocked"},
  "when": {"all": [
    {"type": "state_equals", "subject": "object:waterwheel", "key": "blocked", "value": false},
    {"type": "state_equals", "subject": "object:burial_slab", "key": "removed", "value": false}
  ]},
  "effects": [
    {"type": "set_state", "subject": "situation:rising_water", "key": "active", "value": true},
    {"type": "notify_gm", "message": "Water begins rising in the lower passage."}
  ],
  "approval": "gm_review"
}
```

**Initial conditions:** `state_equals`, `state_compare` for numbers, `known_by_party`, `situation_status`, and nested `all`/`any`/`not`. **Initial effects:** `set_state`, `activate_situation`, `resolve_situation`, `reveal_fact`, `notify_gm`. Add `move_actor`, scheduling, and connection changes only when a tested use case requires them.

**Execution contract:**

1. A command validates permissions, expected state version, and resource references.
2. Evaluate applicable rules against a consistent snapshot; generate a **preview** with proposed changes, notifications, and explanation of why each rule matched.
3. If `gm_review`, require explicit confirmation. If deterministic and configured for auto-apply, commit without confirmation.
4. Apply the command, resulting state mutations, and event record **atomically** in one database transaction.
5. Use an idempotency key to prevent duplicate application on retries. Specify deterministic rule order; cap chain depth/number of effects; detect self-triggering loops and reject unsafe rules.
6. Log the initiating actor, event, matched rule, approved/modified/skipped effects, and resulting state versions. Re-evaluate stale previews on confirmation rather than applying blindly.
7. A GM override is a normal audited command, not an untracked direct database edit.

Do **not** make the event log the sole source of truth or promise full event sourcing. Persist current state directly; use the log for history/audit and debugging.

## 4. Phased delivery

### Phase 0 — Baseline verification and lifecycle safety (required first)

**Goal:** Verify the review findings in the current checkout, protect existing campaign data, and establish an executable baseline before adding new state.

Tasks:

- Inspect the actual `conclude`/reset routes, `resetCampaignRun()` (if still present), callers, database mutations, and UI wording. Produce an exact list of what is reset, deleted, or preserved; distinguish session end, campaign conclusion, and scenario replay.
- Capture current test results, schema/migration version, seed results, and a manual or automated walkthrough smoke test. Record pre-existing failures rather than hiding them.
- Add regression tests that document the current lifecycle behavior and its destructive consequences.
- Make destructive reset/replay intent unmistakable in the UI, with an explicit confirmation describing affected data. Protect the endpoint with existing authorization and prevent accidental invocation. Do **not** silently change the existing API contract or delete data to test it.
- Decide whether the safest short-term measure is renaming UI actions, adding an explicit reset command, or guarding legacy `conclude`; present compatibility tradeoffs for approval before changing semantics.
- Record authoritative owners of state, time, clues, encounters, and paths. Identify which original review claims are confirmed, superseded, or unverified.

**Acceptance:** Baseline is reproducible; reset is visibly destructive and guarded; existing campaigns remain readable; test coverage documents lifecycle behavior; no migration or data loss is required for this phase.

**Gate:** Present findings, exact safety changes, baseline test report, and proposed Phase 1 state ownership design. Stop for approval.

### Cross-cutting design constraint — Run ownership from Phase 1

Every new runtime state or event record must have a clear **playthrough owner**. If the current `campaign_id` conflates definition and run, use a documented temporary mapping or compatible owner abstraction that can migrate to `campaign_run_id` in Phase 5. Do not assume `campaign_id` permanently means a reusable definition. Document keys, uniqueness constraints, API ownership, authorization, and migration mapping **before** creating new tables. Runtime state must never be shared accidentally across two playthroughs. Avoid introducing a second authoritative copy of the same fact.

### Ruleset integration assessment — required gate before Phase 2

Inspect existing Core/Enhanced ruleset inheritance, override precedence, resolution of mechanical modifiers, time-based mechanics, and supplement interaction. Trace how combat, conditions, resources, and turn advancement are currently calculated. Document whether Enhanced is a **curated fixed ruleset** or whether independently composable supplements are a product requirement. Identify conflicts, ambiguity, or duplicated calculations; add focused regression tests where needed. The campaign condition/effect evaluator should **orchestrate state and call existing ruleset services**, not reimplement AC, attack modifiers, saving throws, resource consumption, or other mechanics. Deliver an interface contract and recommendation; **do not** broaden scope to generic ruleset composition without separate approval.

**Completed 2026-10-30.** The record is `docs/plans/ruleset-integration-assessment.md`. Enhanced stays one curated overlay. Phase 2 is narrative facts only, through `playState.js`. No composition redesign. `npm run test:overlay` locks the four Enhanced spells and two abilities. Phase 2 is not approved by that record.

### Phase 1 — Inventory, state foundation, and one end-to-end use case

**Goal:** Represent the walkthrough waterwheel/slab truth explicitly without disturbing existing encounter flows.

Tasks:

- Map existing `campaign_location_flag`, encounter statuses, clue/objective state, `campaign_log`, `campaign_transition`, and any other state mechanisms. Document what remains authoritative.
- Define run/playthrough ownership and migration mapping as described above; ensure isolation is tested even if the current schema only has `campaign_id`.
- Add a typed state access layer (e.g. `getState`, `setState` with validated scope, subject, key, and expected version). Reuse existing tables if they can satisfy the contract; otherwise add a migration for a narrowly scoped state table.
- Seed explicit state for `waterwheel.blocked`, `burial_slab.removed`, and optionally `water_flowing` **only if it is not better derived** from other facts. Avoid contradictory duplicated truth.
- Expose GM-only read/write commands with audit trail. Integrate with current auth conventions.
- Display the state on the existing GM walkthrough/location screen; avoid a large new editor at this stage.
- Add tests for persistence, reload, isolation between campaigns, invalid references, authorization, and concurrent updates.

**Acceptance:** The GM can mark the wheel unblocked and slab removed; values persist across reloads; a second campaign remains unaffected; the original walkthrough still works; existing encounter and combat behavior is unchanged.

**Gate:** Present schema diff, API changes, tests, and screenshots/description of UI; complete and review the ruleset integration assessment before approval for Phase 2.

### Phase 2 — Declarative conditions, effects, and preview/apply

**Handoff:** `docs/plans/TRACKER.md`, next-session note. The walkthrough wins where the example matrix below disagrees. Water flowing stays derived. The slice is a GM-confirmed open of the existing Rising water encounter when the wheel is unblocked. No new rules table.

**Goal:** Eliminate manual bookkeeping for the walkthrough's causal water puzzle.

Tasks:

- Define JSON schema/validators and a pure condition evaluator with unit tests.
- Implement a rule evaluator that produces proposed effects without mutating state.
- Add preview/confirm API and a GM review UI showing source, matched conditions, changes, and notifications.
- Add atomic application, idempotency, concurrency checking, bounded chaining, and audit records.
- Encode the walkthrough, not the old example matrix: the wheel unblocked and Rising water still prepared asks the GM to open that encounter. The slab does not gate the prompt. Water flowing stays derived, true only when the wheel is unblocked and the slab is removed. Re-blocking the wheel does not resolve the encounter. Verify both action orders, including slab-first.
- Make repeated application a no-op; handle re-blocking/replacing only if explicitly supported by the authored scenario.

**Acceptance:** Both action orders produce coherent state; repeated commands cannot duplicate consequences; preview can be rejected or adjusted; the log explains what happened; no scripts are embedded in campaign content.

### Phase 3 — Connections and discovery

**Goal:** Fix secret passage semantics without confusing hidden with blocked.

Tasks:

- Extend existing transition/path handling with separate **existence**, **knowledge/discovery**, and **accessibility** concepts.
- Define a GM override for travel through a hidden or blocked path, with logging.
- Ensure player-facing endpoints never reveal undiscovered exits or their destinations.
- Seed Heart↔Gate secret connection as initially undiscovered; discovery reveals it without automatically changing its physical accessibility.
- Test both directions, GM vs player visibility, access changes, and compatibility with ordinary paths.

**Acceptance:** Players cannot see/traverse the secret route before discovery under normal play; the GM can inspect and override; existing non-secret paths work unchanged.

### Phase 4 — Situations, time, and environmental automation

**Handoff:** `docs/plans/TRACKER.md`, next-session note. The walkthrough wins where this section asks for a Situation model or a damage roll. The slice is a GM-confirmed 1 damage when a turn is spent searching the stair while the existing Bad air encounter is opened. Rising water stays the Phase 2 preview. No new situation table. No second clock.

**Goal:** Make non-combat circumstances first-class without destabilizing combat encounters.

Tasks:

- Add a minimal `Situation` model: identity, optional location, participants/references, status, notes, activation/resolution conditions.
- Relate existing encounters to situations only where needed; **do not bulk-convert all encounters**.
- Support rising water as a situation and bad air as a time-related hazard.
- Integrate with existing campaign time/turn advancement and wandering-monster logic rather than adding a second clock.
- Define when repeated effects fire (once on activation, once per exploration turn, etc.); guard against double advancement and repeated API calls.

**Acceptance:** Advancing a turn triggers eligible hazards exactly once, displays proposed consequences where GM approval is required, and does not break existing wandering encounter checks or combat timing.

### Phase 5 — Campaign definitions, runs, and lifecycle

**Goal:** Separate authored content from an actual playthrough, preserving history.

**Design gate first:** Inventory all current reset/conclude behavior, mutable fields embedded in definitions, references, and downstream consumers. Propose migration and compatibility strategy for review **before writing schema changes**.

Tasks after approval:

- Introduce a stable definition/run boundary; prefer incremental table evolution or overlays over duplicating every resource.
- Ensure run-scoped state, knowledge, clock, and event history do not mutate reusable authored defaults.
- Separate `end session`, `conclude campaign`, and `reset/new playthrough` semantics.
- Preserve the old `conclude` behavior behind a clearly named, explicitly confirmed compatibility operation until clients and data have migrated; do not silently change its meaning.
- Provide a tested path for existing campaigns, including backup/rollback and repeatable migration.

**Acceptance:** A completed run retains history; a new run starts from authored defaults; old campaign data remains readable; destructive reset requires explicit confirmation; migration can be verified on a copy of existing data.

### Phase 6 — Authoring organization and story views

**Goal:** Make the structure comprehensible to a GM, not merely executable by software.

Build complementary views of the same data, using existing frontend patterns:

- **World:** containment tree; selected location shows contents, actors, exits, situations, clues, secrets.
- **Story:** dependency/causality view of situations and event rules; label connections as `causes`, `requires`, `reveals`, or `relates to` rather than implying a required plot sequence.
- **Resources:** searchable typed catalog with backlinks and reference validation.
- **Automation:** readable “When / If / Then” editor, validation errors, preview and test action.
- **Play:** current location, active situations, relevant secrets, clock, proposed actions, and history.

Start with **read-only story/automation views** before building visual graph editing. A graph is a presentation, not the canonical storage format.

**Acceptance:** A GM can locate the water crisis thread, identify the wheel/slab dependencies, inspect the relevant locations, and see what an action would change without reading JSON or SQL.

### Phase 7 — Threads and knowledge refinement (optional, demand-driven)

- Add GM-only **Thread** with premise, involved resources, open questions, and possible outcomes. Threads do not enforce quest order.
- Build on existing clues/reveals to distinguish world truth from party knowledge; expand to individual/faction knowledge only when required by concrete scenarios.
- Test secrecy across all player-facing APIs, not just the UI.

**Acceptance:** A thread organizes related content without controlling player progression; hidden facts are not leaked to unauthorized players.

## 5. Walkthrough reference scenario / executable acceptance matrix

| Scenario | Expected result |
|---|---|
| New run | Wheel blocked, slab in place, rising water inactive, secret passage unknown |
| Remove wheel obstruction first | Wheel unblocked; the GM is asked to open Rising water. Water is not flowing while the slab is in place. |
| Remove slab afterward | Water flowing becomes true. Rising water stays opened. Putting the bone back does not resolve it. |
| Remove slab first | The next time the wheel is freed, the GM is still asked to open Rising water. Water flowing becomes true only once the wheel is also free. |
| Discover secret door | Knowledge changes; path becomes visible to party without silently changing locked/blocked state |
| Search the stair for a turn | Bad air is already opened, the fight is closed, and the party is on that stair. The GM is asked to apply 1 damage. No roll. A declined turn writes nothing. The same turn cannot apply twice. |
| Repeat same action/request | No duplicate events or effects |
| GM overrides outcome | Override is recorded; state and presentation remain consistent |
| Reload/reconnect | State, time, and history remain coherent |
| New playthrough | Defaults restored in the new run; prior run history retained |

If the story text specifies a different water-flow sequence, treat the actual authored scenario as authoritative and document the correction. Do not hardcode the illustrative behavior above into a global engine.

## 6. API and implementation conventions

Prefer domain functions callable from existing server routes over large new route handlers. Exact route names must follow current conventions. Suggested operations:

```text
GET  campaign/run state by resource
POST command: change resource state (with expected version + idempotency key)
POST command: preview action
POST command: confirm/apply preview
GET  event/history entries
GET  applicable situations and transitions
```

Use structured command/result types, explicit authorization checks, transaction boundaries, and server-side validation. Avoid an unrestricted endpoint that accepts arbitrary subject/key/value and permits a player to modify GM-owned state. Define what is authored vs run-scoped, and who can edit each, in one shared permission matrix.

## 7. Testing, migration, and quality gates

For **every phase**:

- Unit tests for pure domain logic and validators.
- DB-backed integration tests for persistence, transactions, constraints, and rollback where applicable.
- API tests for GM/player authorization, information leakage, invalid references, retries, and concurrency.
- Walkthrough seeding must be idempotent or have a documented reset process; never assume an empty production database.
- Preserve existing Core/Enhanced ruleset tests and combat/time/encounter behavior.
- Add at least one negative test for every new condition/effect type.
- Document migration up/down behavior, backup requirements, and any non-reversible operations.
- Update `docs/plans/TRACKER.md` and relevant `ai/` docs according to repository instructions.

### Required Cursor output after each phase

1. Summary of implemented behavior and design decisions.
2. Files changed and migration IDs.
3. Test commands run, results, and any failures not introduced by the change.
4. Known limitations, compatibility concerns, and follow-up work.
5. Manual walkthrough steps for verification.
6. A concise proposal for the **next phase**, without beginning it until approved.

## 8. Review-to-plan traceability

| Original review issue | Priority | Delivery / validation |
|---|---|---|
| Destructive `conclude`/reset semantics | P0 | Phase 0 safety; Phase 5 proper lifecycle |
| World state limited to narrow flags | P1 | Phase 1 typed, run-owned state |
| Narrative conditions/consequences only in prose | P1 | Phase 2 rules, effects, audit |
| Secret paths lack discovery/access checks | P1 | Phase 3 |
| Location-centric ownership | P2 | Phases 4, 6, 7; avoid forced location on situations/threads |
| Authored definitions mixed with runtime state | P2 | Run-aware Phase 1 design; Phase 5 separation |
| Ruleset inheritance/composition unvalidated | P3 | Required assessment before Phase 2; redesign deferred |
| Waterwheel/slab causal state missing | Walkthrough | Phases 1–2, both action orders |
| Rising-water and bad-air hazards manual | Walkthrough | Phase 4 |
| Existing clue/objective behavior must survive | Regression | Baseline and each phase |

## 9. Decisions Cursor should surface, not assume

- Is the existing campaign already a playthrough, a reusable authored definition, or both?
- Which existing flag/encounter/clue values are authoritative, and which should become derived?
- How are campaign time, event order, and combat rounds represented today?
- Should GM review be the default for all narrative effects? (Recommended: yes.)
- How should stale previews, conflicting GM edits, and offline clients behave?
- Which state keys are registered/typed versus freely authored? (Recommended: validated registry/schema for MVP.)
- Can existing path discovery be modeled through clues without a new knowledge table?
- Does the current database migration mechanism support reversible changes?

## 10. Immediate Cursor prompt

> Read the project instructions and current architecture. Use `GeasGremlin_Cursor_Implementation_Plan.md` as the target design, not as a command to rewrite the app. First produce a current-state mapping of tables/routes/UI to the plan and identify any conflicts. Then implement **Phase 0 only**: verify findings and baseline behavior, document actual destructive lifecycle semantics, add regression tests and safe explicit confirmation/authorization without silently changing API contracts or deleting data. Report exact changes and verification results. Propose the run-ownership contract for Phase 1 and stop for approval. Before Phase 2, complete the required Core/Enhanced ruleset integration assessment.
