import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  addAdventuringMark,
  acceptWander,
  addEncounterEnemy,
  endEncounter,
  getAdventuring,
  getCampaign,
  getItems,
  giveParty,
  removeAdventuringMark,
  removeEncounterEnemy,
  rollTreasure,
  startEncounter,
  setAdventuringPlace,
  tickAdventuring,
  selectLocation,
} from '../api/api';
import { clockToSeconds, effectEndSeconds, formatGameTime, markStatus, primaryStep, splitGameTime } from '../domain/gameTime.mjs';

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

export default function AdventuringPage({ campaignName }) {
  const { campaignId } = useParams();
  const [name, setName] = useState(campaignName || '');
  const [items, setItems] = useState([]);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [xp, setXp] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [enemyName, setEnemyName] = useState('');
  const [enemyQty, setEnemyQty] = useState('');
  const [enemyTreasure, setEnemyTreasure] = useState('');
  const [draft, setDraft] = useState(null);
  const [effectNote, setEffectNote] = useState('');
  const [effectDuration, setEffectDuration] = useState(10);
  const [effectClock, setEffectClock] = useState(CLOCK_ZERO);
  const [effectDirty, setEffectDirty] = useState(false);
  const [eventNote, setEventNote] = useState('');
  const [eventClock, setEventClock] = useState(CLOCK_ZERO);
  const [eventDirty, setEventDirty] = useState(false);

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
        setName(r.data.name || '');
        return getItems(r.data.ruleset_id);
      })
      .then((r) => {
        if (r && !cancelled) setItems(r.data || []);
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

  const gameSeconds = board == null ? null : Number(board.game_seconds);

  useEffect(() => {
    if (gameSeconds == null || effectDirty) return;
    const parts = splitGameTime(gameSeconds);
    if (parts) setEffectClock(parts);
  }, [gameSeconds, effectDirty]);

  useEffect(() => {
    if (gameSeconds == null || eventDirty) return;
    const parts = splitGameTime(gameSeconds);
    if (parts) setEventClock(parts);
  }, [gameSeconds, eventDirty]);

  const run = (action) => {
    setBusy(true);
    setError(null);
    return action()
      .then((res) => {
        const parts = [];
        const checks = res?.data?.checks;
        const n = res?.data?.queued;
        if (checks > 0) parts.push(`${checks} wander check${checks === 1 ? '' : 's'}`);
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
    const nameTrim = enemyName.trim();
    if (!nameTrim) {
      setError('Enemy name is required.');
      return;
    }
    run(() => addEncounterEnemy(campaignId, {
      name: nameTrim,
      quantity: enemyQty.trim() || null,
      treasure_type: enemyTreasure.trim() || null,
    })).then((ok) => {
      if (!ok) return;
      setEnemyName('');
      setEnemyQty('');
      setEnemyTreasure('');
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
    const at = clockToSeconds(effectClock.day, effectClock.hour, effectClock.minute, effectClock.second);
    const duration = parseInt(effectDuration, 10);
    if (!note) {
      setError('Effect note is required.');
      return;
    }
    if (at == null) {
      setError('Effect start time is not a valid clock time.');
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
      setEffectDirty(false);
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

  const now = Number(board?.game_seconds);
  const clockLabel = Number.isInteger(now) ? formatGameTime(now) : '';
  const lastRoll = (board?.wanders || [])[0];
  const canAccept = Boolean(lastRoll && lastRoll.table_roll != null && lastRoll.label && !lastRoll.accepted);
  const place = board?.place === 'inside' ? 'inside' : 'outside';
  const primary = primaryStep(place, board?.in_encounter);
  const clockButtons = [
    CLOCK_BUTTONS.find((button) => button.step === primary),
    ...CLOCK_BUTTONS.filter((button) => button.step !== primary),
  ];

  return (
    <div className="adventuring">
      <div>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Adventuring</h1>
          {name ? <p className="muted">{name}</p> : null}
          {error && <p style={{ color: '#c95858' }}>{error}</p>}
          {notice && <p style={{ color: '#e8c547' }}>{notice}</p>}
          {loading && !board && <p className="muted">Loading…</p>}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
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
            {board?.in_encounter ? (
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => run(() => endEncounter(campaignId))}>End encounter</button>
            ) : (
              <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={() => run(() => startEncounter(campaignId))}>Start encounter</button>
            )}
          </div>
        </div>

        <div className="card">
          <h2>Encounter</h2>
          {board && !board.in_encounter && <p className="muted">No encounter.</p>}
          {board?.in_encounter && (
            <>
              {(board.enemies || []).length === 0 && <p className="muted">No enemies yet.</p>}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {(board.enemies || []).map((enemy) => (
                  <li key={enemy.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <span>
                      {enemy.name}
                      {enemy.quantity ? <span className="muted"> · {enemy.quantity}</span> : null}
                      {enemy.treasure_type ? <span className="muted"> · {enemy.treasure_type}</span> : null}
                    </span>
                    <span style={{ display: 'flex', gap: 6 }}>
                      {enemy.treasure_type ? (
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => rollEnemyTreasure(enemy)}>Roll treasure</button>
                      ) : null}
                      <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => run(() => removeEncounterEnemy(campaignId, enemy.id))}>Remove</button>
                    </span>
                  </li>
                ))}
              </ul>
              <form onSubmit={addEnemy} style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <input value={enemyName} onChange={(e) => setEnemyName(e.target.value)} placeholder="Enemy name" maxLength={80} style={{ ...FIELD, flex: 1, minWidth: 120 }} />
                <input value={enemyQty} onChange={(e) => setEnemyQty(e.target.value)} placeholder="Quantity" maxLength={80} style={{ ...FIELD, width: 100 }} />
                <input value={enemyTreasure} onChange={(e) => setEnemyTreasure(e.target.value)} placeholder="Treasure" maxLength={40} style={{ ...FIELD, width: 90 }} />
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
            </>
          )}
        </div>

        <div className="card">
          <h2>Locations</h2>
          {(board?.locations || []).length === 0 && <p className="muted">No locations yet.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(board?.locations || []).map((loc) => {
              const selected = String(board.location_id) === String(loc.id);
              return (
                <li key={loc.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <span>
                    <strong>{loc.name}</strong>
                    <span className="muted"> · {locationFacts(loc)}</span>
                    {selected ? <span className="muted"> · selected</span> : null}
                  </span>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy || selected} onClick={() => run(() => selectLocation(campaignId, loc.id))}>Select</button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card">
          <h2>Characters</h2>
          {board && board.characters.length === 0 && <p className="muted">No characters in this campaign.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(board?.characters || []).map((c) => (
              <li key={c.id} style={{ marginBottom: 6 }}>
                <strong>{c.name}</strong>
                {c.user ? <span className="muted"> · {c.user}</span> : null}
                <span style={{ marginLeft: 8, color: c.active ? '#e8c547' : '#8a7f72' }}>{c.active ? 'Active' : 'Inactive'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {clockButtons.map((button) => (
            <button
              key={button.step}
              type="button"
              className={button.step === primary ? 'btn btn-primary' : 'btn btn-secondary'}
              disabled={busy || !board}
              onClick={() => run(() => tickAdventuring(campaignId, button.step))}
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
        <p className="adventuring-clock">{clockLabel || '—'}</p>
        <h2>Wander</h2>
        <p className="muted">A roll does not start the encounter.</p>
        {(board?.wanders || []).length === 0 && <p className="muted">No checks yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.5rem' }}>
          {(board?.wanders || []).map((row) => (
            <li key={row.id} style={{ marginBottom: 6 }}>
              {row.table_roll == null
                ? `Miss (${row.check_roll} on d${row.check_die})`
                : `${row.label || 'No row'}${row.quantity ? ` · ${row.quantity}` : ''} (${row.table_roll} on d${row.table_die})`}
              <span className="muted"> · {row.location_name} · {formatGameTime(Number(row.at_seconds))}</span>
              {row.accepted ? <span className="muted"> · accepted</span> : null}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginBottom: '1rem' }}
          disabled={busy || !canAccept}
          onClick={() => run(() => acceptWander(campaignId))}
        >
          Accept
        </button>
        <h2>Timed</h2>
        {(board?.marks || []).length === 0 && <p className="muted">No effects or events.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem' }}>
          {(board?.marks || []).map((mark) => {
            const end = mark.kind === 'effect' ? effectEndSeconds(Number(mark.at_seconds), Number(mark.duration_minutes)) : null;
            const status = markStatus(mark, now);
            return (
              <li key={mark.id} style={{ marginBottom: 8 }}>
                <div><strong>{mark.note}</strong> <span className="muted">{mark.kind} · {status}</span></div>
                <div className="muted" style={{ fontSize: '0.9rem' }}>
                  {formatGameTime(Number(mark.at_seconds))}
                  {end != null ? ` – ${formatGameTime(end)}` : ''}
                </div>
                <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem', marginTop: 4 }} disabled={busy} onClick={() => run(() => removeAdventuringMark(campaignId, mark.id))}>Remove</button>
              </li>
            );
          })}
        </ul>

        <form onSubmit={addEffect} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem' }}>
          <h2 style={{ marginBottom: 0 }}>Add effect</h2>
          <input value={effectNote} onChange={(e) => setEffectNote(e.target.value)} placeholder="Note" maxLength={120} style={FIELD} />
          <label>
            Start
            <div style={{ marginTop: 4 }} onChange={() => setEffectDirty(true)}>
              <ClockFields value={effectClock} onChange={(next) => { setEffectDirty(true); setEffectClock(next); }} />
            </div>
          </label>
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
    </div>
  );
}
