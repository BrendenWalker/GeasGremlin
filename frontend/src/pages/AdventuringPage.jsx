import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNotices } from '../components/NoticeContext';
import {
  addAdventuringMark,
  addHireling,
  checkHireling,
  clearHirePenalty,
  endAdventureLoyalty,
  lightAdventuring,
  removeHireling,
  rollHire,
  lostAdventuring,
  marchAdventuring,
  settleAdventuring,
  weatherAdventuring,
  acceptWander,
  addEncounterEnemy,
  endEncounter,
  getAdventuring,
  getCampaign,
  getItems,
  getMonsters,
  getPrep,
  prepDamage,
  prepRepair,
  giveParty,
  removeAdventuringMark,
  removeEncounterEnemy,
  fleeEncounterEnemy,
  applyAward,
  applyDamage,
  rollAttack,
  tallyAward,
  rollInitiative,
  rollMorale,
  rollReaction,
  rollSurprise,
  rollTreasure,
  rollTurn,
  setEnemyHitPoints,
  startEncounter,
  takeCreatures,
  setLocationFlag,
  setPlayFact,
  applyRisingWater,
  rejectRisingWater,
  applyBadAir,
  rejectBadAir,
  clearLocationFlag,
  setAdventuringPlace,
  tickAdventuring,
  selectLocation,
  concludeCampaign,
  endSituationSession,
} from '../api/api';
import { CONCLUDE_CONFIRM } from '../domain/concludeConfirm.mjs';
import { clockToSeconds, effectEndSeconds, effectTurnsLeft, formatGameTime, markStatus, primaryStep, splitGameTime } from '../domain/gameTime.mjs';
import SituationPanel from '../components/SituationPanel';

const COIN = new Set(['cp', 'sp', 'ep', 'gp', 'pp']);

const FIELD = {
  padding: '0.45rem',
  borderRadius: 4,
  border: '1px solid #3d3530',
  background: '#1a1614',
  color: '#e8e0d5',
};

const CLOCK_ZERO = { day: 1, hour: 0, minute: 0, second: 0 };

const CLOCK_BUTTONS = [
  { step: 'round', label: 'Next Round' },
  { step: 'turn', label: 'Next Turn' },
  { step: 'watch', label: 'Next Watch' },
  { step: 'day', label: 'Next Day' },
];

function intervalLabel(seconds) {
  const n = Number(seconds);
  if (n === 14400) return 'every watch';
  if (n === 1800) return 'every 3 turns';
  return `every ${n} seconds`;
}

function locationFacts(loc) {
  const bits = [loc.place];
  if (loc.site) bits.push(loc.site);
  if (loc.terrain) {
    const pct = Number(loc.movement_pct);
    const shown = Number.isInteger(pct) ? `${pct > 0 ? '+' : ''}${pct}%` : '';
    bits.push(shown ? `${loc.terrain} ${shown}` : loc.terrain);
  }
  bits.push(`d${loc.check_die}`);
  bits.push(intervalLabel(loc.interval_seconds));
  return bits.join(' · ');
}

function errText(err) {
  return err.response?.data?.error || err.message;
}

function wholeInt(value) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+$/.test(text)) return null;
  return Number(text);
}

function signed(n) {
  const value = Number(n) || 0;
  return value > 0 ? `+${value}` : String(value);
}

function carryLine(character) {
  if (character.move == null) return null;
  const load = character.load === 'over'
    ? 'over the heavy load'
    : character.load === 'heavy'
      ? 'heavily loaded'
      : 'lightly loaded';
  return `${character.pounds} lb · light ${character.light_lb} · heavy ${character.heavy_lb} · ${character.armor} · ${load} · ${character.move}'`;
}

function bodyLine(name, data) {
  const parts = [];
  if (data.food_damage) parts.push(`${data.food_damage} from hunger`);
  if (data.water_damage) parts.push(`${data.water_damage} from thirst`);
  if (data.healed) parts.push(`${data.healed} healed`);
  if (data.creatures_healed) {
    const count = Number(data.creatures_healed);
    parts.push(`${count} creature${count === 1 ? '' : 's'} healed the same`);
  }
  if (data.heal_food) parts.push('healing stopped until they eat');
  if (data.heal_water) parts.push('healing stopped until they drink');
  if (!data.slept) parts.push(`short of ${data.required_hours} hours sleep`);
  if (data.down) parts.push('down');
  if (parts.length === 0) parts.push('no change');
  return `${name}: ${parts.join('. ')}.`;
}

function hitPointLabel(hp) {
  if (hp == null || hp === '') return 'no hit points';
  if (Number(hp) === 0) return 'down';
  return `${hp} hp`;
}

function characterHitPoints(current, maximum) {
  if (maximum == null || maximum === '') return 'no hit points';
  const now = current == null || current === '' ? maximum : current;
  return `${now}/${maximum}`;
}

function emptyRoomLine(check) {
  if (!check) return null;
  const die = `${check.check_roll} on d${check.check_die}`;
  if (check.outcome === 'named') return `Empty room: ${check.name} (${die})`;
  if (check.outcome === 'none') return `Empty room, nothing to meet (${die})`;
  return `Empty room miss (${die})`;
}

function creatureGroups(creatures) {
  const groups = [];
  for (const creature of creatures || []) {
    const key = [creature.name, creature.hp, creature.base_hp, creature.disposition, creature.in_fight ? 1 : 0, creature.note || ''].join('|');
    const found = groups.find((group) => group.key === key);
    if (found) found.count += 1;
    else {
      groups.push({
        key,
        name: creature.name,
        hp: creature.hp,
        base_hp: creature.base_hp,
        disposition: creature.disposition,
        in_fight: creature.in_fight === true,
        note: creature.note || '',
        count: 1,
      });
    }
  }
  return groups;
}

function creatureLine(group) {
  let state = 'no hit points';
  if (group.hp === 0) state = 'down';
  else if (group.hp != null && group.hp !== '') {
    state = group.base_hp == null || group.base_hp === '' ? `${group.hp} hp` : `${group.hp}/${group.base_hp}`;
  }
  const fled = group.disposition === 'fled' ? ' · fled' : '';
  const fight = group.in_fight ? ' · in the fight' : '';
  const count = group.count > 1 ? ` · ${group.count}` : '';
  const note = group.note ? ` · ${group.note}` : '';
  return `${group.name}${count} · ${state}${fled}${fight}${note}`;
}

function fighterOptions(board) {
  const options = [];
  for (const character of board?.characters || []) {
    options.push({ key: `character:${character.id}`, side: 'character', id: character.id, name: character.name });
  }
  for (const enemy of board?.enemies || []) {
    options.push({ key: `enemy:${enemy.id}`, side: 'enemy', id: enemy.id, name: enemy.name });
  }
  return options;
}

function blowSentence(blow) {
  const bonus = Number(blow.bonus) ? ` ${signed(blow.bonus)}` : '';
  const natural = blow.natural === 'miss' ? ' Natural 1 misses.' : blow.natural === 'hit' ? ' Natural 20 hits.' : '';
  return `${blow.attacker.name} rolled ${blow.roll}${bonus} = ${blow.total} vs AC ${blow.armor_class}. ${blow.hit ? 'Hit.' : 'Miss.'}${natural}`;
}

function damageSentence(row) {
  const dice = Array.isArray(row.faces) && row.faces.length
    ? `${row.faces.join('+')}${Number(row.flat) ? ` ${signed(row.flat)}` : ''} = `
    : '';
  const left = row.down ? `${row.defender.name} is down.` : `${row.defender.name} has ${row.hp} hit points.`;
  return `${dice}${row.amount} damage. ${left}`;
}

function awardGroupLine(group) {
  const dice = group.hd < 1 ? 'less than 1 HD' : `${group.hd} HD`;
  const special = group.asterisks ? `, ${group.asterisks} special` : '';
  return `${group.name}: ${dice}${special}, ${group.count} × ${group.each} = ${group.subtotal}`;
}

function awardShareLine(share) {
  const who = share.retainer ? `${share.name}, retainer` : share.name;
  if (share.capped && share.amount !== share.table) return `${who}: ${share.amount} (stops at ${share.ceiling})`;
  return `${who}: ${share.amount}`;
}

function surpriseActor(actor) {
  if (actor.range < 1) return `${actor.name}: cannot be surprised`;
  if (actor.surprised) return `${actor.name}: surprised on 1–${actor.range}, skips one round`;
  return `${actor.name}: not surprised (1–${actor.range})`;
}

function turnLines(result) {
  const lines = [`${result.name}, level ${result.level}, rolled ${result.roll} on 1d20.`];
  for (const group of result.groups || []) {
    if (!group.checked) {
      lines.push(`${group.name}: not reached.`);
      continue;
    }
    const need = group.target === 'T' || group.target === 'D' || group.target === 'No'
      ? String(group.target)
      : `needs ${group.target}`;
    const effect = group.target === 'D' && group.turned > 0 ? ', damaged' : '';
    lines.push(`${group.name} (${group.label}) ${need}. Turned ${group.turned} of ${group.count}${effect}.`);
  }
  if (result.hd) lines.push(`2d6 hit dice: ${result.hd.total}.`);
  if (result.damage) lines.push(`Damage ${result.damage.total}. Not applied to hit points.`);
  if ((result.groups || []).some((group) => group.turned > 0)) lines.push('Turned undead flee.');
  if (result.block) lines.push('Cannot turn again for one turn.');
  if (result.retry) lines.push('Not all were affected. Another attempt can be made next round.');
  return lines;
}

function ClockFields({ value, onChange }) {
  const set = (key, raw) => {
    const n = parseInt(raw, 10);
    onChange({ ...value, [key]: Number.isNaN(n) ? 0 : n });
  };
  const input = { ...FIELD, width: '100%', boxSizing: 'border-box' };
  return (
    <span style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto 1fr auto 1fr', gap: 4, alignItems: 'center' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        Day
        <input type="number" min={1} value={value.day} onChange={(e) => set('day', e.target.value)} style={input} />
      </label>
      <input type="number" min={0} max={23} value={value.hour} onChange={(e) => set('hour', e.target.value)} style={input} aria-label="Hour" />
      <span className="muted">:</span>
      <input type="number" min={0} max={59} value={value.minute} onChange={(e) => set('minute', e.target.value)} style={input} aria-label="Minute" />
      <span className="muted">:</span>
      <input type="number" min={0} max={59} value={value.second} onChange={(e) => set('second', e.target.value)} style={input} aria-label="Second" />
    </span>
  );
}

export default function AdventuringPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { notify } = useNotices();
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const setError = (text) => notifyRef.current({ tone: 'error', text: text || '', source: 'adventuring-error' });
  const setNotice = (text) => notifyRef.current({ tone: 'info', text: text || '', source: 'adventuring-notice' });
  const [items, setItems] = useState([]);
  const [monsters, setMonsters] = useState([]);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [homeTab, setHomeTab] = useState('location');
  const [busy, setBusy] = useState(false);
  const [concludeArmed, setConcludeArmed] = useState(false);
  const [marchNote, setMarchNote] = useState(null);
  const [lostNote, setLostNote] = useState(null);
  const [weatherNote, setWeatherNote] = useState(null);
  const [prep, setPrep] = useState(null);
  const [vehicleName, setVehicleName] = useState('');
  const [taken, setTaken] = useState(0);
  const [damageAmount, setDamageAmount] = useState('');
  const [crew, setCrew] = useState('1');
  const [vehicleText, setVehicleText] = useState('');
  const [lostLeader, setLostLeader] = useState('');
  const [followingRoad, setFollowingRoad] = useState(false);
  const [navigatorOn, setNavigatorOn] = useState(false);
  const [employerId, setEmployerId] = useState('');
  const [hireName, setHireName] = useState('');
  const [hireLevel, setHireLevel] = useState('1');
  const [hireAdjust, setHireAdjust] = useState(0);
  const [hireRoll, setHireRoll] = useState(null);
  const [hireNote, setHireNote] = useState(null);
  const [specialistRole, setSpecialistRole] = useState('');
  const [specialistCostValue, setSpecialistCostValue] = useState('');
  const [mercenaryRole, setMercenaryRole] = useState('');
  const [mercenaryLevel, setMercenaryLevel] = useState('1');
  const [mercenaryQty, setMercenaryQty] = useState('1');
  const [loyaltyAdjust, setLoyaltyAdjust] = useState(0);
  const [bodyNote, setBodyNote] = useState(null);
  const [bodyAte, setBodyAte] = useState({});
  const [bodyDrank, setBodyDrank] = useState({});
  const [bodyBed, setBodyBed] = useState({});
  const [bodyHours, setBodyHours] = useState({});
  const [xp, setXp] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [enemyMonsterId, setEnemyMonsterId] = useState('');
  const [enemyName, setEnemyName] = useState('');
  const [enemyQty, setEnemyQty] = useState('1');
  const [takeName, setTakeName] = useState('');
  const [takeCount, setTakeCount] = useState('1');
  const [flagNote, setFlagNote] = useState('');
  const [flagState, setFlagState] = useState('sprung');
  const [draft, setDraft] = useState(null);
  const [partyAmbush, setPartyAmbush] = useState(false);
  const [enemyAmbush, setEnemyAmbush] = useState(false);
  const [keenEnemies, setKeenEnemies] = useState({});
  const [surprise, setSurprise] = useState(null);
  const [leadId, setLeadId] = useState('');
  const [reactionAdjustment, setReactionAdjustment] = useState(0);
  const [reaction, setReaction] = useState(null);
  const [initiative, setInitiative] = useState(null);
  const [moraleAdjustment, setMoraleAdjustment] = useState(0);
  const [moraleByEnemy, setMoraleByEnemy] = useState({});
  const [turnClericId, setTurnClericId] = useState('');
  const [turnCounts, setTurnCounts] = useState({});
  const [turnHitDice, setTurnHitDice] = useState({});
  const [turnResult, setTurnResult] = useState(null);
  const [enemyHp, setEnemyHp] = useState({});
  const [blowAttacker, setBlowAttacker] = useState('');
  const [blowDefender, setBlowDefender] = useState('');
  const [blowMode, setBlowMode] = useState('melee');
  const [blowAdjust, setBlowAdjust] = useState(0);
  const [blowBonus, setBlowBonus] = useState('');
  const [blowAc, setBlowAc] = useState('');
  const [blow, setBlow] = useState(null);
  const [blowAmount, setBlowAmount] = useState('');
  const [blowApplied, setBlowApplied] = useState(null);
  const [awardOn, setAwardOn] = useState({});
  const [awardCounts, setAwardCounts] = useState({});
  const [awardDice, setAwardDice] = useState({});
  const [awardLevels, setAwardLevels] = useState({});
  const [awardSpells, setAwardSpells] = useState({});
  const [awardSkip, setAwardSkip] = useState({});
  const [awardRetainer, setAwardRetainer] = useState({});
  const [npcName, setNpcName] = useState('');
  const [npcDice, setNpcDice] = useState('');
  const [npcLevel, setNpcLevel] = useState('');
  const [npcCount, setNpcCount] = useState('');
  const [npcSpells, setNpcSpells] = useState(false);
  const [awardDraft, setAwardDraft] = useState(null);
  const [effectNote, setEffectNote] = useState('');
  const [effectDuration, setEffectDuration] = useState(10);
  const [eventNote, setEventNote] = useState('');
  const [eventClock, setEventClock] = useState(CLOCK_ZERO);
  const [eventDirty, setEventDirty] = useState(false);
  const [locationPick, setLocationPick] = useState('');
  const [risingDismissed, setRisingDismissed] = useState(false);
  const [badAirAsk, setBadAirAsk] = useState(null);

  const load = useCallback((quiet) => {
    if (!quiet) setLoading(true);
    return getAdventuring(campaignId)
      .then((r) => setBoard(r.data))
      .catch((err) => setError(errText(err)))
      .finally(() => {
        if (!quiet) setLoading(false);
      });
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;
    getCampaign(campaignId)
      .then((r) => {
        if (cancelled) return null;
        return Promise.all([getItems(r.data.ruleset_id), getMonsters(r.data.ruleset_id)]);
      })
      .then((pair) => {
        if (!pair || cancelled) return;
        setItems(pair[0].data || []);
        setMonsters(pair[1].data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(errText(err));
      });
    return () => { cancelled = true; };
  }, [campaignId]);

  useEffect(() => {
    load(false);
    const interval = setInterval(() => load(true), 5000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    getPrep(campaignId)
      .then((r) => {
        if (!cancelled) setPrep(r.data);
      })
      .catch((err) => {
        if (!cancelled) setError(errText(err));
      });
    return () => { cancelled = true; };
  }, [campaignId]);

  const gameSeconds = board == null ? null : Number(board.game_seconds);

  useEffect(() => {
    if (gameSeconds == null || eventDirty) return;
    const parts = splitGameTime(gameSeconds);
    if (parts) setEventClock(parts);
  }, [gameSeconds, eventDirty]);

  useEffect(() => {
    setLocationPick(board?.location_id == null ? '' : String(board.location_id));
  }, [board?.location_id]);

  const risingId = board?.rising_water?.encounter_id ?? null;
  useEffect(() => {
    if (risingId == null) setRisingDismissed(false);
  }, [risingId]);

  const run = (action) => {
    setBusy(true);
    setError(null);
    return action()
      .then((res) => {
        const parts = [];
        const n = res?.data?.queued;
        const visit = res?.data?.visit;
        if (visit?.outcome === 'named') parts.push(`Empty room: ${visit.name}`);
        else if (visit?.outcome === 'none') parts.push('Empty room, nothing to meet');
        else if (visit?.outcome === 'miss') parts.push('Empty room miss');
        if (res?.data?.accepted) parts.push('Accepted onto the encounter');
        if (n != null) parts.push(`Queued for ${n} character${n === 1 ? '' : 's'}`);
        setNotice(parts.length ? `${parts.join('. ')}.` : null);
        return load(true).then(() => res, () => res);
      })
      .catch((err) => {
        setError(errText(err));
        return false;
      })
      .finally(() => setBusy(false));
  };

  const leave = (action) => {
    run(action).then((ok) => {
      if (ok) navigate('/');
    });
  };

  const giveXp = (e) => {
    e.preventDefault();
    const amount = parseInt(xp, 10);
    if (!Number.isInteger(amount) || amount < 1) {
      setError('XP must be a positive integer.');
      return;
    }
    run(() => giveParty(campaignId, { type: 'give_xp', amount })).then((ok) => { if (ok) setXp(''); });
  };

  const giveItem = (e) => {
    e.preventDefault();
    const id = parseInt(itemId, 10);
    const qty = parseInt(quantity, 10);
    if (!Number.isInteger(id)) {
      setError('Choose an item.');
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setError('Quantity must be a positive integer.');
      return;
    }
    run(() => giveParty(campaignId, { type: 'give_item', item_id: id, quantity: qty }));
  };

  const addEnemy = (e) => {
    e.preventDefault();
    const count = enemyQty.trim() === '' ? 1 : parseInt(enemyQty, 10);
    if (!Number.isInteger(count) || count < 1) {
      setError('Count must be a positive integer.');
      return;
    }
    const someoneElse = enemyMonsterId === 'other';
    if (!enemyMonsterId) {
      setError('Choose a monster.');
      return;
    }
    const nameTrim = enemyName.trim();
    if (someoneElse && !nameTrim) {
      setError('Name is required.');
      return;
    }
    const body = someoneElse
      ? { name: nameTrim, count }
      : { monster_id: Number(enemyMonsterId), count };
    run(() => addEncounterEnemy(campaignId, body)).then((ok) => {
      if (!ok) return;
      setEnemyMonsterId('');
      setEnemyName('');
      setEnemyQty('1');
    });
  };

  const rollEnemyTreasure = (enemy) => {
    run(() => rollTreasure(campaignId, { enemy_id: enemy.id })).then((res) => {
      if (!res?.data) return;
      setDraft({
        code: res.data.code,
        lines: (res.data.lines || []).map((line) => ({
          column: line.column,
          amount: line.amount,
          mode: COIN.has(String(line.column).toLowerCase()) ? 'xp' : 'item',
          itemId: '',
        })),
      });
      setNotice('Treasure draft. Nothing is given until you apply it.');
    });
  };

  const clearDice = () => {
    setSurprise(null);
    setReaction(null);
    setInitiative(null);
    setMoraleByEnemy({});
    setTurnResult(null);
    setBlow(null);
    setBlowApplied(null);
    setAwardDraft(null);
  };

  const rollSurpriseDice = () => {
    const lessLikely = Object.keys(keenEnemies).filter((id) => keenEnemies[id]).map((id) => Number(id));
    run(() => rollSurprise(campaignId, {
      party_ambush: partyAmbush,
      enemy_ambush: enemyAmbush,
      less_likely_enemy_ids: lessLikely,
    })).then((res) => {
      if (res?.data) setSurprise(res.data);
    });
  };

  const rollReactionDice = () => {
    const characterId = parseInt(leadId, 10);
    if (!Number.isInteger(characterId)) {
      setError('Choose the lead character.');
      return;
    }
    run(() => rollReaction(campaignId, {
      character_id: characterId,
      adjustment: Number(reactionAdjustment),
    })).then((res) => {
      if (res?.data) setReaction(res.data);
    });
  };

  const rollInitiativeDice = () => {
    run(() => rollInitiative(campaignId)).then((res) => {
      if (res?.data) setInitiative(res.data);
    });
  };

  const rollEnemyMorale = (enemy, engaged) => {
    run(() => rollMorale(campaignId, {
      enemy_id: enemy.id,
      adjustment: Number(moraleAdjustment),
      engaged: engaged === true,
    })).then((res) => {
      if (!res?.data) return;
      setMoraleByEnemy((current) => ({ ...current, [enemy.id]: res.data }));
    });
  };

  const rollTurning = () => {
    const characterId = parseInt(turnClericId, 10);
    if (!Number.isInteger(characterId)) {
      setError('Choose a cleric.');
      return;
    }
    const groups = [];
    for (const enemy of board?.enemies || []) {
      const countText = String(turnCounts[enemy.id] ?? '').trim();
      if (!countText) continue;
      const count = parseInt(countText, 10);
      if (!Number.isInteger(count) || count < 1) {
        setError(`Count for ${enemy.name} must be a positive integer.`);
        return;
      }
      const group = { enemy_id: enemy.id, count };
      if (!enemy.hit_dice) {
        const hd = parseInt(turnHitDice[enemy.id], 10);
        if (!Number.isInteger(hd) || hd < 1) {
          setError(`${enemy.name} needs hit dice.`);
          return;
        }
        group.hit_dice = hd;
      }
      groups.push(group);
    }
    if (groups.length === 0) {
      setError('Enter a count for the undead to turn.');
      return;
    }
    run(() => rollTurn(campaignId, { character_id: characterId, groups })).then((res) => {
      if (res?.data) setTurnResult(res.data);
    });
  };

  const updateDraftLine = (index, patch) => {
    setDraft((current) => {
      if (!current) return current;
      const lines = current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line));
      return { ...current, lines };
    });
  };

  const applyDraft = () => {
    if (!draft) return;
    const xp = draft.lines
      .filter((line) => line.mode === 'xp')
      .reduce((sum, line) => sum + Number(line.amount), 0);
    const itemLines = draft.lines.filter((line) => line.mode === 'item');
    if (draft.lines.some((line) => !Number.isInteger(Number(line.amount)) || Number(line.amount) < 1)) {
      setError('Each draft amount must be a positive integer.');
      return;
    }
    if (itemLines.some((line) => !line.itemId)) {
      setError('Choose an item for each item line.');
      return;
    }
    if (xp < 1 && itemLines.length === 0) {
      setError('Nothing to apply.');
      return;
    }
    run(async () => {
      let queued = null;
      if (xp >= 1) {
        const res = await giveParty(campaignId, { type: 'give_xp', amount: xp });
        queued = res.data.queued;
      }
      for (const line of itemLines) {
        const res = await giveParty(campaignId, {
          type: 'give_item',
          item_id: parseInt(line.itemId, 10),
          quantity: Number(line.amount),
        });
        queued = res.data.queued;
      }
      return { data: { queued } };
    }).then((res) => {
      if (res) setDraft(null);
    });
  };

  const addEffect = (e) => {
    e.preventDefault();
    const note = effectNote.trim();
    const at = Number(board?.game_seconds);
    const duration = parseInt(effectDuration, 10);
    if (!note) {
      setError('Effect note is required.');
      return;
    }
    if (!Number.isInteger(at) || at < 0) {
      setError('The clock is not ready.');
      return;
    }
    if (!Number.isInteger(duration) || duration < 1) {
      setError('Duration must be a positive number of minutes.');
      return;
    }
    run(() => addAdventuringMark(campaignId, {
      kind: 'effect',
      note,
      at_seconds: at,
      duration_minutes: duration,
    })).then((ok) => {
      if (!ok) return;
      setEffectNote('');
    });
  };

  const addEvent = (e) => {
    e.preventDefault();
    const note = eventNote.trim();
    const at = clockToSeconds(eventClock.day, eventClock.hour, eventClock.minute, eventClock.second);
    if (!note) {
      setError('Event note is required.');
      return;
    }
    if (at == null) {
      setError('Event time is not a valid clock time.');
      return;
    }
    run(() => addAdventuringMark(campaignId, { kind: 'event', note, at_seconds: at })).then((ok) => {
      if (!ok) return;
      setEventNote('');
      setEventDirty(false);
    });
  };

  const saveEnemyHp = (enemy) => {
    const hp = parseInt(enemyHp[enemy.id], 10);
    if (!Number.isInteger(hp) || hp < 0) {
      setError('Hit points must be zero or more.');
      return;
    }
    run(() => setEnemyHitPoints(campaignId, enemy.id, { hp })).then((ok) => {
      if (!ok) return;
      setEnemyHp((current) => ({ ...current, [enemy.id]: '' }));
    });
  };

  const rollEnemyHp = (enemy) => {
    run(() => setEnemyHitPoints(campaignId, enemy.id, { roll: true }));
  };

  const rollBlow = () => {
    const options = fighterOptions(board);
    const attacker = options.find((option) => option.key === blowAttacker);
    const defender = options.find((option) => option.key === blowDefender);
    if (!attacker || !defender) {
      setError('Choose an attacker and a defender.');
      return;
    }
    if (attacker.key === defender.key) {
      setError('The attacker and the defender are the same.');
      return;
    }
    const attackerEnemy = attacker.side === 'enemy'
      ? (board.enemies || []).find((enemy) => String(enemy.id) === String(attacker.id))
      : null;
    const defenderEnemy = defender.side === 'enemy'
      ? (board.enemies || []).find((enemy) => String(enemy.id) === String(defender.id))
      : null;
    const body = {
      attacker: { side: attacker.side, id: attacker.id },
      defender: { side: defender.side, id: defender.id },
      mode: blowMode,
      adjustment: Number(blowAdjust),
    };
    if (attackerEnemy && !attackerEnemy.hit_dice) {
      const bonus = parseInt(blowBonus, 10);
      if (!Number.isInteger(bonus)) {
        setError('Enter an attack bonus.');
        return;
      }
      body.attack_bonus = bonus;
    }
    if (defenderEnemy && defenderEnemy.armor_class == null) {
      const ac = parseInt(blowAc, 10);
      if (!Number.isInteger(ac)) {
        setError('Enter an armor class.');
        return;
      }
      body.armor_class = ac;
    }
    run(() => rollAttack(campaignId, body)).then((res) => {
      if (!res?.data) return;
      setBlow(res.data);
      setBlowApplied(null);
    });
  };

  const applyBlow = (roll) => {
    if (!blow?.defender) return;
    const body = { defender: { side: blow.defender.side, id: blow.defender.id } };
    if (roll) {
      body.roll = true;
      body.attacker = { side: blow.attacker.side, id: blow.attacker.id };
      body.mode = blow.mode;
    } else {
      const amount = parseInt(blowAmount, 10);
      if (!Number.isInteger(amount) || amount < 1) {
        setError('Damage must be at least 1.');
        return;
      }
      body.amount = amount;
    }
    run(() => applyDamage(campaignId, body)).then((res) => {
      if (!res?.data) return;
      setBlowApplied(res.data);
      setBlowAmount('');
    });
  };

  const tallyExperience = () => {
    const groups = [];
    for (const enemy of board?.enemies || []) {
      if (awardOn[enemy.id] !== true) continue;
      const count = parseInt(awardCounts[enemy.id], 10);
      if (!Number.isInteger(count) || count < 1) {
        setError(`Count for ${enemy.name} must be a positive integer.`);
        return;
      }
      const group = { enemy_id: enemy.id, count };
      if (!enemy.hit_dice) {
        const dice = String(awardDice[enemy.id] || '').trim();
        if (!dice) {
          setError(`${enemy.name} needs hit dice.`);
          return;
        }
        group.hit_dice = dice;
      }
      const levelText = String(awardLevels[enemy.id] || '').trim();
      if (levelText) {
        const level = parseInt(levelText, 10);
        if (!Number.isInteger(level) || level < 1) {
          setError(`Level for ${enemy.name} must be a positive integer.`);
          return;
        }
        group.level = level;
      }
      if (awardSpells[enemy.id] === true) group.spells = true;
      groups.push(group);
    }
    const extraName = npcName.trim();
    const extraDice = npcDice.trim();
    const extraLevel = npcLevel.trim();
    if (extraName || extraDice || extraLevel) {
      const count = parseInt(npcCount, 10);
      if (!Number.isInteger(count) || count < 1) {
        setError('NPC count must be a positive integer.');
        return;
      }
      const group = { count, spells: npcSpells === true };
      if (extraName) group.name = extraName;
      if (extraDice) group.hit_dice = extraDice;
      if (extraLevel) {
        const level = parseInt(extraLevel, 10);
        if (!Number.isInteger(level) || level < 1) {
          setError('NPC level must be a positive integer.');
          return;
        }
        group.level = level;
      }
      groups.push(group);
    }
    if (groups.length === 0) {
      setError('Choose a monster or NPC.');
      return;
    }
    const members = (board?.characters || [])
      .filter((character) => awardSkip[character.id] !== true)
      .map((character) => ({
        character_id: character.id,
        retainer: awardRetainer[character.id] === true,
      }));
    if (members.length === 0) {
      setError('Choose at least one character.');
      return;
    }
    run(() => tallyAward(campaignId, { groups, members })).then((res) => {
      if (res?.data) setAwardDraft(res.data);
    });
  };

  const marchParty = (rest) => {
    run(() => marchAdventuring(campaignId, rest)).then((res) => {
      if (!res?.data) return;
      if (res.data.rested) {
        const healed = Number(res.data.creatures_healed) || 0;
        const extra = healed > 0
          ? ` ${healed} creature${healed === 1 ? '' : 's'} regained a hit point.`
          : '';
        setMarchNote(`A day of rest. Forced march starts over.${extra}`);
        return;
      }
      const lines = (res.data.results || []).map((row) => {
        if (row.day === 1) return `${row.name}: first forced day, no damage.`;
        if (row.saved) return `${row.name}: save ${row.total} vs ${row.target}. No damage.`;
        const again = row.roll == null ? ' Save already failed.' : '';
        const down = row.down ? ' Down.' : '';
        return `${row.name}: ${row.damage} damage.${again}${down}`;
      });
      setMarchNote(lines.join(' '));
    });
  };

  const rollLost = () => {
    const characterId = parseInt(lostLeader, 10);
    if (!Number.isInteger(characterId)) {
      setError('Choose the leader.');
      return;
    }
    run(() => lostAdventuring(campaignId, { character_id: characterId, following: followingRoad })).then((res) => {
      if (!res?.data) return;
      const data = res.data;
      if (data.skipped) setLostNote(`${data.name} is following a road or river.`);
      else setLostNote(`${data.name} rolled ${data.total} vs ${data.target}. ${data.lost ? 'Lost.' : 'Not lost.'}`);
    });
  };

  const chosenVehicle = (prep?.vehicles || []).find((row) => row.name === vehicleName) || null;

  const applyVehicleDamage = () => {
    if (!chosenVehicle) return;
    const amount = wholeInt(damageAmount);
    if (amount == null || amount < 0) {
      setError('Damage must be a non-negative integer.');
      return;
    }
    run(() => prepDamage(campaignId, {
      listed: chosenVehicle.hp,
      hardness: chosenVehicle.hardness,
      taken,
      amount,
      water: chosenVehicle.water,
    })).then((res) => {
      if (!res) return;
      setTaken(res.data.taken);
      setVehicleText(`${chosenVehicle.name}: ${res.data.excess} past hardness. Damage taken ${res.data.taken}. Remaining ${res.data.remaining}. ${res.data.condition}.`);
    });
  };

  const repairVehicle = () => {
    if (!chosenVehicle) return;
    const count = wholeInt(crew);
    if (count == null || count < 1 || count > 200) {
      setError('Crew must be from 1 to 200.');
      return;
    }
    run(() => prepRepair(campaignId, {
      listed: chosenVehicle.hp,
      taken,
      crew: count,
      water: chosenVehicle.water,
    })).then((res) => {
      if (!res) return;
      setTaken(res.data.taken);
      setVehicleText(`${chosenVehicle.name}: repaired ${res.data.restored} (rolled ${res.data.gained}). Damage taken ${res.data.taken}. Remaining ${res.data.remaining}, field repair stops at ${res.data.cap}. ${res.data.condition}.`);
    });
  };

  const rollWeather = () => {
    run(() => weatherAdventuring(campaignId, navigatorOn)).then((res) => {
      if (!res?.data) return;
      const data = res.data;
      const bits = [
        data.direction,
        data.condition,
        `sailing ${data.sailing}`,
        `tacking ${data.tacking}`,
        `${data.hours} hours (${data.distance})`,
      ];
      if (data.note) bits.push(data.note);
      setWeatherNote(`${bits.join('. ')}.`);
    });
  };

  const employer = (board?.characters || []).find((character) => String(character.id) === String(employerId));
  const retained = (board?.hirelings || []).filter((row) => row.kind === 'retainer' && String(row.employer_id) === String(employerId)).length;

  const rollForRetainer = () => {
    const characterId = parseInt(employerId, 10);
    if (!Number.isInteger(characterId)) {
      setError('Choose the employer.');
      return;
    }
    run(() => rollHire(campaignId, { character_id: characterId, adjustment: Number(hireAdjust) || 0 })).then((res) => {
      if (res?.data) setHireRoll(res.data);
    });
  };

  const takeRetainer = () => {
    const characterId = parseInt(employerId, 10);
    const level = parseInt(hireLevel, 10);
    if (!hireRoll || hireRoll.result !== 'Acceptance') {
      setError('They have not accepted.');
      return;
    }
    run(() => addHireling(campaignId, {
      character_id: characterId,
      kind: 'retainer',
      name: hireName.trim(),
      level,
      total: hireRoll.total,
    })).then((res) => {
      if (res) {
        setHireRoll(null);
        setHireName('');
      }
    });
  };

  const addSpecialist = () => {
    const characterId = parseInt(employerId, 10);
    if (!Number.isInteger(characterId) || !specialistRole) {
      setError('Choose the employer and the specialist.');
      return;
    }
    const body = { character_id: characterId, kind: 'specialist', role: specialistRole };
    if (specialistCostValue !== '') body.cost = parseInt(specialistCostValue, 10);
    run(() => addHireling(campaignId, body));
  };

  const addMercenary = () => {
    const characterId = parseInt(employerId, 10);
    if (!Number.isInteger(characterId) || !mercenaryRole) {
      setError('Choose the employer and the mercenaries.');
      return;
    }
    run(() => addHireling(campaignId, {
      character_id: characterId,
      kind: 'mercenary',
      role: mercenaryRole,
      level: parseInt(mercenaryLevel, 10),
      quantity: parseInt(mercenaryQty, 10),
    }));
  };

  const lightSource = (source) => {
    run(() => lightAdventuring(campaignId, source));
  };

  const settleCharacter = (character) => {
    const hoursText = bodyHours[character.id];
    const hours = hoursText == null || hoursText === ''
      ? character.required_hours
      : parseInt(hoursText, 10);
    if (!Number.isInteger(hours) || hours < 0 || hours > 24) {
      setError('Sleep hours must be from 0 to 24.');
      return;
    }
    run(() => settleAdventuring(campaignId, {
      character_id: character.id,
      ate: bodyAte[character.id] !== false,
      drank: bodyDrank[character.id] !== false,
      bedrest: bodyBed[character.id] === true,
      hours,
    })).then((res) => {
      if (res?.data) setBodyNote(bodyLine(character.name, res.data));
    });
  };

  const applyExperience = () => {
    const awards = (awardDraft?.shares || [])
      .filter((share) => Number(share.amount) >= 1)
      .map((share) => ({ character_id: share.character_id, amount: share.amount }));
    if (awards.length === 0) {
      setError('Nothing to award.');
      return;
    }
    run(() => applyAward(campaignId, { awards })).then((res) => {
      if (res) setAwardDraft(null);
    });
  };

  const now = Number(board?.game_seconds);
  const clockLabel = Number.isInteger(now) ? formatGameTime(now) : '';
  const lastRoll = (board?.wanders || []).find((row) => row.kind !== 'visit');
  const visitRoll = board?.visit_check || null;
  const canAccept = Boolean(lastRoll && lastRoll.table_roll != null && lastRoll.label && !lastRoll.accepted);
  const here = (board?.locations || []).find((loc) => String(loc.id) === String(board?.location_id)) || null;
  const saveFlag = (e) => {
    e.preventDefault();
    if (!here) return;
    if (!flagNote.trim()) {
      setError('Flag note is required.');
      return;
    }
    run(() => setLocationFlag(campaignId, here.id, { note: flagNote.trim(), state: flagState })).then((res) => {
      if (res) setFlagNote('');
    });
  };
  const hereTable = here
    ? (board?.tables || []).find((table) => String(table.id) === String(here.encounter_table_id))
    : null;
  const hereLine = here
    ? [here.name, here.terrain, hereTable?.name].filter(Boolean).join(' · ')
    : 'No location';
  const visitLine = here?.site && Number.isInteger(board?.visit_turns)
    ? `${board.visit_turns} ${board.visit_turns === 1 ? 'turn' : 'turns'} on ${here.site}`
    : null;
  const place = board?.place === 'inside' ? 'inside' : 'outside';
  const primary = primaryStep(place, board?.in_encounter);
  const fighters = fighterOptions(board);
  const attackerChoice = fighters.find((option) => option.key === blowAttacker);
  const defenderChoice = fighters.find((option) => option.key === blowDefender);
  const attackerEnemy = attackerChoice?.side === 'enemy'
    ? (board?.enemies || []).find((enemy) => String(enemy.id) === String(attackerChoice.id))
    : null;
  const defenderEnemy = defenderChoice?.side === 'enemy'
    ? (board?.enemies || []).find((enemy) => String(enemy.id) === String(defenderChoice.id))
    : null;
  const needAttackBonus = Boolean(attackerEnemy && !attackerEnemy.hit_dice);
  const needArmorClass = Boolean(defenderEnemy && defenderEnemy.armor_class == null);
  const chosenMonster = monsters.find((monster) => String(monster.id) === String(enemyMonsterId));
  const clockButtons = [
    CLOCK_BUTTONS.find((button) => button.step === primary),
    ...CLOCK_BUTTONS.filter((button) => button.step !== primary),
  ].filter((button) => button.step !== 'round');

  const risingPrompt = board?.rising_water && !risingDismissed ? (
    <div style={{ margin: '8px 0 12px' }}>
      <p style={{ marginTop: 0 }}>{board.rising_water.why}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => run(() => applyRisingWater(campaignId, { encounter_id: board.rising_water.encounter_id }))}
        >
          Open Rising water
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            run(() => rejectRisingWater(campaignId)).then((res) => {
              if (res) setRisingDismissed(true);
            });
          }}
        >
          Leave it
        </button>
      </div>
    </div>
  ) : null;

  const badAirPrompt = badAirAsk ? (
    <div style={{ margin: '8px 0 12px' }}>
      <p style={{ marginTop: 0 }}>{badAirAsk.why}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            run(() => applyBadAir(campaignId, { game_seconds: badAirAsk.game_seconds })).then((res) => {
              if (res?.data?.changed) setBadAirAsk(null);
            });
          }}
        >
          Apply 1 damage
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            run(() => rejectBadAir(campaignId)).then((res) => {
              if (res) setBadAirAsk(null);
            });
          }}
        >
          Leave it
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="adventuring">
      <div>
        {loading && !board && <p className="muted">Loading…</p>}

        <div className="card">
          <div className="catalog-tabs" role="tablist" aria-label="Home">
            {[
              ['location', 'Location'],
              ['travel', 'Travel'],
              ['encounter', 'Encounter'],
              ['hirelings', 'Hirelings'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={homeTab === id}
                className={`catalog-tab${homeTab === id ? ' active' : ''}`}
                onClick={() => setHomeTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {homeTab === 'encounter' && (
          <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>Encounter</h2>
            {board?.in_encounter ? (
              <>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => tickAdventuring(campaignId, 'round'))}>Next Round</button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => { clearDice(); run(() => endEncounter(campaignId)); }}>End</button>
              </>
            ) : (
              <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={() => run(() => startEncounter(campaignId))}>Start</button>
            )}
          </div>
          {board && !board.in_encounter && <p className="muted">No encounter.</p>}
          {board?.in_encounter && (
            <>
              {(board.enemies || []).length === 0 && <p className="muted">No enemies yet.</p>}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(board.enemies || []).map((enemy) => (
                  <li key={enemy.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>
                        {enemy.name}
                        {enemy.treasure_type ? <span className="muted"> · {enemy.treasure_type}</span> : null}
                        {enemy.armor_class != null ? <span className="muted"> · AC {enemy.armor_class}</span> : null}
                      </span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        {enemy.treasure_type ? (
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => rollEnemyTreasure(enemy)}>Roll treasure</button>
                        ) : null}
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => run(() => removeEncounterEnemy(campaignId, enemy.id))}>Remove</button>
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => run(() => fleeEncounterEnemy(campaignId, enemy.id))}>Flee</button>
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                      <span className="muted">{hitPointLabel(enemy.hp)}</span>
                      <input
                        type="number"
                        min={0}
                        placeholder="HP"
                        aria-label={`${enemy.name} hit points`}
                        value={enemyHp[enemy.id] ?? ''}
                        onChange={(e) => setEnemyHp((current) => ({ ...current, [enemy.id]: e.target.value }))}
                        style={{ ...FIELD, width: 70 }}
                      />
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => saveEnemyHp(enemy)}>Set</button>
                      {enemy.hit_dice && enemy.base_hp == null ? (
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => rollEnemyHp(enemy)}>Roll hit points</button>
                      ) : null}
                    </div>
                    {enemy.notes ? (
                      <details style={{ marginTop: 4 }}>
                        <summary className="muted">Notes</summary>
                        <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{enemy.notes}</p>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
              <form onSubmit={addEnemy} style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={enemyMonsterId}
                  aria-label="Monster"
                  onChange={(e) => {
                    setEnemyMonsterId(e.target.value);
                    if (e.target.value !== 'other') setEnemyName('');
                  }}
                  style={{ ...FIELD, flex: 1, minWidth: 160 }}
                >
                  <option value="">Monster…</option>
                  {monsters.map((monster) => (
                    <option key={monster.id} value={monster.id}>{monster.name}</option>
                  ))}
                  <option value="other">Someone else</option>
                </select>
                {enemyMonsterId === 'other' && (
                  <input
                    value={enemyName}
                    onChange={(e) => setEnemyName(e.target.value)}
                    placeholder="Name"
                    aria-label="Enemy name"
                    maxLength={80}
                    style={{ ...FIELD, flex: 1, minWidth: 120 }}
                  />
                )}
                {chosenMonster?.treasure_type ? <span className="muted">{chosenMonster.treasure_type}</span> : null}
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={enemyQty}
                  onChange={(e) => setEnemyQty(e.target.value)}
                  aria-label="Enemy count"
                  style={{ ...FIELD, width: 80 }}
                />
                <button type="submit" className="btn btn-secondary" disabled={busy}>Add enemy</button>
              </form>
              {draft && (
                <div style={{ marginTop: 12 }}>
                  <h2 style={{ marginBottom: 4 }}>Treasure {draft.code}</h2>
                  <p className="muted">Nothing is given until you apply it.</p>
                  {draft.lines.length === 0 && <p className="muted">Nothing rolled.</p>}
                  {draft.lines.map((line, index) => (
                    <div key={`${line.column}-${index}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ minWidth: 48 }}>{line.column}</span>
                      <input
                        type="number"
                        min={1}
                        value={line.amount}
                        aria-label={`${line.column} amount`}
                        onChange={(e) => updateDraftLine(index, { amount: e.target.value })}
                        style={{ ...FIELD, width: 90 }}
                      />
                      <select
                        value={line.mode}
                        aria-label={`${line.column} gives`}
                        onChange={(e) => updateDraftLine(index, { mode: e.target.value })}
                        style={FIELD}
                      >
                        <option value="xp">XP</option>
                        <option value="item">Item</option>
                      </select>
                      {line.mode === 'item' && (
                        <select
                          value={line.itemId}
                          aria-label={`${line.column} item`}
                          onChange={(e) => updateDraftLine(index, { itemId: e.target.value })}
                          style={{ ...FIELD, maxWidth: 220 }}
                        >
                          <option value="">Choose…</option>
                          {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </select>
                      )}
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => setDraft((current) => current && ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-primary" disabled={busy || draft.lines.length === 0} onClick={applyDraft}>Apply</button>
                </div>
              )}
              <div style={{ marginTop: 16 }}>
                <h2>Dice</h2>
                <p className="muted">These rolls do not move the clock.</p>
                <h3 style={{ marginBottom: 6 }}>Surprise</h3>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label><input type="checkbox" checked={partyAmbush} onChange={(e) => setPartyAmbush(e.target.checked)} /> Party ambushed</label>
                  <label><input type="checkbox" checked={enemyAmbush} onChange={(e) => setEnemyAmbush(e.target.checked)} /> Enemies ambushed</label>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={rollSurpriseDice}>Roll surprise</button>
                </div>
                {(board.enemies || []).map((enemy) => (
                  <label key={`keen-${enemy.id}`} style={{ display: 'block', marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={keenEnemies[enemy.id] === true}
                      onChange={(e) => setKeenEnemies((current) => ({ ...current, [enemy.id]: e.target.checked }))}
                    />
                    {` ${enemy.name} less likely to be surprised`}
                  </label>
                ))}
                {surprise && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ margin: '4px 0' }}>
                      {surprise.party.roll == null
                        ? 'Party did not roll.'
                        : `Party rolled ${surprise.party.roll}${surprise.party.skips ? '. That side skips one round.' : '.'}`}
                    </p>
                    {surprise.party.actors.map((actor) => <p key={`sp-${actor.id}`} style={{ margin: '2px 0' }}>{surpriseActor(actor)}</p>)}
                    <p style={{ margin: '4px 0' }}>
                      {surprise.enemies.roll == null
                        ? 'Enemies did not roll.'
                        : `Enemies rolled ${surprise.enemies.roll}${surprise.enemies.skips ? '. That side skips one round.' : '.'}`}
                    </p>
                    {surprise.enemies.actors.map((actor) => <p key={`se-${actor.id}`} style={{ margin: '2px 0' }}>{surpriseActor(actor)}</p>)}
                  </div>
                )}

                <h3 style={{ marginBottom: 6 }}>Reaction</h3>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={leadId} aria-label="Lead character" onChange={(e) => setLeadId(e.target.value)} style={FIELD}>
                    <option value="">Lead character…</option>
                    {(board.characters || []).map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
                  </select>
                  <label>
                    Adjustment
                    <input type="number" min={-10} max={10} value={reactionAdjustment} aria-label="Reaction adjustment" onChange={(e) => setReactionAdjustment(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
                  </label>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={rollReactionDice}>Roll reaction</button>
                </div>
                {reaction && (
                  <p style={{ margin: '6px 0' }}>
                    {reaction.name}: 2d6 {reaction.faces.join('+')} {signed(reaction.bonus)} Charisma {signed(reaction.adjustment)} = {reaction.total}. {reaction.result}.
                  </p>
                )}

                <h3 style={{ marginBottom: 6 }}>Initiative</h3>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={rollInitiativeDice}>Roll initiative</button>
                {initiative && (
                  <ol style={{ margin: '8px 0', paddingLeft: 20 }}>
                    {(initiative.order || []).map((group) => (
                      <li key={`${group.total}-${group.actors.map((actor) => actor.id).join('-')}`}>
                        {group.actors.map((actor) => `${actor.name} ${actor.total} (${actor.roll}${Number(actor.bonus) ? signed(actor.bonus) : ''})`).join(', ')}
                        {group.together ? ' — together' : ''}
                      </li>
                    ))}
                  </ol>
                )}

                <h3 style={{ marginBottom: 6 }}>Morale</h3>
                <label>
                  Adjustment
                  <input type="number" min={-2} max={2} value={moraleAdjustment} aria-label="Morale adjustment" onChange={(e) => setMoraleAdjustment(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
                </label>
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
                  {(board.enemies || []).map((enemy) => {
                    const last = moraleByEnemy[enemy.id];
                    const moraleText = enemy.morale == null
                      ? 'no morale'
                      : enemy.morale_engaged == null
                        ? `morale ${enemy.morale}`
                        : `morale ${enemy.morale} / ${enemy.morale_engaged} engaged`;
                    return (
                      <li key={`morale-${enemy.id}`} style={{ marginBottom: 6 }}>
                        <span>{enemy.name}</span>
                        <span className="muted"> · {moraleText}</span>
                        {enemy.hit_dice ? <span className="muted"> · {enemy.hit_dice} HD</span> : null}
                        <span style={{ display: 'inline-flex', gap: 6, marginLeft: 8 }}>
                          <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy || enemy.morale == null} onClick={() => rollEnemyMorale(enemy, false)}>Check</button>
                          {enemy.morale_engaged != null ? (
                            <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => rollEnemyMorale(enemy, true)}>Engaged</button>
                          ) : null}
                        </span>
                        {last ? <span> · {last.roll} vs {last.target}, {last.result}</span> : null}
                      </li>
                    );
                  })}
                </ul>

                <h3 style={{ marginBottom: 6 }}>Turning undead</h3>
                {(board.turn_blocks || []).map((block) => {
                  const who = (board.characters || []).find((character) => character.id === block.character_id);
                  return (
                    <p key={block.character_id} className="muted" style={{ margin: '4px 0' }}>
                      {who?.name || 'Cleric'} cannot turn until {formatGameTime(block.until_seconds)}.
                    </p>
                  );
                })}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={turnClericId} aria-label="Cleric" onChange={(e) => setTurnClericId(e.target.value)} style={FIELD}>
                    <option value="">Cleric…</option>
                    {(board.characters || []).map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
                  </select>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={rollTurning}>Turn undead</button>
                </div>
                {(board.enemies || []).map((enemy) => (
                  <div key={`turn-${enemy.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 120 }}>{enemy.name}</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      placeholder="Count"
                      aria-label={`${enemy.name} count`}
                      value={turnCounts[enemy.id] ?? ''}
                      onChange={(e) => setTurnCounts((current) => ({ ...current, [enemy.id]: e.target.value }))}
                      style={{ ...FIELD, width: 80 }}
                    />
                    {!enemy.hit_dice ? (
                      <input
                        type="number"
                        min={1}
                        max={100}
                        placeholder="HD"
                        aria-label={`${enemy.name} hit dice`}
                        value={turnHitDice[enemy.id] ?? ''}
                        onChange={(e) => setTurnHitDice((current) => ({ ...current, [enemy.id]: e.target.value }))}
                        style={{ ...FIELD, width: 70 }}
                      />
                    ) : null}
                  </div>
                ))}
                {turnResult && (
                  <div style={{ marginTop: 8 }}>
                    {turnLines(turnResult).map((line) => <p key={line} style={{ margin: '2px 0' }}>{line}</p>)}
                  </div>
                )}

                <h3 style={{ marginBottom: 6 }}>Blows</h3>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select value={blowAttacker} aria-label="Attacker" onChange={(e) => setBlowAttacker(e.target.value)} style={FIELD}>
                    <option value="">Attacker…</option>
                    {fighters.map((option) => <option key={option.key} value={option.key}>{option.name}</option>)}
                  </select>
                  <select value={blowDefender} aria-label="Defender" onChange={(e) => setBlowDefender(e.target.value)} style={FIELD}>
                    <option value="">Defender…</option>
                    {fighters.map((option) => <option key={`def-${option.key}`} value={option.key}>{option.name}</option>)}
                  </select>
                  <select value={blowMode} aria-label="Attack mode" onChange={(e) => setBlowMode(e.target.value)} style={FIELD}>
                    <option value="melee">Melee</option>
                    <option value="missile">Missile</option>
                    <option value="back">Back</option>
                  </select>
                  <label>
                    Adjustment
                    <input type="number" min={-10} max={10} value={blowAdjust} aria-label="Attack adjustment" onChange={(e) => setBlowAdjust(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
                  </label>
                  {needAttackBonus ? (
                    <label>
                      Attack bonus
                      <input type="number" min={-10} max={20} value={blowBonus} aria-label="Attack bonus" onChange={(e) => setBlowBonus(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
                    </label>
                  ) : null}
                  {needArmorClass ? (
                    <label>
                      Armor class
                      <input type="number" min={-10} max={40} value={blowAc} aria-label="Armor class" onChange={(e) => setBlowAc(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
                    </label>
                  ) : null}
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={rollBlow}>Roll attack</button>
                </div>
                {blow && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ margin: '4px 0' }}>{blowSentence(blow)}</p>
                    {blow.attack_note ? <p className="muted" style={{ margin: '2px 0' }}>{blow.attack_note}</p> : null}
                    {blow.hit ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          min={1}
                          placeholder="Damage"
                          aria-label="Damage"
                          value={blowAmount}
                          onChange={(e) => setBlowAmount(e.target.value)}
                          style={{ ...FIELD, width: 80 }}
                        />
                        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => applyBlow(false)}>Apply</button>
                        {blow.damage ? (
                          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => applyBlow(true)}>Roll damage</button>
                        ) : null}
                      </div>
                    ) : null}
                    {blowApplied ? <p style={{ margin: '6px 0' }}>{damageSentence(blowApplied)}</p> : null}
                  </div>
                )}

                <h3 style={{ marginBottom: 6 }}>Awards</h3>
                <p className="muted">Hit dice on the r142 table. The party XP button stays for anything else. Nothing is given until you apply it.</p>
                {(board.enemies || []).map((enemy) => (
                  <div key={`award-${enemy.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                    <label style={{ minWidth: 120 }}>
                      <input
                        type="checkbox"
                        checked={awardOn[enemy.id] === true}
                        onChange={(e) => setAwardOn((current) => ({ ...current, [enemy.id]: e.target.checked }))}
                      />
                      {` ${enemy.name}`}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      placeholder="Count"
                      aria-label={`${enemy.name} award count`}
                      value={awardCounts[enemy.id] ?? ''}
                      onChange={(e) => setAwardCounts((current) => ({ ...current, [enemy.id]: e.target.value }))}
                      style={{ ...FIELD, width: 80 }}
                    />
                    {!enemy.hit_dice ? (
                      <input
                        placeholder="HD"
                        aria-label={`${enemy.name} award hit dice`}
                        value={awardDice[enemy.id] ?? ''}
                        onChange={(e) => setAwardDice((current) => ({ ...current, [enemy.id]: e.target.value }))}
                        style={{ ...FIELD, width: 80 }}
                      />
                    ) : (
                      <span className="muted">{enemy.hit_dice} HD</span>
                    )}
                    <input
                      type="number"
                      min={1}
                      max={100}
                      placeholder="Level"
                      aria-label={`${enemy.name} award level`}
                      value={awardLevels[enemy.id] ?? ''}
                      onChange={(e) => setAwardLevels((current) => ({ ...current, [enemy.id]: e.target.value }))}
                      style={{ ...FIELD, width: 70 }}
                    />
                    <label>
                      <input
                        type="checkbox"
                        checked={awardSpells[enemy.id] === true}
                        onChange={(e) => setAwardSpells((current) => ({ ...current, [enemy.id]: e.target.checked }))}
                      />
                      {' spells'}
                    </label>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <input value={npcName} onChange={(e) => setNpcName(e.target.value)} placeholder="NPC" maxLength={80} aria-label="NPC name" style={{ ...FIELD, width: 120 }} />
                  <input value={npcDice} onChange={(e) => setNpcDice(e.target.value)} placeholder="HD" aria-label="NPC hit dice" style={{ ...FIELD, width: 70 }} />
                  <input type="number" min={1} max={100} value={npcLevel} onChange={(e) => setNpcLevel(e.target.value)} placeholder="Level" aria-label="NPC level" style={{ ...FIELD, width: 70 }} />
                  <input type="number" min={1} max={1000} value={npcCount} onChange={(e) => setNpcCount(e.target.value)} placeholder="Count" aria-label="NPC count" style={{ ...FIELD, width: 80 }} />
                  <label>
                    <input type="checkbox" checked={npcSpells} onChange={(e) => setNpcSpells(e.target.checked)} />
                    {' spells'}
                  </label>
                </div>
                {(board.characters || []).map((character) => (
                  <div key={`share-${character.id}`} style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={awardSkip[character.id] !== true}
                        onChange={(e) => setAwardSkip((current) => ({ ...current, [character.id]: !e.target.checked }))}
                      />
                      {` ${character.name}`}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={awardRetainer[character.id] === true}
                        onChange={(e) => setAwardRetainer((current) => ({ ...current, [character.id]: e.target.checked }))}
                      />
                      {' retainer'}
                    </label>
                  </div>
                ))}
                {(board.characters || []).length === 0 ? <p className="muted">No characters in this campaign.</p> : null}
                <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }} disabled={busy} onClick={tallyExperience}>Tally</button>
                {awardDraft && (
                  <div style={{ marginTop: 8 }}>
                    {awardDraft.groups.map((group, index) => <p key={`${group.name}-${index}`} style={{ margin: '2px 0' }}>{awardGroupLine(group)}</p>)}
                    <p style={{ margin: '6px 0' }}>Total {awardDraft.total}</p>
                    {awardDraft.shares.map((share) => <p key={share.character_id} style={{ margin: '2px 0' }}>{awardShareLine(share)}</p>)}
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={applyExperience}>Apply</button>
                  </div>
                )}
              </div>
            </>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end', marginTop: '1rem' }}>
            <form onSubmit={giveXp} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <label>
                Party XP
                <input type="number" min={1} value={xp} onChange={(e) => setXp(e.target.value)} style={{ ...FIELD, width: 90, marginLeft: 6 }} />
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy || !board}>Give party XP</button>
            </form>
            <form onSubmit={giveItem} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <label>
                Item
                <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ ...FIELD, marginLeft: 6, maxWidth: 220 }}>
                  <option value="">Choose…</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                </select>
              </label>
              <label>
                Qty
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
              </label>
              <button type="submit" className="btn btn-primary" disabled={busy || !board || !itemId}>Give party item</button>
            </form>
          </div>
          </>
          )}

          {homeTab === 'location' && (
          <>
          {board?.water_story && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>{board.water_story.title}</h2>
              <p style={{ marginTop: 0 }}>{board.water_story.now}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
                {(board.water_story.places || []).map((place, index) => (
                  <li key={`${place.name}-${index}`}>
                    <strong>{place.name}</strong>
                    <span className="muted">{` · ${place.line}`}</span>
                  </li>
                ))}
              </ul>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
                {(board.water_story.links || []).map((link) => (
                  <li key={link.relation}>
                    <span className="muted">{link.relation}</span>
                    {` ${link.text}`}
                  </li>
                ))}
              </ul>
              <h3 style={{ marginBottom: 6 }}>What would change</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(board.water_story.would || []).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <SituationPanel campaignId={campaignId} board={board} busy={busy} run={run} mode="play" bare />

        <div className="card">
          <h2>Locations</h2>
          {(board?.locations || []).length === 0 && <p className="muted">No locations yet.</p>}
          {board && (board.locations || []).length > 0 && (
            <>
              <p style={{ marginTop: 0 }}>
                <strong>Selected</strong>
                {here ? (
                  <>
                    {` ${here.name}`}
                    <span className="muted">
                      {` · ${locationFacts(here)}${(here.flags || []).length ? ` · ${(here.flags || []).length} flag${(here.flags || []).length === 1 ? '' : 's'}` : ''}`}
                    </span>
                  </>
                ) : (
                  <span className="muted"> · No location</span>
                )}
              </p>
              {(!here || (here.facts || []).length === 0) && risingPrompt}
              {(!here || (here.facts || []).length === 0) && badAirPrompt}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!locationPick || String(locationPick) === String(board.location_id)) return;
                  run(() => selectLocation(campaignId, locationPick));
                }}
                style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
              >
                <label>
                  Location
                  <select
                    aria-label="Location"
                    value={locationPick}
                    onChange={(e) => setLocationPick(e.target.value)}
                    style={{ ...FIELD, marginLeft: 6, maxWidth: 280 }}
                  >
                    <option value="">Choose…</option>
                    {(board.locations || []).map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={busy || !locationPick || String(locationPick) === String(board.location_id)}
                >
                  Select
                </button>
              </form>
            </>
          )}
          {here && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ marginBottom: 6 }}>Creatures here</h3>
              {(here.creatures || []).length === 0 && <p className="muted">No creatures at this location.</p>}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {creatureGroups(here.creatures).map((group) => (
                  <li key={group.key} style={{ marginBottom: 4 }}>{creatureLine(group)}</li>
                ))}
              </ul>
              {board?.in_encounter && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const count = parseInt(takeCount, 10);
                    if (!takeName) {
                      setError('Choose a creature.');
                      return;
                    }
                    if (!Number.isInteger(count) || count < 1) {
                      setError('Count must be a positive number.');
                      return;
                    }
                    run(() => takeCreatures(campaignId, { name: takeName, count }));
                  }}
                  style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}
                >
                  <select value={takeName} aria-label="Creature to add" onChange={(e) => setTakeName(e.target.value)} style={FIELD}>
                    <option value="">Living creature…</option>
                    {[...new Set((here.creatures || []).filter((creature) => creature.hp > 0 && !creature.in_fight).map((creature) => creature.name))].map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={takeCount}
                    aria-label="How many creatures"
                    onChange={(e) => setTakeCount(e.target.value)}
                    style={{ ...FIELD, width: 70 }}
                  />
                  <button type="submit" className="btn btn-secondary" disabled={busy}>Add to fight</button>
                </form>
              )}
            </div>
          )}
          {here && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ marginBottom: 6 }}>Room flags</h3>
              <p className="muted">Sprung, taken, or found. A sentence stays a clue.</p>
              {(here.flags || []).length === 0 && <p className="muted">Nothing marked here.</p>}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(here.flags || []).map((flag) => (
                  <li key={flag.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                    <span>{flag.note} · {flag.state}</span>
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => run(() => clearLocationFlag(campaignId, here.id, flag.id))}>Clear</button>
                  </li>
                ))}
              </ul>
              <form onSubmit={saveFlag} style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="Pit, chest, secret" maxLength={80} aria-label="Flag note" style={FIELD} />
                <select value={flagState} aria-label="Flag state" onChange={(e) => setFlagState(e.target.value)} style={FIELD}>
                  <option value="sprung">Sprung</option>
                  <option value="taken">Taken</option>
                  <option value="found">Found</option>
                </select>
                <button type="submit" className="btn btn-secondary" disabled={busy}>Set flag</button>
              </form>
            </div>
          )}
          {here && (here.facts || []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h3 style={{ marginBottom: 6 }}>Object facts</h3>
              <p className="muted">This playthrough. Room flags stay sprung, taken, or found.</p>
              {(here.facts || []).map((fact) => (
                <label key={fact.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={fact.value === true}
                    disabled={busy}
                    onChange={() => run(() => setPlayFact(campaignId, {
                      subject_type: fact.subject_type,
                      subject_key: fact.subject_key,
                      state_key: fact.state_key,
                      value: fact.value !== true,
                      version: fact.version,
                    }))}
                  />
                  <span>{fact.label}</span>
                </label>
              ))}
              {board?.water_flowing != null && (
                <p className="muted">{board.water_flowing ? 'Water is flowing.' : 'Water is not flowing.'}</p>
              )}
              {risingPrompt}
              {badAirPrompt}
            </div>
          )}
        </div>

          </>
          )}

          {homeTab === 'travel' && (
          <>
          <h2>Travel</h2>
          <p className="muted">Not a map. The clock stays put.</p>
          {board?.party_miles == null && <p className="muted">No group movement yet.</p>}
          {board?.party_miles != null && board?.overland_miles == null && (
            <p>{board.party_miles} miles a day before terrain. Select an outside location.</p>
          )}
          {board?.overland_miles != null && (
            <p>{board.overland_miles} miles today. A forced march makes {board.forced_miles}.</p>
          )}
          {board?.air_miles != null && (
            <p>By air, {board.air_miles} miles. Terrain is ignored. Stay aloft at {board.stall_feet}'.</p>
          )}
          {marchNote && <p style={{ color: '#e8c547' }}>{marchNote}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={() => marchParty(false)}>Forced march</button>
            <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={() => marchParty(true)}>Rest</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <label>
              Leader
              <select value={lostLeader} onChange={(e) => setLostLeader(e.target.value)} style={{ ...FIELD, marginLeft: 6 }}>
                <option value="">Choose…</option>
                {(board?.characters || []).map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={followingRoad} onChange={(e) => setFollowingRoad(e.target.checked)} />
              {' Following a road or river'}
            </label>
            <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={rollLost}>Lost</button>
          </div>
          {lostNote && <p style={{ color: '#e8c547' }}>{lostNote}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              <input type="checkbox" checked={navigatorOn} onChange={(e) => setNavigatorOn(e.target.checked)} />
              {' Navigator stays out all night'}
            </label>
            <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={rollWeather}>Weather</button>
          </div>
          {weatherNote && <p style={{ color: '#e8c547' }}>{weatherNote}</p>}
        <div className="card">
          <h2>Vehicles</h2>
          <p className="muted">{`Attacks hit AC ${prep?.vehicle_ac ?? 11}. Hardness comes off the damage. Field repair is 1d4 per crew member and stops at 90% of the listed hit points.`}</p>
          <select
            aria-label="Vehicle"
            value={vehicleName}
            onChange={(e) => {
              const name = e.target.value;
              const row = (prep?.vehicles || []).find((item) => item.name === name);
              setVehicleName(name);
              setTaken(0);
              setCrew(String(row?.crew || 1));
              setVehicleText('');
            }}
            style={FIELD}
          >
            <option value="">Choose a vehicle</option>
            {(prep?.vehicles || []).map((row) => (
              <option key={row.name} value={row.name}>{row.name}</option>
            ))}
          </select>
          {chosenVehicle && (
            <p>
              {`${chosenVehicle.movement}${chosenVehicle.miles ? `, ${chosenVehicle.miles} miles` : ''}. Hardness ${chosenVehicle.hardness}, HP ${chosenVehicle.hp}, ${chosenVehicle.cost} gp. Damage taken ${taken}.`}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="number"
              min={0}
              aria-label="Vehicle damage"
              placeholder="Damage"
              value={damageAmount}
              onChange={(e) => setDamageAmount(e.target.value)}
              style={{ ...FIELD, width: 90 }}
            />
            <button type="button" className="btn btn-secondary" disabled={busy || !chosenVehicle} onClick={applyVehicleDamage}>
              Apply damage
            </button>
            <input
              type="number"
              min={1}
              max={200}
              aria-label="Repair crew"
              value={crew}
              onChange={(e) => setCrew(e.target.value)}
              style={{ ...FIELD, width: 70 }}
            />
            <button type="button" className="btn btn-secondary" disabled={busy || !chosenVehicle} onClick={repairVehicle}>
              Field repair
            </button>
          </div>
          {vehicleText && <p>{vehicleText}</p>}
        </div>
          </>
          )}

          {homeTab === 'hirelings' && (
          <>
        <div className="card">
          <h2>Hirelings</h2>
          <p className="muted">Retainers enter the dungeon. Specialists and mercenaries do not. Cost is not deducted.</p>
          {(board?.hirelings || []).length === 0 && <p className="muted">None hired.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.75rem' }}>
            {(board?.hirelings || []).map((row) => (
              <li key={row.id} style={{ marginBottom: 8 }}>
                <strong>{row.name}</strong>
                <span className="muted">
                  {` · ${row.kind}`}
                  {row.level != null ? ` · level ${row.level}` : ''}
                  {row.quantity > 1 ? ` · ${row.quantity}` : ''}
                  {row.loyalty != null ? ` · loyalty ${row.loyalty}` : ''}
                  {row.morale != null ? ` · morale ${row.morale}` : ''}
                  {row.cost_gp != null ? ` · ${row.cost_gp} gp/month` : ''}
                </span>
                {row.detail && <div className="muted">{row.detail}</div>}
                {row.kind !== 'retainer' && <div className="muted">Does not enter a dungeon.</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {row.kind !== 'specialist' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => run(() => checkHireling(campaignId, row.id, {
                        adjustment: Number(loyaltyAdjust) || 0,
                        combat: row.kind === 'retainer',
                        end: false,
                      })).then((res) => {
                        if (res?.data) {
                          const data = res.data;
                          setHireNote(`${data.name} rolled ${data.roll} vs ${data.target}. ${data.result === 'holds' ? 'Holds.' : 'Leaves.'}${data.loyalty != null && data.loyalty !== row.loyalty ? ` Loyalty is ${data.loyalty}.` : ''}`);
                        }
                      })}
                    >
                      {row.kind === 'retainer' ? 'Loyalty' : 'Morale'}
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => removeHireling(campaignId, row.id))}>Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
          {hireNote && <p style={{ color: '#e8c547' }}>{hireNote}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <label>
              Employer
              <select value={employerId} onChange={(e) => { setEmployerId(e.target.value); setHireRoll(null); }} style={{ ...FIELD, marginLeft: 6 }}>
                <option value="">Choose…</option>
                {(board?.characters || []).map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </select>
            </label>
            {employer && (
              <span className="muted">
                {`Cap ${employer.retainer_cap} (${retained} hired). Retainer level at most ${employer.max_retainer_level}.`}
                {employer.hire_penalty < 0 ? ' Further hire rolls in this region are −1.' : ''}
              </span>
            )}
            {employer?.hire_penalty < 0 && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => clearHirePenalty(campaignId, employer.id))}>Different town</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <input value={hireName} onChange={(e) => setHireName(e.target.value)} placeholder="Retainer name" maxLength={80} style={FIELD} />
            <label>
              Level
              <input type="number" min={1} value={hireLevel} onChange={(e) => setHireLevel(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
            </label>
            <label>
              Offer
              <input type="number" min={-10} max={10} value={hireAdjust} onChange={(e) => setHireAdjust(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
            </label>
            <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={rollForRetainer}>Roll hire</button>
            {hireRoll?.result === 'Acceptance' && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={takeRetainer}>Hire</button>
            )}
          </div>
          {hireRoll && (
            <p>{`${hireRoll.name} rolled ${hireRoll.total}. ${hireRoll.result}${hireRoll.further === -1 ? '. Further rolls in this region are −1.' : ''}${hireRoll.loyalty_bonus ? '. Loyalty +1.' : ''}`}</p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <select value={specialistRole} onChange={(e) => setSpecialistRole(e.target.value)} style={FIELD}>
              <option value="">Specialist…</option>
              {(board?.specialists || []).map((row) => (
                <option key={row.role} value={row.role}>
                  {row.role}{row.cost != null ? ` (${row.cost} gp)` : ` (${row.cost_lo}–${row.cost_hi} gp)`}
                </option>
              ))}
            </select>
            <input type="number" min={1} value={specialistCostValue} onChange={(e) => setSpecialistCostValue(e.target.value)} placeholder="Cost if a range" style={{ ...FIELD, width: 140 }} />
            <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={addSpecialist}>Add specialist</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <select value={mercenaryRole} onChange={(e) => setMercenaryRole(e.target.value)} style={FIELD}>
              <option value="">Mercenary…</option>
              {(board?.mercenaries || []).map((row) => (
                <option key={row.role} value={row.role}>{row.role} ({row.cost} gp, morale {row.morale})</option>
              ))}
            </select>
            <label>
              Level
              <input type="number" min={1} value={mercenaryLevel} onChange={(e) => setMercenaryLevel(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
            </label>
            <label>
              Qty
              <input type="number" min={1} value={mercenaryQty} onChange={(e) => setMercenaryQty(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
            </label>
            <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={addMercenary}>Add mercenaries</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label>
              Loyalty adjustment
              <input type="number" min={-2} max={2} value={loyaltyAdjust} onChange={(e) => setLoyaltyAdjust(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !board}
              onClick={() => run(() => endAdventureLoyalty(campaignId, Number(loyaltyAdjust) || 0)).then((res) => {
                if (!res?.data) return;
                const lines = res.data.results.map((row) => `${row.name} rolled ${row.roll} vs ${row.target}. ${row.result === 'holds' ? 'Stays.' : 'Leaves.'}`);
                setHireNote(lines.join(' '));
              })}
            >
              End of adventure
            </button>
          </div>
        </div>
          </>
          )}
        </div>
      </div>

      <div>
      <div className="card">
        <p className="adventuring-clock">{clockLabel || '—'}</p>
        {board && <p style={{ color: '#fff', margin: '0 0 0.75rem' }}>{hereLine}</p>}
        {visitLine ? <p className="muted" style={{ margin: '-0.5rem 0 0.75rem' }}>{visitLine}</p> : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {clockButtons.map((button) => (
            <button
              key={button.step}
              type="button"
              className={button.step === primary ? 'btn clock-step' : 'btn btn-secondary'}
              disabled={busy || !board}
              onClick={() => run(() => tickAdventuring(campaignId, button.step)).then((res) => {
                if (res?.data?.bad_air) setBadAirAsk(res.data.bad_air);
              })}
            >
              {button.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <span className="muted">Place</span>
          {['outside', 'inside'].map((value) => (
            <button
              key={value}
              type="button"
              className={place === value ? 'btn btn-primary' : 'btn btn-secondary'}
              aria-pressed={place === value}
              disabled={busy || !board}
              onClick={() => {
                if (place === value) return;
                run(() => setAdventuringPlace(campaignId, value));
              }}
            >
              {value === 'outside' ? 'Outside' : 'Inside'}
            </button>
          ))}
        </div>
        <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>Wander</h2>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !canAccept}
              onClick={() => run(() => acceptWander(campaignId))}
            >
              Accept
            </button>
          </div>
          {!lastRoll && !visitRoll && <p className="muted" style={{ marginTop: 0, marginBottom: 0 }}>No checks yet.</p>}
          {lastRoll && (
            <p style={{ marginTop: 0, marginBottom: 0 }}>
              {lastRoll.table_roll == null
                ? `Miss (${lastRoll.check_roll} on d${lastRoll.check_die})`
                : `${lastRoll.label || 'No row'}${lastRoll.quantity ? ` · ${lastRoll.quantity}` : ''} (${lastRoll.table_roll} on d${lastRoll.table_die})`}
              {lastRoll.accepted ? <span className="muted"> · accepted</span> : null}
            </p>
          )}
          {visitRoll && (
            <p style={{ marginTop: lastRoll ? 8 : 0, marginBottom: 0 }}>{emptyRoomLine(visitRoll)}</p>
          )}
        </div>
        <h2 style={{ marginTop: 0 }}>Effects/Events</h2>
        {(board?.marks || []).length === 0 && <p className="muted">No effects or events.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem' }}>
          {(board?.marks || []).map((mark) => {
            const end = mark.kind === 'effect' ? effectEndSeconds(Number(mark.at_seconds), Number(mark.duration_minutes)) : null;
            const status = markStatus(mark, now);
            const left = effectTurnsLeft(mark, now);
            const expired = mark.kind === 'effect' && status === 'due';
            const counting = left > 0;
            const label = mark.kind === 'effect'
              ? (counting ? `${left} turn${left === 1 ? '' : 's'} left` : (expired ? 'expired' : status))
              : `${mark.kind} · ${status}`;
            return (
              <li key={mark.id} className={expired ? 'mark-expired' : undefined} style={{ marginBottom: 8 }}>
                <div>
                  <strong>{mark.note} </strong>
                  <span className={counting ? 'turns-left' : 'muted'}>{label}</span>
                </div>
                <div className="muted" style={{ fontSize: '0.9rem' }}>
                  {formatGameTime(Number(mark.at_seconds))}
                  {end != null ? ` – ${formatGameTime(end)}` : ''}
                </div>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', marginTop: 4 }} disabled={busy} onClick={() => run(() => removeAdventuringMark(campaignId, mark.id))}>Remove</button>
              </li>
            );
          })}
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={() => lightSource('torch')}>Light a torch</button>
          <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={() => lightSource('lantern')}>Light a lantern</button>
        </div>

        <form onSubmit={addEffect} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem' }}>
          <h2 style={{ marginBottom: 0 }}>Add effect</h2>
          <input value={effectNote} onChange={(e) => setEffectNote(e.target.value)} placeholder="Note" maxLength={120} style={FIELD} />
          <label>
            Duration (minutes)
            <input type="number" min={1} value={effectDuration} onChange={(e) => setEffectDuration(e.target.value)} style={{ ...FIELD, width: 90, marginLeft: 6 }} />
          </label>
          <button type="submit" className="btn btn-secondary" disabled={busy || !board}>Add effect</button>
        </form>

        <form onSubmit={addEvent} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ marginBottom: 0 }}>Add event</h2>
          <input value={eventNote} onChange={(e) => setEventNote(e.target.value)} placeholder="Note" maxLength={120} style={FIELD} />
          <label>
            Event time
            <div style={{ marginTop: 4 }}>
              <ClockFields value={eventClock} onChange={(next) => { setEventDirty(true); setEventClock(next); }} />
            </div>
          </label>
          <button type="submit" className="btn btn-secondary" disabled={busy || !board}>Add event</button>
        </form>
      </div>

      <div className="card">
        <h2>Characters</h2>
        {board?.party_move != null && (
          <p>The group moves at {board.party_slow}'s {board.party_move}' ({board.party_turn}' a turn, {board.party_miles} miles a day).</p>
        )}
        {bodyNote && <p style={{ color: '#e8c547' }}>{bodyNote}</p>}
        {board && board.characters.length === 0 && <p className="muted">No characters in this campaign.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(board?.characters || []).map((c) => (
            <li key={c.id} style={{ marginBottom: 10 }}>
              <strong>{c.name}</strong>
              <span className="muted"> · {characterHitPoints(c.current_hp, c.hp)}</span>
              {c.user ? <span className="muted"> · {c.user}</span> : null}
              <span style={{ marginLeft: 8, color: c.active ? '#e8c547' : '#8a7f72' }}>{c.active ? 'Active' : 'Inactive'}</span>
              {carryLine(c) && <div className="muted">{carryLine(c)}</div>}
              <div className="muted">
                {c.food_missed > 0 ? `${c.food_missed} day${c.food_missed === 1 ? '' : 's'} without food` : 'fed'}
                {c.heal_food ? ' · no healing until they eat' : ''}
                {c.heal_water ? ' · no healing until they drink' : ''}
                {` · sleep ${c.required_hours}h`}
                {c.march_days > 0 ? ` · forced march day ${c.march_days}${c.march_failed ? ', save failed' : ''}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                <label><input type="checkbox" checked={bodyAte[c.id] !== false} onChange={(e) => setBodyAte((current) => ({ ...current, [c.id]: e.target.checked }))} /> Ate</label>
                <label><input type="checkbox" checked={bodyDrank[c.id] !== false} onChange={(e) => setBodyDrank((current) => ({ ...current, [c.id]: e.target.checked }))} /> Drank</label>
                <label><input type="checkbox" checked={bodyBed[c.id] === true} onChange={(e) => setBodyBed((current) => ({ ...current, [c.id]: e.target.checked }))} /> Bedrest</label>
                <label>
                  Hours
                  <input
                    type="number"
                    min={0}
                    max={24}
                    placeholder={String(c.required_hours)}
                    value={bodyHours[c.id] ?? ''}
                    onChange={(e) => setBodyHours((current) => ({ ...current, [c.id]: e.target.value }))}
                    style={{ ...FIELD, width: 70, marginLeft: 6 }}
                  />
                </label>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => settleCharacter(c)}>Settle day</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Session</h2>
        <p className="muted">End session pauses and keeps this playthrough. Conclude wipes it.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !board}
            onClick={() => leave(() => endSituationSession(campaignId))}
          >
            End session
          </button>
          {!concludeArmed && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || !board}
              onClick={() => setConcludeArmed(true)}
            >
              Conclude campaign
            </button>
          )}
        </div>
        {concludeArmed && (
          <div style={{ marginTop: 12 }}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{CONCLUDE_CONFIRM}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy || !board}
                onClick={() => leave(() => concludeCampaign(campaignId))}
              >
                Wipe this playthrough
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setConcludeArmed(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
