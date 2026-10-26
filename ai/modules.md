# Module resources

A published Basic Fantasy module is the source for one campaign's rows. The module is open content. The fill uses the board that already exists.

How those rows behave is [docs/plans/04-gm-procedure.md](../docs/plans/04-gm-procedure.md). What each column means is [database/DATA_MODEL.md](../database/DATA_MODEL.md). The physical columns are [database/schema.sql](../database/schema.sql). Catalog rules are [rulesets.md](rulesets.md).

Write the rows through the campaign routes that already exist.

- A location is `POST /api/campaigns/:id/adventuring/locations`.
- A situation, objective, NPC, clue, prepared encounter, member, or lead is under `/api/campaigns/:id/situation`.

Leave the ruleset catalog alone. Do not run `import-catalog` or `import-ruleset`.

## What becomes a row

| Module material | Row | What to store |
| --- | --- | --- |
| A place | `campaign_location` | Name, inside or outside, wander setup, a GM-only `summary`, and the same `site` label on every place in one site. |
| A scene | `campaign_situation` | Title and premise. Status stays `planned`. Stage stays `setup`. |
| A goal | `campaign_objective` | Body. `known` only when the module says the party already has it. Status stays `open`. |
| A story person | `campaign_npc` | Name, motivation, knowledge, and attitude. Link the scene when the person is in it. |
| A secret | `campaign_clue` | Body. `discovered` stays false. Link the scene when the secret belongs to it. |
| A planned fight or discovery | `campaign_encounter` plus members | Kind, title, and purpose. Status stays `prepared`. |
| A path to another place | `campaign_transition` | Destination and a reason. Create the destination first. |

A sprung pit, a taken chest, or a found secret is a `campaign_location_flag` with that state. The GM sets it during play. The fill does not. A sentence secret stays a clue.

A goal that belongs to one scene sets `situation_id`. A goal for the whole module leaves it empty.

A `site` label is at most 80 characters. A place outside that site leaves it empty. The visit stamp is written when the party selects a place, not during the fill.

Hired help stays `campaign_hireling`. A price list does not become an NPC. The log is written when the table makes a decision. A fill does not preload it.

A member is one `campaign_creature` linked to the encounter. A printed number is that many creatures. A printed range goes in the encounter notes and is not a column. Treasure type is the code the module states, stored on the creature. When the module is silent, use the catalog treasure type for that monster name. Monster stats stay on the catalog row. Hit points start empty unless the module prints a total.

A printed hit-point box is a `campaign_creature` on that place. One row per box. `hp` and `base_hp` both start at the printed total. `base_disposition` starts at `present`. A level's wander boxes sit on the level location, not on a room. A named person with a printed total is a creature too. The story NPC row stays motivation and knowledge.

Kind is `combat`, `social`, `hazard`, `trap`, `puzzle`, `environment`, or `discovery`.

## Shape

Names and titles are 1 to 80 characters. Prose is at most 4000. A long room splits across the location summary, the situation premise, and the clues.

Location names are unique in the campaign. Put the area key in the name when two places would collide.

A location needs an encounter table the campaign can already see. Use a stock table for the wilderness. A module die table may be a custom campaign encounter table. The checkboxes are creature rows, not table rows. Keyed monsters stay prepared encounters when they have no printed total. A printed total is a creature.

A dungeon room is inside. A wilderness hex or a town exterior is outside. Leave the check die and the interval at the board defaults unless the module states a different chance. Outside, terrain and movement percent are both empty or both a stock pair. Inside leaves both empty. A terrain the board does not name leaves both empty.

A store in the module is a place. Shop categories stay on the location shop the GM edits in Configuration.

## While filling

The user names the campaign. One campaign per fill.

Create situations as `planned` and encounters as `prepared`. Leave the selected location, the open fight, the clock, and `concluded` where they are.

Selecting a location stamps `arrived_seconds` the first time. Activating a situation selects its location and clears `concluded`. Opening a prepared encounter marks its creatures in the fight. Resolving a prepared row does not end that fight. None of those actions are part of the fill.

If a location name is already taken, stop and name the row. Do not delete campaign rows to make the insert fit.

The module text stays out of the repository. The campaign rows are the copy.
