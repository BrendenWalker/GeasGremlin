import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  addAdventuringMark,
  addEncounterEnemy,
  endEncounter,
  getAdventuring,
  getCampaign,
  getItems,
  giveParty,
  removeAdventuringMark,
  removeEncounterEnemy,
  startEncounter,
  tickAdventuring,
} from '../api/api';
import { clockToSeconds, effectEndSeconds, formatGameTime, markStatus, splitGameTime } from '../domain/gameTime.mjs';

const FIELD = {
  padding: '0.45rem',
  borderRadius: 4,
  border: '1px solid #3d3530',
  background: '#1a1614',
  color: '#e8e0d5',
};

const CLOCK_ZERO = { day: 1, hour: 0, minute: 0, second: 0 };

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
        const n = res?.data?.queued;
        setNotice(n == null ? null : `Queued for ${n} character${n === 1 ? '' : 's'}.`);
        return load(true).then(() => true, () => true);
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
    run(() => addEncounterEnemy(campaignId, nameTrim)).then((ok) => { if (ok) setEnemyName(''); });
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
                    <span>{enemy.name}</span>
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.2rem 0.5rem' }} disabled={busy} onClick={() => run(() => removeEncounterEnemy(campaignId, enemy.id))}>Remove</button>
                  </li>
                ))}
              </ul>
              <form onSubmit={addEnemy} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input value={enemyName} onChange={(e) => setEnemyName(e.target.value)} placeholder="Enemy name" maxLength={80} style={{ ...FIELD, flex: 1 }} />
                <button type="submit" className="btn btn-secondary" disabled={busy}>Add enemy</button>
              </form>
            </>
          )}
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
          <button type="button" className="btn btn-primary" disabled={busy || !board} onClick={() => run(() => tickAdventuring(campaignId, 'round'))}>Next Round</button>
          <button type="button" className="btn btn-secondary" disabled={busy || !board} onClick={() => run(() => tickAdventuring(campaignId, 'day'))}>Next Day</button>
        </div>
        <p className="adventuring-clock">{clockLabel || '—'}</p>
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
