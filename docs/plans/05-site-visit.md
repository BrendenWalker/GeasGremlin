# Site visit

Status lives in [TRACKER.md](TRACKER.md). This session shows the GM how many turns the party has been on this site. It does not add a clock. It does not change `arrived_seconds`.

Empty-room checks that re-arm when the visit ends are [06-visit-checks.md](06-visit-checks.md). They wait on this stamp.

## Already true

`campaign_board.game_seconds` is the only clock. Day 1 starts at 0. A turn is 600 seconds. Inside, the primary step is Next Turn.

`selectCampaignLocation` in `backend/server.js` writes `campaign_location.arrived_seconds` the first time that location is selected. Later selects leave it. A lead's return uses that stamp to mean the party has been there. Clearing it would make a later return look like a first visit.

Players call `GET /campaigns/:id/here`. That response is the location name and objectives marked known. It does not include the summary.

## Outcome

The GM sees whole turns since the party entered this site: `(game_seconds - stamp) / 600`, rounded down. Goblin war parties are turns 4 through 18. The exit ambush is after turn 18. Those bands are read off the count. They are not stored as monster rules.

Leaving for the fort clears the stamp. The next entry starts at 0. `arrived_seconds` stays where it was.

Pick the smallest stamp that can clear. A shared label on the locations of one site is enough when selecting a location outside that site clears the stamp. A parent location, a location tree, or a map is refused. A second column of seconds that ticks on its own is the cut clock.

The count is GM-only. `here` does not return it.

## Reuse

`game_seconds`, and the same 600-second turn Next Turn already uses. Do not read the count off `check_seconds` or `arrived_seconds`.

## Do not build

A second clock. A location parent. A map. A hardcoded goblin table. A player-facing count.

## Check

`node backend/visit.check.js`

The count follows the clock by whole turns of 600. Clearing the stamp starts the next visit at 0. Starting or clearing a visit does not change `arrived_seconds`.
