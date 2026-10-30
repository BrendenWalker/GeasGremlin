import React, { useState } from 'react';
import {
  addSituationLog,
  arriveTransition,
  findTransition,
  setTransitionAccess,
  createClue,
  createNpc,
  createObjective,
  addEncounterMember,
  createPreparedEncounter,
  createTransition,
  deleteClue,
  deleteEncounterMember,
  deleteNpc,
  deleteObjective,
  deletePreparedEncounter,
  deleteTransition,
  updateEncounterMember,
  updatePreparedEncounter,
  updateTransition,
  openPreparedEncounter,
  resolvePreparedEncounter,
  updateClue,
  updateNpc,
  updateObjective,
} from '../api/api';
import { discoveriesByPlace } from '../domain/discoveries.mjs';
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

const ERROR = { color: '#c95858' };

const KINDS = ['discovery', 'social', 'combat', 'hazard', 'trap', 'puzzle', 'environment'];

function shortText(value, max = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function sameId(left, right) {
  if (left == null || left === '') return right == null;
  return String(left) === String(right);
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

function PickRow({ label, empty, records, pickedId, busy, confirm, onChange, onEdit, onAskRemove, onRemove, onCancel, optionLabel, confirmLabel }) {
  if (records.length === 0) return <p className="muted">{empty}</p>;
  const picked = records.find((row) => sameId(row.id, pickedId));
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <label>
        {label}
        <select
          value={pickedId == null ? '' : String(pickedId)}
          disabled={busy}
          onChange={(event) => onChange(event.target.value)}
          style={{ ...FIELD, marginLeft: 6, maxWidth: 420 }}
        >
          <option value="">{`New ${label.toLowerCase()}`}</option>
          {records.map((row) => (
            <option key={row.id} value={row.id}>{optionLabel(row)}</option>
          ))}
        </select>
      </label>
      {picked && !confirm && (
        <>
          <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={onEdit}>Edit</button>
          <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={onAskRemove}>Remove</button>
        </>
      )}
      {picked && confirm && (
        <>
          <span className="muted">Remove {confirmLabel(picked)}?</span>
          <button type="button" className="btn btn-danger" style={TINY} disabled={busy} onClick={onRemove}>Remove</button>
          <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={onCancel}>Cancel</button>
        </>
      )}
    </div>
  );
}

function EditorFrame({ title, pickedId, editId, error, busy, submitLabel, onSubmit, onCancel, children }) {
  const open = pickedId == null || editId != null;
  return (
    <>
      {pickedId != null && editId == null && error ? <p style={{ ...ERROR, margin: '0.5rem 0 0' }}>{error}</p> : null}
      {open && (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <h3 style={{ marginBottom: 0 }}>{title}</h3>
          {error ? <p style={{ ...ERROR, margin: 0 }}>{error}</p> : null}
          {children}
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-secondary" disabled={busy}>{submitLabel}</button>
            {editId != null && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
            )}
          </span>
        </form>
      )}
    </>
  );
}

function memberLine(member) {
  const hp = member.hp == null ? null : `${member.hp} hp`;
  return [member.name, member.treasure_type, hp].filter(Boolean).join(' · ');
}

function keepField(event, save) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  save();
}

function PlaceSelect({ label, value, locations, onChange, allowEmpty = true }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} style={{ ...FIELD, marginLeft: 6 }}>
        {allowEmpty && <option value="">None</option>}
        {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
      </select>
    </label>
  );
}

function MemberEditor({
  members, busy, memberEditId, memberName, memberCount, memberTreasure,
  onName, onCount, onTreasure, onEdit, onRemove, onSave, onCancel,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="muted">Members</span>
      {members.length === 0 && <p className="muted" style={{ margin: 0 }}>No members yet.</p>}
      {members.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {members.map((member) => (
            <li key={member.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span>{memberLine(member)}</span>
              <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => onEdit(member)}>Edit</button>
              <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => onRemove(member)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={memberName}
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => keepField(event, onSave)}
        placeholder="Member name"
        maxLength={80}
        aria-label="Member name"
        style={FIELD}
      />
      {memberEditId == null && (
        <input
          type="number"
          min={1}
          value={memberCount}
          onChange={(event) => onCount(event.target.value)}
          onKeyDown={(event) => keepField(event, onSave)}
          placeholder="Count"
          aria-label="Member count"
          style={FIELD}
        />
      )}
      <input
        value={memberTreasure}
        onChange={(event) => onTreasure(event.target.value)}
        onKeyDown={(event) => keepField(event, onSave)}
        placeholder="Treasure"
        maxLength={40}
        aria-label="Member treasure"
        style={FIELD}
      />
      <span style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={onSave}>
          {memberEditId == null ? 'Add member' : 'Save member'}
        </button>
        {memberEditId != null && (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
        )}
      </span>
    </div>
  );
}

export default function SituationPanel({ campaignId, board, busy, run, mode = 'play', bare = false }) {
  const editing = mode === 'edit';
  const pack = board?.situation;
  const locations = board?.locations || [];
  const [pickedPlaceId, setPickedPlaceId] = useState('');
  const [pickedObjectiveId, setPickedObjectiveId] = useState(null);
  const [objectiveEditId, setObjectiveEditId] = useState(null);
  const [confirmObjective, setConfirmObjective] = useState(false);
  const [objectiveError, setObjectiveError] = useState(null);
  const [objective, setObjective] = useState('');
  const [objectiveKnown, setObjectiveKnown] = useState(false);
  const [objectivePlace, setObjectivePlace] = useState('');
  const [npcEditId, setNpcEditId] = useState(null);
  const [npcError, setNpcError] = useState(null);
  const [npcName, setNpcName] = useState('');
  const [npcLocationId, setNpcLocationId] = useState('');
  const [npcMotivation, setNpcMotivation] = useState('');
  const [npcKnowledge, setNpcKnowledge] = useState('');
  const [npcAttitude, setNpcAttitude] = useState('');
  const [pickedClueId, setPickedClueId] = useState(null);
  const [clueEditId, setClueEditId] = useState(null);
  const [confirmClue, setConfirmClue] = useState(false);
  const [clueError, setClueError] = useState(null);
  const [clue, setClue] = useState('');
  const [cluePlace, setCluePlace] = useState('');
  const [clueNpcId, setClueNpcId] = useState('');
  const [clueObjectiveId, setClueObjectiveId] = useState('');
  const [pickedEncounterId, setPickedEncounterId] = useState(null);
  const [encounterEditId, setEncounterEditId] = useState(null);
  const [confirmEncounter, setConfirmEncounter] = useState(false);
  const [encounterError, setEncounterError] = useState(null);
  const [encounterTitle, setEncounterTitle] = useState('');
  const [encounterKind, setEncounterKind] = useState('discovery');
  const [encounterPurpose, setEncounterPurpose] = useState('');
  const [encounterNotes, setEncounterNotes] = useState('');
  const [encounterPlace, setEncounterPlace] = useState('');
  const [memberEditId, setMemberEditId] = useState(null);
  const [memberName, setMemberName] = useState('');
  const [memberCount, setMemberCount] = useState('');
  const [memberTreasure, setMemberTreasure] = useState('');
  const [pickedLeadId, setPickedLeadId] = useState(null);
  const [leadEditId, setLeadEditId] = useState(null);
  const [confirmLead, setConfirmLead] = useState(false);
  const [leadError, setLeadError] = useState(null);
  const [leadFrom, setLeadFrom] = useState('');
  const [leadLocation, setLeadLocation] = useState('');
  const [leadReason, setLeadReason] = useState('');
  const [leadOneWay, setLeadOneWay] = useState(false);
  const [leadSecret, setLeadSecret] = useState(false);
  const [leadBlocked, setLeadBlocked] = useState(false);
  const [logKind, setLogKind] = useState('decision');
  const [logBody, setLogBody] = useState('');

  if (!board || !pack) return null;

  const scopeId = editing ? pickedPlaceId : (board.location_id == null ? '' : String(board.location_id));
  const here = locations.find((loc) => sameId(loc.id, board.location_id));
  const atScope = (id) => (scopeId ? sameId(id, scopeId) : id == null);
  const npcs = (pack.npcs || []).filter((row) => atScope(row.location_id));
  const npcHere = (id) => npcs.some((row) => sameId(row.id, id));
  const clues = (pack.clues || []).filter((row) => atScope(row.location_id) || npcHere(row.npc_id));
  const objectives = pack.objectives || [];
  const scopedObjectives = objectives.filter((row) => atScope(row.location_id));
  const encounters = (pack.encounters || []).filter((row) => atScope(row.location_id));
  const leads = pathsHere(pack.transitions, scopeId);
  const knownObjectives = objectives.filter((row) => row.known);
  const hiddenHere = scopedObjectives.filter((row) => !row.known);
  const roomClues = clues.filter((row) => !row.discovered && atScope(row.location_id) && !npcHere(row.npc_id));
  const discoveryGroups = discoveriesByPlace(pack.clues, locations);

  const act = (setErr, action) => {
    setErr(null);
    return run(action, setErr);
  };

  const choose = (value, setPicked, setConfirm, editId, blank, setErr) => {
    const id = value || null;
    setPicked(id);
    setConfirm(false);
    setErr(null);
    if (editId != null && !sameId(editId, id)) blank();
  };

  const blankObjective = () => {
    setObjectiveEditId(null);
    setObjective('');
    setObjectiveKnown(false);
    setObjectivePlace(scopeId);
    setObjectiveError(null);
  };

  const blankClue = () => {
    setClueEditId(null);
    setClue('');
    setCluePlace(scopeId);
    setClueNpcId('');
    setClueObjectiveId('');
    setClueError(null);
  };

  const blankMember = () => {
    setMemberEditId(null);
    setMemberName('');
    setMemberCount('');
    setMemberTreasure('');
  };

  const blankEncounter = () => {
    setEncounterEditId(null);
    setEncounterTitle('');
    setEncounterKind('discovery');
    setEncounterPurpose('');
    setEncounterNotes('');
    setEncounterPlace(scopeId);
    setEncounterError(null);
    blankMember();
  };

  const blankLead = () => {
    setLeadEditId(null);
    setLeadFrom(scopeId);
    setLeadLocation('');
    setLeadReason('');
    setLeadOneWay(false);
    setLeadSecret(false);
    setLeadBlocked(false);
    setLeadError(null);
  };

  const blankNpc = () => {
    setNpcEditId(null);
    setNpcName('');
    setNpcLocationId(scopeId);
    setNpcMotivation('');
    setNpcKnowledge('');
    setNpcAttitude('');
    setNpcError(null);
  };

  const clearChildren = (place = scopeId) => {
    setPickedObjectiveId(null);
    setConfirmObjective(false);
    setObjectiveEditId(null);
    setObjective('');
    setObjectiveKnown(false);
    setObjectivePlace(place);
    setObjectiveError(null);
    setNpcEditId(null);
    setNpcName('');
    setNpcLocationId(place);
    setNpcMotivation('');
    setNpcKnowledge('');
    setNpcAttitude('');
    setNpcError(null);
    setPickedClueId(null);
    setConfirmClue(false);
    setClueEditId(null);
    setClue('');
    setCluePlace(place);
    setClueNpcId('');
    setClueObjectiveId('');
    setClueError(null);
    setPickedEncounterId(null);
    setConfirmEncounter(false);
    setEncounterEditId(null);
    setEncounterTitle('');
    setEncounterKind('discovery');
    setEncounterPurpose('');
    setEncounterNotes('');
    setEncounterPlace(place);
    setEncounterError(null);
    setMemberEditId(null);
    setMemberName('');
    setMemberCount('');
    setMemberTreasure('');
    setPickedLeadId(null);
    setConfirmLead(false);
    setLeadEditId(null);
    setLeadFrom(place);
    setLeadLocation('');
    setLeadReason('');
    setLeadOneWay(false);
    setLeadSecret(false);
    setLeadBlocked(false);
    setLeadError(null);
  };

  const placePayload = (id) => (id ? Number(id) : null);

  const saveObjective = (event) => {
    event.preventDefault();
    const body = objective.trim();
    if (!body) {
      setObjectiveError('Objective is required.');
      return;
    }
    const payload = { body, known: objectiveKnown, location_id: placePayload(objectivePlace) };
    const action = objectiveEditId == null
      ? () => createObjective(campaignId, payload)
      : () => updateObjective(campaignId, objectiveEditId, payload);
    act(setObjectiveError, action).then((ok) => {
      if (ok) blankObjective();
    });
  };

  const removeObjective = () => {
    const row = scopedObjectives.find((item) => sameId(item.id, pickedObjectiveId));
    if (!row) return;
    const id = row.id;
    setConfirmObjective(false);
    act(setObjectiveError, () => deleteObjective(campaignId, id)).then((ok) => {
      if (!ok) return;
      if (sameId(pickedObjectiveId, id)) setPickedObjectiveId(null);
      if (sameId(objectiveEditId, id)) blankObjective();
    });
  };

  const editNpc = (row) => {
    setNpcEditId(row.id);
    setNpcName(row.name || '');
    setNpcLocationId(row.location_id ? String(row.location_id) : '');
    setNpcMotivation(row.motivation || '');
    setNpcKnowledge(row.knowledge || '');
    setNpcAttitude(row.attitude || '');
    setNpcError(null);
  };

  const saveNpc = (event) => {
    event.preventDefault();
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
      location_id: placePayload(npcLocationId),
    };
    const action = npcEditId == null
      ? () => createNpc(campaignId, payload)
      : () => updateNpc(campaignId, npcEditId, payload);
    act(setNpcError, action).then((ok) => {
      if (ok) blankNpc();
    });
  };

  const removeNpc = (row) => {
    act(setNpcError, () => deleteNpc(campaignId, row.id)).then((ok) => {
      if (ok && sameId(npcEditId, row.id)) blankNpc();
    });
  };

  const saveClue = (event) => {
    event.preventDefault();
    const body = clue.trim();
    if (!body) {
      setClueError('Clue is required.');
      return;
    }
    const payload = {
      body,
      location_id: placePayload(cluePlace),
      npc_id: placePayload(clueNpcId),
      objective_id: placePayload(clueObjectiveId),
    };
    const action = clueEditId == null
      ? () => createClue(campaignId, payload)
      : () => updateClue(campaignId, clueEditId, payload);
    act(setClueError, action).then((ok) => {
      if (ok) blankClue();
    });
  };

  const removeClue = () => {
    const row = clues.find((item) => sameId(item.id, pickedClueId));
    if (!row) return;
    const id = row.id;
    setConfirmClue(false);
    act(setClueError, () => deleteClue(campaignId, id)).then((ok) => {
      if (!ok) return;
      if (sameId(pickedClueId, id)) setPickedClueId(null);
      if (sameId(clueEditId, id)) blankClue();
    });
  };

  const saveEncounter = (event) => {
    event.preventDefault();
    const name = encounterTitle.trim();
    if (!name) {
      setEncounterError('Encounter title is required.');
      return;
    }
    const payload = {
      title: name,
      kind: encounterKind,
      purpose: encounterPurpose,
      notes: encounterNotes,
      location_id: placePayload(encounterPlace),
    };
    const action = encounterEditId == null
      ? () => createPreparedEncounter(campaignId, payload)
      : () => updatePreparedEncounter(campaignId, encounterEditId, payload);
    act(setEncounterError, action).then((ok) => {
      if (ok) blankEncounter();
    });
  };

  const saveMember = () => {
    const name = memberName.trim();
    if (!encounterEditId) return;
    if (!name) {
      setEncounterError('Member name is required.');
      return;
    }
    const payload = { name, treasure_type: memberTreasure };
    if (memberEditId == null) {
      const count = memberCount.trim() === '' ? 1 : parseInt(memberCount, 10);
      if (!Number.isInteger(count) || count < 1) {
        setEncounterError('Count must be a positive integer.');
        return;
      }
      payload.count = count;
    }
    const action = memberEditId == null
      ? () => addEncounterMember(campaignId, encounterEditId, payload)
      : () => updateEncounterMember(campaignId, encounterEditId, memberEditId, payload);
    act(setEncounterError, action).then((ok) => {
      if (ok) blankMember();
    });
  };

  const removeMember = (member) => {
    if (!encounterEditId) return;
    act(setEncounterError, () => deleteEncounterMember(campaignId, encounterEditId, member.id)).then((ok) => {
      if (ok && sameId(memberEditId, member.id)) blankMember();
    });
  };

  const removeEncounter = () => {
    const row = encounters.find((item) => sameId(item.id, pickedEncounterId));
    if (!row) return;
    const id = row.id;
    setConfirmEncounter(false);
    act(setEncounterError, () => deletePreparedEncounter(campaignId, id)).then((ok) => {
      if (!ok) return;
      if (sameId(pickedEncounterId, id)) setPickedEncounterId(null);
      if (sameId(encounterEditId, id)) blankEncounter();
    });
  };

  const saveLead = (event) => {
    event.preventDefault();
    if (!leadLocation) {
      setLeadError('Choose a destination.');
      return;
    }
    const payload = {
      from_location_id: placePayload(leadFrom),
      to_location_id: Number(leadLocation),
      reason: leadReason,
      one_way: leadOneWay,
      discovered: !leadSecret,
      blocked: leadBlocked,
    };
    const action = leadEditId == null
      ? () => createTransition(campaignId, payload)
      : () => updateTransition(campaignId, leadEditId, payload);
    act(setLeadError, action).then((ok) => {
      if (ok) blankLead();
    });
  };

  const removeLead = () => {
    const row = leads.find((item) => sameId(item.id, pickedLeadId));
    if (!row) return;
    const id = row.id;
    setConfirmLead(false);
    act(setLeadError, () => deleteTransition(campaignId, id)).then((ok) => {
      if (!ok) return;
      if (sameId(pickedLeadId, id)) setPickedLeadId(null);
      if (sameId(leadEditId, id)) blankLead();
    });
  };

  const clueLine = (row) => (
    <li key={row.id} style={{ marginBottom: 6 }}>
      <span>{row.body}</span>
      {row.npc_id ? <span className="muted">{` · ${((pack.npcs || []).find((npc) => sameId(npc.id, row.npc_id)) || {}).name || 'NPC'}`}</span> : null}
      <span className="muted">{row.discovered ? ' · discovered' : ' · not discovered'}</span>
      <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => updateClue(campaignId, row.id, { discovered: !row.discovered }))}>
        {row.discovered ? 'Hide discovery' : 'Discovered'}
      </button>
    </li>
  );

  const objectiveLine = (row) => (
    <li key={row.id} style={{ marginBottom: 6 }}>
      <span>{row.body}</span>
      <span className="muted">{row.status === 'resolved' ? ' · resolved' : ''}</span>
      <span className="muted">{row.known ? ' · known' : ' · hidden'}</span>
      <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => updateObjective(campaignId, row.id, { known: !row.known }))}>
        {row.known ? 'Hide' : 'Known'}
      </button>
      <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 6 }} disabled={busy} onClick={() => run(() => updateObjective(campaignId, row.id, { status: row.status === 'resolved' ? 'open' : 'resolved' }))}>
        {row.status === 'resolved' ? 'Reopen' : 'Resolve'}
      </button>
    </li>
  );

  return (
    <div className={bare ? undefined : 'card'} style={{ marginBottom: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>Here</h2>
      {editing && (
        <>
          <PlaceSelect
            label="Place"
            value={pickedPlaceId}
            locations={locations}
            onChange={(value) => {
              setPickedPlaceId(value);
              clearChildren(value);
            }}
          />
          <p className="muted">
            {pickedPlaceId
              ? `New rows belong to ${locationName(locations, pickedPlaceId)}.`
              : 'With no place selected, new rows stay with the party.'}
          </p>
        </>
      )}
      {!editing && pack.concluded && (
        <p>This campaign is concluded. The playthrough was reset to its base lines. Object facts return to their authored values. The log, hirelings, wander checks, room flags, and pending commands are already gone. Starting the session clears this flag and does not bring those rows back.</p>
      )}
      {!editing && !here && <p className="muted">Select a location.</p>}
      {!editing && here && (
        <>
          <p style={{ marginBottom: 4 }}><strong>{here.name}</strong></p>
          {here.place === 'inside' ? (
            <p className="muted" style={{ margin: '0.75rem 0 0' }}>
              {ambientLine({
                ambientLight: here.ambient_light,
                marks: board.marks,
                nowSeconds: board.game_seconds,
                characters: board.characters,
              })}
            </p>
          ) : null}
          {here.summary ? (
            <div style={{ borderLeft: '3px solid #c9a227', padding: '0.35rem 0 0.35rem 0.75rem', margin: '0.75rem 0' }}>
              <div style={{ color: '#c9a227', fontSize: '0.8rem', marginBottom: 4 }}>Read aloud</div>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{here.summary}</p>
            </div>
          ) : null}
          {here.place === 'inside' && here.dark_summary ? (
            <div style={{ borderLeft: '3px solid #6e7c8a', padding: '0.35rem 0 0.35rem 0.75rem', margin: '0.75rem 0' }}>
              <div style={{ color: '#8aa0b4', fontSize: '0.8rem', marginBottom: 4 }}>In the dark</div>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{here.dark_summary}</p>
            </div>
          ) : null}
          {here.gm_text ? (
            <div style={{ borderLeft: '3px solid #8a6e4b', padding: '0.35rem 0 0.35rem 0.75rem', margin: '0.75rem 0' }}>
              <div style={{ color: '#c4a574', fontSize: '0.8rem', marginBottom: 4 }}>GM text</div>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{here.gm_text}</p>
            </div>
          ) : null}
          <p>{board.in_encounter ? 'A fight is open.' : 'No fight is open.'}</p>
        </>
      )}

      <h3>Objectives</h3>
      {!editing && knownObjectives.length === 0 && hiddenHere.length === 0 && <p className="muted">None yet.</p>}
      {!editing && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {knownObjectives.map(objectiveLine)}
          {hiddenHere.map(objectiveLine)}
        </ul>
      )}
      {editing && (
        <>
          <PickRow
            label="Objective"
            empty="No objectives yet."
            records={scopedObjectives}
            pickedId={pickedObjectiveId}
            busy={busy}
            confirm={confirmObjective}
            onChange={(value) => choose(value, setPickedObjectiveId, setConfirmObjective, objectiveEditId, blankObjective, setObjectiveError)}
            onEdit={() => {
              const row = scopedObjectives.find((item) => sameId(item.id, pickedObjectiveId));
              if (!row) return;
              setObjectiveEditId(row.id);
              setObjective(row.body || '');
              setObjectiveKnown(row.known === true);
              setObjectivePlace(row.location_id ? String(row.location_id) : '');
              setObjectiveError(null);
            }}
            onAskRemove={() => setConfirmObjective(true)}
            onRemove={removeObjective}
            onCancel={() => setConfirmObjective(false)}
            optionLabel={(row) => shortText(`${row.body}${row.status === 'resolved' ? ' · resolved' : ''} · ${row.known ? 'known' : 'hidden'}`)}
            confirmLabel={(row) => shortText(row.body, 48)}
          />
          <EditorFrame
            title={objectiveEditId == null ? 'New objective' : 'Edit objective'}
            pickedId={pickedObjectiveId}
            editId={objectiveEditId}
            error={objectiveError}
            busy={busy}
            submitLabel={objectiveEditId == null ? 'Add objective' : 'Save objective'}
            onSubmit={saveObjective}
            onCancel={blankObjective}
          >
            <input value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Objective" aria-label="Objective" style={FIELD} />
            <PlaceSelect label="Place" value={objectivePlace} locations={locations} onChange={setObjectivePlace} />
            <label><input type="checkbox" checked={objectiveKnown} onChange={(event) => setObjectiveKnown(event.target.checked)} /> Known to players</label>
          </EditorFrame>
        </>
      )}

      <h3>NPCs</h3>
      {npcs.length === 0 && <p className="muted">{scopeId ? 'None at this place.' : 'None yet.'}</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {npcs.map((row) => {
          const told = (pack.clues || []).filter((item) => !editing && !item.discovered && sameId(item.npc_id, row.id));
          return (
            <li key={row.id} style={{ marginBottom: 6 }}>
              <strong>{row.name}</strong>
              {row.attitude ? <span className="muted"> · {row.attitude}</span> : null}
              {row.location_id ? <span className="muted"> · {locationName(locations, row.location_id)}</span> : null}
              {row.motivation ? <div className="muted">Motivation: {row.motivation}</div> : null}
              {row.knowledge ? <div className="muted">Knows: {row.knowledge}</div> : null}
              {told.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0' }}>
                  {told.map(clueLine)}
                </ul>
              )}
              {editing && (
                <span style={{ display: 'inline-flex', gap: 6, marginTop: 4 }}>
                  <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => editNpc(row)}>Edit</button>
                  <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => removeNpc(row)}>Remove</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {editing && (
        <form onSubmit={saveNpc} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {npcError ? <p style={{ ...ERROR, margin: 0 }}>{npcError}</p> : null}
          <input value={npcName} onChange={(event) => setNpcName(event.target.value)} placeholder="NPC name" maxLength={80} aria-label="NPC name" style={FIELD} />
          <PlaceSelect label="Location" value={npcLocationId} locations={locations} onChange={setNpcLocationId} />
          <input value={npcMotivation} onChange={(event) => setNpcMotivation(event.target.value)} placeholder="Motivation" aria-label="NPC motivation" style={FIELD} />
          <input value={npcKnowledge} onChange={(event) => setNpcKnowledge(event.target.value)} placeholder="What they know" aria-label="What the NPC knows" style={FIELD} />
          <input value={npcAttitude} onChange={(event) => setNpcAttitude(event.target.value)} placeholder="Attitude" maxLength={80} aria-label="NPC attitude" style={FIELD} />
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-secondary" disabled={busy}>{npcEditId == null ? 'Add NPC' : 'Save NPC'}</button>
            {npcEditId != null && (
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={blankNpc}>Cancel</button>
            )}
          </span>
        </form>
      )}

      <h3>Clues</h3>
      {!editing && roomClues.length === 0 && <p className="muted">{scopeId ? 'None in this place.' : 'None yet.'}</p>}
      {!editing && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {roomClues.map(clueLine)}
        </ul>
      )}
      {editing && (
        <>
          <PickRow
            label="Clue"
            empty="No clues yet."
            records={clues}
            pickedId={pickedClueId}
            busy={busy}
            confirm={confirmClue}
            onChange={(value) => choose(value, setPickedClueId, setConfirmClue, clueEditId, blankClue, setClueError)}
            onEdit={() => {
              const row = clues.find((item) => sameId(item.id, pickedClueId));
              if (!row) return;
              setClueEditId(row.id);
              setClue(row.body || '');
              setCluePlace(row.location_id ? String(row.location_id) : '');
              setClueNpcId(row.npc_id ? String(row.npc_id) : '');
              setClueObjectiveId(row.objective_id ? String(row.objective_id) : '');
              setClueError(null);
            }}
            onAskRemove={() => setConfirmClue(true)}
            onRemove={removeClue}
            onCancel={() => setConfirmClue(false)}
            optionLabel={(row) => shortText(`${row.body}${row.discovered ? ' · discovered' : ''}`)}
            confirmLabel={(row) => shortText(row.body, 48)}
          />
          <EditorFrame
            title={clueEditId == null ? 'New clue' : 'Edit clue'}
            pickedId={pickedClueId}
            editId={clueEditId}
            error={clueError}
            busy={busy}
            submitLabel={clueEditId == null ? 'Add clue' : 'Save clue'}
            onSubmit={saveClue}
            onCancel={blankClue}
          >
            <input value={clue} onChange={(event) => setClue(event.target.value)} placeholder="Clue" aria-label="Clue" style={FIELD} />
            <PlaceSelect label="Place" value={cluePlace} locations={locations} onChange={setCluePlace} />
            <label>
              NPC
              <select value={clueNpcId} onChange={(event) => setClueNpcId(event.target.value)} aria-label="Clue NPC" style={{ ...FIELD, marginLeft: 6 }}>
                <option value="">None</option>
                {(pack.npcs || []).map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
              </select>
            </label>
            <label>
              Implies
              <select value={clueObjectiveId} onChange={(event) => setClueObjectiveId(event.target.value)} aria-label="Clue objective" style={{ ...FIELD, marginLeft: 6 }}>
                <option value="">None</option>
                {objectives.map((row) => <option key={row.id} value={row.id}>{shortText(row.body, 48)}</option>)}
              </select>
            </label>
          </EditorFrame>
        </>
      )}

      <h3>Prepared encounters</h3>
      {!editing && encounters.length === 0 && <p className="muted">{scopeId ? 'None at this place.' : 'None yet.'}</p>}
      {!editing && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {encounters.map((row) => (
            <li key={row.id} style={{ marginBottom: 8 }}>
              <strong>{row.title}</strong>
              <span className="muted"> · {row.kind} · {row.status}</span>
              {row.purpose ? <div className="muted">{row.purpose}</div> : null}
              {row.notes ? <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{row.notes}</div> : null}
              {row.members.length > 0 && (
                <div className="muted">{row.members.map((member) => member.name).join(', ')}</div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" style={TINY} disabled={busy || (row.status !== 'prepared' && row.status !== 'opened')} onClick={() => run(() => openPreparedEncounter(campaignId, row.id))}>Open</button>
                <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => run(() => resolvePreparedEncounter(campaignId, row.id))}>Resolve</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <>
          <PickRow
            label="Prepared encounter"
            empty="No prepared encounters yet."
            records={encounters}
            pickedId={pickedEncounterId}
            busy={busy}
            confirm={confirmEncounter}
            onChange={(value) => choose(value, setPickedEncounterId, setConfirmEncounter, encounterEditId, blankEncounter, setEncounterError)}
            onEdit={() => {
              const row = encounters.find((item) => sameId(item.id, pickedEncounterId));
              if (!row) return;
              setEncounterEditId(row.id);
              setEncounterTitle(row.title || '');
              setEncounterKind(row.kind || 'discovery');
              setEncounterPurpose(row.purpose || '');
              setEncounterNotes(row.notes || '');
              setEncounterPlace(row.location_id ? String(row.location_id) : '');
              setEncounterError(null);
              blankMember();
            }}
            onAskRemove={() => setConfirmEncounter(true)}
            onRemove={removeEncounter}
            onCancel={() => setConfirmEncounter(false)}
            optionLabel={(row) => {
              const purpose = row.purpose ? ` · ${row.purpose}` : '';
              const who = row.members.length ? ` · ${row.members.map((member) => member.name).join(', ')}` : '';
              return shortText(`${row.title} · ${row.kind} · ${row.status}${purpose}${who}`, 140);
            }}
            confirmLabel={(row) => row.title}
          />
          <EditorFrame
            title={encounterEditId == null ? 'New prepared encounter' : 'Edit prepared encounter'}
            pickedId={pickedEncounterId}
            editId={encounterEditId}
            error={encounterError}
            busy={busy}
            submitLabel={encounterEditId == null ? 'Add encounter' : 'Save encounter'}
            onSubmit={saveEncounter}
            onCancel={blankEncounter}
          >
            <input value={encounterTitle} onChange={(event) => setEncounterTitle(event.target.value)} placeholder="Encounter" maxLength={80} aria-label="Encounter title" style={FIELD} />
            <label>
              Kind
              <select value={encounterKind} onChange={(event) => setEncounterKind(event.target.value)} aria-label="Encounter kind" style={{ ...FIELD, marginLeft: 6 }}>
                {KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
              </select>
            </label>
            <PlaceSelect label="Place" value={encounterPlace} locations={locations} onChange={setEncounterPlace} />
            <textarea value={encounterPurpose} onChange={(event) => setEncounterPurpose(event.target.value)} placeholder="Purpose" aria-label="Encounter purpose" rows={2} style={FIELD} />
            <textarea value={encounterNotes} onChange={(event) => setEncounterNotes(event.target.value)} placeholder="Notes" aria-label="Encounter notes" rows={3} style={FIELD} />
            {encounterEditId == null ? (
              <p className="muted" style={{ margin: 0 }}>Save the encounter before adding members.</p>
            ) : (
              <MemberEditor
                members={(encounters.find((item) => sameId(item.id, encounterEditId)) || {}).members || []}
                busy={busy}
                memberEditId={memberEditId}
                memberName={memberName}
                memberCount={memberCount}
                memberTreasure={memberTreasure}
                onName={setMemberName}
                onCount={setMemberCount}
                onTreasure={setMemberTreasure}
                onEdit={(member) => {
                  setMemberEditId(member.id);
                  setMemberName(member.name || '');
                  setMemberCount('');
                  setMemberTreasure(member.treasure_type || '');
                  setEncounterError(null);
                }}
                onRemove={removeMember}
                onSave={saveMember}
                onCancel={blankMember}
              />
            )}
          </EditorFrame>
        </>
      )}

      <h3>Paths</h3>
      {!editing && leads.length === 0 && <p className="muted">{scopeId ? 'None.' : 'None yet.'}</p>}
      {!editing && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {leads.map((row) => {
            const back = scopeId ? !sameId(row.from_location_id, scopeId) : false;
            const dest = back ? row.from_location_id : row.to_location_id;
            const secret = row.discovered === false;
            const shut = row.blocked === true;
            return (
              <li key={row.id} style={{ marginBottom: 6 }}>
                <span>{locationName(locations, dest)}</span>
                {row.reason ? <span className="muted"> · {row.reason}</span> : null}
                {row.one_way ? <span className="muted"> · one way</span> : null}
                {secret ? <span className="muted"> · secret</span> : null}
                {shut ? <span className="muted"> · blocked</span> : null}
                {!secret && !shut && (
                  <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => arriveTransition(campaignId, row.id, { reverse: back }))}>Go To</button>
                )}
                {(secret || shut) && (
                  <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => arriveTransition(campaignId, row.id, { reverse: back, override: true }))}>Go anyway</button>
                )}
                {secret && (
                  <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => findTransition(campaignId, row.id))}>Mark found</button>
                )}
                <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => setTransitionAccess(campaignId, row.id, !shut))}>{shut ? 'Clear block' : 'Block'}</button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <>
          <PickRow
            label="Path"
            empty="No paths yet."
            records={leads}
            pickedId={pickedLeadId}
            busy={busy}
            confirm={confirmLead}
            onChange={(value) => choose(value, setPickedLeadId, setConfirmLead, leadEditId, blankLead, setLeadError)}
            onEdit={() => {
              const row = leads.find((item) => sameId(item.id, pickedLeadId));
              if (!row) return;
              setLeadEditId(row.id);
              setLeadFrom(row.from_location_id ? String(row.from_location_id) : '');
              setLeadLocation(row.to_location_id ? String(row.to_location_id) : '');
              setLeadReason(row.reason || '');
              setLeadOneWay(row.one_way === true);
              setLeadSecret(row.discovered === false);
              setLeadBlocked(row.blocked === true);
              setLeadError(null);
            }}
            onAskRemove={() => setConfirmLead(true)}
            onRemove={removeLead}
            onCancel={() => setConfirmLead(false)}
            optionLabel={(row) => {
              const ends = `${locationName(locations, row.from_location_id)} → ${locationName(locations, row.to_location_id)}`;
              const flag = row.one_way ? ' · one way' : '';
              const secret = row.discovered === false ? ' · secret' : '';
              const shut = row.blocked === true ? ' · blocked' : '';
              const reason = row.reason ? ` · ${row.reason}` : '';
              return shortText(`${ends}${flag}${secret}${shut}${reason}`);
            }}
            confirmLabel={(row) => locationName(locations, row.to_location_id)}
          />
          <EditorFrame
            title={leadEditId == null ? 'New path' : 'Edit path'}
            pickedId={pickedLeadId}
            editId={leadEditId}
            error={leadError}
            busy={busy}
            submitLabel={leadEditId == null ? 'Add path' : 'Save path'}
            onSubmit={saveLead}
            onCancel={blankLead}
          >
            <PlaceSelect label="From" value={leadFrom} locations={locations} onChange={setLeadFrom} />
            <label>
              Destination
              <select value={leadLocation} onChange={(event) => setLeadLocation(event.target.value)} aria-label="Path destination" style={{ ...FIELD, marginLeft: 6 }}>
                <option value="">Choose…</option>
                {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </label>
            <input value={leadReason} onChange={(event) => setLeadReason(event.target.value)} placeholder="Reason" aria-label="Path reason" style={FIELD} />
            <label>
              <input type="checkbox" checked={leadOneWay} onChange={(event) => setLeadOneWay(event.target.checked)} />
              {' '}One way
            </label>
            <label>
              <input type="checkbox" checked={leadSecret} onChange={(event) => setLeadSecret(event.target.checked)} />
              {' '}Secret
            </label>
            <label>
              <input type="checkbox" checked={leadBlocked} onChange={(event) => setLeadBlocked(event.target.checked)} />
              {' '}Blocked
            </label>
          </EditorFrame>
        </>
      )}

      {!editing && (
        <>
          <h3>Discovered</h3>
          {discoveryGroups.length === 0 && <p className="muted">Nothing discovered yet.</p>}
          {discoveryGroups.map((group) => (
            <div key={group.key || 'party'}>
              <h4 style={{ margin: '0.75rem 0 0.25rem', fontSize: '1rem' }}>{group.name}</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {group.rows.map(clueLine)}
              </ul>
            </div>
          ))}

          <h3>Log</h3>
          {(pack.log || []).length === 0 && <p className="muted">Nothing recorded.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {(pack.log || []).map((row) => (
              <li key={row.id} style={{ marginBottom: 6 }}>
                <span className="muted">{formatGameTime(row.at_seconds)} · {row.kind}</span>
                <div>{row.body}</div>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const body = logBody.trim();
              if (!body) return;
              run(() => addSituationLog(campaignId, { kind: logKind, body })).then((ok) => {
                if (ok) setLogBody('');
              });
            }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}
          >
            <select value={logKind} onChange={(event) => setLogKind(event.target.value)} aria-label="Log kind" style={FIELD}>
              <option value="decision">decision</option>
              <option value="consequence">consequence</option>
              <option value="discovery">discovery</option>
            </select>
            <input value={logBody} onChange={(event) => setLogBody(event.target.value)} placeholder="What happened" aria-label="Log" style={{ ...FIELD, flex: 1, minWidth: 160 }} />
            <button type="submit" className="btn btn-secondary" disabled={busy}>Add log</button>
          </form>
        </>
      )}
    </div>
  );
}
