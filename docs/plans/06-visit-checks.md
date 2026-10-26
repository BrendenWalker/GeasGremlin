# Visit-scoped empty checks

Status lives in [TRACKER.md](TRACKER.md). This session makes an empty-room check fire once per site visit, and makes a hit name a living creature that is already there. It does not add a roller. It waits on the stamp in [05-site-visit.md](05-site-visit.md).

## Already true

`campaign_location.check_die` defaults to 6. A roll of 1 or below is a hit. `interval_seconds` defaults to 1800 inside (3 turns) and 14400 outside (one watch). Nameless is 1 on 1d6 every 3 turns, so 1800. The Cave is every second turn, so 1200. Those are fields on the location. The module fill sets them.

A watch, turn, or day tick rolls when a location is selected and no encounter is open. `campaign_board.check_seconds` moves forward by whole intervals. Selecting a different location sets that mark to `game_seconds`. A round does not check. The roll is stored on `campaign_wander`. It does not open the encounter. Accept copies the last hit onto the open fight.

A living creature is a `campaign_creature` at that location with `hp` above 0. A defeated row stays and is not drawn again. `POST /api/campaigns/:id/adventuring/creatures/take` copies living rows of one name onto an encounter that is already open. It does not create creatures. Ending the fight deletes the fight rows and leaves the creatures.

## Outcome

An empty-room check the module runs once per trip fires at most once while the visit stamp is set. Clearing the stamp lets it fire again.

A hit names a living creature already at that location. It does not insert a creature, a stock row, or an encounter-table row. A miss is stored as a miss. The fight stays closed. The GM still opens it, then uses the existing take.

The repeating wander on `interval_seconds` stays. This once-per-visit check sits beside it. An empty pool cannot invent a creature. The check records that there was nothing to meet.

## Reuse

The visit stamp. `check_die`, `interval_seconds`, and `campaign_wander`. `campaign_creature` for the finite result. The take route, after the GM has opened a fight. Skip `hp` of 0.

## Do not build

A second die roller. An endless stock table. A new creature on a hit. Auto-opening the fight. A check that fires again on the same visit.

## Check

`node backend/empty-check.check.js`

The same visit does not fire the check twice. Clearing the stamp lets it fire again. A hit does not grow the pool.
