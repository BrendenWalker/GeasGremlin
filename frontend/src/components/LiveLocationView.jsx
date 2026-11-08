import React, { useEffect, useMemo, useState } from 'react';
import {
  addSituationLog,
  arriveTransition,
  findTransition,
  setTransitionAccess,
  openPreparedEncounter,
  resolvePreparedEncounter,
  updateClue,
  updateObjective,
  selectLocation,
  setLocationFlag,
  clearLocationFlag,
  setPlayFact,
  takeCreatures,
} from '../api/api';
import { formatGameTime } from '../domain/gameTime.mjs';
import { ambientLine } from '../domain/sight.mjs';

const FIELD = {
  padding: '0.45rem',
  borderRadius: 4,
  border: '1px solid #3d3530',
  background: '#1a1614',
  color: '#e8e0d5',
};

const TINY = { padding: '0.2rem 0.5rem' };

const SECTION = { marginTop: '0.85rem' };
const SECTION_TITLE = { margin: '0 0 0.35rem', fontSize: '1rem' };
const ROW = { marginBottom: 6 };

function sameId(left, right) {
  if (left == null || left === '') return right == null;
  return String(left) === String(right);
}

function shortText(value, max = 96) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function intervalLabel(seconds) {
  const n = Number(seconds);
  if (n === 14400) return 'every watch';
  if (n === 1800) return 'every 3 turns';
  return `every ${n} seconds`;
}

function locationName(locations, id) {
  const found = (locations || []).find((loc) => sameId(loc.id, id));
  return found ? found.name : 'location';
}

function pathsHere(rows, scopeId) {
  return (rows || []).filter((row) => {
    const fromHere = scopeId ? sameId(row.from_location_id, scopeId) : row.from_location_id == null;
    if (fromHere) return true;
    if (!scopeId || row.one_way === true || row.from_location_id == null) return false;
    return sameId(row.to_location_id, scopeId) && !sameId(row.from_location_id, row.to_location_id);
  });
}

function locationOptions(board) {
  const places = board?.places || [];
  const locations = board?.locations || [];
  const groups = places.map((place) => ({
    id: place.id,
    label: place.name,
    locations: locations.filter((loc) => String(loc.place_id) === String(place.id)),
  })).filter((group) => group.locations.length > 0);
  const unassigned = locations.filter((loc) => loc.place_id == null);
  if (unassigned.length > 0) groups.push({ id: 'unassigned', label: 'Unassigned Locations', locations: unassigned });
  return groups;
}

function combatStrip(creature) {
  if (!creature) return null;
  const bits = [];
  if (creature.armor_class != null) bits.push(`AC ${creature.armor_class}`);
  if (creature.attack_note) bits.push(creature.attack_note);
  if (creature.hp != null) {
    bits.push(creature.base_hp != null ? `${creature.hp}/${creature.base_hp} HP` : `${creature.hp} HP`);
  }
  if (creature.note) bits.push(creature.note);
  return bits.length ? bits.join(' · ') : null;
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
      creature.armor_class ?? '',
      creature.attack_note || '',
    ].join('|');
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
        armor_class: creature.armor_class,
        attack_note: creature.attack_note,
        count: 1,
      });
    }
  }
  return groups;
}

function ExpandableText({ text, label, limit = 160 }) {
  const [open, setOpen] = useState(false);
  const value = String(text || '').trim();
  if (!value) return null;
  const long = value.length > limit || value.includes('\n');
  return (
    <div style={{ marginTop: 2 }}>
      {label ? <span className="muted">{label}: </span> : null}
      <span style={{ whiteSpace: open || !long ? 'pre-wrap' : 'normal' }}>
        {open || !long ? value : shortText(value, limit)}
      </span>
      {long ? (
        <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 6 }} onClick={() => setOpen((v) => !v)}>
          {open ? 'Less' : 'More'}
        </button>
      ) : null}
    </div>
  );
}

function Callout({ color, label, children }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, padding: '0.35rem 0 0.35rem 0.75rem', margin: '0.5rem 0' }}>
      <div style={{ color, fontSize: '0.8rem', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export default function LiveLocationView({
  campaignId,
  board,
  busy,
  run,
  risingPrompt = null,
  environmentalPrompt = null,
}) {
  const pack = board?.situation;
  const locations = board?.locations || [];
  const here = locations.find((loc) => sameId(loc.id, board?.location_id));
  const scopeId = board?.location_id == null ? '' : String(board.location_id);
  const herePlace = here && (board?.places || []).find((place) => sameId(place.id, here.place_id));

  const [locationPick, setLocationPick] = useState(board?.location_id == null ? '' : String(board.location_id));
  const [clueFilter, setClueFilter] = useState('undiscovered');
  const [expandedClueId, setExpandedClueId] = useState(null);
  const [logKind, setLogKind] = useState('decision');
  const [logBody, setLogBody] = useState('');
  const [showLogForm, setShowLogForm] = useState(false);
  const [flagNote, setFlagNote] = useState('');
  const [flagState, setFlagState] = useState('sprung');
  const [takeName, setTakeName] = useState('');
  const [takeCount, setTakeCount] = useState('1');

  useEffect(() => {
    setLocationPick(board?.location_id == null ? '' : String(board.location_id));
  }, [board?.location_id]);

  const npcs = useMemo(
    () => (pack?.npcs || []).filter((row) => sameId(row.location_id, scopeId)),
    [pack?.npcs, scopeId]
  );
  const objectives = pack?.objectives || [];
  const knownObjectives = objectives.filter((row) => row.known);
  const hiddenHere = objectives.filter((row) => !row.known && sameId(row.location_id, scopeId));
  const encounters = useMemo(
    () => (pack?.encounters || []).filter((row) => sameId(row.location_id, scopeId)),
    [pack?.encounters, scopeId]
  );
  const activeEncounters = encounters.filter((row) => row.status === 'opened' || row.status === 'prepared')
    .sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === 'opened' ? -1 : 1;
    });
  const resolvedEncounters = encounters.filter((row) => row.status === 'resolved');
  const leads = pathsHere(pack?.transitions, scopeId);
  const creatures = here?.creatures || [];
  const creatureByName = useMemo(() => {
    const map = new Map();
    for (const creature of creatures) {
      const key = String(creature.name || '').trim().toLowerCase();
      if (!key || map.has(key)) continue;
      map.set(key, creature);
    }
    return map;
  }, [creatures]);

  const placeClues = useMemo(
    () => (pack?.clues || []).filter((row) => sameId(row.location_id, scopeId)),
    [pack?.clues, scopeId]
  );
  const filteredClues = placeClues.filter((row) => {
    if (clueFilter === 'all') return true;
    if (clueFilter === 'discovered') return row.discovered === true;
    return row.discovered !== true;
  });

  if (!board || !pack) return null;
  if (!here) {
    return <p className="muted" style={{ marginTop: '0.75rem' }}>Select a location to run the scene.</p>;
  }

  const headerBits = [
    here.environment,
    herePlace ? herePlace.name : null,
    here.terrain || null,
    `d${here.check_die}`,
    intervalLabel(here.interval_seconds),
  ].filter(Boolean);

  const submitLog = (event) => {
    event.preventDefault();
    const body = logBody.trim();
    if (!body) return;
    run(() => addSituationLog(campaignId, { kind: logKind, body })).then((ok) => {
      if (ok) {
        setLogBody('');
        setShowLogForm(false);
      }
    });
  };

  const saveFlag = (event) => {
    event.preventDefault();
    const note = flagNote.trim();
    if (!note) return;
    run(() => setLocationFlag(campaignId, here.id, { note, state: flagState })).then((ok) => {
      if (ok) setFlagNote('');
    });
  };

  const logForm = (
    <form onSubmit={submitLog} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      <select value={logKind} onChange={(event) => setLogKind(event.target.value)} aria-label="Log kind" style={FIELD}>
        <option value="decision">decision</option>
        <option value="consequence">consequence</option>
        <option value="discovery">discovery</option>
      </select>
      <input
        value={logBody}
        onChange={(event) => setLogBody(event.target.value)}
        placeholder="What happened"
        aria-label="Log"
        style={{ ...FIELD, flex: 1, minWidth: 160 }}
      />
      <button type="submit" className="btn btn-secondary" disabled={busy}>Add log</button>
    </form>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', margin: '0.5rem 0' }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>
              {herePlace ? `${herePlace.name} · ${here.name}` : here.name}
            </h2>
            <span className="muted">#{here.id}</span>
          </div>
          <div className="muted" style={{ marginTop: 2 }}>{headerBits.join(' · ')}</div>
          {here.environment === 'inside' ? (
            <div className="muted" style={{ marginTop: 2 }}>
              {ambientLine({
                ambientLight: here.ambient_light,
                marks: board.marks,
                nowSeconds: board.game_seconds,
                characters: board.characters,
              })}
            </div>
          ) : null}
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>
            {board.in_encounter ? 'A fight is open.' : 'No fight is open.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => setShowLogForm((v) => !v)}>
            {showLogForm ? 'Hide log form' : 'Add log'}
          </button>
          {(board.locations || []).length > 0 && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!locationPick || String(locationPick) === String(board.location_id)) return;
                run(() => selectLocation(campaignId, locationPick));
              }}
              style={{ display: 'flex', gap: 6, alignItems: 'center' }}
            >
              <select
                aria-label="Location"
                value={locationPick || String(board.location_id || '')}
                onChange={(event) => setLocationPick(event.target.value)}
                style={{ ...FIELD, maxWidth: 240 }}
              >
                <option value="">Choose…</option>
                {locationOptions(board).map((group) => (
                  <optgroup key={group.id} label={group.label}>
                    {group.locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                type="submit"
                className="btn btn-secondary"
                style={TINY}
                disabled={busy || !locationPick || String(locationPick) === String(board.location_id)}
              >
                Select
              </button>
            </form>
          )}
        </div>
      </div>

      {showLogForm ? logForm : null}

      {here.summary ? (
        <Callout color="#c9a227" label="Read aloud">
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{here.summary}</p>
        </Callout>
      ) : null}
      {here.environment === 'inside' && here.dark_summary ? (
        <Callout color="#6e7c8a" label="In the dark">
          <p style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#8aa0b4' }}>{here.dark_summary}</p>
        </Callout>
      ) : null}

      {(npcs.length > 0 || creatures.length > 0) && (
        <section style={SECTION}>
          <h3 style={SECTION_TITLE}>Present</h3>
          {npcs.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {npcs.map((row) => {
                const matched = creatureByName.get(String(row.name || '').trim().toLowerCase());
                const strip = combatStrip(matched);
                const told = (pack.clues || []).filter((item) => !item.discovered && sameId(item.npc_id, row.id));
                return (
                  <li key={row.id} style={{ ...ROW, paddingBottom: 6, borderBottom: '1px solid #2a2420' }}>
                    <div>
                      <strong>{row.name}</strong>
                      {row.attitude ? <span className="muted"> — {row.attitude}</span> : null}
                    </div>
                    {strip ? <div className="muted" style={{ marginTop: 2 }}>{strip}</div> : null}
                    <ExpandableText text={row.motivation} label="Wants" />
                    <ExpandableText text={row.knowledge} label="Knows" />
                    {told.length > 0 && (
                      <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
                        {told.map((clue) => (
                          <li key={clue.id} style={ROW}>
                            <span>{shortText(clue.body, 120)}</span>
                            <span className="muted">{clue.world_true === false ? ' · false' : ' · true'}</span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ ...TINY, marginLeft: 8 }}
                              disabled={busy}
                              onClick={() => run(() => updateClue(campaignId, clue.id, { discovered: true }))}
                            >
                              Discovered
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {creatures.length > 0 && (
            <ul style={{ listStyle: 'none', padding: npcs.length ? '0.35rem 0 0' : 0, margin: 0 }}>
              {creatureGroups(creatures).map((group) => {
                const namedNpc = npcs.some((npc) => String(npc.name || '').trim().toLowerCase() === String(group.name || '').trim().toLowerCase());
                if (namedNpc) return null;
                const strip = combatStrip(group);
                let state = 'no hit points';
                if (group.hp === 0) state = 'down';
                else if (group.hp != null && group.hp !== '') {
                  state = group.base_hp == null ? `${group.hp} hp` : `${group.hp}/${group.base_hp}`;
                }
                return (
                  <li key={group.key} style={ROW}>
                    <strong>{group.name}</strong>
                    {group.count > 1 ? <span className="muted"> · ×{group.count}</span> : null}
                    {group.disposition === 'fled' ? <span className="muted"> · fled</span> : null}
                    {group.in_fight ? <span className="muted"> · in the fight</span> : null}
                    {strip ? <div className="muted">{strip}</div> : <span className="muted"> · {state}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {board.in_encounter && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const count = parseInt(takeCount, 10);
                if (!takeName || !Number.isInteger(count) || count < 1) return;
                run(() => takeCreatures(campaignId, { name: takeName, count }));
              }}
              style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <select value={takeName} aria-label="Creature to add" onChange={(event) => setTakeName(event.target.value)} style={FIELD}>
                <option value="">Living creature…</option>
                {[...new Set(creatures.filter((creature) => creature.hp > 0 && !creature.in_fight).map((creature) => creature.name))].map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={100}
                value={takeCount}
                aria-label="How many creatures"
                onChange={(event) => setTakeCount(event.target.value)}
                style={{ ...FIELD, width: 70 }}
              />
              <button type="submit" className="btn btn-secondary" disabled={busy}>Add to fight</button>
            </form>
          )}
        </section>
      )}

      {(activeEncounters.length > 0 || resolvedEncounters.length > 0) && (
        <section style={SECTION}>
          <h3 style={SECTION_TITLE}>Encounters</h3>
          {activeEncounters.length === 0 && <p className="muted" style={{ margin: '0 0 6px' }}>None active.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {activeEncounters.map((row) => (
              <li key={row.id} style={{ ...ROW, paddingBottom: 6, borderBottom: '1px solid #2a2420' }}>
                <div>
                  <strong>{row.title}</strong>
                  <span className="muted"> · {row.kind} · {row.status}</span>
                  {row.environmental_effect === 'damage' ? (
                    <span className="muted">{` · ${row.environmental_amount} damage`}</span>
                  ) : null}
                </div>
                {row.purpose ? <div className="muted">{row.purpose}</div> : null}
                {row.notes ? <ExpandableText text={row.notes} label="GM" limit={140} /> : null}
                {row.members?.length > 0 && (
                  <div className="muted">{row.members.map((member) => member.name).join(', ')}</div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={TINY}
                    disabled={busy || (row.status !== 'prepared' && row.status !== 'opened')}
                    onClick={() => run(() => openPreparedEncounter(campaignId, row.id))}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={TINY}
                    disabled={busy}
                    onClick={() => run(() => resolvePreparedEncounter(campaignId, row.id))}
                  >
                    Resolve
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {resolvedEncounters.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary className="muted">Resolved ({resolvedEncounters.length})</summary>
              <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0' }}>
                {resolvedEncounters.map((row) => (
                  <li key={row.id} style={ROW}>
                    <span>{row.title}</span>
                    <span className="muted"> · {row.kind} · resolved</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {leads.length > 0 && (
        <section style={SECTION}>
          <h3 style={SECTION_TITLE}>Exits</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {leads.map((row) => {
              const back = !sameId(row.from_location_id, scopeId);
              const dest = back ? row.from_location_id : row.to_location_id;
              const secret = row.discovered === false;
              const shut = row.blocked === true;
              return (
                <li key={row.id} style={{ ...ROW, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <span>{locationName(locations, dest)}</span>
                  {row.reason ? <span className="muted">· {row.reason}</span> : null}
                  {row.one_way ? <span className="muted">· one way</span> : null}
                  {secret ? <span className="muted">· secret</span> : null}
                  {shut ? <span className="muted">· blocked</span> : null}
                  {!secret && !shut && (
                    <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => run(() => arriveTransition(campaignId, row.id, { reverse: back }))}>Go To</button>
                  )}
                  {(secret || shut) && (
                    <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => run(() => arriveTransition(campaignId, row.id, { reverse: back, override: true }))}>Go anyway</button>
                  )}
                  {secret && (
                    <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => run(() => findTransition(campaignId, row.id))}>Mark found</button>
                  )}
                  <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => run(() => setTransitionAccess(campaignId, row.id, !shut))}>{shut ? 'Clear block' : 'Block'}</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(knownObjectives.length > 0 || hiddenHere.length > 0) && (
        <section style={SECTION}>
          <h3 style={SECTION_TITLE}>Objectives</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {[...knownObjectives, ...hiddenHere].map((row) => (
              <li key={row.id} style={{ ...ROW, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span>{shortText(row.body, 100)}</span>
                <span className="muted">{row.known ? 'Known' : 'Hidden'}</span>
                {row.status === 'resolved' ? <span className="muted">· resolved</span> : null}
                <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => run(() => updateObjective(campaignId, row.id, { known: !row.known }))}>
                  {row.known ? 'Hide' : 'Known'}
                </button>
                <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => run(() => updateObjective(campaignId, row.id, { status: row.status === 'resolved' ? 'open' : 'resolved' }))}>
                  {row.status === 'resolved' ? 'Reopen' : 'Resolve'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {placeClues.length > 0 && (
        <section style={SECTION}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <h3 style={{ ...SECTION_TITLE, margin: 0 }}>Clues</h3>
            {['undiscovered', 'discovered', 'all'].map((key) => (
              <button
                key={key}
                type="button"
                className={`btn ${clueFilter === key ? 'btn-primary' : 'btn-secondary'}`}
                style={TINY}
                onClick={() => setClueFilter(key)}
              >
                {key === 'undiscovered' ? 'Undiscovered' : key === 'discovered' ? 'Discovered' : 'All'}
              </button>
            ))}
          </div>
          {filteredClues.length === 0 && <p className="muted" style={{ margin: 0 }}>None in this filter.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {filteredClues.map((row) => {
              const open = sameId(expandedClueId, row.id);
              const npc = (pack.npcs || []).find((item) => sameId(item.id, row.npc_id));
              const objective = objectives.find((item) => sameId(item.id, row.objective_id));
              return (
                <li key={row.id} style={{ ...ROW, paddingBottom: 6, borderBottom: '1px solid #2a2420' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    <span>{open ? row.body : shortText(row.body, 110)}</span>
                    <span className="muted" style={{ fontWeight: 600 }}>{row.world_true === false ? 'False' : 'True'}</span>
                    <span className="muted">{row.discovered ? '· discovered' : '· undiscovered'}</span>
                    <button type="button" className="btn btn-secondary" style={TINY} onClick={() => setExpandedClueId(open ? null : row.id)}>
                      {open ? 'Less' : 'More'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={TINY}
                      disabled={busy}
                      onClick={() => run(() => updateClue(campaignId, row.id, { discovered: !row.discovered }))}
                    >
                      {row.discovered ? 'Hide discovery' : 'Discovered'}
                    </button>
                  </div>
                  {open && (
                    <div className="muted" style={{ marginTop: 4 }}>
                      {npc ? <div>NPC: {npc.name}</div> : null}
                      {objective ? <div>Objective: {shortText(objective.body, 80)}</div> : null}
                      {!npc && !objective ? <div>No linked NPC or objective.</div> : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {here.gm_text ? (
        <section style={SECTION}>
          <details>
            <summary>Location reference</summary>
            <Callout color="#8a6e4b" label="GM text">
              <p style={{ whiteSpace: 'pre-wrap', margin: 0, color: '#c4a574' }}>{here.gm_text}</p>
            </Callout>
          </details>
        </section>
      ) : null}

      <section style={SECTION}>
        <h3 style={SECTION_TITLE}>Location state</h3>
        {risingPrompt}
        {environmentalPrompt}
        {(here.facts || []).length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {(here.facts || []).map((fact) => (
              <label key={fact.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
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
              <p className="muted" style={{ margin: '4px 0 0' }}>{board.water_flowing ? 'Water is flowing.' : 'Water is not flowing.'}</p>
            )}
          </div>
        )}
        <div className="muted" style={{ marginBottom: 4 }}>Room flags</div>
        {(here.flags || []).length === 0 && <p className="muted" style={{ margin: '0 0 6px' }}>Nothing marked here.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(here.flags || []).map((flag) => (
            <li key={flag.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, alignItems: 'center' }}>
              <span>{flag.note} · {flag.state}</span>
              <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => run(() => clearLocationFlag(campaignId, here.id, flag.id))}>Clear</button>
            </li>
          ))}
        </ul>
        <form onSubmit={saveFlag} style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={flagNote} onChange={(event) => setFlagNote(event.target.value)} placeholder="Pit, chest, secret" maxLength={80} aria-label="Flag note" style={FIELD} />
          <select value={flagState} aria-label="Flag state" onChange={(event) => setFlagState(event.target.value)} style={FIELD}>
            <option value="sprung">Sprung</option>
            <option value="taken">Taken</option>
            <option value="found">Found</option>
          </select>
          <button type="submit" className="btn btn-secondary" disabled={busy}>Set flag</button>
        </form>
      </section>

      <section style={SECTION}>
        <h3 style={SECTION_TITLE}>Session log</h3>
        {(pack.log || []).length === 0 && <p className="muted" style={{ margin: 0 }}>Nothing recorded.</p>}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {(pack.log || []).slice(0, 12).map((row) => (
            <li key={row.id} style={ROW}>
              <span className="muted">{formatGameTime(row.at_seconds)} · {row.kind}</span>
              <div>{row.body}</div>
            </li>
          ))}
        </ul>
        {!showLogForm ? logForm : null}
      </section>
    </div>
  );
}
