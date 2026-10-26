# GM procedure

Status lives in [TRACKER.md](TRACKER.md). This pass remembers the situation. It does not roll dice, open a fight, move the clock, or pay loot by itself. The clock, the selected location, the open fight, hirelings, and session pause stay where they are.

## Stage

`backend/situation.js` lists the eight stages and the suggested next stage for each. `conclusion` suggests nothing. Exploration suggests exploration. The client does not keep a second copy. `GET /adventuring` returns the list, the three-line prompt, and `suggested_next` on the active situation. Setting a stage writes the stage and nothing else. The GM can set a stage that is not suggested.

## Rows

`campaign.concluded` is the completion flag. Pausing does not set it. Starting a session does not clear it. Activating a situation clears it.

`campaign_location.summary` is the standing description. Players do not receive it. `arrived_seconds` is the clock the first time that location is selected. Later selects leave it.

`campaign_situation` is one scene. At most one row per campaign is `active`. Activating another sets the current active row back to `planned` and keeps its stage. Resolved is a separate action. A situation's location restricts delete of that location.

Objectives, story NPCs, clues, prepared encounters, leads, and the log are campaign rows. Hirelings stay on `campaign_hireling` until the campaign is concluded. The open fight is `campaign_creature` rows with `in_fight`. One row is one individual. Ending the fight clears `in_fight` and leaves hit points. A prepared member is a link to one of those creatures.

Opening a prepared encounter sets it to `opened` and the active stage to `encounter`. A combat encounter, or any encounter with members, marks those creatures `in_fight` and sets `in_encounter`. Opening the same scene again, while it is still `opened`, does that without copying rows. A social encounter with no members does not open the fight. Resolving the prepared row does not end the fight. The clock does not move.

Arriving on a lead selects that location and sets the active stage to `location_intro`. It does not resolve the situation. Return does the same thing for a location that already has `arrived_seconds`.

End session sets the active stage to `rest_or_session_end`, if there is one, and pauses. It does not conclude and does not resolve objectives. Conclude restores the run to its base values, deletes hirelings and the other rows play created, pauses, and sets `concluded`. It leaves character sheets in place. Every situation returns to `planned` at `setup`.

## Who sees it

Adventuring, which is GM-only, plays the situation: select and activate, change stage, flag an objective known or a clue discovered, open or resolve a prepared encounter, arrive or return, and write the log. Configuration creates, edits, and deletes the wording of a situation, objective, NPC, clue, prepared encounter, or lead. Creating a situation there leaves it planned. Players call `GET /campaigns/:id/here` and see the location name and objectives marked known. That response does not include summaries, premises, clues, NPCs, or the log. The sheet polls it every 10 seconds.

## Check

`node backend/situation.check.js`

In the browser: two locations, one with a summary, written on Configuration. A situation at the first with a known objective, an NPC, an undiscovered clue, a non-combat encounter, and a lead, also written on Configuration. On Adventuring, explore twice and the fight stays closed. Open the encounter and the fight stays closed. A decision is recorded. Arrive changes the board location and the stage. End session leaves `concluded` false. The player sheet shows the place and the known objective, not the clue or the motivation. Conclude pauses the campaign. Starting it again still shows concluded until a situation is activated. Adventuring has no add, save, or remove for those rows.
