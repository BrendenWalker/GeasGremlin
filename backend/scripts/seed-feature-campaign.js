/**
 * Feature Walk, paused, on the morning the cistern is still untouched.
 * Aborts if the campaign name is taken, or if Feature Bram, Feature Oda,
 * Feature Nix, or Feature Pip already exist. Deleting the campaign does not
 * delete those sheets. Does not start or conclude the campaign.
 *
 *   node scripts/seed-feature-campaign.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const { attachAuthoredFacts } = require('../playState');

const CAMPAIGN_NAME = 'Feature Walk';
const RULESET_NAME = 'Basic Fantasy Core';
const GM = 'ShopTester';
const PLAYER = 'PlayerOne';
const CLOCK = 28800; // Day 1 08:00:00
const CARTER_LEAVES = 151200; // Day 2 18:00:00
const SHEET_NAMES = ['Feature Bram', 'Feature Oda', 'Feature Nix', 'Feature Pip'];

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
    const sheets = await client.query(
      'SELECT name FROM characters WHERE name = ANY($1::text[]) ORDER BY name',
      [SHEET_NAMES]
    );
    if (sheets.rows.length > 0) {
      const names = sheets.rows.map((row) => row.name).join(', ');
      throw new Error(`Character names already exist: ${names}. Deleting the campaign does not delete the sheets.`);
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
    // Names the hermit already in the niche, or the empty room. No catalog monster on the row.
    const customRows = [
      [1, 1, null, 'Well hermit', null],
      [2, 6, null, 'Empty room', null],
    ];
    for (const [lo, hi, monsterId, label, quantity] of customRows) {
      await client.query(
        `INSERT INTO encounter_table_row
           (encounter_table_id, face_lo, face_hi, monster_id, label, quantity)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [custom.id, lo, hi, monsterId, label, quantity]
      );
    }

    const outside = (name, terrain, pct, tableName, summary) => ({
      name, place: 'outside', terrain, pct, tableName, summary, site: null,
      die: 6, interval: 14400, ambient: null, dark: null,
    });
    const inside = (name, tableName, summary, interval, die) => ({
      name, place: 'inside', terrain: null, pct: null, tableName, summary,
      site: 'Cistern', die, interval, ambient: 0, dark: null,
    });
    const places = [
      outside(
        'Millbridge', 'Road', 33, 'City, Town, or Village (Day)',
        'Morning. The mill is stopped, and the well in the square is dry. Miller Bram is arguing with a carter in the square. A stair goes under the mill house.'
      ),
      inside(
        'Cistern Gate', 'Dungeon Level 1',
        'The stair ends on a stone landing. Three goblins stand on the far side, beside a shaft. An oak chest sits against the wall.',
        1800, 6
      ),
      inside(
        'Cistern Well', null,
        'A hermit sits in the niche.',
        600, 6
      ),
      inside(
        'Cistern Stair', 'Dungeon Level 2',
        'A narrow stone flight drops from under the pulley. The steps are damp, and the way keeps going down. The air is bad: thick, foul, and it catches in the throat.',
        1800, 6
      ),
      inside(
        'Cistern Crypt', 'Dungeon Level 3',
        'One skeleton lies in the niches. It stands if they search the niches or carry a light to the far arch. Oda can turn it.',
        1800, 6
      ),
      inside(
        'Cistern Deep', 'Dungeon Level 4-5',
        'A still pool. If the wheel is free, the water is knee-deep and rising, and the passage on is half under.',
        1800, 6
      ),
      inside(
        'Cistern Heart', 'Dungeon Level 8+',
        'A collapsed burial slab dams the water. A turn of work clears it. This place is a tomb. Water can reach the town once both the bone and the slab are dealt with.',
        1800, 8
      ),
    ];
    places.find((row) => row.name === 'Cistern Well').tableId = custom.id;

    const locationIds = {};
    for (const place of places) {
      const table = place.tableId || tableId(place.tableName);
      const inserted = await one(
        client,
        `INSERT INTO campaign_location
           (campaign_id, name, place, check_die, interval_seconds, encounter_table_id,
            terrain, movement_pct, summary, site, arrived_seconds, ambient_light, dark_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          campaignId, place.name, place.place, place.die, place.interval, table,
          place.terrain, place.pct, place.summary, place.site,
          place.name === 'Millbridge' ? CLOCK : null,
          place.ambient, place.dark,
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
      ['Goblin', goblin.id, 5, 5, 'present', 'holds the landing', treasureCode, 'Cistern Gate'],
      ['Goblin', goblin.id, 4, 4, 'present', 'holds the landing', treasureCode, 'Cistern Gate'],
      ['Goblin', goblin.id, 2, 2, 'present', 'holds the landing', treasureCode, 'Cistern Gate'],
      ['Skeleton', skeleton.id, 7, 7, 'present', 'in the niches', null, 'Cistern Crypt'],
      ['Well hermit', null, 4, 4, 'present', 'jammed the wheel', null, 'Cistern Well'],
    ];
    const creatureIds = { Goblin: [], Skeleton: [] };
    for (const [name, monsterId, hp, baseHp, disposition, note, treasure, locationName] of creatures) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_creature
           (campaign_id, location_id, name, monster_id, treasure_type, hp, base_hp,
            disposition, base_disposition, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
         RETURNING id`,
        [campaignId, locationIds[locationName], name, monsterId, treasure, hp, baseHp, disposition, note]
      );
      if (creatureIds[name]) creatureIds[name].push(inserted.id);
    }

    const people = [
      {
        name: 'Feature Bram', user: PLAYER, race: 5, classId: 2, level: 4, xp: 8000, hp: 22,
        money: 8000, str: 16, int: 9, wis: 10, dex: 12, con: 14, chr: 16,
        gender: 'Male', age: 28, hair: 'Brown', eyes: 'Grey', height: '6\'', weight: '180',
        languages: 'Common', notes: 'He speaks for the group.',
      },
      {
        name: 'Feature Oda', user: PLAYER, race: 5, classId: 1, level: 3, xp: 5000, hp: 14,
        money: 3000, str: 12, int: 10, wis: 16, dex: 10, con: 12, chr: 13,
        gender: 'Female', age: 31, hair: 'Black', eyes: 'Brown', height: '5\'6"', weight: '140',
        languages: 'Common', notes: 'She can turn the dead.',
      },
      {
        name: 'Feature Nix', user: GM, race: 3, classId: 3, level: 3, xp: 5000, hp: 8,
        money: 1500, str: 9, int: 16, wis: 12, dex: 13, con: 10, chr: 11,
        gender: 'Female', age: 64, hair: 'Silver', eyes: 'Green', height: '5\'4"', weight: '110',
        languages: 'Common, Elvish', notes: 'She wants a look at the stone under the mill.',
      },
      {
        name: 'Feature Pip', user: PLAYER, race: 4, classId: 4, level: 2, xp: 1500, hp: 7,
        money: 400, str: 10, int: 12, wis: 10, dex: 16, con: 12, chr: 8,
        gender: 'Male', age: 34, hair: 'Sandy', eyes: 'Blue', height: '3\'2"', weight: '70',
        languages: 'Common', notes: 'He checks the floor, and he fits the low places.',
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
        `INSERT INTO character_abilities (character_id, ability_id, mod)
         SELECT $1, ra.ability_id, ra.int_param
         FROM race_abilities ra
         JOIN abilities a ON a.id = ra.ability_id
         WHERE ra.race_id = $2 AND a.description ILIKE '%darkvision%'`,
        [inserted.id, person.race]
      );
      await client.query(
        `INSERT INTO character_classes (character_id, class_id, class_level, sort_order)
         VALUES ($1, $2, $3, 0)`,
        [inserted.id, person.classId, person.level]
      );
      await client.query(
        `INSERT INTO campaign_character
           (campaign_id, character_id, food_missed, heal_food, heal_water, march_days, march_failed, hire_penalty)
         VALUES ($1, $2, 0, false, false, 0, false, 0)`,
        [campaignId, inserted.id]
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

    async function objective(locationName, body, known) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_objective
           (campaign_id, location_id, body, known, base_known, status, base_status)
         VALUES ($1, $2, $3, $4, $4, 'open', 'open') RETURNING id`,
        [campaignId, locationName ? locationIds[locationName] : null, body, known]
      );
      return inserted.id;
    }
    await objective(null, 'Bring water back to Millbridge', true);
    const tomb = await objective('Cistern Heart', 'The cistern is a tomb', false);
    await objective('Millbridge', 'Get the mill turning', true);

    async function npc(locationName, name, motivation, knowledge, attitude) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_npc (campaign_id, location_id, name, motivation, knowledge, attitude)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [campaignId, locationIds[locationName], name, motivation, knowledge, attitude]
      );
      return inserted.id;
    }
    await npc(
      'Millbridge', 'Miller Bram',
      'He will show the stair. He will not go down. He cannot pay until the wheel turns.',
      'The stair is under the mill house. The carter leaves tomorrow evening if he is still unpaid.',
      'Desperate'
    );
    await npc(
      'Cistern Well', 'Well hermit',
      'He wants food and quiet.',
      'He jammed a thigh bone into the wheel so the town would stop drawing water. If pressed, he blames the goblins.',
      'Wary'
    );

    async function clue(locationName, body, objectiveId) {
      await client.query(
        `INSERT INTO campaign_clue (campaign_id, location_id, objective_id, body, discovered, base_discovered)
         VALUES ($1, $2, $3, $4, false, false)`,
        [campaignId, locationIds[locationName], objectiveId, body]
      );
    }
    await clue('Cistern Gate', 'Scratch marks climb the shaft.', null);
    await clue('Cistern Well', 'A thigh bone is jammed in the wheel.', null);
    await clue('Cistern Gate', 'Chalk marks a secret door on the landing.', null);
    await clue('Cistern Heart', 'The slab is a burial.', tomb);

    async function scene(locationName, title, kind, purpose, notes, members) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_encounter
           (campaign_id, location_id, title, kind, purpose, notes, status, base_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'prepared', 'prepared') RETURNING id`,
        [campaignId, locationIds[locationName], title, kind, purpose, notes]
      );
      for (const creatureId of members) {
        await client.query(
          'INSERT INTO campaign_encounter_member (encounter_id, creature_id) VALUES ($1, $2)',
          [inserted.id, creatureId]
        );
      }
    }
    await scene(
      'Cistern Gate', 'Gate goblins', 'combat',
      'Three goblins hold the landing.',
      'They are alive. They stand on the far side of the landing, by the shaft, clear of the covered pit. They take food or a few silver and step aside. They fight if the party shoves past. An oak chest against the wall holds a small coin stash. It sits off the pit. Set Oak chest taken when they take it. Open this when talk fails or the party pushes through. Resolve it when they have stepped aside or the fight is over. Resolve does not end a fight.',
      creatureIds.Goblin
    );
    await scene(
      'Cistern Gate', 'Covered pit', 'trap',
      'Between the last step and the goblins, ten feet deep.',
      'The cover spans the landing from the last step to where the goblins stand. They stand clear of it, on the far side by the shaft. The chest is against the wall, off the cover. A straight step off the stair, or a shove toward the shaft, sets it off. The pit is still covered. A fall is 1d6. When someone sets it off, set a flag on this place: Pit, sprung. It stays after the fight.',
      []
    );
    await scene(
      'Cistern Gate', 'Scratch marks', 'discovery',
      'Marks climb the shaft.',
      'The marks are there, and the clue starts hidden. Mark it discovered when someone sees them. The chalk door on this landing only shortens the way back. It starts secret. Mark it found when they see the chalk. That does not block or open it.',
      []
    );
    await scene(
      'Cistern Well', 'Hermit talk', 'social',
      'The hermit wants food and quiet.',
      'He is already in the niche. He jammed a thigh bone into the wheel, and he blames the goblins if pressed. He will not say the dam is lower. A denizen check names him or the empty room. It does not add a creature. This encounter has no members.',
      []
    );
    await scene(
      'Cistern Well', 'Well pulley', 'puzzle',
      'A thigh bone jams the wheel.',
      'The bone is his doing, and the clue starts hidden. Mark it discovered when they find the bone. Pulling it starts a trickle. The real dam is the slab below. No flag.',
      []
    );
    await scene(
      'Cistern Stair', 'Bad air', 'hazard',
      'A turn of searching costs 1 damage.',
      'The air is bad on this flight. Each turn they search here costs 1 damage unless they retreat for a turn first. Do not roll for the damage. No flag.',
      []
    );
    await scene(
      'Cistern Crypt', 'Niche skeleton', 'combat',
      'One skeleton stands if disturbed.',
      'It stays in the niches until they search them or carry a light to the far arch. Oda can turn it. Open this when it stands. The member is the skeleton already here.',
      creatureIds.Skeleton
    );
    await scene(
      'Cistern Deep', 'Rising water', 'environment',
      'The pool rises if the wheel is free.',
      'The pool is still. If the bone is out of the wheel, the water is knee-deep and rising, and the passage on is half under. If the bone is still in, it stays a still pool. No flag.',
      []
    );
    await scene(
      'Cistern Heart', 'Burial slab', 'puzzle',
      'The fallen slab is the dam.',
      'A turn of work clears it. This place is a tomb. The clue that the slab is a burial starts hidden. Mark it discovered when they see that. Water can reach the town only after both the bone and the slab are dealt with. No flag.',
      []
    );

    const paths = [
      ['Millbridge', 'Cistern Gate', 'The stair under the mill.'],
      ['Cistern Gate', 'Cistern Well', 'The shaft beside the landing.'],
      ['Cistern Well', 'Cistern Stair', 'The way below the pulley.'],
      ['Cistern Stair', 'Cistern Crypt', 'Down the flight.'],
      ['Cistern Crypt', 'Cistern Deep', 'The far arch.'],
      ['Cistern Deep', 'Cistern Heart', 'The passage on.'],
      ['Cistern Heart', 'Cistern Gate', 'The chalk door. It shortens the way back.', true, false],
    ];
    for (const [fromName, toName, reason, oneWay, discovered] of paths) {
      const found = discovered !== false;
      await client.query(
        `INSERT INTO campaign_transition
           (campaign_id, from_location_id, to_location_id, reason, one_way, discovered, base_discovered, blocked, base_blocked)
         VALUES ($1, $2, $3, $4, $5, $6, $6, false, false)`,
        [campaignId, locationIds[fromName], locationIds[toName], reason, oneWay === true, found]
      );
    }

    await client.query(
      `INSERT INTO campaign_mark (campaign_id, kind, note, at_seconds, duration_minutes)
       VALUES ($1, 'event', 'The carter leaves', $2, NULL)`,
      [campaignId, CARTER_LEAVES]
    );
    await attachAuthoredFacts(client, campaignId);

    await client.query('COMMIT');
    console.log(JSON.stringify({
      campaignId,
      gm: GM,
      player: PLAYER,
      clock: 'Day 1 08:00:00',
      event: 'Day 2 18:00:00 The carter leaves',
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
