/**
 * Morgansfort, before the first session. The party has been in the fort for
 * two weeks. Father Thelbain is about to ask them to look for Jerard.
 * Aborts if that campaign name already exists on Basic Fantasy Core.
 * Does not start or conclude the campaign, and does not select a place.
 * Begin Campaign selects the Toothless Dragon.
 *
 * Room text is read from the module files at seed time. It is not stored in
 * this repository.
 *
 *   node scripts/seed-morgansfort.js
 *   node scripts/seed-morgansfort.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const { saveCampaignDetails } = require('../campaignDetails');

const CAMPAIGN_NAME = 'Morgansfort';
const RULESET_NAME = 'Basic Fantasy Core';
const GM = 'GameMaster';
const PLAYER = 'PlayerOne';
const MODULE_DIR = process.env.MORGANSFORT_DIR
  || 'c:\\Users\\bkw\\Documents\\!RPGs\\Basic Fantasy\\Modules\\Western Lands  Campaign';
const DRY = process.argv.includes('--dry-run');
const PROSE = 4000;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

function clip(value) {
  const text = String(value || '').replace(/\s+\n/g, '\n').trim();
  if (!text) return null;
  if (text.length <= PROSE) return text;
  return `${text.slice(0, PROSE - 24).trim()}\n[truncated at 4000]`;
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

function readOdt(file) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-'));
  try {
    execFileSync('tar', ['-xf', file, '-C', dir, 'content.xml'], { stdio: 'pipe' });
    return fs.readFileSync(path.join(dir, 'content.xml'), 'utf8');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function odtText(xml) {
  const text = xml
    .replace(/<text:soft-page-break\/>/g, '')
    .replace(/<text:tab[^>]*\/>/g, '\t')
    .replace(/<text:line-break[^>]*\/>/g, '\n')
    .replace(/<\/text:[ph]>/g, '\n')
    .replace(/<text:s[^>]*\/>/g, ' ')
    .replace(/<[^>]+>/g, '');
  return decodeXml(text).replace(/\u00a0/g, ' ');
}

function between(text, start, end) {
  const i = text.indexOf(start);
  if (i < 0) throw new Error(`Missing anchor: ${start.slice(0, 70)}`);
  const j = text.indexOf(end, i + start.length);
  if (j < 0) throw new Error(`Missing end anchor: ${end.slice(0, 70)}`);
  return text.slice(i, j);
}

function rumorsFrom(xml) {
  const start = xml.indexOf('>Rumors<');
  if (start < 0) throw new Error('Supplement rumors were not found');
  const listStart = xml.indexOf('<text:list', start);
  const listEnd = xml.indexOf('</text:list>', listStart);
  const list = xml.slice(listStart, listEnd);
  return [...list.matchAll(/<text:list-item>([\s\S]*?)<\/text:list-item>/g)].map((match) => {
    const inner = match[1];
    const text = decodeXml(inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    return { text, falseRumor: inner.includes('text:style-name="T2"') };
  });
}

function matchHeader(line) {
  const colon = line.match(/^(\d+)\.\s+([^:\n]+):\s*(.*)$/);
  const paren = colon ? null : line.match(/^(\d+)\.\s+(.+?)\s+(\(.*\))\s*$/);
  const found = colon || paren;
  if (!found) return null;
  const title = found[2].trim();
  if (!/[A-Za-z]{2,}/.test(title)) return null;
  if (/^\d/.test(title) || /\d+d\d+/.test(title)) return null;
  return { number: Number(found[1]), title, rest: (found[3] || '').trim() };
}

function titleCase(title) {
  const trimmed = title.trim();
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed.toLowerCase().replace(/(^|[^A-Za-z'’])([a-z])/g, (all, boundary, letter) => boundary + letter.toUpperCase());
}

function parseRooms(block) {
  const rooms = [];
  let current = null;
  for (const line of block.split('\n')) {
    const header = matchHeader(line);
    if (header) {
      if (current && current.number === header.number) {
        current.lines.push(line);
        continue;
      }
      if (current) rooms.push(current);
      current = { number: header.number, title: titleCase(header.title), lines: [] };
      if (header.rest) current.lines.push(header.rest);
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) rooms.push(current);
  return rooms;
}

function isReadAloud(line) {
  const text = line.trim();
  if (!text) return false;
  if (text.startsWith('(')) return false;
  if (/\bAC\b/.test(text) && /\bHD\b/.test(text)) return false;
  if (text.includes('□') || /^HP\b/.test(text)) return false;
  if (/^\d+\s+[A-Za-z]/.test(text)) return false;
  if (/\d+\s*(gp|sp|cp|pp|ep)\b/i.test(text)) return false;
  if (/\d+%/.test(text)) return false;
  if (/^(If |Note |The GM|Roll |There is a \d|Any character|Only check|Spit range)/.test(text)) return false;
  if (/\b(secret door|pit trap|save vs\.|hit points|wandering monster)\b/i.test(text)) return false;
  return true;
}

function roomCopy(room) {
  const lines = room.lines.map((line) => line.trim()).filter(Boolean);
  const summary = clip(lines.filter(isReadAloud).join('\n\n')) || `${room.title}.`;
  const gmText = clip(lines.join('\n'));
  return { summary, gmText };
}

function extractGroups(lines) {
  const groups = [];
  let current = null;
  const flush = () => {
    if (current) groups.push(current);
    current = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const stat = line.match(/^(.+?):\s*AC\b/);
    if (stat) {
      flush();
      current = { name: stat[1].trim(), stat: line, hits: [] };
      continue;
    }
    if (!current) continue;
    if (line.includes('□')) {
      current.hits.push(...[...line.matchAll(/(\d{1,3})\s*□+/g)].map((match) => Number(match[1])));
      continue;
    }
    if (line === '' || /^(XP|Dam|Mv|Spit|Any |Note|Only )\b/.test(line)) {
      if (line) current.stat += ` ${line}`;
      continue;
    }
    flush();
  }
  flush();
  for (const group of groups) {
    const onePoint = /1\s*pt|1 hit point|each checkbox/i.test(group.stat);
    if (onePoint && group.hits.length === 1 && group.hits[0] > 1 && group.hits[0] <= 100) {
      group.hits = Array(group.hits[0]).fill(1);
    }
    group.hits = group.hits.filter((hp) => hp >= 1 && hp <= 999);
  }
  return groups.filter((group) => group.name);
}

function norm(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const MONSTER_ALIAS = new Map([
  ['pit viper', 'Snake, Pit Viper'],
  ['pit vipers', 'Snake, Pit Viper'],
  ['spitting cobra', 'Snake, Spitting Cobra'],
  ['spitting cobras', 'Snake, Spitting Cobra'],
  ['normal bat', 'Bat'],
  ['normal bats', 'Bat'],
  ['female kobold', 'Kobold'],
  ['female kobolds', 'Kobold'],
  ['male kobold', 'Kobold'],
  ['male kobolds', 'Kobold'],
  ['kobolds see area 14', 'Kobold'],
  ['armed female orc', 'Orc'],
  ['armed female orcs', 'Orc'],
  ['orc warrior', 'Orc'],
  ['orc warriors', 'Orc'],
  ['onyg the ogre', 'Ogre'],
  ['badushna the orc queen', 'Orc'],
  ['gwelayn zombie', 'Zombie'],
  ['goblin war party', 'Goblin'],
  ['yellow mold patches', 'Yellow Mold'],
  ['shrieker', 'Shrieker (Wailing Morel)'],
  ['shriekers', 'Shrieker (Wailing Morel)'],
  ['crystal living statue', 'Living Statue, Crystal'],
  ['zombie diner', 'Zombie'],
  ['zombie diners', 'Zombie'],
  ['zombie displacer', 'Zombie'],
  ['gobphloc hogstone', 'Hobgoblin'],
  ['giant tarantula', 'Spider, Giant Tarantula'],
  ['giant tarantulas', 'Spider, Giant Tarantula'],
  ['tiger beetle', 'Beetle, Giant Tiger'],
  ['tiger beetles', 'Beetle, Giant Tiger'],
  ['zombies', 'Zombie'],
]);

function nameCandidates(value) {
  const base = norm(value.replace(/^\d+d\d+(?:\+\d+)?\s+/i, '').replace(/^\d+\s+/, ''));
  const found = [base];
  const parts = base.split(' ').filter(Boolean);
  if (parts.length === 0) return found;
  const last = parts[parts.length - 1];
  const push = (word) => {
    const next = [...parts.slice(0, -1), word].join(' ');
    if (next && !found.includes(next)) found.push(next);
  };
  if (last.endsWith('s') && !last.endsWith('ss') && last.length > 3) push(last.slice(0, -1));
  if (last.endsWith('ies')) push(`${last.slice(0, -3)}y`);
  if (last.endsWith('ves')) push(`${last.slice(0, -3)}f`);
  return found;
}

function tokenKey(value) {
  return norm(value).split(' ').filter(Boolean).sort().join(' ');
}

function monsterFor(name, byNorm, byTokens) {
  const keys = nameCandidates(name);
  for (const key of keys) {
    const alias = MONSTER_ALIAS.get(key);
    if (alias && byNorm.has(norm(alias))) return byNorm.get(norm(alias));
    if (byNorm.has(key)) return byNorm.get(key);
    if (byTokens.has(tokenKey(key))) return byTokens.get(tokenKey(key));
  }
  for (const row of byNorm.values()) {
    const paren = row.name.match(/\(([^)]+)\)/);
    if (paren && keys.includes(norm(paren[1]))) return row;
  }
  return null;
}

function displayName(raw, monster) {
  const stripped = raw.replace(/^\d+\s+/, '').replace(/\s+/g, ' ').trim();
  if (!monster) return stripped.slice(0, 80);
  const a = norm(stripped);
  const b = norm(monster.name);
  if (a === b || a === `${b}s` || a === `${b}es` || a.replace(/ies$/, 'y') === b || a.replace(/ves$/, 'f') === b) {
    return monster.name;
  }
  return stripped.slice(0, 80);
}

function parseWander(block) {
  const entries = [];
  let current = null;
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    const header = line.match(/^(\d+)(?:-(\d+))?\.\s+(\S.*)$/);
    if (header && !line.includes('□')) {
      const face = Number(header[1]);
      let faceHi = header[2] == null ? face : Number(header[2]);
      if (faceHi === 0) faceHi = 10;
      const rest = header[3].trim();
      const dice = rest.match(/^(\d+d\d+(?:\+\d+)?|\d+d\d+)\s+(.+)$/);
      const body = (dice ? dice[2] : rest).replace(/\s*\([^)]*total[^)]*\)\s*/i, '').trim();
      current = {
        face,
        faceHi: Math.max(face, faceHi),
        quantity: dice ? dice[1] : null,
        label: body.slice(0, 80) || rest.slice(0, 80),
        lines: [line],
      };
      entries.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return entries.filter((entry) => entry.label);
}

function linksFrom(text) {
  const found = [];
  const pattern = /\b(?:to|into|from)\s+(?:room|area)\s+(\d+)\b|\boutside room\s+(\d+)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const number = Number(match[1] || match[2]);
    const before = text.slice(Math.max(0, match.index - 70), match.index).toLowerCase();
    const secret = /secret/.test(before);
    const teleport = /teleport/.test(before);
    const pit = /pit|trapdoor|drops|falling/.test(before);
    let reason = 'Door';
    let oneWay = false;
    let discovered = true;
    if (teleport) {
      reason = 'Teleport';
      oneWay = true;
      discovered = false;
    } else if (pit) {
      reason = 'Pit';
      oneWay = true;
      discovered = false;
    } else if (secret) {
      reason = 'Secret door';
      discovered = false;
    }
    found.push({ number, reason, oneWay, discovered });
  }
  return found;
}

function assertShape(model) {
  const numbers = (prefix) => model.rooms.filter((room) => room.prefix === prefix).map((room) => room.number);
  const has = (prefix, number) => numbers(prefix).includes(number);
  if (!has('Stafeld', 1) || !has('Stafeld', 2) || !has('Stafeld', 28)) {
    throw new Error('Stafeld rooms 1, 2, and 28 did not parse');
  }
  if (!has('Nameless', 1) || !has('Nameless', 73) || !has('Nameless', 88)) {
    throw new Error('Nameless rooms 1, 73, and 88 did not parse');
  }
  if (!has('Cave', 1) || !has('Cave', 23) || !has('Cave', 24)) {
    throw new Error('Cave rooms 1, 23, and 24 did not parse');
  }
  const wolf = model.rooms.find((room) => room.prefix === 'Stafeld' && room.number === 2);
  if (wolf.summary.includes('AC')) throw new Error('Stafeld 2 summary contains stats');
  if (!wolf.gmText || !wolf.gmText.includes('AC')) throw new Error('Stafeld 2 gm text lost the wolf stats');
  if (model.rumors.length !== 20) throw new Error(`Expected 20 rumors, got ${model.rumors.length}`);
  const names = new Set();
  for (const place of model.placeNames) {
    if (names.has(place)) throw new Error(`Duplicate location ${place}`);
    if (!place || place.length > 80) throw new Error(`Bad location name ${place}`);
    names.add(place);
  }
}

function buildModel(moduleText, supplementXml) {
  const rumors = rumorsFrom(supplementXml);
  const stafeldRooms = parseRooms(between(moduleText, '1. ENTRANCE ROOM:', 'The Nameless Dungeon')).map((room) => ({
    ...room, prefix: 'Stafeld', site: 'Stafeld', interval: 1800, table: 'Stafeld',
  }));
  const namelessRooms = parseRooms(between(moduleText, '1. ENTRANCE: (10', 'Nameless Dungeon Level 1 Map')).map((room) => ({
    ...room,
    prefix: 'Nameless',
    site: 'Nameless Dungeon',
    interval: 1800,
    table: room.number <= 35 ? 'Nameless 1' : room.number <= 68 ? 'Nameless 2' : 'Nameless 3',
  }));
  const caveRooms = parseRooms(between(moduleText, '1. ORC COMMON ROOM:', 'Cave of the Unknown Map')).map((room) => ({
    ...room, prefix: 'Cave', site: 'Cave of the Unknown', interval: 1200, table: 'Cave',
  }));
  const rooms = [...stafeldRooms, ...namelessRooms, ...caveRooms];
  for (const room of rooms) {
    const copy = roomCopy(room);
    room.summary = copy.summary;
    room.gmText = copy.gmText;
    room.groups = extractGroups(room.lines);
    room.name = `${room.prefix} ${room.number}. ${room.title}`.slice(0, 80);
  }
  const wanders = [
    { key: 'Stafeld', name: 'Stafeld Wander', site: 'Stafeld', interval: 1800, block: between(moduleText, 'Random Encounters', '1. ENTRANCE ROOM:') },
    { key: 'Nameless 1', name: 'Nameless 1 Wander', site: 'Nameless Dungeon', interval: 1800, block: between(moduleText, 'rolled every 3 turns (half an hour)', 'Level 2\nRoll 1d6') },
    { key: 'Nameless 2', name: 'Nameless 2 Wander', site: 'Nameless Dungeon', interval: 1800, block: between(moduleText, 'Level 2\nRoll 1d6 for the type of encounter.', 'Level 3\nRoll 1d6') },
    { key: 'Nameless 3', name: 'Nameless 3 Wander', site: 'Nameless Dungeon', interval: 1800, block: between(moduleText, 'Level 3\nRoll 1d6 for the type of encounter.', 'Dungeon Level 1') },
    { key: 'Cave', name: 'Cave Wander', site: 'Cave of the Unknown', interval: 1200, block: between(moduleText, 'An encounter should be rolled for every second turn', 'The Orcs (and their leaders)') },
  ];
  for (const wander of wanders) {
    wander.entries = parseWander(wander.block);
    if (wander.entries.length === 0) throw new Error(`No wander rows for ${wander.name}`);
    wander.groups = wander.entries.flatMap((entry) => {
      let replaced = false;
      const lines = entry.lines.map((line) => {
        if (!replaced && /^AC\b/.test(line.trim())) {
          replaced = true;
          return `${entry.label}: ${line.trim()}`;
        }
        return line;
      });
      return extractGroups(lines);
    });
  }
  const tribe = extractGroups(between(moduleText, 'The Orcs (and their leaders)', 'Starisel Zelinth and Gwelayn').split('\n'));
  const starisel = extractGroups(between(moduleText, 'Starisel Zelinth and Gwelayn', 'Dungeon Key\n1. ORC COMMON ROOM:').split('\n'));
  const placeNames = [
    ...townPlaces().map((place) => place.name),
    ...wildPlaces().map((place) => place.name),
    ...rooms.map((room) => room.name),
    ...wanders.map((wander) => wander.name),
    'Cave Orc Tribe',
  ];
  const model = { rumors, rooms, wanders, tribe, starisel, placeNames };
  assertShape(model);
  return model;
}

function townPlaces() {
  const day = 'City, Town, or Village (Day)';
  const place = (name, summary, gmText) => ({
    name, place: 'outside', terrain: null, pct: null, table: day, summary, gmText, site: 'Morgansfort', die: 6, interval: 14400,
  });
  return [
    place('1. Gatehouse', 'A stone gatehouse. The passage through is ten feet wide, with a heavy door at each end.', 'By day, two soldiers and a corporal or sergeant, plus one scribe. Hobeth and his apprentice Glorin split the duty. About 70 percent of the time it is Glorin. They record names and charge 1 sp a person and 1 cp an animal, unless the tax was paid this month. Antique coin from a ruin is taxed 10 percent here and then stamped. Hiding it is a flogging and confiscation. The stamp chest goes to the keep when the gates shut.'),
    place('1. Gatehouse Upper', 'The upper gatehouse is a barracks over the passage, with murder holes in the floor.', 'Twelve bunks, oil vats, and braziers sit ready over the holes. The racks hold sword, dagger, and crossbow for each guard.'),
    place('2. Southeast Tower', 'A corner tower given over to bunks and weapon racks.', 'Nine bunks. Sword, spear, crossbow, and a pair of daggers for each guard. Nothing of value in the trunks.'),
    place('3. Common Stable', 'The common stable. Horses, mules, and donkeys stand in the stalls.', 'Hardel and his three sons keep it. One of them is always here. Stabling is 5 cp a day or 25 cp a week, feed and exercise included. The boys sleep in the hayloft when their father is out.'),
    place('4. Bank', 'A thick stone bank. Iron bars cut the room in half, with a counter behind the slots.', '1d4 clerks at the counter. One or two off-duty soldiers stand guard day and night. The vault door is four inches of steel. Only the bank officers have the keys.'),
    place('5. Trader', 'Jeroh Lotherra\'s shop. Dry goods, packed to the beams.', 'He stocks the usual equipment list, not weapons, armor, or livestock, at list price. He buys serviceable goods he believes are not stolen, dungeon finds included, at 4 sp per gp of listed value. Jewelry and other rich goods he will not buy, but he will take them in trade at 6 sp per gp.'),
    place('6. Square', 'The Square is the fort\'s market. It is not a square, and the locals will laugh if asked why.', 'Continual light keeps it lit after sunset. By day, 2d8 commoners and 1d6 off-duty soldiers. From midnight to dawn it is usually empty. The module\'s night check, 1 on 1d6 every three turns, is not the board\'s watch check. 75 percent of those night meetings are 2d4 soldiers.'),
    place('7. Herbalist', 'A faded bunch of herbs hangs outside Maien Brai\'s house. The rooms smell of drying plants.', 'Maien is a friendly middle-aged widow. Her daughter Jyni lives with her. About 60 percent of the time she has a few healing potions at 250 gp. Given a reason, she can make stronger poisons.'),
    place('8. Stableman\'s House', 'Hardel\'s house. The outside is tired. The inside is worse.', 'He and his three sons live in the clutter. They will invite a favored visitor in for a drink or a bad dinner.'),
    place('9. Gambling House', 'Bargus\'s house looks like nothing from the street.', 'A concealed stair drops to a gambling hall. Invitation only. 2d6 patrons, Bargus, 1d3+2 dealers, and two bouncers. He pays the watch to look away. Most illicit wants can be arranged here.'),
    place('10. Thelan Taramedes', 'An iron-bound door with a small mystical mark, easy to miss.', 'Thelan is a semi-retired 4th level magic-user, vain and kind. The bedroom trunk hides scrolls: protection from magic, detect magic, detect evil, shield, and web.'),
    place('11. Smithy', 'The smithy announces itself with heat, smoke, and the hammer.', 'Rugarr works with his apprentice Tob. Rugarr lives upstairs. Tob sleeps in the shop, and sometimes goes home to a nearby farm.'),
    place('12. Warehouse', 'A long wooden warehouse full of crates, barrels, and sacks.', 'The merchant guild rents space at 1 gp a week. By day: clerk Sardas and laborers Valdin, Tamas, and Kaino, each a normal man with 3 hit points. At need they have leather, shortbow, and spear. The laborers sleep here. Sardas rooms at the inn. Locked at night.'),
    {
      ...place('13. Toothless Dragon', 'The Toothless Dragon serves beer, wine, and three hearty meals a day.', `${RUMOR_HOW}\n\nGarnoth, a retired 3rd level fighter, runs it with his wife Lianna. Their daughters Irene and Louise serve. Rude patrons get thrown out. Garnoth fights with a club if he must: AC 11, attack +2, 17 hit points.`),
      place: 'inside',
      interval: 1800,
      ambientLight: 70,
      darkSummary: null,
    },
    place('14. Iron Helm Inn', 'The inn has a common room downstairs and four rooms above.', 'Lorynn, Lianna\'s older brother, keeps it. A cot in the common room is 1 sp. A room is 1 gp, plus 1 sp for an extra cot. The bath is 1 sp. He is unmarried and pays awkward attention to unattended human or elven women.'),
    place('15. Chapel of St. Queril', 'The Reformers\' chapel. Plain, and unusually well kept.', 'Father Thelbain, a 6th level cleric, will not adventure. He casts for parishioners free and for adventurers against a real donation. He usually has cure light wounds twice, bless, hold person, and cure disease. His assistants are Baris, Jerard, and Melean, all 1st level.'),
    place('16. East Tower', 'Another wall tower of bunks and racks.', 'Nine bunks. The same guard weapons as the other towers. No private valuables.'),
    place('17. Northeast Tower', 'The northeast tower. Bunks line the outer walls.', 'Nine bunks and the usual racks. Nothing worth stealing in the trunks.'),
    place('18. Southwest Tower', 'The southwest tower, fitted like the northeast one.', 'Nine bunks, racks, and no private coin.'),
    place('19. Inner Tower', 'A tower on the inner wall. The door opens onto stairs and the watch above.', 'Nothing else is kept here. A secret stair into tunnels under the fort would start in this tower, if those tunnels are ever dug. They are not in this seed.'),
    place('20. Green', 'The Green is packed earth, not grass. The fort drills here.', 'In good daylight weather, 85 percent chance of 1d4+1 knights or 3d6 soldiers practicing. At night, 1 on 1d6 each turn of 2d4 soldiers passing the barracks or the keep. The keep and barracks doors are under continual light.'),
    place('21. Northwest Tower', 'The northwest tower. Bunks and racks, like the others.', 'Nine guards\' worth of ordinary weapons. No coin in the trunks.'),
    place('22. North Tower', 'The north tower. Bunks stand on both the inner and outer walls.', 'Nine bunks. Racks by the east and west doors.'),
    place('23. Garrison Stable', 'The knights\' horses, and the squires who sleep with them.', 'Stairs on the south wall go up to the knights\' quarters.'),
    place('23. Knights\' Quarters', 'A long upper hall. Five small rooms face west and two large rooms face east.', 'The west rooms are the junior knights. Sir Galadin and Sir Kellin have the east rooms. They swore to Baron Morgan and stayed to steady his son. The junior knights, Gervus among them, swore to Halden.'),
    place('24. Barracks', 'The first and second squads are packed into this floor.', 'Twenty-two men, at least half of the bunks full at any hour. They keep quiet. The officers sleep upstairs. Weapon racks fill the east wall.'),
    place('24. Officers\' Quarters', 'Thin wooden partitions make seven sleeping closets, and the stair door can lock.', 'Captain Argos, Lieutenants Kellos, Aeos, Haydin, and Korbl, Top Sergeant Aldric, and Master Sergeant Karstein. A locked closet holds garrison valuables. The module says to roll treasure types J, K, and L for the closet, and P through T for each foot locker.'),
    place('25. Keep', 'The keep\'s ground floor is the great room, where Halden holds court and the household eats.', 'Kitchen behind. Offices and servants along the outer walls.'),
    place('25. Keep Upper', 'The upper keep. The baron\'s rooms are shut. Halden sleeps here.', 'Morgan has not come south in more than five years.'),
    place('25. Keep Cellar', 'Stores, a well near the kitchen stair, and a vault behind a metal door.', 'Only Halden and Bailiff Tomandy have vault keys. The gate chest is emptied here each night.'),
  ];
}

function wildPlaces() {
  const outside = (name, terrain, pct, table, summary, gmText) => ({
    name, place: 'outside', terrain, pct, table, summary, gmText, site: null, die: 6, interval: 14400,
  });
  return [
    outside('Old Road North', 'Road', 33, 'Inhabited Territories', 'The Old Road north of the fort is cleared and in good repair. Farms sit back from it in small hamlets.', 'A day\'s march this way is the wood where the Nameless Dungeon waits. The module\'s cave is also north. This campaign moved that cave west.'),
    outside('Old Road South', 'Clear', 0, 'Grassland', 'South of the fort the Old Road is half swallowed by grass. Travel it as clear ground, not as a road.', 'Stafeld is a short trip this way. The river bridge is down.'),
    outside('Stafeld Shore', 'Clear', 0, 'River or Riverside', 'The trees thin. Across the rough water, the blackened walls of Stafeld stand on a rock of an island.', 'A search of the shore finds Jerard\'s dead horse on 1-4 of a d6. A Wisdom check says the spears were goblin. A sturdy boat with oars is pulled up. It is a goblin boat, with sacks and crude tools. The delta is rough: 1 on 1d6 the boat gets away from them, and the rower needs a Strength check.'),
    outside('Stafeld Island', 'Clear', 0, 'Desert or Barren', 'The island is bare rock, wind, and the broken fangs of the old walls. A cobbled way runs from the water to two smashed columns.', 'Bones and a couple of campfires mark the path. In the middle of the ruin is a mound of wall-stone with a trodden path to an unlocked trapdoor.'),
    outside('Blue Forest', 'Forest', -33, 'Woods or Forest', 'West of the fort the land rises into the Blue Forest, called Gwyndelfinn in the old talk.', 'The cave is about six days west at a hard 18 miles a day. Barrow\'s Edge is about 40 miles out, the old dwarven supply town.'),
    outside('Barrow\'s Edge', null, null, 'City, Town, or Village (Day)', 'A small town left behind when the dwarven mines played out. Most of the people are still dwarves.', 'About 619 people: 557 dwarves, 50 halflings, 12 humans, and 2 guards. Eight clergy. Two taverns, a smith, and the ordinary village crafts. They use the same rumors as the fort. They will say goblins have been going into an old mine a half-day off, and that some merchants have been paid in raw gold.'),
    outside('Old Dwarven Mine', 'Hills', -33, 'Mountains or Hills', 'A worked-out mine in the hills, half a day from Barrow\'s Edge. Fresh tracks say someone is using it again.', 'This is the Gold in the Hills job, which is not keyed in the Morgansfort book. The gold is going to Brect. Stopping Xikek cuts a purse string for Nelaser. The supplement is the brief. The anthology module is not in this seed.'),
    outside('Forest Track', 'Forest', -33, 'Woods or Forest', 'The track west of Barrow\'s Edge, still under the trees.', 'A day or so out of town, Kardon Karien finds the party. His daughter Gwelayn and her maid were taken by orcs. He can pay 800 gp. He does not know the orcs have already given the women to the necromancer.'),
    outside('Nameless Road Camp', 'Forest', -33, 'Woods or Forest', 'A camp under the trees beside the Old Road, about a day north of the fort.', 'On the first watch, goblins attack, about one and a half to two times the party, and then flee on purpose. If the party chases, someone falls through into the dungeon after two or three rounds. If they stay, a second band, half again as large, comes on the last watch and does the same. Between turns 4 and 18 inside, war parties still prowl. After that, scouts only. The chief means to let them clear it and then ambush them at the door.'),
    outside('Cave Hill', 'Forest', -33, 'Woods or Forest', 'A hill in the forest. The orc cave is not hard to find. A wrecked wagon is still on the road, and the orcs left a trail.', 'The women are not in the orc cave anymore. An old well on the hilltop drops to Cave room 19. Do not mention the well.'),
  ];
}

const TOWN_PATHS = [
  ['1. Gatehouse', '6. Square', 'The gate passage', false, true],
  ['1. Gatehouse', '1. Gatehouse Upper', 'Stairs in the gatehouse', false, true],
  ['1. Gatehouse', 'Old Road North', 'The Old Road, north', false, true],
  ['1. Gatehouse', 'Old Road South', 'The Old Road, south', false, true],
  ['1. Gatehouse', 'Blue Forest', 'The track west into the forest', false, true],
  ['6. Square', '3. Common Stable', 'Across the Square', false, true],
  ['6. Square', '4. Bank', 'Across the Square', false, true],
  ['6. Square', '5. Trader', 'Across the Square', false, true],
  ['6. Square', '7. Herbalist', 'Across the Square', false, true],
  ['6. Square', '8. Stableman\'s House', 'Across the Square', false, true],
  ['6. Square', '9. Gambling House', 'Across the Square', false, true],
  ['6. Square', '10. Thelan Taramedes', 'Across the Square', false, true],
  ['6. Square', '11. Smithy', 'Across the Square', false, true],
  ['6. Square', '12. Warehouse', 'Across the Square', false, true],
  ['6. Square', '13. Toothless Dragon', 'Across the Square', false, true],
  ['6. Square', '14. Iron Helm Inn', 'Across the Square', false, true],
  ['6. Square', '15. Chapel of St. Queril', 'Across the Square', false, true],
  ['6. Square', '2. Southeast Tower', 'Door to the tower', false, true],
  ['6. Square', '16. East Tower', 'Door to the tower', false, true],
  ['6. Square', '17. Northeast Tower', 'Door to the tower', false, true],
  ['6. Square', '20. Green', 'The inner gate', false, true],
  ['1. Gatehouse Upper', '2. Southeast Tower', 'Wall walk', false, true],
  ['2. Southeast Tower', '16. East Tower', 'Wall walk', false, true],
  ['16. East Tower', '17. Northeast Tower', 'Wall walk', false, true],
  ['17. Northeast Tower', '22. North Tower', 'Wall walk', false, true],
  ['22. North Tower', '21. Northwest Tower', 'Wall walk', false, true],
  ['21. Northwest Tower', '18. Southwest Tower', 'Wall walk', false, true],
  ['18. Southwest Tower', '1. Gatehouse Upper', 'Wall walk over the gate', false, true],
  ['20. Green', '18. Southwest Tower', 'Door to the tower', false, true],
  ['20. Green', '19. Inner Tower', 'Door to the tower', false, true],
  ['20. Green', '21. Northwest Tower', 'Door to the tower', false, true],
  ['20. Green', '22. North Tower', 'Door to the tower', false, true],
  ['20. Green', '23. Garrison Stable', 'The stable door', false, true],
  ['20. Green', '24. Barracks', 'The barracks door', false, true],
  ['20. Green', '25. Keep', 'The keep door', false, true],
  ['23. Garrison Stable', '23. Knights\' Quarters', 'Stairs to the knights', false, true],
  ['24. Barracks', '24. Officers\' Quarters', 'Stairs to the officers', false, true],
  ['25. Keep', '25. Keep Upper', 'Stairs to Halden\'s floor', false, true],
  ['25. Keep', '25. Keep Cellar', 'Stairs to the cellar', false, true],
  ['Old Road South', 'Stafeld Shore', 'South to the ruined bridge', false, true],
  ['Stafeld Shore', 'Stafeld Island', 'The goblin boat', false, true],
  ['Stafeld Island', 'Stafeld 1. Entrance Room', 'The mound\'s trapdoor', false, true],
  ['Blue Forest', 'Barrow\'s Edge', 'About forty miles west', false, true],
  ['Barrow\'s Edge', 'Old Dwarven Mine', 'Half a day into the hills', false, true],
  ['Barrow\'s Edge', 'Forest Track', 'The track further west', false, true],
  ['Forest Track', 'Cave Hill', 'The orc trail, a few days on', false, true],
  ['Old Road North', 'Nameless Road Camp', 'A day\'s march', false, true],
];

const ROOM_NOTES = {
  'Stafeld 8.': 'This campaign: the five here are goblins, not orcs. Same hit points. Spear, AC 14, HD 1-1, damage 1d6, move 20, save as Fighter 1, morale 7.',
  'Stafeld 14.': 'The kobolds can be talked to. They have families here. Goblins have been burning their villages. They have no plan for the fortress beyond a place to hide.',
  'Stafeld 22.': 'One of the goblins is Gobphloc Hogstone, the captain. Use him in place of the first 7-hit-point goblin. Do not roll surprise. He is already watching the gnolls in room 24. Hobgoblin captain: AC 15, HD 3, 18 hit points, battle axe 1d8, move 30, save as Fighter 3, morale 8.',
  'Stafeld 28.': 'The sword is Goblinbane, longsword +1, +3 against goblinkind, and it glows when any are within 50 feet. The bow is Hobpiercer, longbow +1, +3 against goblinkind.',
  'Cave 1.': 'They do not have to fight. Badushna and Onyg are bright enough to bargain if the party looks like a way to be rid of Starisel. A loud fight brings those two from room 4.',
  'Cave 23.': 'The altar has an ebony upper slab where the victim lies. Fire or axe-work on that slab ruins it, even if the stone base remains. Starisel will bargain until someone tries.',
  'Nameless 73.': 'The Orb of Domination is here, a faint glass sphere, found on an ordinary search. A hidden compartment in the base holds a teleport scroll. Sir Gervus turns once the orb is found. He needs 1d4 rounds to open the compartment and two more to read the scroll. Anyone holding him at the end of the reading goes with him to Ramsgate. Nelaser then appears as an image. She cannot be hurt, and she cannot hurt anyone. She wants the orb, and she is the only one who can wield it.',
};

const RUMOR_HOW = 'Rumors are heard by talking to people around the fort. At this bar, 1 gp buys a patron a drink and one roll among rumors not yet marked discovered. Skip a rumor already heard. Hold some of the list back. Each player may start with one. Barrow\'s Edge repeats this list, and a questioned goblin may answer from it.';

const INTRO = `You have been in Morgansfort for two weeks. The fort is busy, the guard is bored, and the Toothless Dragon has become the place you compare notes.

This evening you step out of the tavern. Father Thelbain of the Reformed chapel is waiting. He is stocky, about fifty, in plain robes, and the smile does not last.

Father Thelbain says:

“Hello, dear friends,” Father Thelbain cheerfully greets you. “May the blessings of Tah be upon you,” he says as he waves his hand in a semicircle in front of him, his hand folded with only two fingers extended.

“I have heard of your exploits and successes in adventuring,” he smiles. “Word has traveled from abroad, and it’s all good. Thank you for being in our city.”

Thelbain’s face turns more serious, glances around him in a suspicious manner, and motions the character to an empty part of the street. 

“I need serious help,” he whispers. “The Morgansfort knights and guard are not taking me seriously! One of my clerics, Jerard, hasn’t returned in a couple of days. He went out to the area near Stafeld to research some herbs and plants needed for making potions; he’s our botanist.

“The problem is that this is not the first time that this happens,” he looks almost embarrassed. “You see, Jerard tends to be a little... distracted and absent minded. I guess it’s the trait of a genius. His mind is always racing with ideas and possibilities, new potions, new creations.

“So he eventually returns and gets scolded about the whole thing. And the knights and regiment are tired of assembling a group to get him, only to have him appear fresh-faced like nothing has happened. But this time I think it’s bad.

“There’s tellings and rumors of unexpected goblin groups in the nearby lands,” he adds, his voice a tad darker and foreboding. “Occasionally, it’s not a rare thing. But the news is of far more frequent and bigger groups. They haven’t caused any troubles here so far. But they have been prowling Stafeld. Some think they might be planning to restore its use as a battle fortress.

“You see, above ground, Stafeld is basically gone... But the dungeons underneath are, as far as we know, open.

“I’m dead serious about this,” he continues. “And as Tah is my god and witness, I will have my dear cleric Baris Barrenrock to go with you on this journey, should you accept...”`;

const GM_NOTES = `Nelaser, an elf magic-user, has charmed the bugbear chieftain Brect Hammerhand. She wants the fort because Morgansfort and Stafeld together can threaten Slateholm, and after that the road to Novatia. Most people here think that is a far-off rumor. A few have heard the name Nelaser and filed it with the nursery story of Nelaro.

Play Stafeld first. Jerard was taken because these goblins want clerics as healers. The shore has his horse on 1-4 of a d6, and a goblin boat. Room 8 is goblins in this campaign, not orcs. Room 22 is Gobphloc Hogstone. The tomb weapons are Goblinbane and Hobpiercer.

Once Gobphloc has talked, Thelbain sends the party west through the Blue Forest. This campaign puts the Cave of the Unknown in Gwyndelfinn, not a few miles north of the fort. Barrow's Edge is about forty miles out. The old mine is the Gold in the Hills job, and that gold is going to Brect. The anthology itself is not keyed here. Kardon Karien meets them west of town. The orcs already handed his daughter to Starisel. Starisel is not Nelaser. The altar is a false lead. Nelaser's hold on the host is the Orb of Domination, in Nameless room 73.

The Nameless Dungeon is a day's march north, under the ruins of Alderston. Sir Gervus belongs to Nelaser. He means to take the orb and teleport to her keep at Ramsgate. She appears there only as an image. She is not using the orb day to day anymore. She still wants it back in her hand.

The twenty rumors at the Toothless Dragon are the supplement's list. False ones are marked. The module's own rumor table is not loaded.

${RUMOR_HOW}

Do not select a place during the fill. Begin Campaign opens on the Toothless Dragon. The campaign is not started.`;

async function one(client, sql, params) {
  const result = await client.query(sql, params);
  if (result.rows.length !== 1) throw new Error(`Expected one row: ${sql}`);
  return result.rows[0];
}

async function main() {
  const modulePath = path.join(MODULE_DIR, 'BF1-Morgansfort-r29.odt');
  const supplementPath = path.join(MODULE_DIR, 'Morgansfort Campaign Supplement.odt');
  if (!fs.existsSync(modulePath) || !fs.existsSync(supplementPath)) {
    throw new Error(`Module files were not found in ${MODULE_DIR}`);
  }
  const moduleXml = readOdt(modulePath);
  const supplementXml = readOdt(supplementPath);
  const model = buildModel(odtText(moduleXml), supplementXml);

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
    const monsters = await client.query(
      'SELECT id, name, treasure_type FROM monster WHERE ruleset_id = $1',
      [ruleset.id]
    );
    const byNorm = new Map(monsters.rows.map((row) => [norm(row.name), row]));
    const byTokens = new Map(monsters.rows.map((row) => [tokenKey(row.name), row]));
    const codes = await client.query('SELECT code FROM treasure_type WHERE ruleset_id = $1', [ruleset.id]);
    const treasureCodes = new Set(codes.rows.map((row) => row.code));
    const stock = await client.query(
      'SELECT id, name FROM encounter_table WHERE ruleset_id = $1 AND campaign_id IS NULL',
      [ruleset.id]
    );
    const stockId = (name) => {
      const found = stock.rows.find((row) => row.name === name);
      if (!found) throw new Error(`Missing stock table ${name}`);
      return found.id;
    };
    const unmatched = new Set();

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

    const tableIds = {};
    for (const wander of model.wanders) {
      const die = Math.max(...wander.entries.map((entry) => entry.faceHi));
      const table = await one(
        client,
        `INSERT INTO encounter_table (name, die, campaign_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [`${wander.key} denizens`, die, campaignId]
      );
      tableIds[wander.key] = table.id;
      for (const entry of wander.entries) {
        const monster = monsterFor(entry.label, byNorm, byTokens);
        if (!monster) unmatched.add(entry.label);
        await client.query(
          `INSERT INTO encounter_table_row
             (encounter_table_id, face_lo, face_hi, monster_id, label, quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            table.id,
            entry.face,
            entry.faceHi,
            monster ? monster.id : null,
            entry.label,
            entry.quantity,
          ]
        );
      }
    }

    const locationIds = {};
    async function addPlace(place) {
      const table = place.tableId || tableIds[place.table] || stockId(place.table);
      const inserted = await one(
        client,
        `INSERT INTO campaign_location
           (campaign_id, name, place, check_die, interval_seconds, encounter_table_id,
            terrain, movement_pct, summary, site, ambient_light, dark_summary, gm_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          campaignId,
          place.name,
          place.place,
          place.die,
          place.interval,
          table,
          place.terrain,
          place.pct,
          clip(place.summary),
          place.site,
          place.ambientLight === undefined ? (place.place === 'inside' ? 0 : null) : place.ambientLight,
          place.darkSummary === undefined ? (place.place === 'inside' ? 'Dark. Bring a light.' : null) : place.darkSummary,
          clip(place.gmText),
        ]
      );
      locationIds[place.name] = inserted.id;
    }

    for (const place of [...townPlaces(), ...wildPlaces()]) await addPlace(place);
    for (const room of model.rooms) {
      const extra = Object.entries(ROOM_NOTES).find(([key]) => room.name.startsWith(key));
      await addPlace({
        name: room.name,
        place: 'inside',
        terrain: null,
        pct: null,
        table: room.table,
        summary: room.summary,
        gmText: extra ? `${room.gmText || ''}\n${extra[1]}` : room.gmText,
        site: room.site,
        die: 6,
        interval: room.interval,
      });
    }
    for (const wander of model.wanders) {
      await addPlace({
        name: wander.name,
        place: 'inside',
        terrain: null,
        pct: null,
        table: wander.key,
        summary: 'Not a room. The printed wandering hit points for this level are here.',
        gmText: 'The rooms use this level\'s die table. These creatures are the module\'s printed totals. Take one of them for a wander check. Accepting the check also offers a new creature with blank hit points. Do not use both for the same check.',
        site: wander.site,
        die: 6,
        interval: wander.interval,
      });
    }
    await addPlace({
      name: 'Cave Orc Tribe',
      place: 'inside',
      terrain: null,
      pct: null,
      table: 'Cave',
      summary: 'Not a room. The orc tribe\'s printed hit points are kept here.',
      gmText: 'Room 1 usually has 2d6+4 of the warriors, the rest being out raiding. The armed women are in room 3. Onyg and Badushna are moved to room 4. Thirteen pregnant women are noncombatants at 3 hit points if you need them. They are not given rows.',
      site: 'Cave of the Unknown',
      die: 6,
      interval: 1200,
    });

    await saveCampaignDetails(client, campaignId, {
      intro: INTRO,
      gm_notes: GM_NOTES,
      first_location_id: locationIds['13. Toothless Dragon'],
    });

    const categories = await client.query('SELECT id, name FROM item_categories');
    const categoryId = (name) => {
      const found = categories.rows.find((row) => row.name === name);
      if (!found) throw new Error(`Missing item category ${name}`);
      return found.id;
    };
    async function shop(locationName, name, buy, sell, categoryNames) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_location_shops (location_id, name, buy_cost_delta, sell_cost_delta)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [locationIds[locationName], name, buy, sell]
      );
      for (const categoryName of categoryNames) {
        await client.query(
          `INSERT INTO campaign_location_shop_item_categories (shop_id, item_category_id)
           VALUES ($1, $2)`,
          [inserted.id, categoryId(categoryName)]
        );
      }
    }
    await shop('5. Trader', 'Lotherra\'s Goods', 0, -60, ['Goods', 'Clothing', 'Storage', 'Provisions', 'Consumables']);
    await shop('11. Smithy', 'Rugarr\'s Forge', 0, 0, ['Weapon', 'Armor']);
    await shop('13. Toothless Dragon', 'Toothless Dragon', 0, -50, ['Provisions']);

    const listedHoard = (room) => room && /\d+\s*(gp|sp|cp|pp|ep)\b/i.test(room.lines.join('\n'));
    const creatureIdsByLocation = {};
    const remember = (locationName, id) => {
      if (!creatureIdsByLocation[locationName]) creatureIdsByLocation[locationName] = [];
      creatureIdsByLocation[locationName].push(id);
    };
    async function addCreature(locationName, rawName, hp, note) {
      const monster = monsterFor(rawName, byNorm, byTokens);
      if (!monster) unmatched.add(rawName.replace(/^\d+\s+/, ''));
      const room = model.rooms.find((row) => row.name === locationName);
      const treasure = monster && !listedHoard(room) && treasureCodes.has(monster.treasure_type)
        ? monster.treasure_type
        : null;
      const inserted = await one(
        client,
        `INSERT INTO campaign_creature
           (campaign_id, location_id, name, monster_id, treasure_type, hp, base_hp,
            disposition, base_disposition, note)
         VALUES ($1,$2,$3,$4,$5,$6,$6,'present','present',$7)
         RETURNING id`,
        [
          campaignId,
          locationIds[locationName],
          displayName(rawName, monster),
          monster ? monster.id : null,
          treasure,
          hp,
          note ? String(note).slice(0, 400) : null,
        ]
      );
      remember(locationName, inserted.id);
      return inserted.id;
    }

    async function addGroups(locationName, groups) {
      const ids = [];
      for (const group of groups) {
        const hits = group.hits.length > 0 ? group.hits : [];
        if (hits.length === 0) continue;
        for (const hp of hits) {
          ids.push(await addCreature(locationName, group.name, hp, group.stat));
        }
      }
      return ids;
    }

    for (const room of model.rooms) {
      if (room.prefix === 'Cave' && (room.number === 1 || room.number === 4 || room.number === 23)) continue;
      await addGroups(room.name, room.groups);
    }
    for (const wander of model.wanders) await addGroups(wander.name, wander.groups);
    await addGroups('Cave Orc Tribe', model.tribe);
    await addGroups(model.rooms.find((room) => room.prefix === 'Cave' && room.number === 23).name, model.starisel);

    const stafeld8 = model.rooms.find((room) => room.prefix === 'Stafeld' && room.number === 8);
    if (stafeld8) {
      const goblin = byNorm.get('goblin');
      if (!goblin) throw new Error('Catalog has no Goblin');
      await client.query(
        `UPDATE campaign_creature
         SET name = 'Goblin', monster_id = $2
         WHERE location_id = $1 AND name ILIKE '%orc%'`,
        [locationIds[stafeld8.name], goblin.id]
      );
    }
    const stafeld22 = model.rooms.find((room) => room.prefix === 'Stafeld' && room.number === 22);
    const hobgoblin = byNorm.get('hobgoblin');
    if (!hobgoblin) throw new Error('Catalog has no Hobgoblin');
    if (stafeld22) {
      const replaced = await client.query(
        `UPDATE campaign_creature
         SET name = 'Gobphloc Hogstone', monster_id = $2, hp = 18, base_hp = 18,
             note = 'Hobgoblin captain. AC 15, HD 3, battle axe 1d8, morale 8.'
         WHERE id = (
           SELECT id FROM campaign_creature
           WHERE location_id = $1 AND name = 'Goblin' AND hp = 7
           ORDER BY id LIMIT 1
         )
         RETURNING id`,
        [locationIds[stafeld22.name], hobgoblin.id]
      );
      if (replaced.rows.length === 0) {
        await addCreature(stafeld22.name, 'Gobphloc Hogstone', 18, 'Hobgoblin captain. AC 15, HD 3, battle axe.');
      }
    }

    async function moveNamed(fromName, toName, pattern) {
      await client.query(
        `UPDATE campaign_creature SET location_id = $2
         WHERE location_id = $1 AND name ILIKE $3`,
        [locationIds[fromName], locationIds[toName], pattern]
      );
    }
    const cave4 = model.rooms.find((room) => room.prefix === 'Cave' && room.number === 4).name;
    await moveNamed('Cave Orc Tribe', cave4, 'Onyg%');
    await moveNamed('Cave Orc Tribe', cave4, 'Badushna%');

    async function encounter(locationName, title, kind, purpose, notes, memberIds) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_encounter
           (campaign_id, location_id, title, kind, purpose, notes, status, base_status)
         VALUES ($1,$2,$3,$4,$5,$6,'prepared','prepared') RETURNING id`,
        [campaignId, locationIds[locationName], title.slice(0, 80), kind, clip(purpose), clip(notes)]
      );
      for (const creatureId of memberIds || []) {
        await client.query(
          'INSERT INTO campaign_encounter_member (encounter_id, creature_id) VALUES ($1, $2)',
          [inserted.id, creatureId]
        );
      }
    }

    await encounter(
      '13. Toothless Dragon',
      'Thelbain\'s request',
      'social',
      'Thelbain asks them to find Jerard.',
      'He is at the door as they leave. Baris is still at the chapel. The potions come after they agree. He will not go himself.',
      []
    );
    await encounter(
      'Stafeld Shore',
      'Jerard\'s horse',
      'discovery',
      'A search may find the horse and the boat.',
      'Horse on 1-4 of a d6. Wisdom check for goblin spears. The boat is goblin. Delta mishap is 1 on 1d6, then a Strength check.',
      []
    );
    await encounter(
      'Forest Track',
      'Kardon\'s hire',
      'social',
      'Kardon wants his daughter back.',
      'He offers 800 gp. Gwelayn and the maid Saril are already in the cave, not with the orcs. He still pays if Gwelayn\'s body is returned. Saril does not matter to him if Gwelayn is dead.',
      []
    );
    await encounter(
      'Nameless Road Camp',
      'Goblin night attack',
      'combat',
      'Goblins attack, then flee, to draw them onto the sinkhole.',
      'First watch: about 1.5 to 2 times the party. They fail morale on purpose. A chase of two or three rounds drops the lead into Nameless room 1. If the party stays, the last watch brings a band half again as large, with the same trick.',
      []
    );
    await encounter(
      'Old Dwarven Mine',
      'Mine gold',
      'discovery',
      'Someone is working the dead mine.',
      'Gold in the Hills is not keyed here. If they break it up, the coin was bound for Brect. Xikek knows that much under hard questioning.',
      []
    );

    for (const room of model.rooms) {
      const members = creatureIdsByLocation[room.name] || [];
      const statNotes = room.groups.map((group) => group.stat).join('\n');
      if (members.length === 0 && !statNotes) {
        if (/pit|trap/i.test(room.title)) {
          await encounter(room.name, room.title.slice(0, 80), 'trap', room.title, room.gmText, []);
        }
        continue;
      }
      if (room.prefix === 'Cave' && room.number === 1) {
        await encounter(
          room.name,
          'Orc common room',
          'combat',
          '2d6+4 warriors are here. The rest are raiding.',
          'Draw them from Cave Orc Tribe. They will talk. See the room note. A loud fight brings Onyg and Badushna.',
          []
        );
        continue;
      }
      await encounter(
        room.name,
        room.title.slice(0, 80),
        'combat',
        members.length ? 'The printed creatures in this room.' : 'Keyed, with no printed total.',
        statNotes || room.gmText,
        members
      );
    }
    const leaders = await client.query(
      `SELECT id FROM campaign_creature
       WHERE location_id = $1 AND (name ILIKE 'Onyg%' OR name ILIKE 'Badushna%')
       ORDER BY id`,
      [locationIds[cave4]]
    );
    await encounter(
      cave4,
      'Onyg and Badushna',
      'combat',
      'The ogre and the orc queen, if they were not already drawn out.',
      'They are usually here. Room 1\'s noise brings them.',
      leaders.rows.map((row) => row.id)
    );

    async function objective(locationName, body, known) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_objective
           (campaign_id, location_id, body, known, base_known, status, base_status)
         VALUES ($1,$2,$3,$4,$4,'open','open') RETURNING id`,
        [campaignId, locationName ? locationIds[locationName] : null, body, known]
      );
      return inserted.id;
    }
    const findJerard = await objective('Stafeld Shore', 'Find Jerard of Newport, who rode south toward Stafeld for herbs and did not come back.', true);
    await objective('Stafeld Island', 'Learn what the goblins are doing at Stafeld.', true);
    await objective('Stafeld 28. The Tomb', 'Grancent Kyne was buried under Stafeld with his weapons.', true);
    await objective(null, 'Nelaser is aiming a goblin host at Morgansfort, with Slateholm and Novatia behind it.', false);
    const cave8 = model.rooms.find((room) => room.prefix === 'Cave' && room.number === 8);
    await objective(cave8 ? cave8.name : null, 'Bring Gwelayn back to her father.', false);
    await objective('Old Dwarven Mine', 'The gold leaving the old mine is paying Brect\'s host.', false);
    const nameless73 = model.rooms.find((room) => room.prefix === 'Nameless' && room.number === 73);
    await objective(nameless73.name, 'The Orb of Domination is hidden in the Nameless Dungeon.', false);
    await objective(nameless73.name, 'Sir Gervus means to steal the orb for Nelaser.', false);

    async function npc(locationName, name, motivation, knowledge, attitude) {
      const inserted = await one(
        client,
        `INSERT INTO campaign_npc (campaign_id, location_id, name, motivation, knowledge, attitude)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [campaignId, locationName ? locationIds[locationName] : null, name, clip(motivation), clip(knowledge), attitude]
      );
      return inserted.id;
    }
    const thelbain = await npc(
      '13. Toothless Dragon',
      'Father Thelbain',
      'He wants Jerard back, and he wants the knights to take the goblin talk seriously. He will not go underground.',
      'Jerard left two mornings ago for herbs near Stafeld. Baris will go along. Two-dose healing potions after they agree. He knows the Kyne rumor and the old tale of the cave, and he does not know Nelaser is real.',
      'Earnest'
    );
    await npc('15. Chapel of St. Queril', 'Baris Barrenrock', 'She goes where Thelbain sends her.', '1st level cleric of the Reformed church. She is his right hand on this trip.', 'Steady');
    await npc(null, 'Jerard of Newport', 'He wants to go home and finish his potions.', 'Captured near Stafeld while herb-gathering. He is careless, likable, and folds in a crisis. He will have overheard goblin talk if they find him alive. No keyed cell is printed for him.', 'Frightened');
    await npc('25. Keep', 'Baronet Halden Rathwynn', 'Keep the barony whole, and keep adventurers coming.', 'Fighter 5. He gilds the ruins when he tells stories. He runs if he is caught alone. He will not abandon his own troops. Potion of Flying, Medallion of ESP, plate +1, shield, ring of protection +2, longsword +1 and +3 against undead.', 'Welcoming');
    await npc('25. Keep', 'Bailiff Tomandy', 'He wants the quiet Slateholm retirement Morgan promised and did not deliver.', 'He is 61, sharp, and resentful. He and Halden hold the only vault keys.', 'Proper');
    await npc('23. Knights\' Quarters', 'Sir Kellin', 'Hold the fort in Morgan\'s absence.', 'Senior knight. Thelbain wants the goblin proof brought to him or to Aldric.', 'Dutiful');
    await npc('23. Knights\' Quarters', 'Sir Galadin', 'Same oath as Kellin.', 'The other senior knight. The junior knights came to serve under these two.', 'Dutiful');
    await npc('23. Knights\' Quarters', 'Sir Gervus', 'In public, a pious junior knight. In fact, he reports to Nelaser.', 'He wears a ring of spell turning only part of the time, afraid of using it up. Half the time it is in his lockbox. On the Nameless delve he means to take the orb, let the party die, and teleport to Ramsgate.', 'Polite');
    await npc('24. Officers\' Quarters', 'Top Sergeant Aldric', 'Keep the squads alive.', 'Thelbain names him, with Kellin, as the man who should hear real proof of a goblin campaign.', 'Blunt');
    await npc('13. Toothless Dragon', 'Garnoth', 'Run a quiet tavern.', 'Retired fighter. He throws out anyone who bothers his daughters.', 'Gruff');
    await npc('5. Trader', 'Jeroh Lotherra', 'Buy cheap and sell the list.', 'Pays 4 sp on the gp for ordinary goods. Takes jewelry only in trade, at 6 sp on the gp.', 'Commercial');
    await npc('11. Smithy', 'Rugarr', 'Keep the fort in iron.', 'Bachelor. Tob is the apprentice.', 'Friendly');
    await npc('7. Herbalist', 'Maien Brai', 'Sell what she has grown.', 'Healing potions on hand about 60 percent of the time, 250 gp. She knew the kind of work Jerard was doing.', 'Friendly');
    await npc('10. Thelan Taramedes', 'Thelan Taramedes', 'Be left with his books, and be admired.', '4th level magic-user. The useful scrolls are at the bottom of the bedroom trunk.', 'Pompous');
    await npc('9. Gambling House', 'Bargus', 'Keep the cellar full and the watch paid.', 'Invitation only. He can arrange most quiet crimes.', 'Sly');
    await npc(stafeld22.name, 'Gobphloc Hogstone', 'Scout the fortress for Brect and get out alive if the scouts die.', 'He knows Brect wants a hidden power in a cave to the west, and he does not know Nelaser. He will talk after the knights have him.', 'Haughty');
    await npc(null, 'Brect Hammerhand', 'Take the coast, which he thinks is his own idea.', 'Bugbear chieftain. Nelaser has him, by charm and by greed. He is smarter than a bugbear is supposed to be.', 'Proud');
    await npc(null, 'Nelaser of the Silver Hand', 'Take Novatia, starting with this coast.', 'Elf magic-user. Her keep is Ramsgate. She does not need the orb for the charm anymore. She still wants it in her hand. No stats are printed.', 'Cold');
    await npc(null, 'Kardon Karien', 'Get Gwelayn back.', 'He meets them on the forest track, not in the fort. 800 gp. He still pays for her body.', 'Desperate');
    const cave23 = model.rooms.find((room) => room.prefix === 'Cave' && room.number === 23).name;
    await npc(cave23, 'Starisel Zelinth', 'Finish a wife on the altar, and keep the altar.', 'He is a zombraire, not Nelaser. He met her once, blindfolded, and refused a junior place. He knows the orb\'s name and that it lies in the Nameless Dungeon. He will trade that to live.', 'Unhinged');
    await npc(cave4, 'Badushna', 'Keep the tribe and get Starisel out of the caves.', 'She will deal. The complex can stay theirs if he is gone.', 'Wary');
    await npc(cave4, 'Onyg', 'Break the man who held him still.', 'Ogre. He follows Badushna\'s bargains further than he would follow a stranger.', 'Angry');

    async function clue(locationName, body, npcId, objectiveId) {
      await client.query(
        `INSERT INTO campaign_clue
           (campaign_id, location_id, npc_id, objective_id, body, discovered, base_discovered)
         VALUES ($1,$2,$3,$4,$5,false,false)`,
        [campaignId, locationName ? locationIds[locationName] : null, npcId, objectiveId, clip(body)]
      );
    }
    for (const rumor of model.rumors) {
      await clue(
        '13. Toothless Dragon',
        `${rumor.text} ${rumor.falseRumor ? 'False.' : 'Treat as true for this campaign.'}`,
        null,
        null
      );
    }
    await clue('13. Toothless Dragon', 'Jerard rode south to an herb patch within sight of Stafeld and has been gone two days.', thelbain, findJerard);
    await clue('Stafeld Shore', 'The beached boat and, if the horse is found, the spears are goblin work.', null, null);
    await clue('Cave Hill', 'The hilltop well drops into the dungeon. The party has not been told.', null, null);

    const roomByNumber = new Map(model.rooms.map((room) => [`${room.prefix}:${room.number}`, room.name]));
    const edges = [];
    const edgeKey = new Set();
    function addEdge(fromName, toName, reason, oneWay, discovered, strict) {
      if (!fromName || !toName || fromName === toName) return;
      if (!locationIds[fromName] || !locationIds[toName]) {
        if (strict) throw new Error(`Path is missing a place: ${fromName} -> ${toName}`);
        return;
      }
      const key = oneWay
        ? `${fromName}>${toName}:${reason}`
        : `${[fromName, toName].sort().join('|')}:${reason}`;
      if (edgeKey.has(key)) return;
      edgeKey.add(key);
      edges.push([fromName, toName, reason, oneWay, discovered]);
    }
    for (const [fromName, toName, reason, oneWay, discovered] of TOWN_PATHS) {
      addEdge(fromName, toName, reason, oneWay, discovered, true);
    }
    addEdge('Nameless Road Camp', roomByNumber.get('Nameless:1'), 'The ground gives way', true, false);
    addEdge('Cave Hill', roomByNumber.get('Cave:1'), 'The orc cave mouth', false, true);
    addEdge('Cave Hill', roomByNumber.get('Cave:19'), 'The hilltop well', true, false);
    for (const room of model.rooms) {
      for (const link of linksFrom(`${room.title}\n${room.lines.join('\n')}`)) {
        const target = roomByNumber.get(`${room.prefix}:${link.number}`);
        addEdge(room.name, target, link.reason, link.oneWay, link.discovered);
      }
      if (room.prefix === 'Stafeld' && room.number < 17 && /\bpit\b/i.test(room.lines.join('\n'))) {
        addEdge(room.name, roomByNumber.get('Stafeld:17'), 'A pit drops to the lower level', true, false);
      }
    }
    for (const [fromName, toName, reason, oneWay, discovered] of edges) {
      await client.query(
        `INSERT INTO campaign_transition
           (campaign_id, from_location_id, to_location_id, reason, one_way, discovered, base_discovered, blocked, base_blocked)
         VALUES ($1,$2,$3,$4,$5,$6,$6,false,false)`,
        [campaignId, locationIds[fromName], locationIds[toName], reason, oneWay, discovered]
      );
    }

    const counts = {
      campaignId,
      dryRun: DRY,
      gm: GM,
      player: PLAYER,
      locations: Object.keys(locationIds).length,
      rooms: model.rooms.length,
      transitions: edges.length,
      rumors: model.rumors.length,
      unmatched: [...unmatched].sort(),
    };
    if (DRY) {
      await client.query('ROLLBACK');
      console.log(JSON.stringify(counts, null, 2));
      return;
    }
    await client.query('COMMIT');
    console.log(JSON.stringify(counts, null, 2));
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
