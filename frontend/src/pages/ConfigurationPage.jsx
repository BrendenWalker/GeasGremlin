import React, { useCallback, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  createEncounterTable,
  createLocation,
  deleteEncounterTable,
  deleteLocation,
  getAdventuring,
  getPrep,
  prepDamage,
  prepRepair,
  stockRoom,
  updateEncounterTable,
  updateLocation,
} from '../api/api';

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

function movementLabel(pct) {
  const n = Number(pct);
  if (!Number.isInteger(n)) return '';
  return `${n > 0 ? '+' : ''}${n}%`;
}

function tableName(tables, id) {
  const found = (tables || []).find((table) => String(table.id) === String(id));
  return found ? found.name : 'table';
}

export default function ConfigurationPage({ campaignName }) {
  const { campaignId } = useParams();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [locId, setLocId] = useState(null);
  const [locName, setLocName] = useState('');
  const [locPlace, setLocPlace] = useState('outside');
  const [locDie, setLocDie] = useState(6);
  const [locInterval, setLocInterval] = useState('');
  const [locTable, setLocTable] = useState('');
  const [terrain, setTerrain] = useState('');
  const [movement, setMovement] = useState('');
  const [editTableId, setEditTableId] = useState(null);
  const [tableNameValue, setTableNameValue] = useState('');
  const [tableDie, setTableDie] = useState(6);
  const [tableRows, setTableRows] = useState([{ ...BLANK_ROW }]);
  const [prep, setPrep] = useState(null);
  const [stockText, setStockText] = useState('');
  const [trapName, setTrapName] = useState('');
  const [trapNote, setTrapNote] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [taken, setTaken] = useState(0);
  const [damageAmount, setDamageAmount] = useState('');
  const [crew, setCrew] = useState('1');
  const [vehicleText, setVehicleText] = useState('');

  const load = useCallback(() => {
    return Promise.all([getAdventuring(campaignId), getPrep(campaignId)])
      .then(([boardRes, prepRes]) => {
        setBoard(boardRes.data);
        setPrep(prepRes.data);
      })
      .catch((err) => setError(errText(err)));
  }, [campaignId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const run = (action) => {
    setBusy(true);
    setError(null);
    return action()
      .then((res) => load().then(() => res, () => res))
      .catch((err) => {
        setError(errText(err));
        return false;
      })
      .finally(() => setBusy(false));
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
    setError(null);
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
      setError('Location name is required.');
      return;
    }
    if (tableId == null || tableId < 1) {
      setError('Choose a table.');
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
        setError('Interval must be a positive number of seconds.');
        return;
      }
      body.interval_seconds = interval;
    }
    if (locPlace === 'outside' && (terrain || String(movement).trim() !== '')) {
      const pct = wholeInt(movement);
      if (!terrain) {
        setError('Choose a terrain.');
        return;
      }
      if (pct == null || pct < -100 || pct > 200) {
        setError('Movement percent must be an integer from -100 to 200.');
        return;
      }
      body.terrain = terrain;
      body.movement_pct = pct;
    }
    const action = locId == null
      ? () => createLocation(campaignId, body)
      : () => updateLocation(campaignId, locId, body);
    run(action).then((res) => {
      if (res) blankLocation();
    });
  };

  const removeLocation = (id) => {
    run(() => deleteLocation(campaignId, id)).then((res) => {
      if (res && String(locId) === String(id)) blankLocation();
    });
  };

  const blankTable = () => {
    setEditTableId(null);
    setTableNameValue('');
    setTableDie(6);
    setTableRows([{ ...BLANK_ROW }]);
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
      setError('Table name is required.');
      return;
    }
    if (die == null || die < 2 || die > 100) {
      setError('Table die must be from 2 to 100.');
      return;
    }
    const rows = [];
    for (let i = 0; i < tableRows.length; i += 1) {
      const row = tableRows[i];
      const faceLo = wholeInt(row.face_lo);
      const faceHi = wholeInt(row.face_hi);
      if (faceLo == null || faceHi == null || faceHi < faceLo || faceHi > die) {
        setError(`Row ${i + 1} faces must sit on the die.`);
        return;
      }
      if (!row.label.trim()) {
        setError(`Row ${i + 1} needs a label.`);
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
    run(action).then((res) => {
      if (!res) return;
      if (editTableId == null && locTable === '' && res.data?.id != null) setLocTable(String(res.data.id));
      blankTable();
    });
  };

  const removeTable = (id) => {
    run(() => deleteEncounterTable(campaignId, id)).then((res) => {
      if (res && String(editTableId) === String(id)) blankTable();
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

  const tables = board?.tables || [];
  const customTables = tables.filter((table) => table.custom);
  const stockTables = tables.filter((table) => !table.custom);
  const locations = board?.locations || [];

  return (
    <div>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Configuration</h1>
        {campaignName ? <p className="muted">{campaignName}</p> : null}
        {error && <p style={{ color: '#c95858' }}>{error}</p>}
        {loading && !board && <p className="muted">Loading…</p>}

        <h2>Locations</h2>
        {locations.length === 0 && <p className="muted">No locations yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {locations.map((loc) => {
            const selected = String(board.location_id) === String(loc.id);
            const adjust = loc.terrain ? ` · ${loc.terrain} ${movementLabel(loc.movement_pct)}` : '';
            return (
              <li key={loc.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <span>
                  <strong>{loc.name}</strong>
                  <span className="muted">
                    {` · ${loc.place}${adjust} · d${loc.check_die} · ${tableName(tables, loc.encounter_table_id)}`}
                  </span>
                  {selected ? <span className="muted"> · selected</span> : null}
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => editLocation(loc)}>Edit</button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => removeLocation(loc.id)}>Remove</button>
                </span>
              </li>
            );
          })}
        </ul>

        <form onSubmit={saveLocation} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{locId == null ? 'New location' : 'Edit location'}</h2>
          <input value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="Name" maxLength={80} aria-label="Location name" style={FIELD} />
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
      </div>

      <div className="card">
        <h2>Campaign tables</h2>
        {customTables.length === 0 && <p className="muted">No campaign tables yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {customTables.map((table) => (
            <li key={table.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, alignItems: 'center' }}>
              <span>
                <strong>{table.name}</strong>
                <span className="muted">{` · d${table.die} · ${(table.rows || []).length} row${(table.rows || []).length === 1 ? '' : 's'}`}</span>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => editTable(table)}>Edit</button>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => removeTable(table.id)}>Remove</button>
              </span>
            </li>
          ))}
        </ul>

        <form onSubmit={saveTable} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <h2 style={{ marginBottom: 0 }}>{editTableId == null ? 'New table' : 'Edit table'}</h2>
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
        <h3 style={{ marginBottom: 6 }}>Vehicles</h3>
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
    </div>
  );
}
