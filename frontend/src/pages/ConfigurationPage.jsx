import React, { useCallback, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  createEncounterTable,
  createLocation,
  createShop,
  createCreatures,
  deleteCreature,
  setLocationFlag,
  clearLocationFlag,
  deleteEncounterTable,
  deleteLocation,
  deleteShop,
  getAdventuring,
  getItemCategories,
  getPrep,
  stockRoom,
  updateEncounterTable,
  updateLocation,
  updateShop,
} from '../api/api';
import SituationPanel from '../components/SituationPanel';

const FIELD = {
  padding: '0.45rem',
  borderRadius: 4,
  border: '1px solid #3d3530',
  background: '#1a1614',
  color: '#e8e0d5',
};

const BLANK_ROW = { face_lo: '1', face_hi: '6', label: '', quantity: '' };

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
    const key = [creature.name, creature.hp, creature.base_hp, creature.disposition, creature.in_fight ? 1 : 0, creature.note || ''].join('|');
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
  const [locPlace, setLocPlace] = useState('outside');
  const [locDie, setLocDie] = useState(6);
  const [locInterval, setLocInterval] = useState('');
  const [locTable, setLocTable] = useState('');
  const [terrain, setTerrain] = useState('');
  const [movement, setMovement] = useState('');
  const [locSummary, setLocSummary] = useState('');
  const [locSite, setLocSite] = useState('');
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
  const [shopId, setShopId] = useState(null);
  const [shopName, setShopName] = useState('');
  const [buyDelta, setBuyDelta] = useState('0');
  const [sellDelta, setSellDelta] = useState('0');
  const [shopCategoryIds, setShopCategoryIds] = useState([]);
  const [creatureName, setCreatureName] = useState('');
  const [creatureBoxes, setCreatureBoxes] = useState('');
  const [creatureCount, setCreatureCount] = useState('1');
  const [creatureNote, setCreatureNote] = useState('');
  const [flagNote, setFlagNote] = useState('');
  const [flagState, setFlagState] = useState('sprung');

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

  const blankLocation = () => {
    setLocId(null);
    setLocName('');
    setLocPlace('outside');
    setLocDie(6);
    setLocInterval('');
    setLocTable('');
    setTerrain('');
    setMovement('');
    setLocSummary('');
    setLocSite('');
    setLocError(null);
    blankShop();
  };

  const editLocation = (loc) => {
    setLocId(loc.id);
    setLocName(loc.name);
    setLocPlace(loc.place === 'inside' ? 'inside' : 'outside');
    setLocDie(loc.check_die);
    setLocInterval(loc.interval_seconds == null ? '' : String(loc.interval_seconds));
    setLocTable(String(loc.encounter_table_id));
    setTerrain(loc.terrain || '');
    setMovement(loc.movement_pct == null ? '' : String(loc.movement_pct));
    setLocSummary(loc.summary || '');
    setLocSite(loc.site || '');
    blankShop();
    setError(null);
    setLocError(null);
  };

  const onPlace = (value) => {
    setLocPlace(value);
    if (value === 'inside') {
      setTerrain('');
      setMovement('');
    }
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
      place: locPlace,
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
    if (locPlace === 'outside' && (terrain || String(movement).trim() !== '')) {
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
    body.site = locSite;
    const action = locId == null
      ? () => createLocation(campaignId, body)
      : () => updateLocation(campaignId, locId, body);
    run(action, setLocError).then((res) => {
      if (res) blankLocation();
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

  const editShop = (shop) => {
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
    if (locId == null) return;
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
      ? () => createShop(campaignId, locId, body)
      : () => updateShop(campaignId, locId, shopId, body);
    run(action).then((res) => {
      if (res) blankShop();
    });
  };

  const removeShop = (id) => {
    run(() => deleteShop(campaignId, locId, id)).then((res) => {
      if (res && String(shopId) === String(id)) blankShop();
    });
  };

  const blankCreatures = () => {
    setCreatureName('');
    setCreatureBoxes('');
    setCreatureCount('1');
    setCreatureNote('');
  };

  const saveCreatures = (e) => {
    e.preventDefault();
    if (locId == null) return;
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
    run(() => createCreatures(campaignId, locId, body)).then((res) => {
      if (res) blankCreatures();
    });
  };

  const removeCreature = (id) => {
    run(() => deleteCreature(campaignId, locId, id));
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
  const editingLocation = locations.find((loc) => String(loc.id) === String(locId));
  const pickedLocation = locations.find((loc) => String(loc.id) === String(pickedId));
  const locationShops = editingLocation?.shops || [];

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Configuration</h1>
        {campaignName ? <p className="muted">{campaignName}</p> : null}
        {error && <p style={{ color: '#c95858' }}>{error}</p>}
        {loading && !board && <p className="muted">Loading…</p>}

        <h2>Locations</h2>
        {locations.length === 0 && <p className="muted">No locations yet.</p>}
        {locations.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label>
              Location
              <select
                value={pickedId == null ? '' : String(pickedId)}
                disabled={busy}
                onChange={(e) => {
                  const id = e.target.value;
                  setPickedId(id || null);
                  setConfirmRemove(false);
                  if (locId != null && String(locId) !== String(id)) blankLocation();
                }}
                style={{ ...FIELD, marginLeft: 6, maxWidth: 420 }}
              >
                <option value="">New location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}{String(board.location_id) === String(loc.id) ? ' · selected' : ''}
                  </option>
                ))}
              </select>
            </label>
            {pickedLocation && !confirmRemove && (
              <>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => editLocation(pickedLocation)}>Edit</button>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => setConfirmRemove(true)}>Remove</button>
              </>
            )}
            {pickedLocation && confirmRemove && (
              <>
                <span className="muted">Remove {pickedLocation.name}?</span>
                <button type="button" className="btn btn-danger" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={removeLocation}>Remove</button>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => setConfirmRemove(false)}>Cancel</button>
              </>
            )}
          </div>
        )}
        {pickedId != null && locId == null && locError && <p style={{ color: '#c95858', margin: '0.5rem 0 0' }}>{locError}</p>}

        {(pickedId == null || locId != null) && (
        <form onSubmit={saveLocation} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{locId == null ? 'New location' : 'Edit location'}</h2>
          {locError && <p style={{ color: '#c95858', margin: 0 }}>{locError}</p>}
          <input value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="Name" maxLength={80} aria-label="Location name" style={FIELD} />
          <textarea value={locSummary} onChange={(e) => setLocSummary(e.target.value)} placeholder="What the characters can notice here" aria-label="Location summary" rows={3} style={FIELD} />
          <input value={locSite} onChange={(e) => setLocSite(e.target.value)} placeholder="Site, shared by one dungeon or town" aria-label="Site" maxLength={80} style={FIELD} />
          <label>
            Place
            <select value={locPlace} onChange={(e) => onPlace(e.target.value)} style={{ ...FIELD, marginLeft: 6 }}>
              <option value="outside">Outside</option>
              <option value="inside">Inside</option>
            </select>
          </label>
          {locPlace === 'outside' && (
            <>
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
            </>
          )}
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
              placeholder={locPlace === 'inside' ? '1800' : '14400'}
              style={{ ...FIELD, width: 100, marginLeft: 6 }}
            />
          </label>
          <label>
            Table
            <select value={locTable} onChange={(e) => setLocTable(e.target.value)} style={{ ...FIELD, marginLeft: 6, maxWidth: 280 }}>
              <option value="">Choose…</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name} (d{table.die}){table.custom ? '' : ' · stock'}
                </option>
              ))}
            </select>
          </label>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-secondary" disabled={busy || !board}>
              {locId == null ? 'Add location' : 'Save location'}
            </button>
            {locId != null && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={blankLocation}>Cancel</button>
            )}
          </span>
        </form>
        )}

        {locId != null && (
          <form onSubmit={saveShop} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <h2 style={{ marginBottom: 0 }}>{shopId == null ? 'New shop' : 'Edit shop'}</h2>
            <p className="muted">0 is the listed price. Buy +20 means the character pays 120%. Sell −50 means the shop pays half.</p>
            {locationShops.length === 0 && <p className="muted">No shops at this location yet.</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {locationShops.map((shop) => (
                <li key={shop.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <span>
                    <strong>{shop.name}</strong>
                    <span className="muted">{` · buy ${percentLabel(shop.buy_cost_delta)} · sell ${percentLabel(shop.sell_cost_delta)}`}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => editShop(shop)}>Edit</button>
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => removeShop(shop.id)}>Remove</button>
                  </span>
                </li>
              ))}
            </ul>
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
            <span style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-secondary" disabled={busy || !board}>
                {shopId == null ? 'Add shop' : 'Save shop'}
              </button>
              {shopId != null && (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={blankShop}>Cancel</button>
              )}
            </span>
          </form>
        )}

        {locId != null && (
          <form onSubmit={saveCreatures} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <h2 style={{ marginBottom: 0 }}>Creatures</h2>
            <p className="muted">One number plus a count repeats it. A comma list is one creature per total. Dead stay at 0.</p>
            {(editingLocation?.creatures || []).length === 0 && <p className="muted">No creatures at this location yet.</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {creatureGroups(editingLocation?.creatures).map((group) => (
                <li key={group.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <span>{creatureLine(group)}</span>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => removeCreature(group.ids[0])}>Remove one</button>
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
            <button type="submit" className="btn btn-secondary" disabled={busy || !board}>Add creatures</button>
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
      </div>

      <SituationPanel campaignId={campaignId} board={board} busy={busy} run={run} mode="edit" />

      <div className="card">
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
      </div>
    </div>
  );
}
