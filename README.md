# RPGHub

Tabletop RPG campaign and character management. Replaces the original Delphi N-tier Hub (RabbitMQ + Firebird) with a single web app: REST API backend and React frontend, using your existing **rpghub** PostgreSQL database.

The data model is game-agnostic: the same tables support D&D, Pathfinder, Basic Fantasy, or other systems; only the reference data (races, classes, spells, items) changes.

## Ports

- **Backend**: 8100  
- **Frontend**: 8101  

## Prerequisites

- Node.js 18+ (for local development)
- PostgreSQL with the **rpghub** database (you’ve already migrated from Firebird)
- A `.env` at the **repository root** (Docker) or optionally under **`backend/`** for local development: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

## Database

The backend expects a PostgreSQL database named `rpghub` with tables created from the reference schema. The schema includes a **campaign** table (and all others); if you see "Failed to create campaign" or "No campaigns yet", the database has not been initialized.

### First-time setup: create the schema

1. Create the database (if it doesn’t exist):
   ```bash
   psql -U postgres -c "CREATE DATABASE rpghub;"
   ```

2. Run the full schema from the **repository root**:
   ```bash
   psql -h localhost -U postgres -d rpghub -f database/schema.sql
   ```
   Use your actual host, user, and DB name (e.g. from `.env`: `DB_HOST`, `DB_USER`, `DB_NAME`).

After this, the `campaign` table and all other tables (including `characters`) exist. You can create campaigns and characters. If you only created the `campaign` table by hand, run the **full** `schema.sql` so that `characters`, `races`, `classes`, and the rest exist; otherwise "Create character" will fail.

---

If your database was migrated from the original system with **uppercase** table/column names (e.g. `CHARACTERS`, `RACES`), either run the reference schema on a fresh DB (lowercase identifiers) or ensure the API’s queries match your schema. The API uses **lowercase** names: `campaign`, `characters`, `races`, `classes`, `spells`, `items`, etc.

**Migrations:** If the database already existed with an older schema, run the appropriate migration in `database/` (e.g. `migrate_campaign_character.sql`, `migrate_player_gm.sql` for player/GM communication tables).

## Local development

```bash
# Backend
cd backend
npm install
# Set DB_NAME=rpghub and other DB_* in ../.env (repo root) or backend/.env
node server.js   # or: npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Frontend dev server runs on port 3002 and proxies `/api` to `http://localhost:8100` (configure in `vite.config.js` if your backend uses another port).

## Docker

From the **repository root**:

```bash
cp env.example .env
# Edit .env with your DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
docker compose up -d
```

Backend: http://localhost:8100  
Frontend: http://localhost:8101 (proxies `/api` to the backend container).

## API overview

- **Campaigns**: `GET/POST /api/campaigns`, `GET/PUT/DELETE /api/campaigns/:id`
- **Characters**: `GET/POST /api/campaigns/:campaignId/characters`, `GET/PUT/DELETE /api/characters/:id`
- **Character items**: `POST /api/characters/:id/items`, `PUT/DELETE /api/characters/:id/items/:itemId`
- **Character spells**: `POST /api/characters/:id/spells` (learn), `PUT /api/characters/:id/spells/:spellId` (memorized), `POST /api/characters/:id/spells/:spellId/cast`
- **Reference**: `GET /api/races`, `GET /api/classes`, `GET /api/classes/:id/leveling`, `GET /api/abilities`, `GET /api/spells`, `GET /api/items`, plus categories/types
- **Player / GM** (replaces RabbitMQ): `GET /api/player/characters?user=NAME`, `GET /api/campaigns/:id/party`, `POST /api/campaigns/:id/commands` (give_xp, give_gold, give_item, open_shop, etc.), `GET /api/characters/:id/commands`, `PATCH /api/commands/:id/read`, `POST /api/characters/:id/transfers`, `GET /api/characters/:id/transfers`, `PATCH /api/transfers/:id` (accept/reject)

Health: `GET /api/health` (returns status and version).

## Feature parity with Familiar

RPGHub aims for basic feature parity with the Familiar (Basic Fantasy) client:

- **New character wizard**: Class → Race → Attributes (with race/class min–max) → Name & starting gold.
- **Character sheet (tabs)**:
  - **Info**: Demographics (gender, age, hair, eyes, height, weight), move, languages, stats, HP, AC, money (PP/GP/SP/CP), notes; take damage / heal.
  - **Combat**: Equip melee primary/secondary, ranged, armor, shield from inventory; view AC and abilities.
  - **Spellbook**: Learn spell, set memorized count, record cast.
  - **Inventory**: Add item (from reference list), drop one or drop all.
- **Equipment slots** and **next-level XP** from class leveling are supported via the API and schema.
- **Play (player UI)**: From the **Play** link, enter your player name to list your characters. Open a character to use the same sheet with an **Adventuring** notes tab, **Party** list (others in the campaign), and **Send stuff** (items/gold to another party member). GM commands (give XP, gold, items) are stored in the database and applied when the player’s client polls and marks them read. Player-to-player transfers appear as **Incoming** with Accept/Reject.

## Original project

Based on the Delphi project under `D:\!projects\Gitea\cross-platform\RPGs`: Hub (RabbitMQ + SQLite/Firebird), Familiar and GM clients. This service keeps the same object/database abstractions and replaces the message-passing architecture with a single REST API and web UI.
