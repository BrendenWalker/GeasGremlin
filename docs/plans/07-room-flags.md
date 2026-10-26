# Room flags

Status lives in [TRACKER.md](TRACKER.md). This session stores a fact about a place that the fight does not own. It does not add a map.

## Already true

Leads are `campaign_transition`. Arriving selects the destination. A sentence-length secret is `campaign_clue`. `discovered` is bookkeeping. Players do not receive clues. `campaign_location.summary` is the standing description. Players do not receive it.

Ending an encounter clears `in_fight` on `campaign_creature`. The creatures stay. Resolving a prepared encounter does not end the open fight.

The stocking roll and the trap picker on Configuration do not save a result.

## Outcome

A sprung pit, a taken chest, or a found secret is one note row with a state, on the location. The GM can set it and clear it. Deleting the location deletes its flags. The state is a short word. Sprung, taken, and found are enough.

The row survives ending the open fight. It is not a column on `campaign_creature`. A secret that is a sentence stays a clue. Players do not receive the flag. `GET /campaigns/:id/here` does not include it.

## Reuse

The location, and the same GM-only boundary as the summary and the clues. Leads stay transitions.

## Do not build

A map or coordinates. A parent location. A flag on the enemy row. A second store for prose secrets. A trap type list. A saved stocking roll. Rolling anything when the flag is set.

## Check

`node backend/room-flag.check.js`

The flag is still set after the encounter is deleted. `here` does not return it.
