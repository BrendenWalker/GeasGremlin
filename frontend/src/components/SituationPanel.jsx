import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  activateSituation,
  addSituationLog,
  arriveTransition,
  concludeCampaign,
  createClue,
  createNpc,
  createObjective,
  addEncounterMember,
  createPreparedEncounter,
  createSituation,
  createTransition,
  deleteClue,
  deleteEncounterMember,
  deleteNpc,
  deleteObjective,
  deletePreparedEncounter,
  deleteSituation,
  deleteTransition,
  updateEncounterMember,
  updatePreparedEncounter,
  updateTransition,
  endSituationSession,
  openPreparedEncounter,
  resolvePreparedEncounter,
  resolveSituation,
  restSituation,
  returnToLocation,
  updateClue,
  updateNpc,
  updateObjective,
  updateSituation,
} from '../api/api';
import { formatGameTime } from '../domain/gameTime.mjs';

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

function PickRow({ label, empty, records, pickedId, busy, confirm, onChange, onEdit, onAskRemove, onRemove, onCancel, optionLabel, confirmLabel }) {
  if (records.length === 0) return <p className="muted">{empty}</p>;
  const picked = records.find((row) => String(row.id) === String(pickedId));
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

function stageLabel(stages, id) {
  const found = (stages || []).find((stage) => stage.id === id);
  return found ? found.label : id;
}

function locationName(locations, id) {
  const found = (locations || []).find((loc) => String(loc.id) === String(id));
  return found ? found.name : 'location';
}

export default function SituationPanel({ campaignId, board, busy, run, mode = 'play' }) {
  const navigate = useNavigate();
  const editing = mode === 'edit';
  const pack = board?.situation;
  const active = pack?.active || null;
  const locations = board?.locations || [];
  const stages = pack?.stages || [];
  const [pickedSituationId, setPickedSituationId] = useState(null);
  const [situationEditId, setSituationEditId] = useState(null);
  const [confirmSituation, setConfirmSituation] = useState(false);
  const [situationError, setSituationError] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationId, setLocationId] = useState('');
  const [pickedObjectiveId, setPickedObjectiveId] = useState(null);
  const [objectiveEditId, setObjectiveEditId] = useState(null);
  const [confirmObjective, setConfirmObjective] = useState(false);
  const [objectiveError, setObjectiveError] = useState(null);
  const [objective, setObjective] = useState('');
  const [objectiveKnown, setObjectiveKnown] = useState(false);
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
  const [pickedEncounterId, setPickedEncounterId] = useState(null);
  const [encounterEditId, setEncounterEditId] = useState(null);
  const [confirmEncounter, setConfirmEncounter] = useState(false);
  const [encounterError, setEncounterError] = useState(null);
  const [encounterTitle, setEncounterTitle] = useState('');
  const [encounterKind, setEncounterKind] = useState('discovery');
  const [encounterPurpose, setEncounterPurpose] = useState('');
  const [encounterNotes, setEncounterNotes] = useState('');
  const [memberEditId, setMemberEditId] = useState(null);
  const [memberName, setMemberName] = useState('');
  const [memberCount, setMemberCount] = useState('');
  const [memberTreasure, setMemberTreasure] = useState('');
  const [pickedLeadId, setPickedLeadId] = useState(null);
  const [leadEditId, setLeadEditId] = useState(null);
  const [confirmLead, setConfirmLead] = useState(false);
  const [leadError, setLeadError] = useState(null);
  const [leadLocation, setLeadLocation] = useState('');
  const [leadReason, setLeadReason] = useState('');
  const [logKind, setLogKind] = useState('decision');
  const [logBody, setLogBody] = useState('');
  const [otherStage, setOtherStage] = useState('');

  if (!board || !pack) return null;

  const selected = editing
    ? (pack.situations || []).find((row) => String(row.id) === String(pickedSituationId)) || null
    : null;
  const scope = editing ? selected : active;
  const inScope = (row) => {
    if (!scope) return true;
    if (editing) return row.situation_id === scope.id;
    return row.situation_id == null || row.situation_id === scope.id;
  };
  const suggested = new Set(active?.suggested_next || []);
  const otherStages = stages.filter((stage) => !suggested.has(stage.id));
  const here = locations.find((loc) => String(loc.id) === String(board.location_id));
  const been = locations.filter((loc) => loc.arrived_seconds != null && String(loc.id) !== String(board.location_id));
  const objectives = (pack.objectives || []).filter(inScope);
  const npcs = (pack.npcs || []).filter((row) => !scope || (scope.npc_ids || []).includes(row.id));
  const clues = (pack.clues || []).filter((row) => !scope || (scope.clue_ids || []).includes(row.id));
  const encounters = (pack.encounters || []).filter(inScope);
  const leads = (pack.transitions || []).filter(inScope);
  const situationRows = editing
    ? (pack.situations || [])
    : (pack.situations || []).filter((row) => !active || row.id !== active.id);
  const parentId = scope ? scope.id : null;

  const leave = (action) => {
    run(action).then((ok) => {
      if (ok) navigate('/');
    });
  };

  const act = (setErr, action) => {
    setErr(null);
    return run(action, setErr);
  };

  const choose = (value, setPicked, setConfirm, editId, blank, setErr) => {
    const id = value || null;
    setPicked(id);
    setConfirm(false);
    setErr(null);
    if (editId != null && String(editId) !== String(id)) blank();
  };

  const blankSituation = () => {
    setSituationEditId(null);
    setTitle('');
    setDescription('');
    setLocationId('');
    setSituationError(null);
  };

  const blankObjective = () => {
    setObjectiveEditId(null);
    setObjective('');
    setObjectiveKnown(false);
    setObjectiveError(null);
  };

  const blankClue = () => {
    setClueEditId(null);
    setClue('');
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
    setEncounterError(null);
    blankMember();
  };

  const blankLead = () => {
    setLeadEditId(null);
    setLeadLocation('');
    setLeadReason('');
    setLeadError(null);
  };

  const blankNpc = () => {
    setNpcEditId(null);
    setNpcName('');
    setNpcLocationId('');
    setNpcMotivation('');
    setNpcKnowledge('');
    setNpcAttitude('');
    setNpcError(null);
  };

  const clearChildren = () => {
    setPickedObjectiveId(null);
    setConfirmObjective(false);
    blankObjective();
    blankNpc();
    setPickedClueId(null);
    setConfirmClue(false);
    blankClue();
    setPickedEncounterId(null);
    setConfirmEncounter(false);
    blankEncounter();
    setPickedLeadId(null);
    setConfirmLead(false);
    blankLead();
  };

  const editSituation = (row) => {
    setSituationEditId(row.id);
    setTitle(row.title || '');
    setDescription(row.description || '');
    setLocationId(row.location_id ? String(row.location_id) : '');
    setSituationError(null);
  };

  const saveSituation = (event) => {
    event.preventDefault();
    const name = title.trim();
    if (!name) {
      setSituationError('Situation title is required.');
      return;
    }
    const body = { title: name, description };
    if (situationEditId) {
      body.location_id = locationId ? Number(locationId) : null;
      act(setSituationError, () => updateSituation(campaignId, situationEditId, body)).then((ok) => {
        if (ok) blankSituation();
      });
      return;
    }
    if (locationId) body.location_id = Number(locationId);
    act(setSituationError, () => createSituation(campaignId, body)).then((ok) => {
      if (ok) blankSituation();
    });
  };

  const removeSituation = () => {
    if (!selected) return;
    const id = selected.id;
    setConfirmSituation(false);
    act(setSituationError, () => deleteSituation(campaignId, id)).then((ok) => {
      if (!ok) return;
      if (String(pickedSituationId) === String(id)) setPickedSituationId(null);
      if (String(situationEditId) === String(id)) blankSituation();
      clearChildren();
    });
  };

  const attach = (payload) => {
    if (parentId) payload.situation_id = parentId;
    return payload;
  };

  const saveObjective = (event) => {
    event.preventDefault();
    const body = objective.trim();
    if (!body) {
      setObjectiveError('Objective is required.');
      return;
    }
    const payload = { body, known: objectiveKnown };
    const action = objectiveEditId == null
      ? () => createObjective(campaignId, attach(payload))
      : () => updateObjective(campaignId, objectiveEditId, payload);
    act(setObjectiveError, action).then((ok) => {
      if (ok) blankObjective();
    });
  };

  const removeObjective = () => {
    const row = objectives.find((item) => String(item.id) === String(pickedObjectiveId));
    if (!row) return;
    const id = row.id;
    setConfirmObjective(false);
    act(setObjectiveError, () => deleteObjective(campaignId, id)).then((ok) => {
      if (!ok) return;
      if (String(pickedObjectiveId) === String(id)) setPickedObjectiveId(null);
      if (String(objectiveEditId) === String(id)) blankObjective();
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
      location_id: npcLocationId ? Number(npcLocationId) : null,
    };
    const action = npcEditId == null
      ? () => createNpc(campaignId, attach(payload))
      : () => updateNpc(campaignId, npcEditId, payload);
    act(setNpcError, action).then((ok) => {
      if (ok) blankNpc();
    });
  };

  const removeNpc = (row) => {
    act(setNpcError, () => deleteNpc(campaignId, row.id)).then((ok) => {
      if (ok && String(npcEditId) === String(row.id)) blankNpc();
    });
  };

  const saveClue = (event) => {
    event.preventDefault();
    const body = clue.trim();
    if (!body) {
      setClueError('Clue is required.');
      return;
    }
    const action = clueEditId == null
      ? () => createClue(campaignId, attach({ body, discovered: false }))
      : () => updateClue(campaignId, clueEditId, { body });
    act(setClueError, action).then((ok) => {
      if (ok) blankClue();
    });
  };

  const removeClue = () => {
    const row = clues.find((item) => String(item.id) === String(pickedClueId));
    if (!row) return;
    const id = row.id;
    setConfirmClue(false);
    act(setClueError, () => deleteClue(campaignId, id)).then((ok) => {
      if (!ok) return;
      if (String(pickedClueId) === String(id)) setPickedClueId(null);
      if (String(clueEditId) === String(id)) blankClue();
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
    };
    const action = encounterEditId == null
      ? () => createPreparedEncounter(campaignId, attach(payload))
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
    const payload = {
      name,
      treasure_type: memberTreasure,
    };
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
      if (ok && String(memberEditId) === String(member.id)) blankMember();
    });
  };

  const removeEncounter = () => {
    const row = encounters.find((item) => String(item.id) === String(pickedEncounterId));
    if (!row) return;
    const id = row.id;
    setConfirmEncounter(false);
    act(setEncounterError, () => deletePreparedEncounter(campaignId, id)).then((ok) => {
      if (!ok) return;
      if (String(pickedEncounterId) === String(id)) setPickedEncounterId(null);
      if (String(encounterEditId) === String(id)) blankEncounter();
    });
  };

  const saveLead = (event) => {
    event.preventDefault();
    if (!leadLocation) {
      setLeadError('Choose a destination.');
      return;
    }
    const payload = { to_location_id: Number(leadLocation), reason: leadReason };
    const action = leadEditId == null
      ? () => createTransition(campaignId, attach(payload))
      : () => updateTransition(campaignId, leadEditId, payload);
    act(setLeadError, action).then((ok) => {
      if (ok) blankLead();
    });
  };

  const removeLead = () => {
    const row = leads.find((item) => String(item.id) === String(pickedLeadId));
    if (!row) return;
    const id = row.id;
    setConfirmLead(false);
    act(setLeadError, () => deleteTransition(campaignId, id)).then((ok) => {
      if (!ok) return;
      if (String(pickedLeadId) === String(id)) setPickedLeadId(null);
      if (String(leadEditId) === String(id)) blankLead();
    });
  };

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 style={{ marginTop: 0 }}>{editing ? 'Situations' : 'Situation'}</h2>
      {!editing && pack.concluded && (
        <p>This campaign is concluded. Activating a situation starts another scenario.</p>
      )}
      {!editing && !active && <p className="muted">No active situation.</p>}
      {!editing && active && (
        <>
          <p style={{ marginBottom: 4 }}>
            <strong>{active.title}</strong>
            <span className="muted"> · {stageLabel(stages, active.stage)}</span>
            {active.location_id ? <span className="muted"> · {locationName(locations, active.location_id)}</span> : null}
          </p>
          {active.description ? <p style={{ whiteSpace: 'pre-wrap' }}>{active.description}</p> : null}
          {(active.prompt || []).map((line) => <p key={line} className="muted">{line}</p>)}
          {here?.summary ? <p style={{ whiteSpace: 'pre-wrap' }}>{here.summary}</p> : null}
          <p>{board.in_encounter ? 'A fight is open.' : 'No fight is open.'}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            {(active.suggested_next || []).map((id) => (
              <button
                key={id}
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => run(() => updateSituation(campaignId, active.id, { stage: id }))}
              >
                {stageLabel(stages, id)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <label>
              Other stage
              <select
                value={otherStage}
                onChange={(event) => setOtherStage(event.target.value)}
                style={{ ...FIELD, marginLeft: 6 }}
              >
                <option value="">Choose…</option>
                {otherStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || !otherStage}
              onClick={() => run(() => updateSituation(campaignId, active.id, { stage: otherStage }))}
            >
              Set stage
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => restSituation(campaignId))}>Rest</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => leave(() => endSituationSession(campaignId))}>End session</button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => leave(() => concludeCampaign(campaignId))}>Conclude campaign</button>
          </div>
        </>
      )}

      {editing && (
        <>
          <PickRow
            label="Situation"
            empty="No situations yet."
            records={situationRows}
            pickedId={pickedSituationId}
            busy={busy}
            confirm={confirmSituation}
            onChange={(value) => {
              choose(value, setPickedSituationId, setConfirmSituation, situationEditId, blankSituation, setSituationError);
              clearChildren();
            }}
            onEdit={() => editSituation(selected)}
            onAskRemove={() => setConfirmSituation(true)}
            onRemove={removeSituation}
            onCancel={() => setConfirmSituation(false)}
            optionLabel={(row) => {
              const place = row.location_id ? ` · ${locationName(locations, row.location_id)}` : '';
              return `${row.title} · ${row.status} · ${stageLabel(stages, row.stage)}${place}`;
            }}
            confirmLabel={(row) => row.title}
          />
          <EditorFrame
            title={situationEditId == null ? 'New situation' : 'Edit situation'}
            pickedId={pickedSituationId}
            editId={situationEditId}
            error={situationError}
            busy={busy}
            submitLabel={situationEditId == null ? 'Add situation' : 'Save situation'}
            onSubmit={saveSituation}
            onCancel={blankSituation}
          >
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Situation title" maxLength={80} aria-label="Situation title" style={FIELD} />
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Premise" aria-label="Situation premise" rows={3} style={FIELD} />
            <label>
              Location
              <select value={locationId} onChange={(event) => setLocationId(event.target.value)} style={{ ...FIELD, marginLeft: 6 }}>
                <option value="">None</option>
                {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </label>
          </EditorFrame>
          <p className="muted">
            {selected
              ? `New rows below attach to ${selected.title}.`
              : 'Select a situation to attach new rows to it. With none selected, new rows stay on the campaign.'}
          </p>
        </>
      )}

      <h3>Objectives</h3>
      {!editing && objectives.length === 0 && <p className="muted">None yet.</p>}
      {!editing && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {objectives.map((row) => (
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
          ))}
        </ul>
      )}
      {editing && (
        <>
          <PickRow
            label="Objective"
            empty="No objectives yet."
            records={objectives}
            pickedId={pickedObjectiveId}
            busy={busy}
            confirm={confirmObjective}
            onChange={(value) => choose(value, setPickedObjectiveId, setConfirmObjective, objectiveEditId, blankObjective, setObjectiveError)}
            onEdit={() => {
              const row = objectives.find((item) => String(item.id) === String(pickedObjectiveId));
              if (!row) return;
              setObjectiveEditId(row.id);
              setObjective(row.body || '');
              setObjectiveKnown(row.known === true);
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
            <label><input type="checkbox" checked={objectiveKnown} onChange={(event) => setObjectiveKnown(event.target.checked)} /> Known to players</label>
          </EditorFrame>
        </>
      )}

      <h3>NPCs</h3>
      {npcs.length === 0 && <p className="muted">{scope ? 'None linked to this situation.' : 'None yet.'}</p>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {npcs.map((row) => (
          <li key={row.id} style={{ marginBottom: 6 }}>
            <strong>{row.name}</strong>
            {row.attitude ? <span className="muted"> · {row.attitude}</span> : null}
            {row.location_id ? <span className="muted"> · {locationName(locations, row.location_id)}</span> : null}
            {row.motivation ? <div className="muted">Motivation: {row.motivation}</div> : null}
            {row.knowledge ? <div className="muted">Knows: {row.knowledge}</div> : null}
            {editing && (
              <span style={{ display: 'inline-flex', gap: 6, marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => editNpc(row)}>Edit</button>
                <button type="button" className="btn btn-secondary" style={TINY} disabled={busy} onClick={() => removeNpc(row)}>Remove</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <form onSubmit={saveNpc} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {npcError ? <p style={{ ...ERROR, margin: 0 }}>{npcError}</p> : null}
          <input value={npcName} onChange={(event) => setNpcName(event.target.value)} placeholder="NPC name" maxLength={80} aria-label="NPC name" style={FIELD} />
          <label>
            Location
            <select value={npcLocationId} onChange={(event) => setNpcLocationId(event.target.value)} aria-label="NPC location" style={{ ...FIELD, marginLeft: 6 }}>
              <option value="">None</option>
              {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          </label>
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
      {!editing && clues.length === 0 && <p className="muted">{scope ? 'None linked to this situation.' : 'None yet.'}</p>}
      {!editing && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {clues.map((row) => (
            <li key={row.id} style={{ marginBottom: 6 }}>
              <span>{row.body}</span>
              <span className="muted">{row.discovered ? ' · discovered' : ' · not discovered'}</span>
              <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => updateClue(campaignId, row.id, { discovered: !row.discovered }))}>
                {row.discovered ? 'Hide discovery' : 'Discovered'}
              </button>
            </li>
          ))}
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
              const row = clues.find((item) => String(item.id) === String(pickedClueId));
              if (!row) return;
              setClueEditId(row.id);
              setClue(row.body || '');
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
          </EditorFrame>
        </>
      )}

      <h3>Prepared encounters</h3>
      {!editing && encounters.length === 0 && <p className="muted">None yet.</p>}
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
              const row = encounters.find((item) => String(item.id) === String(pickedEncounterId));
              if (!row) return;
              setEncounterEditId(row.id);
              setEncounterTitle(row.title || '');
              setEncounterKind(row.kind || 'discovery');
              setEncounterPurpose(row.purpose || '');
              setEncounterNotes(row.notes || '');
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
            <textarea value={encounterPurpose} onChange={(event) => setEncounterPurpose(event.target.value)} placeholder="Purpose" aria-label="Encounter purpose" rows={2} style={FIELD} />
            <textarea value={encounterNotes} onChange={(event) => setEncounterNotes(event.target.value)} placeholder="Notes" aria-label="Encounter notes" rows={3} style={FIELD} />
            {encounterEditId == null ? (
              <p className="muted" style={{ margin: 0 }}>Save the encounter before adding members.</p>
            ) : (
              <MemberEditor
                members={(encounters.find((item) => String(item.id) === String(encounterEditId)) || {}).members || []}
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

      <h3>Leads</h3>
      {!editing && leads.length === 0 && <p className="muted">None yet.</p>}
      {!editing && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {leads.map((row) => (
            <li key={row.id} style={{ marginBottom: 6 }}>
              <span>{locationName(locations, row.to_location_id)}</span>
              {row.reason ? <span className="muted"> · {row.reason}</span> : null}
              <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => arriveTransition(campaignId, row.id))}>Arrive</button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <>
          <PickRow
            label="Lead"
            empty="No leads yet."
            records={leads}
            pickedId={pickedLeadId}
            busy={busy}
            confirm={confirmLead}
            onChange={(value) => choose(value, setPickedLeadId, setConfirmLead, leadEditId, blankLead, setLeadError)}
            onEdit={() => {
              const row = leads.find((item) => String(item.id) === String(pickedLeadId));
              if (!row) return;
              setLeadEditId(row.id);
              setLeadLocation(row.to_location_id ? String(row.to_location_id) : '');
              setLeadReason(row.reason || '');
              setLeadError(null);
            }}
            onAskRemove={() => setConfirmLead(true)}
            onRemove={removeLead}
            onCancel={() => setConfirmLead(false)}
            optionLabel={(row) => shortText(row.reason ? `${locationName(locations, row.to_location_id)} · ${row.reason}` : locationName(locations, row.to_location_id))}
            confirmLabel={(row) => locationName(locations, row.to_location_id)}
          />
          <EditorFrame
            title={leadEditId == null ? 'New lead' : 'Edit lead'}
            pickedId={pickedLeadId}
            editId={leadEditId}
            error={leadError}
            busy={busy}
            submitLabel={leadEditId == null ? 'Add lead' : 'Save lead'}
            onSubmit={saveLead}
            onCancel={blankLead}
          >
            <label>
              Destination
              <select value={leadLocation} onChange={(event) => setLeadLocation(event.target.value)} aria-label="Lead destination" style={{ ...FIELD, marginLeft: 6 }}>
                <option value="">Choose…</option>
                {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
            </label>
            <input value={leadReason} onChange={(event) => setLeadReason(event.target.value)} placeholder="Reason" aria-label="Lead reason" style={FIELD} />
          </EditorFrame>
        </>
      )}

      {!editing && (
        <>
          <h3>Been here</h3>
          {been.length === 0 && <p className="muted">No earlier location.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {been.map((loc) => (
              <li key={loc.id} style={{ marginBottom: 6 }}>
                <span>{loc.name}</span>
                <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => returnToLocation(campaignId, loc.id))}>Return</button>
              </li>
            ))}
          </ul>

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
              run(() => addSituationLog(campaignId, attach({ kind: logKind, body }))).then((ok) => {
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

          <h3 style={{ marginTop: 16 }}>Situations</h3>
          {situationRows.length === 0 && <p className="muted">No other situations.</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {situationRows.map((row) => (
              <li key={row.id} style={{ marginBottom: 6 }}>
                <strong>{row.title}</strong>
                <span className="muted"> · {row.status} · {stageLabel(stages, row.stage)}</span>
                <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 8 }} disabled={busy} onClick={() => run(() => activateSituation(campaignId, row.id))}>Activate</button>
                {row.status !== 'resolved' && (
                  <button type="button" className="btn btn-secondary" style={{ ...TINY, marginLeft: 6 }} disabled={busy} onClick={() => run(() => resolveSituation(campaignId, row.id))}>Resolve</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
