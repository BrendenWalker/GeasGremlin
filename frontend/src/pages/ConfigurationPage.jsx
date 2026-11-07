import React, { useCallback, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  createEncounterTable,
  createLocation,
  createPlace,
  createShop,
  createCreatures,
  createNpc,
  deleteCreature,
  deleteNpc,
  setLocationFlag,
  clearLocationFlag,
  deleteEncounterTable,
  deleteLocation,
  deletePlace,
  deleteShop,
  getAdventuring,
  getItemCategories,
  getPrep,
  saveCampaignDetails,
  stockRoom,
  updateEncounterTable,
  updateLocation,
  updateNpc,
  updatePlace,
  updateShop,
} from '../api/api';
import SituationPanel from '../components/SituationPanel';
import { intervalForPlace, nextPlaceInterval } from '../domain/gameTime.mjs';

const FIELD = {
  padding: '0.45rem',
  borderRadius: 4,
  border: '1px solid #3d3530',
  background: '#1a1614',
  color: '#e8e0d5',
};

const STACK = { display: 'flex', flexDirection: 'column', gap: 4 };

const BLANK_ROW = { face_lo: '1', face_hi: '6', label: '', quantity: '' };

const PLACE_TYPES = ['Settlement', 'Fortress', 'Dungeon', 'Wilderness', 'Ruin', 'Building', 'Other'];

function errText(err) {
  return err.response?.data?.error || err.message;
}

function wholeInt(value) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+$/.test(text)) return null;
  return Number(text);
}

function percentLabel(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return '';
  return `${n > 0 ? '+' : ''}${n}%`;
}

function creatureGroups(creatures) {
  const groups = [];
  for (const creature of creatures || []) {
    const key = [
      creature.name,
      creature.hp,
      creature.base_hp,
      creature.disposition,
      creature.in_fight ? 1 : 0,
      creature.note || '',
      creature.location_id ?? '',
    ].join('|');
    const found = groups.find((group) => group.key === key);
    if (found) {
      found.count += 1;
      found.ids.push(creature.id);
    } else {
      groups.push({
        key,
        ids: [creature.id],
        name: creature.name,
        hp: creature.hp,
        base_hp: creature.base_hp,
        disposition: creature.disposition,
        in_fight: creature.in_fight === true,
        note: creature.note || '',
        location_id: creature.location_id ?? null,
        location_name: creature.location_name || '',
        count: 1,
      });
    }
  }
  return groups;
}

function creatureLine(group, { showLocation = false } = {}) {
  let state = 'no hit points';
  if (group.hp === 0) state = 'down';
  else if (group.hp != null && group.hp !== '') {
    state = group.base_hp == null || group.base_hp === '' ? `${group.hp} hp` : `${group.hp}/${group.base_hp}`;
  }
  const fled = group.disposition === 'fled' ? ' · fled' : '';
  const fight = group.in_fight ? ' · in the fight' : '';
  const count = group.count > 1 ? ` · ${group.count}` : '';
  const note = group.note ? ` · ${group.note}` : '';
  const place = showLocation && group.location_name ? ` · ${group.location_name}` : '';
  return `${group.name}${count} · ${state}${fled}${fight}${note}${place}`;
}

export default function ConfigurationPage({ campaignName }) {
  const { campaignId } = useParams();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [locError, setLocError] = useState(null);
  const [locId, setLocId] = useState(null);
  const [pickedId, setPickedId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [locName, setLocName] = useState('');
  const [locEnvironment, setLocEnvironment] = useState('outside');
  const [locPlaceId, setLocPlaceId] = useState('');
  const [locDie, setLocDie] = useState(6);
  const [locInterval, setLocInterval] = useState('');
  const [locTable, setLocTable] = useState('');
  const [terrain, setTerrain] = useState('');
  const [movement, setMovement] = useState('');
  const [locSummary, setLocSummary] = useState('');
  const [locGmText, setLocGmText] = useState('');
  const [locAmbient, setLocAmbient] = useState('0');
  const [locDark, setLocDark] = useState('');
  const [placeId, setPlaceId] = useState(null);
  const [placeName, setPlaceName] = useState('');
  const [placeType, setPlaceType] = useState('');
  const [placeDescription, setPlaceDescription] = useState('');
  const [placeGmText, setPlaceGmText] = useState('');
  const [placeError, setPlaceError] = useState(null);
  const [confirmPlaceRemove, setConfirmPlaceRemove] = useState(false);
  const [editTableId, setEditTableId] = useState(null);
  const [pickedTableId, setPickedTableId] = useState(null);
  const [confirmTable, setConfirmTable] = useState(false);
  const [tableError, setTableError] = useState(null);
  const [tableNameValue, setTableNameValue] = useState('');
  const [tableDie, setTableDie] = useState(6);
  const [tableRows, setTableRows] = useState([{ ...BLANK_ROW }]);
  const [prep, setPrep] = useState(null);
  const [stockText, setStockText] = useState('');
  const [trapName, setTrapName] = useState('');
  const [trapNote, setTrapNote] = useState('');
  const [categories, setCategories] = useState([]);
  const [shopLocationId, setShopLocationId] = useState(null);
  const [shopBrowsePlaceKey, setShopBrowsePlaceKey] = useState('');
  const [shopId, setShopId] = useState(null);
  const [shopName, setShopName] = useState('');
  const [buyDelta, setBuyDelta] = useState('0');
  const [sellDelta, setSellDelta] = useState('0');
  const [shopCategoryIds, setShopCategoryIds] = useState([]);
  const [creaturePlaceKey, setCreaturePlaceKey] = useState('');
  const [creatureFilterId, setCreatureFilterId] = useState('');
  const [creatureName, setCreatureName] = useState('');
  const [creatureBoxes, setCreatureBoxes] = useState('');
  const [creatureCount, setCreatureCount] = useState('1');
  const [creatureNote, setCreatureNote] = useState('');
  const [npcEditId, setNpcEditId] = useState(null);
  const [npcName, setNpcName] = useState('');
  const [npcBrowsePlaceKey, setNpcBrowsePlaceKey] = useState('');
  const [npcLocationId, setNpcLocationId] = useState('');
  const [npcMotivation, setNpcMotivation] = useState('');
  const [npcKnowledge, setNpcKnowledge] = useState('');
  const [npcAttitude, setNpcAttitude] = useState('');
  const [npcError, setNpcError] = useState(null);
  const [flagNote, setFlagNote] = useState('');
  const [flagState, setFlagState] = useState('sprung');
  const [introText, setIntroText] = useState('');
  const [gmNotes, setGmNotes] = useState('');
  const [firstLocationId, setFirstLocationId] = useState('');
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [tab, setTab] = useState('intro');
  const [browsePlaceKey, setBrowsePlaceKey] = useState('');

  const load = useCallback(() => {
    return Promise.all([getAdventuring(campaignId), getPrep(campaignId), getItemCategories()])
      .then(([boardRes, prepRes, categoryRes]) => {
        setBoard(boardRes.data);
        setPrep(prepRes.data);
        setCategories(categoryRes.data || []);
      })
      .catch((err) => setError(errText(err)));
  }, [campaignId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!board || detailsDirty) return;
    setIntroText(board.intro || '');
    setGmNotes(board.gm_notes || '');
    setFirstLocationId(board.first_location_id == null ? '' : String(board.first_location_id));
  }, [board, detailsDirty]);

  const saveDetails = (e) => {
    e.preventDefault();
    run(() => saveCampaignDetails(campaignId, {
      intro: introText,
      gm_notes: gmNotes,
      first_location_id: firstLocationId === '' ? null : Number(firstLocationId),
    })).then((res) => {
      if (res) setDetailsDirty(false);
    });
  };

  const run = (action, onError = setError) => {
    setBusy(true);
    setError(null);
    setLocError(null);
    setTableError(null);
    return action()
      .then((res) => load().then(() => res, () => res))
      .catch((err) => {
        onError(errText(err));
        return false;
      })
      .finally(() => setBusy(false));
  };

  const reportLocation = (message) => {
    setError(null);
    setLocError(message);
  };

  const blankShop = () => {
    setShopId(null);
    setShopName('');
    setBuyDelta('0');
    setSellDelta('0');
    setShopCategoryIds([]);
  };

  const blankLocation = (prefillPlaceId = '') => {
    setLocId(null);
    setLocName('');
    setLocEnvironment('outside');
    setLocPlaceId(prefillPlaceId == null ? '' : String(prefillPlaceId));
    setLocDie(6);
    setLocInterval('');
    setLocTable('');
    setTerrain('');
    setMovement('');
    setLocSummary('');
    setLocGmText('');
    setLocAmbient('0');
    setLocDark('');
    setLocError(null);
  };

  const blankCampaignPlace = () => {
    setPlaceId(null);
    setPlaceName('');
    setPlaceType('');
    setPlaceDescription('');
    setPlaceGmText('');
    setPlaceError(null);
    setConfirmPlaceRemove(false);
  };

  const editLocation = (loc) => {
    setLocId(loc.id);
    setLocName(loc.name);
    setLocEnvironment(loc.environment === 'inside' ? 'inside' : 'outside');
    setLocPlaceId(loc.place_id == null ? '' : String(loc.place_id));
    setLocDie(loc.check_die);
    setLocInterval(loc.interval_seconds == null ? '' : String(loc.interval_seconds));
    setLocTable(String(loc.encounter_table_id));
    setTerrain(loc.terrain || '');
    setMovement(loc.movement_pct == null ? '' : String(loc.movement_pct));
    setLocSummary(loc.summary || '');
    setLocGmText(loc.gm_text || '');
    setLocAmbient(loc.ambient_light == null ? '0' : String(loc.ambient_light));
    setLocDark(loc.dark_summary || '');
    setError(null);
    setLocError(null);
  };

  const editCampaignPlace = (place) => {
    setPlaceId(place.id);
    setPlaceName(place.name || '');
    setPlaceType(place.place_type || '');
    setPlaceDescription(place.description || '');
    setPlaceGmText(place.gm_text || '');
    setPlaceError(null);
    setConfirmPlaceRemove(false);
  };

  const onEnvironment = (value) => {
    setLocInterval((current) => nextPlaceInterval(current, locEnvironment, value));
    setLocEnvironment(value);
  };

  const onTerrain = (name) => {
    setTerrain(name);
    if (!name) {
      setMovement('');
      return;
    }
    const found = (board?.terrains || []).find((row) => row.name === name);
    if (found) setMovement(String(found.movement_pct));
  };

  const saveLocation = (e) => {
    e.preventDefault();
    const tableId = wholeInt(locTable);
    if (!locName.trim()) {
      reportLocation('Location name is required.');
      return;
    }
    if (tableId == null || tableId < 1) {
      reportLocation('Choose a table.');
      return;
    }
    const body = {
      name: locName.trim(),
      environment: locEnvironment,
      place_id: locPlaceId === '' ? null : wholeInt(locPlaceId),
      check_die: wholeInt(locDie) || 6,
      encounter_table_id: tableId,
    };
    if (String(locInterval).trim() !== '') {
      const interval = wholeInt(locInterval);
      if (interval == null || interval < 1) {
        reportLocation('Interval must be a positive number of seconds.');
        return;
      }
      body.interval_seconds = interval;
    }
    if (locEnvironment === 'outside' && (terrain || String(movement).trim() !== '')) {
      const pct = wholeInt(movement);
      if (!terrain) {
        reportLocation('Choose a terrain.');
        return;
      }
      if (pct == null || pct < -100 || pct > 200) {
        reportLocation('Movement percent must be an integer from -100 to 200.');
        return;
      }
      body.terrain = terrain;
      body.movement_pct = pct;
    }
    body.summary = locSummary;
    body.gm_text = locGmText;
    if (locEnvironment === 'inside') {
      const light = wholeInt(locAmbient);
      if (light == null || light < 0 || light > 100) {
        reportLocation('Ambient light must be an integer from 0 to 100.');
        return;
      }
      body.ambient_light = light;
      body.dark_summary = locDark;
    }
    const action = locId == null
      ? () => createLocation(campaignId, body)
      : () => updateLocation(campaignId, locId, body);
    run(action, setLocError).then((res) => {
      if (!res?.data?.id) return;
      setBrowsePlaceKey(res.data.place_id == null ? 'unassigned' : String(res.data.place_id));
      setPickedId(res.data.id);
      editLocation(res.data);
    });
  };

  const saveCampaignPlace = (e) => {
    e.preventDefault();
    if (!placeName.trim()) {
      setPlaceError('Place name is required.');
      return;
    }
    const body = {
      name: placeName.trim(),
      place_type: placeType,
      description: placeDescription,
      gm_text: placeGmText,
    };
    const action = placeId == null
      ? () => createPlace(campaignId, body)
      : () => updatePlace(campaignId, placeId, body);
    run(action, setPlaceError).then((res) => {
      if (!res?.data?.id) return;
      editCampaignPlace(res.data);
    });
  };

  const removeCampaignPlace = () => {
    if (placeId == null) return;
    const id = placeId;
    setConfirmPlaceRemove(false);
    run(() => deletePlace(campaignId, id), setPlaceError).then((res) => {
      if (!res) return;
      blankCampaignPlace();
    });
  };

  const removeLocation = () => {
    if (!pickedLocation) return;
    const id = pickedLocation.id;
    setConfirmRemove(false);
    run(() => deleteLocation(campaignId, id), setLocError).then((res) => {
      if (!res) return;
      if (String(pickedId) === String(id)) setPickedId(null);
      if (String(locId) === String(id)) blankLocation();
    });
  };

  const editShop = (shop, locationId) => {
    if (locationId != null) {
      const loc = (board?.locations || []).find((row) => String(row.id) === String(locationId));
      setShopLocationId(locationId);
      setShopBrowsePlaceKey(loc == null || loc.place_id == null ? 'unassigned' : String(loc.place_id));
    }
    setShopId(shop.id);
    setShopName(shop.name);
    setBuyDelta(String(shop.buy_cost_delta ?? 0));
    setSellDelta(String(shop.sell_cost_delta ?? 0));
    setShopCategoryIds((shop.category_ids || []).map((id) => Number(id)));
    setError(null);
  };

  const toggleShopCategory = (id) => {
    setShopCategoryIds((ids) => (ids.includes(id) ? ids.filter((row) => row !== id) : [...ids, id]));
  };

  const saveShop = (e) => {
    e.preventDefault();
    if (shopLocationId == null) {
      setError('Choose a location for the shop.');
      return;
    }
    const buy = wholeInt(buyDelta);
    const sell = wholeInt(sellDelta);
    if (!shopName.trim()) {
      setError('Shop name is required.');
      return;
    }
    if (buy == null || buy < -100 || buy > 1000 || sell == null || sell < -100 || sell > 1000) {
      setError('Buy and sell percent must be integers from -100 to 1000.');
      return;
    }
    if (shopCategoryIds.length === 0) {
      setError('A shop needs at least one category.');
      return;
    }
    const body = {
      name: shopName.trim(),
      buy_cost_delta: buy,
      sell_cost_delta: sell,
      category_ids: shopCategoryIds,
    };
    const action = shopId == null
      ? () => createShop(campaignId, shopLocationId, body)
      : () => updateShop(campaignId, shopLocationId, shopId, body);
    run(action).then((res) => {
      if (!res?.data?.id) return;
      editShop(res.data, shopLocationId);
    });
  };

  const removeShop = (id) => {
    if (shopLocationId == null) return;
    run(() => deleteShop(campaignId, shopLocationId, id)).then((res) => {
      if (res && String(shopId) === String(id)) blankShop();
    });
  };

  const blankCreatures = () => {
    setCreatureName('');
    setCreatureBoxes('');
    setCreatureCount('1');
    setCreatureNote('');
  };

  const blankNpcForm = () => {
    setNpcEditId(null);
    setNpcName('');
    setNpcMotivation('');
    setNpcKnowledge('');
    setNpcAttitude('');
    setNpcError(null);
  };

  const editNpcRow = (row) => {
    const loc = row.location_id == null
      ? null
      : (board?.locations || []).find((item) => String(item.id) === String(row.location_id));
    setNpcEditId(row.id);
    setNpcName(row.name || '');
    setNpcBrowsePlaceKey(row.location_id == null ? '' : (loc == null || loc.place_id == null ? 'unassigned' : String(loc.place_id)));
    setNpcLocationId(row.location_id == null ? '' : String(row.location_id));
    setNpcMotivation(row.motivation || '');
    setNpcKnowledge(row.knowledge || '');
    setNpcAttitude(row.attitude || '');
    setNpcError(null);
    setError(null);
  };

  const saveNpcForm = (e) => {
    e.preventDefault();
    const name = npcName.trim();
    if (!name) {
      setNpcError('NPC name is required.');
      return;
    }
    const payload = {
      name,
      motivation: npcMotivation,
      knowledge: npcKnowledge,
      attitude: npcAttitude,
      location_id: npcLocationId === '' ? null : Number(npcLocationId),
    };
    const action = npcEditId == null
      ? () => createNpc(campaignId, payload)
      : () => updateNpc(campaignId, npcEditId, payload);
    run(action, setNpcError).then((res) => {
      if (!res?.data?.id) return;
      setNpcEditId(res.data.id);
      setNpcError(null);
    });
  };

  const removeNpcRow = (id) => {
    run(() => deleteNpc(campaignId, id), setNpcError).then((res) => {
      if (res && String(npcEditId) === String(id)) blankNpcForm();
    });
  };

  const saveCreatures = (e) => {
    e.preventDefault();
    const targetLocationId = creatureFilterId;
    if (!targetLocationId) {
      setError('Choose a place and location for the creatures.');
      return;
    }
    const name = creatureName.trim();
    if (!name) {
      setError('Creature name is required.');
      return;
    }
    const parts = creatureBoxes.split(/[,\s]+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      setError('Enter hit points.');
      return;
    }
    const totals = parts.map((part) => wholeInt(part));
    if (totals.some((total) => total == null || total < 1)) {
      setError('Hit points must be positive totals.');
      return;
    }
    let body;
    if (totals.length === 1) {
      const count = wholeInt(creatureCount);
      if (count == null || count < 1 || count > 100) {
        setError('Count must be from 1 to 100.');
        return;
      }
      body = { name, hp: totals[0], count, note: creatureNote.trim() || null };
    } else {
      if (totals.length > 100) {
        setError('Enter at most 100 hit point totals.');
        return;
      }
      body = { name, hit_points: totals, note: creatureNote.trim() || null };
    }
    run(() => createCreatures(campaignId, targetLocationId, body)).then((res) => {
      if (res) blankCreatures();
    });
  };

  const removeCreature = (locationId, id) => {
    if (locationId == null) return;
    run(() => deleteCreature(campaignId, locationId, id));
  };

  const saveFlag = (e) => {
    e.preventDefault();
    if (locId == null) return;
    if (!flagNote.trim()) {
      setError('Flag note is required.');
      return;
    }
    run(() => setLocationFlag(campaignId, locId, { note: flagNote.trim(), state: flagState })).then((res) => {
      if (res) setFlagNote('');
    });
  };

  const clearFlag = (id) => {
    run(() => clearLocationFlag(campaignId, locId, id));
  };

  const reportTable = (message) => {
    setError(null);
    setTableError(message);
  };

  const blankTable = () => {
    setEditTableId(null);
    setTableNameValue('');
    setTableDie(6);
    setTableRows([{ ...BLANK_ROW }]);
    setTableError(null);
  };

  const editTable = (table) => {
    const rows = (table.rows || []).map((row) => ({
      face_lo: String(row.face_lo),
      face_hi: String(row.face_hi),
      label: row.label || '',
      quantity: row.quantity || '',
    }));
    setEditTableId(table.id);
    setTableNameValue(table.name);
    setTableDie(table.die);
    setTableRows(rows.length ? rows : [{ face_lo: '1', face_hi: String(table.die), label: '', quantity: '' }]);
    setError(null);
    setTableError(null);
  };

  const onTableDie = (value) => {
    setTableRows((rows) => {
      if (rows.length !== 1) return rows;
      if (rows[0].face_lo !== '1') return rows;
      if (rows[0].face_hi !== String(tableDie)) return rows;
      return [{ ...rows[0], face_hi: value }];
    });
    setTableDie(value);
  };

  const setRow = (index, patch) => {
    setTableRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const saveTable = (e) => {
    e.preventDefault();
    const die = wholeInt(tableDie);
    if (!tableNameValue.trim()) {
      reportTable('Table name is required.');
      return;
    }
    if (die == null || die < 2 || die > 100) {
      reportTable('Table die must be from 2 to 100.');
      return;
    }
    const rows = [];
    for (let i = 0; i < tableRows.length; i += 1) {
      const row = tableRows[i];
      const faceLo = wholeInt(row.face_lo);
      const faceHi = wholeInt(row.face_hi);
      if (faceLo == null || faceHi == null || faceHi < faceLo || faceHi > die) {
        reportTable(`Row ${i + 1} faces must sit on the die.`);
        return;
      }
      if (!row.label.trim()) {
        reportTable(`Row ${i + 1} needs a label.`);
        return;
      }
      rows.push({
        face_lo: faceLo,
        face_hi: faceHi,
        label: row.label.trim(),
        quantity: row.quantity.trim() || null,
      });
    }
    const body = { name: tableNameValue.trim(), die, rows };
    const action = editTableId == null
      ? () => createEncounterTable(campaignId, body)
      : () => updateEncounterTable(campaignId, editTableId, body);
    run(action, setTableError).then((res) => {
      if (!res) return;
      if (editTableId == null && locTable === '' && res.data?.id != null) setLocTable(String(res.data.id));
      blankTable();
    });
  };

  const removeTable = () => {
    if (pickedTableId == null) return;
    const id = pickedTableId;
    setConfirmTable(false);
    run(() => deleteEncounterTable(campaignId, id), setTableError).then((res) => {
      if (!res) return;
      if (String(pickedTableId) === String(id)) setPickedTableId(null);
      if (String(editTableId) === String(id)) blankTable();
    });
  };

  const tables = board?.tables || [];
  const customTables = tables.filter((table) => table.custom);
  const stockTables = tables.filter((table) => !table.custom);
  const pickedTable = customTables.find((table) => String(table.id) === String(pickedTableId));
  const locations = board?.locations || [];
  const places = board?.places || [];
  const editingLocation = locations.find((loc) => String(loc.id) === String(locId));
  const pickedLocation = locations.find((loc) => String(loc.id) === String(pickedId));
  const shopLocation = locations.find((loc) => String(loc.id) === String(shopLocationId));
  const unassignedLocations = locations.filter((loc) => loc.place_id == null);
  const locationsUnder = (id) => locations.filter((loc) => String(loc.place_id) === String(id));
  const locationsWithShops = locations.filter((loc) => (loc.shops || []).length > 0);
  const shopTreePlaces = places
    .map((place) => ({
      place,
      locations: locationsWithShops.filter((loc) => String(loc.place_id) === String(place.id)),
    }))
    .filter((group) => group.locations.length > 0);
  const shopTreeUnassigned = locationsWithShops.filter((loc) => loc.place_id == null);
  const shopAddLocations = shopBrowsePlaceKey === ''
    ? []
    : shopBrowsePlaceKey === 'unassigned'
      ? unassignedLocations
      : locationsUnder(shopBrowsePlaceKey);
  const campaignNpcs = board?.situation?.npcs || [];
  const npcsAtLocation = (locationId) => campaignNpcs.filter((npc) => String(npc.location_id) === String(locationId));
  const locationsWithNpcs = locations.filter((loc) => npcsAtLocation(loc.id).length > 0);
  const npcTreePlaces = places
    .map((place) => ({
      place,
      locations: locationsWithNpcs.filter((loc) => String(loc.place_id) === String(place.id)),
    }))
    .filter((group) => group.locations.length > 0);
  const npcTreeUnassignedLocs = locationsWithNpcs.filter((loc) => loc.place_id == null);
  const npcUnassigned = campaignNpcs.filter((npc) => npc.location_id == null);
  const npcFormLocations = npcBrowsePlaceKey === ''
    ? []
    : npcBrowsePlaceKey === 'unassigned'
      ? unassignedLocations
      : locationsUnder(npcBrowsePlaceKey);
  const creaturePlaceLocations = creaturePlaceKey === ''
    ? locations
    : creaturePlaceKey === 'unassigned'
      ? unassignedLocations
      : locationsUnder(creaturePlaceKey);
  const allCreatures = locations.flatMap((loc) => (
    (loc.creatures || []).map((creature) => ({
      ...creature,
      location_id: loc.id,
      location_name: loc.name,
      place_id: loc.place_id ?? null,
    }))
  ));
  const placeScopedCreatures = creaturePlaceKey === ''
    ? allCreatures
    : creaturePlaceKey === 'unassigned'
      ? allCreatures.filter((creature) => creature.place_id == null)
      : allCreatures.filter((creature) => String(creature.place_id) === String(creaturePlaceKey));
  const filteredCreatures = creatureFilterId
    ? placeScopedCreatures.filter((creature) => String(creature.location_id) === String(creatureFilterId))
    : placeScopedCreatures;
  const creatureAddId = creatureFilterId;

  const placeKeyForLocation = (loc) => (
    loc == null || loc.place_id == null ? 'unassigned' : String(loc.place_id)
  );

  const openLocation = (loc) => {
    setConfirmRemove(false);
    setBrowsePlaceKey(placeKeyForLocation(loc));
    setPickedId(loc.id);
    editLocation(loc);
  };

  const openNewLocation = () => {
    setConfirmRemove(false);
    setPickedId(null);
    const prefill = browsePlaceKey && browsePlaceKey !== 'unassigned' ? browsePlaceKey : '';
    blankLocation(prefill);
  };

  const browseLocations = browsePlaceKey === ''
    ? []
    : browsePlaceKey === 'unassigned'
      ? unassignedLocations
      : locationsUnder(browsePlaceKey);

  const situation = (sections) => (
    <SituationPanel
      campaignId={campaignId}
      board={board}
      busy={busy}
      run={run}
      mode="edit"
      bare
      sections={sections}
    />
  );

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Configuration</h1>
        {campaignName ? <p className="muted">{campaignName}</p> : null}
        {error && <p style={{ color: '#c95858' }}>{error}</p>}
        {loading && !board && <p className="muted">Loading…</p>}

        <div className="catalog-tabs" role="tablist" aria-label="Configuration">
          {[
            ['intro', 'Intro'],
            ['places', 'Places'],
            ['locations', 'Locations'],
            ['shops', 'Shops'],
            ['npcs', 'NPCs'],
            ['creatures', 'Creatures'],
            ['encounters', 'Encounters'],
            ['tables', 'Campaign Tables'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`catalog-tab${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'intro' && (
        <>
        <h2>Intro</h2>
        <p className="muted">Shown on Home until Begin Campaign selects the first location. Players do not see this.</p>
        <form onSubmit={saveDetails} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <label style={STACK}>
            Intro
            <textarea
              value={introText}
              onChange={(e) => { setDetailsDirty(true); setIntroText(e.target.value); }}
              placeholder="What the GM reads before play"
              aria-label="Intro"
              rows={4}
              maxLength={4000}
              style={FIELD}
            />
          </label>
          <label style={STACK}>
            GM notes
            <textarea
              value={gmNotes}
              onChange={(e) => { setDetailsDirty(true); setGmNotes(e.target.value); }}
              placeholder="Private notes for the GM"
              aria-label="GM notes"
              rows={4}
              maxLength={4000}
              style={FIELD}
            />
          </label>
          <label>
            First location
            <select
              value={firstLocationId}
              aria-label="First location"
              disabled={busy || !board}
              onChange={(e) => { setDetailsDirty(true); setFirstLocationId(e.target.value); }}
              style={{ ...FIELD, marginLeft: 6, maxWidth: 420 }}
            >
              <option value="">None</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </label>
          <span>
            <button type="submit" className="btn btn-secondary" disabled={busy || !board}>Save intro</button>
          </span>
        </form>
        {situation(['objectives'])}
        </>
        )}

        {tab === 'places' && (
        <>
        <h2>Places</h2>
        <p className="muted">A Place groups locations. Unassigned locations stay listed under Locations until you put them under a Place.</p>
        <form onSubmit={saveCampaignPlace} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{placeId == null ? 'New place' : 'Edit place'}</h3>
          {placeError && <p style={{ color: '#c95858', margin: 0 }}>{placeError}</p>}
          <label style={STACK}>
            Name
            <input value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="Morgansfort" maxLength={80} aria-label="Place name" style={FIELD} />
          </label>
          <label style={STACK}>
            Type
            <input
              list="place-types"
              value={placeType}
              onChange={(e) => setPlaceType(e.target.value)}
              placeholder="Settlement, Fortress, Dungeon…"
              maxLength={30}
              aria-label="Place type"
              style={FIELD}
            />
            <datalist id="place-types">
              {PLACE_TYPES.map((type) => <option key={type} value={type} />)}
            </datalist>
          </label>
          <label style={STACK}>
            Description
            <textarea value={placeDescription} onChange={(e) => setPlaceDescription(e.target.value)} placeholder="What this destination is" aria-label="Place description" rows={2} style={FIELD} />
          </label>
          <label style={STACK}>
            GM text
            <textarea value={placeGmText} onChange={(e) => setPlaceGmText(e.target.value)} placeholder="Private notes for the GM" aria-label="Place GM text" rows={2} style={FIELD} />
          </label>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="submit" className="btn btn-secondary" disabled={busy || !board}>
              {placeId == null ? 'Add place' : 'Save place'}
            </button>
            {placeId != null && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={blankCampaignPlace}>Cancel</button>
            )}
            {placeId != null && !confirmPlaceRemove && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmPlaceRemove(true)}>Remove</button>
            )}
            {placeId != null && confirmPlaceRemove && (
              <>
                <span className="muted">Remove place? Locations stay unassigned.</span>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={removeCampaignPlace}>Remove</button>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setConfirmPlaceRemove(false)}>Keep</button>
              </>
            )}
          </span>
        </form>

        {places.length === 0 && <p className="muted">No places yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {places.map((place) => (
            <li key={place.id} style={{ marginBottom: 6 }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.15rem 0.45rem' }}
                disabled={busy}
                onClick={() => editCampaignPlace(place)}
              >
                {place.name}{place.place_type ? ` · ${place.place_type}` : ''}
              </button>
            </li>
          ))}
        </ul>
        </>
        )}

        {tab === 'locations' && (
        <>
        <h2>Locations</h2>
        <p className="muted">Locations sit under a Place, or stay unassigned until you assign one.</p>
        {places.length === 0 && locations.length === 0 && <p className="muted">No locations yet.</p>}
        {(places.length > 0 || locations.length > 0) && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <label>
              Place
              <select
                value={browsePlaceKey}
                disabled={busy}
                aria-label="Place"
                onChange={(e) => {
                  const key = e.target.value;
                  setBrowsePlaceKey(key);
                  setConfirmRemove(false);
                  const nextRows = key === ''
                    ? []
                    : key === 'unassigned'
                      ? unassignedLocations
                      : locationsUnder(key);
                  if (pickedId != null && !nextRows.some((loc) => String(loc.id) === String(pickedId))) {
                    setPickedId(null);
                    blankLocation(key && key !== 'unassigned' ? key : '');
                  }
                }}
                style={{ ...FIELD, marginLeft: 6, maxWidth: 280 }}
              >
                <option value="">Choose…</option>
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}{place.place_type ? ` · ${place.place_type}` : ''}
                  </option>
                ))}
                <option value="unassigned">Unassigned</option>
              </select>
            </label>
            <label>
              Location
              <select
                value={locId == null ? '' : String(pickedId || locId)}
                disabled={busy || browsePlaceKey === ''}
                aria-label="Location"
                onChange={(e) => {
                  const id = e.target.value;
                  setConfirmRemove(false);
                  if (!id) {
                    setPickedId(null);
                    blankLocation(browsePlaceKey !== 'unassigned' ? browsePlaceKey : '');
                    return;
                  }
                  const loc = browseLocations.find((row) => String(row.id) === String(id));
                  if (loc) openLocation(loc);
                }}
                style={{ ...FIELD, marginLeft: 6, maxWidth: 320 }}
              >
                <option value="">Choose…</option>
                {browseLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}{String(board?.location_id) === String(loc.id) ? ' · selected' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {pickedId != null && locId == null && locError && <p style={{ color: '#c95858', margin: '0.5rem 0 0' }}>{locError}</p>}

        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={openNewLocation}>
            New location
          </button>
        </div>

        {(pickedId == null || locId != null) && (
        <form onSubmit={saveLocation} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{locId == null ? 'New location' : 'Edit location'}</h2>
          {locError && <p style={{ color: '#c95858', margin: 0 }}>{locError}</p>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <label style={{ ...STACK, flex: 1, minWidth: 0 }}>
              Name
              <input value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="Name" maxLength={80} aria-label="Location name" style={FIELD} />
            </label>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {!confirmRemove && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.2rem 0.5rem' }}
                  disabled={busy || locId == null}
                  onClick={() => setConfirmRemove(true)}
                >
                  Remove location
                </button>
              )}
              {confirmRemove && locId != null && (
                <>
                  <span className="muted">Remove {pickedLocation?.name || locName}?</span>
                  <button type="button" className="btn btn-danger" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={removeLocation}>Remove</button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => setConfirmRemove(false)}>Cancel</button>
                </>
              )}
            </span>
          </div>
          <label style={STACK}>
            Place
            <select
              value={locPlaceId}
              onChange={(e) => setLocPlaceId(e.target.value)}
              aria-label="Parent place"
              style={FIELD}
            >
              <option value="">None · unassigned</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>{place.name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: '8px 12px' }}>
          <label>
            Environment
            <select value={locEnvironment} onChange={(e) => onEnvironment(e.target.value)} style={{ ...FIELD, marginLeft: 6 }}>
              <option value="outside">Outside</option>
              <option value="inside">Inside</option>
            </select>
          </label>
          <label>
            Ambient light
            <input
              type="number"
              min={0}
              max={100}
              value={locAmbient}
              onChange={(e) => setLocAmbient(e.target.value)}
              aria-label="Ambient light"
              style={{ ...FIELD, width: 90, marginLeft: 6 }}
            />
          </label>
          <label>
            Check die
            <input type="number" min={2} max={100} value={locDie} onChange={(e) => setLocDie(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
          </label>
          <label>
            Interval seconds
            <input
              type="number"
              min={1}
              value={locInterval}
              onChange={(e) => setLocInterval(e.target.value)}
              placeholder={String(intervalForPlace(locEnvironment))}
              style={{ ...FIELD, width: 100, marginLeft: 6 }}
            />
          </label>
          <label>
            Table
            <select value={locTable} onChange={(e) => setLocTable(e.target.value)} style={{ ...FIELD, marginLeft: 6, width: 180, maxWidth: 220 }}>
              <option value="">Choose…</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name} (d{table.die}){table.custom ? '' : ' · stock'}
                </option>
              ))}
            </select>
          </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: '8px 12px' }}>
          <label>
            Terrain
            <select value={terrain} onChange={(e) => onTerrain(e.target.value)} style={{ ...FIELD, marginLeft: 6 }}>
              <option value="">None</option>
              {(board?.terrains || []).map((row) => (
                <option key={row.name} value={row.name}>{row.name}</option>
              ))}
            </select>
          </label>
          <label>
            Movement %
            <input
              type="number"
              min={-100}
              max={200}
              value={movement}
              onChange={(e) => setMovement(e.target.value)}
              placeholder="0"
              aria-label="Movement percent"
              style={{ ...FIELD, width: 90, marginLeft: 6 }}
            />
          </label>
          </div>
          <label style={STACK}>
            GM text
            <textarea value={locGmText} onChange={(e) => setLocGmText(e.target.value)} placeholder="Information for the GM" aria-label="GM text" rows={3} style={FIELD} />
          </label>
          <label style={STACK}>
            In the dark
            <textarea value={locDark} onChange={(e) => setLocDark(e.target.value)} placeholder="What they notice in the dark" aria-label="Dark summary" rows={3} style={FIELD} />
          </label>
          <label style={STACK}>
            Read aloud
            <textarea value={locSummary} onChange={(e) => setLocSummary(e.target.value)} placeholder="What the characters can notice here" aria-label="Location summary" rows={3} style={FIELD} />
          </label>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-secondary" disabled={busy || !board}>
              {locId == null ? 'Add location' : 'Save location'}
            </button>
            {locId != null && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { if (pickedLocation) editLocation(pickedLocation); else blankLocation(); }}>Cancel</button>
            )}
          </span>
        </form>
        )}

        {locId != null && (
          <form onSubmit={saveFlag} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <h2 style={{ marginBottom: 0 }}>Room flags</h2>
            <p className="muted">Sprung, taken, or found. A sentence stays a clue.</p>
            {(editingLocation?.flags || []).length === 0 && <p className="muted">Nothing marked at this location.</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {(editingLocation?.flags || []).map((flag) => (
                <li key={flag.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <span>{flag.note} · {flag.state}</span>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => clearFlag(flag.id)}>Clear</button>
                </li>
              ))}
            </ul>
            <input value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="Pit, chest, secret" maxLength={80} aria-label="Flag note" style={FIELD} />
            <label>
              State
              <select value={flagState} aria-label="Flag state" onChange={(e) => setFlagState(e.target.value)} style={{ ...FIELD, marginLeft: 6 }}>
                <option value="sprung">Sprung</option>
                <option value="taken">Taken</option>
                <option value="found">Found</option>
              </select>
            </label>
            <button type="submit" className="btn btn-secondary" disabled={busy || !board}>Set flag</button>
          </form>
        )}
        {situation(['paths'])}
        </>
        )}

        {tab === 'shops' && (
          <>
            <h2>Shops</h2>
            <p className="muted">0 is the listed price. Buy +20 means the character pays 120%. Sell −50 means the shop pays half.</p>
            {shopTreePlaces.length === 0 && shopTreeUnassigned.length === 0 && (
              <p className="muted">No shops yet.</p>
            )}
            {shopTreePlaces.map(({ place, locations: placeLocs }) => (
              <details key={place.id} style={{ marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  {place.name}{place.place_type ? ` · ${place.place_type}` : ''}
                </summary>
                {placeLocs.map((loc) => (
                  <details key={loc.id} style={{ margin: '0.35rem 0 0.35rem 0.75rem' }}>
                    <summary style={{ cursor: 'pointer' }}>{loc.name}</summary>
                    <ul style={{ listStyle: 'none', padding: '0.25rem 0 0 0.75rem', margin: 0 }}>
                      {(loc.shops || []).map((shop) => (
                        <li key={shop.id} style={{ marginBottom: 4 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.15rem 0.45rem' }}
                            disabled={busy}
                            onClick={() => editShop(shop, loc.id)}
                          >
                            {shop.name}
                            <span className="muted">{` · buy ${percentLabel(shop.buy_cost_delta)} · sell ${percentLabel(shop.sell_cost_delta)}`}</span>
                            {String(shopId) === String(shop.id) ? ' · editing' : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </details>
            ))}
            {shopTreeUnassigned.length > 0 && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Unassigned Locations</summary>
                {shopTreeUnassigned.map((loc) => (
                  <details key={loc.id} style={{ margin: '0.35rem 0 0.35rem 0.75rem' }}>
                    <summary style={{ cursor: 'pointer' }}>{loc.name}</summary>
                    <ul style={{ listStyle: 'none', padding: '0.25rem 0 0 0.75rem', margin: 0 }}>
                      {(loc.shops || []).map((shop) => (
                        <li key={shop.id} style={{ marginBottom: 4 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.15rem 0.45rem' }}
                            disabled={busy}
                            onClick={() => editShop(shop, loc.id)}
                          >
                            {shop.name}
                            <span className="muted">{` · buy ${percentLabel(shop.buy_cost_delta)} · sell ${percentLabel(shop.sell_cost_delta)}`}</span>
                            {String(shopId) === String(shop.id) ? ' · editing' : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </details>
            )}

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || !board}
                onClick={() => blankShop()}
              >
                New shop
              </button>
            </div>

            <form onSubmit={saveShop} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <h2 style={{ marginBottom: 0 }}>{shopId == null ? 'New shop' : 'Edit shop'}</h2>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label>
                  Place
                  <select
                    value={shopBrowsePlaceKey}
                    disabled={busy || shopId != null}
                    aria-label="Shop place"
                    onChange={(e) => {
                      const key = e.target.value;
                      setShopBrowsePlaceKey(key);
                      setShopLocationId(null);
                    }}
                    style={{ ...FIELD, marginLeft: 6, maxWidth: 280 }}
                  >
                    <option value="">Choose…</option>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}{place.place_type ? ` · ${place.place_type}` : ''}
                      </option>
                    ))}
                    <option value="unassigned">Unassigned</option>
                  </select>
                </label>
                <label>
                  Location
                  <select
                    value={shopLocationId == null ? '' : String(shopLocationId)}
                    disabled={busy || shopId != null || shopBrowsePlaceKey === ''}
                    aria-label="Shop location"
                    onChange={(e) => {
                      const id = e.target.value;
                      setShopLocationId(id ? id : null);
                    }}
                    style={{ ...FIELD, marginLeft: 6, maxWidth: 320 }}
                  >
                    <option value="">Choose…</option>
                    {shopAddLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {shopLocation && (
                <p className="muted" style={{ margin: 0 }}>
                  {shopId == null ? 'Adding at' : 'At'} {shopLocation.name}
                  {shopLocation.place_id != null
                    ? ` · ${places.find((place) => String(place.id) === String(shopLocation.place_id))?.name || 'place'}`
                    : ' · unassigned'}
                </p>
              )}
              <input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Shop name" maxLength={80} aria-label="Shop name" style={FIELD} />
              <label>
                Buy %
                <input
                  type="number"
                  min={-100}
                  max={1000}
                  value={buyDelta}
                  onChange={(e) => setBuyDelta(e.target.value)}
                  aria-label="Buy percent"
                  style={{ ...FIELD, width: 90, marginLeft: 6 }}
                />
              </label>
              <label>
                Sell %
                <input
                  type="number"
                  min={-100}
                  max={1000}
                  value={sellDelta}
                  onChange={(e) => setSellDelta(e.target.value)}
                  aria-label="Sell percent"
                  style={{ ...FIELD, width: 90, marginLeft: 6 }}
                />
              </label>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>Categories</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                  {categories.map((cat) => (
                    <label key={cat.id}>
                      <input
                        type="checkbox"
                        checked={shopCategoryIds.includes(Number(cat.id))}
                        onChange={() => toggleShopCategory(Number(cat.id))}
                        style={{ marginRight: 4 }}
                      />
                      {cat.name}
                    </label>
                  ))}
                </div>
              </div>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="submit" className="btn btn-secondary" disabled={busy || !board || shopLocationId == null}>
                  {shopId == null ? 'Add shop' : 'Save shop'}
                </button>
                {shopId != null && (
                  <>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={blankShop}>Cancel</button>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => removeShop(shopId)}>Remove</button>
                  </>
                )}
              </span>
            </form>
          </>
        )}

        {tab === 'npcs' && (
          <>
            <h2>NPCs</h2>
            {npcTreePlaces.length === 0 && npcTreeUnassignedLocs.length === 0 && npcUnassigned.length === 0 && (
              <p className="muted">No NPCs yet.</p>
            )}
            {npcTreePlaces.map(({ place, locations: placeLocs }) => (
              <details key={place.id} style={{ marginBottom: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  {place.name}{place.place_type ? ` · ${place.place_type}` : ''}
                </summary>
                {placeLocs.map((loc) => (
                  <details key={loc.id} style={{ margin: '0.35rem 0 0.35rem 0.75rem' }}>
                    <summary style={{ cursor: 'pointer' }}>{loc.name}</summary>
                    <ul style={{ listStyle: 'none', padding: '0.25rem 0 0 0.75rem', margin: 0 }}>
                      {npcsAtLocation(loc.id).map((npc) => (
                        <li key={npc.id} style={{ marginBottom: 4 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.15rem 0.45rem' }}
                            disabled={busy}
                            onClick={() => editNpcRow(npc)}
                          >
                            {npc.name}
                            {npc.attitude ? <span className="muted">{` · ${npc.attitude}`}</span> : null}
                            {String(npcEditId) === String(npc.id) ? ' · editing' : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </details>
            ))}
            {npcTreeUnassignedLocs.length > 0 && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Unassigned Locations</summary>
                {npcTreeUnassignedLocs.map((loc) => (
                  <details key={loc.id} style={{ margin: '0.35rem 0 0.35rem 0.75rem' }}>
                    <summary style={{ cursor: 'pointer' }}>{loc.name}</summary>
                    <ul style={{ listStyle: 'none', padding: '0.25rem 0 0 0.75rem', margin: 0 }}>
                      {npcsAtLocation(loc.id).map((npc) => (
                        <li key={npc.id} style={{ marginBottom: 4 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.15rem 0.45rem' }}
                            disabled={busy}
                            onClick={() => editNpcRow(npc)}
                          >
                            {npc.name}
                            {npc.attitude ? <span className="muted">{` · ${npc.attitude}`}</span> : null}
                            {String(npcEditId) === String(npc.id) ? ' · editing' : ''}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </details>
            )}
            {npcUnassigned.length > 0 && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>No location</summary>
                <ul style={{ listStyle: 'none', padding: '0.25rem 0 0 0.75rem', margin: 0 }}>
                  {npcUnassigned.map((npc) => (
                    <li key={npc.id} style={{ marginBottom: 4 }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.15rem 0.45rem' }}
                        disabled={busy}
                        onClick={() => editNpcRow(npc)}
                      >
                        {npc.name}
                        {npc.attitude ? <span className="muted">{` · ${npc.attitude}`}</span> : null}
                        {String(npcEditId) === String(npc.id) ? ' · editing' : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={blankNpcForm}>
                New NPC
              </button>
            </div>

            <form onSubmit={saveNpcForm} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <h2 style={{ marginBottom: 0 }}>{npcEditId == null ? 'New NPC' : 'Edit NPC'}</h2>
              {npcError ? <p style={{ color: '#c95858', margin: 0 }}>{npcError}</p> : null}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <label>
                  Place
                  <select
                    value={npcBrowsePlaceKey}
                    disabled={busy}
                    aria-label="NPC place"
                    onChange={(e) => {
                      setNpcBrowsePlaceKey(e.target.value);
                      setNpcLocationId('');
                    }}
                    style={{ ...FIELD, marginLeft: 6, maxWidth: 280 }}
                  >
                    <option value="">None · unassigned</option>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name}{place.place_type ? ` · ${place.place_type}` : ''}
                      </option>
                    ))}
                    <option value="unassigned">Unassigned Locations</option>
                  </select>
                </label>
                <label>
                  Location
                  <select
                    value={npcLocationId}
                    disabled={busy || npcBrowsePlaceKey === ''}
                    aria-label="NPC location"
                    onChange={(e) => setNpcLocationId(e.target.value)}
                    style={{ ...FIELD, marginLeft: 6, maxWidth: 320 }}
                  >
                    <option value="">Choose…</option>
                    {npcFormLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <input value={npcName} onChange={(e) => setNpcName(e.target.value)} placeholder="NPC name" maxLength={80} aria-label="NPC name" style={FIELD} />
              <input value={npcMotivation} onChange={(e) => setNpcMotivation(e.target.value)} placeholder="Motivation" aria-label="NPC motivation" style={FIELD} />
              <input value={npcKnowledge} onChange={(e) => setNpcKnowledge(e.target.value)} placeholder="What they know" aria-label="What the NPC knows" style={FIELD} />
              <input value={npcAttitude} onChange={(e) => setNpcAttitude(e.target.value)} placeholder="Attitude" maxLength={80} aria-label="NPC attitude" style={FIELD} />
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="submit" className="btn btn-secondary" disabled={busy || !board}>
                  {npcEditId == null ? 'Add NPC' : 'Save NPC'}
                </button>
                {npcEditId != null && (
                  <>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={blankNpcForm}>Cancel</button>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => removeNpcRow(npcEditId)}>Remove</button>
                  </>
                )}
              </span>
            </form>

            {situation(['clues'])}
          </>
        )}

        {tab === 'creatures' && (
          <>
            <h2>Creatures</h2>
            {locations.length === 0 && <p className="muted">No locations yet.</p>}
            {locations.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label>
                    Place
                    <select
                      value={creaturePlaceKey}
                      disabled={busy}
                      aria-label="Creature place"
                      onChange={(e) => {
                        setCreaturePlaceKey(e.target.value);
                        setCreatureFilterId('');
                      }}
                      style={{ ...FIELD, marginLeft: 6, maxWidth: 280 }}
                    >
                      <option value="">All</option>
                      {places.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.name}{place.place_type ? ` · ${place.place_type}` : ''}
                        </option>
                      ))}
                      <option value="unassigned">Unassigned</option>
                    </select>
                  </label>
                  <label>
                    Location
                    <select
                      value={creatureFilterId}
                      disabled={busy}
                      aria-label="Creature location"
                      onChange={(e) => setCreatureFilterId(e.target.value)}
                      style={{ ...FIELD, marginLeft: 6, maxWidth: 320 }}
                    >
                      <option value="">All</option>
                      {creaturePlaceLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}{String(board?.location_id) === String(loc.id) ? ' · selected' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <form onSubmit={saveCreatures} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                  <p className="muted">
                    {creatureFilterId
                      ? `Showing ${locations.find((loc) => String(loc.id) === String(creatureFilterId))?.name || 'this location'}.`
                      : creaturePlaceKey
                        ? 'Showing all locations in this place. Choose a location to add creatures.'
                        : 'Showing all. Choose a place and location to add creatures.'}
                  </p>
                  <p className="muted">One number plus a count repeats it. A comma list is one creature per total. Dead stay at 0.</p>
                  {filteredCreatures.length === 0 && (
                    <p className="muted">{creatureFilterId || creaturePlaceKey ? 'None here.' : 'None yet.'}</p>
                  )}
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {creatureGroups(filteredCreatures).map((group) => (
                      <li key={group.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                        <span>{creatureLine(group, { showLocation: !creatureFilterId })}</span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.2rem 0.5rem' }}
                          disabled={busy}
                          onClick={() => removeCreature(group.location_id, group.ids[0])}
                        >
                          Remove one
                        </button>
                      </li>
                    ))}
                  </ul>
                  <input value={creatureName} onChange={(e) => setCreatureName(e.target.value)} placeholder="Name" maxLength={80} aria-label="Creature name" style={FIELD} />
                  <input value={creatureBoxes} onChange={(e) => setCreatureBoxes(e.target.value)} placeholder="Hit points, such as 5, 7, 2 or 4" aria-label="Creature hit points" style={FIELD} />
                  <label>
                    Count
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={creatureCount}
                      onChange={(e) => setCreatureCount(e.target.value)}
                      aria-label="Creature count"
                      style={{ ...FIELD, width: 70, marginLeft: 6 }}
                    />
                  </label>
                  <input value={creatureNote} onChange={(e) => setCreatureNote(e.target.value)} placeholder="Note" maxLength={400} aria-label="Creature note" style={FIELD} />
                  <button type="submit" className="btn btn-secondary" disabled={busy || !board || !creatureAddId}>Add creatures</button>
                </form>
              </>
            )}
          </>
        )}

        {tab === 'encounters' && (
          <>
            {situation(['encounters'])}
            <h2>Prep</h2>
            <p className="muted">These help write an adventure. They do not open an encounter or move the clock.</p>
            <h3 style={{ marginBottom: 6 }}>Dungeon stocking</h3>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                run(() => stockRoom(campaignId)).then((res) => {
                  if (res) setStockText(`d% ${res.data.roll}: ${res.data.contents}`);
                });
              }}
            >
              Stock a room
            </button>
            {stockText && <p>{stockText}</p>}
            <h3 style={{ marginBottom: 6 }}>Traps</h3>
            <p className="muted">A pick fills the note. It does not roll the trap.</p>
            <select
              aria-label="Trap"
              value={trapName}
              onChange={(e) => {
                const name = e.target.value;
                const trap = (prep?.traps || []).find((row) => row.name === name);
                setTrapName(name);
                setTrapNote(trap ? trap.note : '');
              }}
              style={FIELD}
            >
              <option value="">Choose a trap</option>
              {(prep?.traps || []).map((trap) => (
                <option key={trap.name} value={trap.name}>{trap.name}</option>
              ))}
            </select>
            <textarea
              aria-label="Trap note"
              value={trapNote}
              maxLength={500}
              onChange={(e) => setTrapNote(e.target.value)}
              style={{ ...FIELD, display: 'block', width: '100%', minHeight: 72, marginTop: 8 }}
            />
          </>
        )}

        {tab === 'tables' && (
        <>
        <h2>Campaign tables</h2>
        {customTables.length === 0 && <p className="muted">No campaign tables yet.</p>}
        {customTables.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label>
              Table
              <select
                value={pickedTableId == null ? '' : String(pickedTableId)}
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value;
                  setPickedTableId(id || null);
                  setConfirmTable(false);
                  setTableError(null);
                  if (editTableId != null && String(editTableId) !== String(id)) blankTable();
                }}
                style={{ ...FIELD, marginLeft: 6, maxWidth: 420 }}
              >
                <option value="">New table</option>
                {customTables.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} · d{table.die} · {(table.rows || []).length} row{(table.rows || []).length === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
            {pickedTable && !confirmTable && (
              <>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => editTable(pickedTable)}>Edit</button>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => setConfirmTable(true)}>Remove</button>
              </>
            )}
            {pickedTable && confirmTable && (
              <>
                <span className="muted">Remove {pickedTable.name}?</span>
                <button type="button" className="btn btn-danger" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={removeTable}>Remove</button>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => setConfirmTable(false)}>Cancel</button>
              </>
            )}
          </div>
        )}
        {pickedTableId != null && editTableId == null && tableError && <p style={{ color: '#c95858', margin: '0.5rem 0 0' }}>{tableError}</p>}

        {(pickedTableId == null || editTableId != null) && (
        <form onSubmit={saveTable} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{editTableId == null ? 'New table' : 'Edit table'}</h2>
          {tableError && <p style={{ color: '#c95858', margin: 0 }}>{tableError}</p>}
          <input value={tableNameValue} onChange={(e) => setTableNameValue(e.target.value)} placeholder="Table name" maxLength={80} aria-label="Table name" style={FIELD} />
          <label>
            Die
            <input type="number" min={2} max={100} value={tableDie} onChange={(e) => onTableDie(e.target.value)} style={{ ...FIELD, width: 70, marginLeft: 6 }} />
          </label>
          {tableRows.map((row, index) => (
            <div key={index} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="number" min={1} value={row.face_lo} aria-label={`Row ${index + 1} low face`} onChange={(e) => setRow(index, { face_lo: e.target.value })} style={{ ...FIELD, width: 70 }} />
              <span className="muted">–</span>
              <input type="number" min={1} value={row.face_hi} aria-label={`Row ${index + 1} high face`} onChange={(e) => setRow(index, { face_hi: e.target.value })} style={{ ...FIELD, width: 70 }} />
              <input value={row.label} aria-label={`Row ${index + 1} label`} placeholder="Label" maxLength={80} onChange={(e) => setRow(index, { label: e.target.value })} style={{ ...FIELD, flex: '1 1 140px' }} />
              <input value={row.quantity} aria-label={`Row ${index + 1} quantity`} placeholder="Quantity" maxLength={80} onChange={(e) => setRow(index, { quantity: e.target.value })} style={{ ...FIELD, width: 120 }} />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '0.2rem 0.5rem' }}
                disabled={busy || tableRows.length === 1}
                onClick={() => setTableRows((rows) => rows.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          ))}
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setTableRows((rows) => [...rows, { face_lo: '', face_hi: '', label: '', quantity: '' }])}>
              Add row
            </button>
            <button type="submit" className="btn btn-secondary" disabled={busy || !board}>
              {editTableId == null ? 'Add table' : 'Save table'}
            </button>
            {editTableId != null && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={blankTable}>Cancel</button>
            )}
          </span>
        </form>
        )}

        <h2>Stock tables</h2>
        {stockTables.length === 0 && <p className="muted">No stock tables for this ruleset.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {stockTables.map((table) => (
            <li key={table.id} style={{ marginBottom: 6 }}>
              <strong>{table.name}</strong>
              <span className="muted">{` · d${table.die}`}</span>
            </li>
          ))}
        </ul>
        </>
        )}
      </div>
    </div>
  );
}
