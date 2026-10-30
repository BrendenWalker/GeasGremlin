# Repository

GeasGremlin is a tabletop campaign and character app: a React frontend, a REST API, and a PostgreSQL database named `geasgremlin`. The same tables serve more than one game. The ruleset catalog is what changes.

- Backend port 8140. Frontend port 8150.
- How to run, import, and export: [README.md](../README.md).
- Physical schema: [database/schema.sql](../database/schema.sql).
- What each table is for: [database/DATA_MODEL.md](../database/DATA_MODEL.md).
- Ruleset JSON: `GameSystems/<System>/`, one folder per system. `gamesystem.json` plus one file per catalog table.

When the schema and `DATA_MODEL.md` disagree, the schema is the physical source and `DATA_MODEL.md` must be updated in the same change.
