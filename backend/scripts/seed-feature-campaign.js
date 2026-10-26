/**
 * One campaign that already holds a row for each campaign feature.
 * Aborts if the name is taken. Does not start or conclude the campaign.
 *
 *   node scripts/seed-feature-campaign.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const CAMPAIGN_NAME = 'Feature Walk';
const RULESET_NAME = 'Basic Fantasy Core';
const GM = 'ShopTester';
const PLAYER = 'PlayerOne';
const CLOCK = 115200; // Day 2 08:00:00

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function one(client, sql, params) {
  const result = await client.query(sql, params);
  if (result.rows.length !== 1) throw new Error(`Expected one row: ${sql}`);
  return result.rows[0];
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ruleset = await one(client, 'SELECT id FROM ruleset WHERE name = $1', [RULESET_NAME]);
    const gm = await one(client, 'SELECT id FROM app_user WHERE username = $1', [GM]);
    const player = await one(client, 'SELECT id FROM app_user WHERE username = $1', [PLAYER]);
    const taken = await client.query(
      'SELECT id FROM campaign WHERE ruleset_id = $1 AND name = $2',
      [ruleset.id, CAMPAIGN_NAME]
    );
    if (taken.rows.length > 0) {
      throw new Error(`Campaign "${CAMPAIGN_NAME}" already exists as id ${taken.rows[0].id}`);
    }

    const treasure = await client.query(
      `SELECT code FROM treasure_type WHERE ruleset_id = $1 AND code = 'A'`,
      [ruleset.id]
    );
    const treasureCode = treasure.rows[0]?.code || null;
    const goblin = await one(
      client,
      'SELECT id FROM monster WHERE ruleset_id = $1 AND name = $2',
      [ruleset.id, 'Goblin']
    );
    const skeleton = await one(
      client,
      'SELECT id FROM monster WHERE ruleset_id = $1 AND name = $2',
      [ruleset.id, 'Skeleton']
    );
    const tables = await client.query(
      'SELECT id, name FROM encounter_table WHERE ruleset_id = $1 AND campaign_id IS NULL',
      [ruleset.id]
    );
    const tableId = (name) => {
      const found = tables.rows.find((row) => row.name === name);
      if (!found) throw new Error(`Missing stock table ${name}`);
      return found.id;
    };

    const campaign = await one(
      client,
      `INSERT INTO campaign (name, ruleset_id, running, concluded)
       VALUES ($1, $2, false, false) RETURNING id`,
      [CAMPAIGN_NAME, ruleset.id]
    );
    const campaignId = campaign.id;
    await client.query(
      `INSERT INTO campaign_member (campaign_id, user_id, role, status)
       VALUES ($1, $2, 'gm', 'accepted'), ($1, $3, 'player', 'accepted')`,
      [campaignId, gm.id, player.id]
    );

    const custom = await one(
      client,
      `INSERT INTO encounter_table (name, die, campaign_id)
       VALUES ('Cistern denizens', 6, $1) RETURNING id`,
      [campaignId]
    );
    const customRows = [
      [1, 1, goblin.id, 'Goblin', '2d4'],
      [2, 3, null, 'Rats in the water', '2d6'],
      [4, 4, skeleton.id, 'Skeleton', '1d6'],
      [5, 6, null, 'Nothing moving', null],
    ];
    for (const [lo, hi, monsterId, label, quantity] of customRows) {
      await client.query(
        `INSERT INTO encounter_table_row
           (encounter_table_id, face_lo, face_hi, monster_id, label, quantity)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [custom.id, lo, hi, monsterId, label, quantity]
      );
    }

    const outside = (name, terrain, pct, tableName, summary, site) => ({
      name, place: 'outside', terrain, pct, tableName, summary, site,
      die: 6, interval: 14400,
    });
    const inside = (name, tableName, summary, interval, die) => ({
      name, place: 'inside', terrain: null, pct: null, tableName, summary,
      site: 'Cistern', die, interval,
    });
    const places = [
      outside('Millbridge', 'Road', 33, 'City, Town, or Village (Day)', 'A mill town on the south road. The well in the square is dry. Miller Bram is shouting at a carter.', null),
      outside('Night Market', null, null, 'City, Town, or Village (Night)', 'Stalls after dark. No terrain is set, on purpose.', null),
      outside('South Track', 'Clear', 0, 'Grassland', 'Open ground south of town.', null),
      outside('Dry Wash', 'Desert', -33, 'Desert or Barren', 'A gravel wash. Slow going.', null),
      outside('Green Maze', 'Jungle', -67, 'Jungle', 'Trees that close overhead.', null),
      outside('High Pass', 'Mountains', -67, 'Mountains or Hills', 'A switchback above the tree line.', null),
      outside('Blackwater', 'Swamp', -67, 'Swamp', 'Standing water and no road.', null),
      outside('West Wood', 'Forest', -33, 'Woods or Forest', 'Oak and underbrush.', null),
      outside('Old Fort', 'Hills', -33, 'Inhabited Territories', 'A ruined fort on a hill. A different site from the cistern.', 'Fort'),
      outside('Salt Reach', null, null, 'Ocean', 'Open water. Terrain is left empty.', null),
      outside('Reed Bank', 'Road', 33, 'River or Riverside', 'The river road. Same movement pair as Millbridge, different table.', null),
      inside('Cistern Gate', 'Dungeon Level 1', 'A wet stair under the mill. Goblins held the landing. A pit is sprung, a chest is empty, and a secret door is chalked.', 1800, 6),
      inside('Cistern Well', null, 'The well chamber. The custom denizen table hangs on this room. The check comes every turn.', 600, 6),
      inside('Cistern Stair', 'Dungeon Level 2', 'The next flight down.', 1800, 6),
      inside('Cistern Crypt', 'Dungeon Level 3', 'Niches and old bones.', 1800, 6),
      inside('Cistern Deep', 'Dungeon Level 4-5', 'The air is worse here.', 1800, 6),
      inside('Cistern Vault', 'Dungeon Level 6-7', 'A door with no key on it.', 1800, 6),
      inside('Cistern Heart', 'Dungeon Level 8+', 'The bottom. The check die is a d8.', 1800, 8),
    ];
    places.find((row) => row.name === 'Cistern Well').tableId = custom.id;

    const locationIds = {};
    for (const place of places) {
      const table = place.tableId || tableId(place.tableName);
      const inserted = await one(
        client,
        `INSERT INTO campaign_location
           (campaign_id, name, place, check_die, interval_seconds, encounter_table_id,
            terrain, movement_pct, summary, site, arrived_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          campaignId, place.name, place.place, place.die, place.interval, table,
          place.terrain, place.pct, place.summary, place.site,
          place.name === 'Millbridge' ? CLOCK
            : place.name === 'Old Fort' ? 50000
              : place.name === 'Cistern Gate' ? 80000
                : null,
        ]
      );
      locationIds[place.name] = inserted.id;
    }

    await client.query(
      `INSERT INTO campaign_board
         (campaign_id, game_seconds, in_encounter, place, location_id, check_seconds, visit_seconds)
       VALUES ($1, $2, false, 'outside', $3, $2, NULL)`,
      [campaignId, CLOCK, locationIds.Millbridge]
    );

    const iron = await one(
      client,
      `INSERT INTO campaign_location_shops (location_id, name, buy_cost_delta, sell_cost_delta)
       VALUES ($1, 'Iron Bin', 20, -50) RETURNING id`,
      [locationIds.Millbridge]
    );
    const millerShop = await one(
      client,
      `INSERT INTO campaign_location_shops (location_id, name, buy_cost_delta, sell_cost_delta)
       VALUES ($1, 'Miller''s Goods', 0, 0) RETURNING id`,
      [locationIds.Millbridge]
    );
    for (const shopId of [iron.id, millerShop.id]) {
      await client.query(
        `INSERT INTO campaign_location_shop_item_categories (shop_id, item_category_id)
         SELECT $1, id FROM item_categories WHERE name = ANY($2::text[])`,
        [shopId, shopId === iron.id ? ['Goods', 'Weapon'] : ['Goods']]
      );
    }

    const creatures = [
      ['Goblin', goblin.id, 5, 5, 'present', 'gate watch', treasureCode],
      ['Goblin', goblin.id, 4, 4, 'present', 'gate watch', treasureCode],
      ['Goblin', goblin.id, 2, 2, 'present', 'gate watch', treasureCode],
      ['Goblin', goblin.id, 0, 4, 'present', 'dead on the landing', treasureCode],
      ['Goblin', goblin.id, 3, 6, 'fled', 'ran down the stair', treasureCode],
      ['Skeleton', skeleton.id, 7, 7, 'present', 'in the niche', null],
      ['Well hermit', null, 4, 4, 'present', 'typed person, not a catalog monster', null],
    ];
    const creatureIds = { Goblin: [], Skeleton: [] };
    for (const [name, monsterId, hp, baseHp, disposition, note, treasure] of creatures) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_creature
           (campaign_id, location_id, name, monster_id, treasure_type, hp, base_hp,
            disposition, base_disposition, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
         RETURNING id`,
        [campaignId, locationIds['Cistern Gate'], name, monsterId, treasure, hp, baseHp, disposition, note]
      );
      if (creatureIds[name]) creatureIds[name].push(inserted.id);
    }

    const flags = [
      ['Pit', 'sprung'],
      ['Oak chest', 'taken'],
      ['Secret door', 'found'],
    ];
    for (const [note, state] of flags) {
      await client.query(
        `INSERT INTO campaign_location_flag (location_id, note, state) VALUES ($1, $2, $3)`,
        [locationIds['Cistern Gate'], note, state]
      );
    }

    const people = [
      {
        name: 'Feature Bram', user: PLAYER, race: 5, classId: 2, level: 4, xp: 8000, hp: 22,
        money: 8000, str: 16, int: 9, wis: 10, dex: 12, con: 14, chr: 16,
        gender: 'Male', age: 28, hair: 'Brown', eyes: 'Grey', height: '6\'', weight: '180',
        languages: 'Common', notes: 'Hired the retainer. Further hire rolls in this region are at −1.',
        foodMissed: 0, healFood: false, healWater: false, marchDays: 0, marchFailed: false, hirePenalty: -1,
      },
      {
        name: 'Feature Oda', user: PLAYER, race: 5, classId: 1, level: 3, xp: 5000, hp: 14,
        money: 3000, str: 12, int: 10, wis: 16, dex: 10, con: 12, chr: 13,
        gender: 'Female', age: 31, hair: 'Black', eyes: 'Brown', height: '5\'6"', weight: '140',
        languages: 'Common', notes: 'Has not had water. Healing stays off until she drinks.',
        foodMissed: 0, healFood: false, healWater: true, marchDays: 0, marchFailed: false, hirePenalty: 0,
      },
      {
        name: 'Feature Nix', user: GM, race: 3, classId: 3, level: 3, xp: 5000, hp: 8,
        money: 1500, str: 9, int: 16, wis: 12, dex: 13, con: 10, chr: 11,
        gender: 'Female', age: 64, hair: 'Silver', eyes: 'Green', height: '5\'4"', weight: '110',
        languages: 'Common, Elvish', notes: 'Owned by ShopTester so the GM can open this sheet from Play.',
        foodMissed: 0, healFood: false, healWater: false, marchDays: 2, marchFailed: true, hirePenalty: 0,
      },
      {
        name: 'Feature Pip', user: PLAYER, race: 4, classId: 4, level: 2, xp: 1500, hp: 7,
        money: 400, str: 10, int: 12, wis: 10, dex: 16, con: 12, chr: 8,
        gender: 'Male', age: 34, hair: 'Sandy', eyes: 'Blue', height: '3\'2"', weight: '70',
        languages: 'Common', notes: 'Two days without food. The slowest member of the group.',
        foodMissed: 2, healFood: true, healWater: false, marchDays: 0, marchFailed: false, hirePenalty: 0,
      },
    ];
    const characterIds = {};
    for (const person of people) {
      const idRow = await one(client, 'SELECT COALESCE(MAX(id), 0) + 1 AS id FROM characters', []);
      const inserted = await one(
        client,
        `INSERT INTO characters (
           id, name, "user", gender, age, hair, eyes, height, weight, languages, race,
           str, "int", wis, dex, con, chr, hp, notes, level, xp, money, ruleset_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
           $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
         ) RETURNING id`,
        [
          idRow.id, person.name, person.user, person.gender, person.age, person.hair, person.eyes,
          person.height, person.weight, person.languages, person.race,
          person.str, person.int, person.wis, person.dex, person.con, person.chr,
          person.hp, person.notes, person.level, person.xp, person.money, ruleset.id,
        ]
      );
      characterIds[person.name] = inserted.id;
      await client.query(
        `INSERT INTO character_classes (character_id, class_id, class_level, sort_order)
         VALUES ($1, $2, $3, 0)`,
        [inserted.id, person.classId, person.level]
      );
      await client.query(
        `INSERT INTO campaign_character
           (campaign_id, character_id, food_missed, heal_food, heal_water, march_days, march_failed, hire_penalty)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          campaignId, inserted.id, person.foodMissed, person.healFood, person.healWater,
          person.marchDays, person.marchFailed, person.hirePenalty,
        ]
      );
    }

    async function giveItem(characterId, itemId, quantity, bonus) {
      const idRow = await one(client, 'SELECT COALESCE(MAX(id), 0) + 1 AS id FROM character_items', []);
      const row = await one(
        client,
        `INSERT INTO character_items (id, character_id, item_id, quantity, bonus, value)
         VALUES ($1, $2, $3, $4, $5, 0) RETURNING id`,
        [idRow.id, characterId, itemId, quantity, bonus]
      );
      return row.id;
    }
    const wornDagger = await giveItem(characterIds['Feature Bram'], 676, 1, 0);
    await giveItem(characterIds['Feature Bram'], 676, 1, 0);
    await giveItem(characterIds['Feature Bram'], 295, 3, 0);
    await giveItem(characterIds['Feature Bram'], 11, 1, 0);
    await giveItem(characterIds['Feature Bram'], 676, 1, 1);
    await client.query(
      'UPDATE characters SET equipped_melee_primary_id = $2 WHERE id = $1',
      [characterIds['Feature Bram'], wornDagger]
    );
    await giveItem(characterIds['Feature Oda'], 207, 1, 0);
    const shield = await giveItem(characterIds['Feature Oda'], 17, 1, 0);
    await client.query(
      'UPDATE characters SET equipped_shield_id = $2 WHERE id = $1',
      [characterIds['Feature Oda'], shield]
    );
    await giveItem(characterIds['Feature Nix'], 640, 1, 0);
    await client.query(
      `INSERT INTO character_spells (character_id, spell_id, memorized, known, intend)
       VALUES ($1, 294, 1, 1, 1), ($2, 83, 1, 1, 1)`,
      [characterIds['Feature Oda'], characterIds['Feature Nix']]
    );

    await client.query(
      `INSERT INTO campaign_hireling
         (campaign_id, employer_id, kind, name, detail, level, loyalty, morale, cost_gp, quantity)
       VALUES
         ($1, $2, 'retainer', 'Ned', 'Spear and a blanket', 1, 8, NULL, NULL, 1),
         ($1, $2, 'specialist', 'Alchemist', NULL, NULL, NULL, NULL, 1000, 1),
         ($1, $2, 'mercenary', 'Light Foot, Human', 'Leather armor, shield, and longsword', 1, NULL, 8, 2, 4)`,
      [campaignId, characterIds['Feature Bram']]
    );

    const dryWell = await one(
      client,
      `INSERT INTO campaign_situation
         (campaign_id, location_id, title, stage, description, status)
       VALUES ($1, $2, 'The dry well', 'exploration',
         'The mill is stopped. Something in the cistern is keeping the water down.', 'active')
       RETURNING id`,
      [campaignId, locationIds['Cistern Gate']]
    );
    const debt = await one(
      client,
      `INSERT INTO campaign_situation
         (campaign_id, location_id, title, stage, description, status)
       VALUES ($1, $2, 'The miller''s debt', 'setup',
         'Miller Bram owes a carter and will point at the cistern if pressed.', 'planned')
       RETURNING id`,
      [campaignId, locationIds.Millbridge]
    );
    const rumor = await one(
      client,
      `INSERT INTO campaign_situation
         (campaign_id, location_id, title, stage, description, status)
       VALUES ($1, $2, 'The road rumor', 'resolution',
         'A warden on the south track already told the party the well was dry.', 'resolved')
       RETURNING id`,
      [campaignId, locationIds['South Track']]
    );

    async function objective(situationId, body, known, status) {
      await client.query(
        `INSERT INTO campaign_objective
           (campaign_id, situation_id, body, known, base_known, status, base_status)
         VALUES ($1, $2, $3, $4, $4, $5, $5)`,
        [campaignId, situationId, body, known, status]
      );
    }
    await objective(null, 'Bring water back to Millbridge', true, 'open');
    await objective(null, 'The cistern is a tomb', false, 'open');
    await objective(dryWell.id, 'Find who blocked the well', true, 'open');
    await objective(dryWell.id, 'Do not trust the hermit', false, 'open');
    await objective(rumor.id, 'Heard the rumor on the south track', true, 'resolved');

    async function npc(situationId, locationName, name, motivation, knowledge, attitude) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_npc (campaign_id, location_id, name, motivation, knowledge, attitude)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [campaignId, locationIds[locationName], name, motivation, knowledge, attitude]
      );
      if (situationId) {
        await client.query(
          'INSERT INTO campaign_situation_npc (situation_id, npc_id) VALUES ($1, $2)',
          [situationId, inserted.id]
        );
      }
    }
    await npc(debt.id, 'Millbridge', 'Miller Bram', 'Keep the mill turning and pay the carter.', 'The water stopped the night the goblins were heard.', 'Desperate');
    await npc(dryWell.id, 'Cistern Gate', 'Well hermit', 'Be left alone in the niche.', 'The wheel below is jammed with a bone.', 'Wary');
    await npc(null, 'South Track', 'Road warden', 'Keep travelers moving.', 'The fort on the hill is empty at noon.', 'Brusque');

    async function clue(situationId, locationName, body, discovered) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_clue (campaign_id, location_id, body, discovered, base_discovered)
         VALUES ($1, $2, $3, $4, $4) RETURNING id`,
        [campaignId, locationIds[locationName], body, discovered]
      );
      if (situationId) {
        await client.query(
          'INSERT INTO campaign_situation_clue (situation_id, clue_id) VALUES ($1, $2)',
          [situationId, inserted.id]
        );
      }
    }
    await clue(dryWell.id, 'Cistern Gate', 'Scratch marks climb the well shaft.', true);
    await clue(dryWell.id, 'Cistern Well', 'The wheel is jammed with a bone.', false);
    await clue(null, 'Old Fort', 'A noon bell still hangs in the fort.', false);

    async function scene(situationId, locationName, title, kind, status, purpose, notes, creatureIdsToLink) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_encounter
           (campaign_id, situation_id, location_id, title, kind, purpose, notes, status, base_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
        [campaignId, situationId, locationIds[locationName], title, kind, purpose, notes, status]
      );
      for (const creatureId of creatureIdsToLink) {
        await client.query(
          'INSERT INTO campaign_encounter_member (encounter_id, creature_id) VALUES ($1, $2)',
          [inserted.id, creatureId]
        );
      }
    }
    await scene(dryWell.id, 'Cistern Gate', 'Gate goblins', 'combat', 'prepared', 'They hold the landing.', 'Printed as 1d6.', [
      creatureIds.Goblin[0],
      creatureIds.Skeleton[0],
    ]);
    await scene(dryWell.id, 'Cistern Gate', 'Hermit talk', 'social', 'prepared', 'He will trade the bone for quiet.', null, []);
    await scene(dryWell.id, 'Cistern Stair', 'Bad air', 'hazard', 'prepared', null, null, []);
    await scene(dryWell.id, 'Cistern Gate', 'Covered pit', 'trap', 'prepared', null, null, []);
    await scene(dryWell.id, 'Cistern Well', 'Well wheel', 'puzzle', 'prepared', null, null, []);
    await scene(dryWell.id, 'Cistern Well', 'Rising water', 'environment', 'prepared', null, null, []);
    await scene(dryWell.id, 'Cistern Gate', 'Scratch marks', 'discovery', 'opened', 'Already noticed.', null, []);
    await scene(rumor.id, 'South Track', 'Empty antechamber', 'discovery', 'resolved', null, null, []);

    await client.query(
      `INSERT INTO campaign_transition (campaign_id, situation_id, to_location_id, reason)
       VALUES
         ($1, $2, $3, 'The passage past the gate'),
         ($1, $2, $4, 'Back to town'),
         ($1, $5, $6, 'Miller points at the cistern')`,
      [
        campaignId, dryWell.id, locationIds['Cistern Well'], locationIds.Millbridge,
        debt.id, locationIds['Cistern Gate'],
      ]
    );

    const logs = [
      [dryWell.id, 'decision', 'The party went down instead of paying the carter.'],
      [dryWell.id, 'consequence', 'The pit on the landing is already sprung.'],
      [dryWell.id, 'discovery', 'Scratch marks climb the shaft.'],
    ];
    for (const [situationId, kind, body] of logs) {
      await client.query(
        `INSERT INTO campaign_log (campaign_id, situation_id, at_seconds, kind, body)
         VALUES ($1, $2, $3, $4, $5)`,
        [campaignId, situationId, CLOCK, kind, body]
      );
    }

    await client.query(
      `INSERT INTO campaign_mark (campaign_id, kind, note, at_seconds, duration_minutes)
       VALUES
         ($1, 'effect', 'Lit torch', $2, 60),
         ($1, 'effect', 'Spent lantern', 0, 1),
         ($1, 'event', 'Miller expects the party', 237600, NULL)`,
      [campaignId, CLOCK]
    );

    await client.query('COMMIT');
    console.log(JSON.stringify({
      campaignId,
      gm: GM,
      player: PLAYER,
      clock: 'Day 2 08:00:00',
      locations: Object.keys(locationIds).length,
      characters: Object.keys(characterIds),
      treasureCode,
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
