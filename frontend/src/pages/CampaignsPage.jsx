import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCampaigns, createCampaign, deleteCampaign, getInvites, getInviteCandidates, inviteToCampaign, acceptInvite, declineInvite, startCampaign } from '../api/api';
import { useRuleset } from '../components/RulesetContext';

export default function CampaignsPage() {
  const { rulesets, error: rulesetError, loading: rulesetsLoading } = useRuleset();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [newRulesetId, setNewRulesetId] = useState('');
  const [creating, setCreating] = useState(false);
  const [invites, setInvites] = useState([]);
  const [candidates, setCandidates] = useState({});
  const [inviteChoice, setInviteChoice] = useState({});
  const [startingId, setStartingId] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      getCampaigns().then((res) => res.data || []),
      getInvites().then((res) => res.data || []),
      getInviteCandidates().then((res) => res.data || []),
    ])
      .then(([list, pending, eligible]) => {
        const grouped = {};
        for (const row of eligible) {
          if (!grouped[row.campaign_id]) grouped[row.campaign_id] = [];
          grouped[row.campaign_id].push(row);
        }
        setCampaigns(list);
        setInvites(pending);
        setCandidates(grouped);
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newName.trim() || !newRulesetId) return;
    setCreating(true);
    createCampaign({ name: newName.trim(), ruleset_id: parseInt(newRulesetId, 10) })
      .then(() => {
        setNewName('');
        setNewRulesetId('');
        load();
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setCreating(false));
  };

  const handleDelete = (id, name) => {
    if (!window.confirm(`Delete campaign "${name}"? This will delete all characters in it.`)) return;
    deleteCampaign(id)
      .then(load)
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleInvite = (id) => {
    const characterId = Number(inviteChoice[id]);
    if (!Number.isInteger(characterId) || characterId <= 0) return;
    setError(null);
    inviteToCampaign(id, characterId)
      .then(() => {
        setInviteChoice((prev) => ({ ...prev, [id]: '' }));
        load();
      })
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  const handleStart = (id) => {
    setStartingId(id);
    setError(null);
    startCampaign(id)
      .then(() => navigate(`/play/${id}`))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setStartingId(null));
  };

  return (
    <div>
      <div className="card">
        <h2>Campaigns</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New campaign name"
            style={{ flex: 1, minWidth: 160, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }}
          />
          <select
            value={newRulesetId}
            onChange={(e) => setNewRulesetId(e.target.value)}
            aria-label="Campaign ruleset"
            disabled={rulesetsLoading || !rulesets || rulesets.length === 0}
            style={{ minWidth: 180, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }}
          >
            <option value="">Ruleset</option>
            {(rulesets || []).map((row) => (
              <option key={row.id} value={String(row.id)}>{row.name}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary" disabled={creating || !newName.trim() || !newRulesetId}>
            Add
          </button>
        </form>
        {rulesetError && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{rulesetError}</p>}
        {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
        {invites.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Invites</h3>
            <ul style={{ listStyle: 'none' }}>
              {invites.map((invite) => (
                <li key={invite.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.35rem 0' }}>
                  <span>{invite.name}</span>
                  <button type="button" className="btn btn-primary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => acceptInvite(invite.id).then(load).catch((err) => setError(err.response?.data?.error || err.message))}>Accept</button>
                  <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => declineInvite(invite.id).then(load).catch((err) => setError(err.response?.data?.error || err.message))}>Decline</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {loading ? (
          <p style={{ color: '#8a7f72' }}>Loading…</p>
        ) : (
          <ul style={{ listStyle: 'none' }}>
            {campaigns.map((c) => (
              <li
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid #3d3530',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', minWidth: 0 }}>
                  <span>{c.name}</span>
                  {c.ruleset_name && <span className="muted">{c.ruleset_name}</span>}
                </span>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {c.role === 'gm' && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => navigate(`/campaigns/${c.id}/characters`)}
                    >
                      Edit
                    </button>
                  )}
                  {c.role && (c.role === 'gm' || c.running) && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      disabled={startingId === c.id}
                      onClick={() => handleStart(c.id)}
                    >
                      {c.running ? 'Join' : 'Start'}
                    </button>
                  )}
                  {c.role === 'gm' ? (
                    <>
                    <select
                      aria-label={`Invite character to ${c.name}`}
                      value={inviteChoice[c.id] || ''}
                      disabled={(candidates[c.id] || []).length === 0}
                      onChange={(e) => setInviteChoice((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      style={{ minWidth: 200, padding: '0.25rem 0.4rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }}
                    >
                      <option value="">{(candidates[c.id] || []).length === 0 ? 'No characters to invite' : 'Choose character'}</option>
                      {(candidates[c.id] || []).map((ch) => (
                        <option key={ch.character_id} value={String(ch.character_id)}>{ch.name} ({ch.username})</option>
                      ))}
                    </select>
                    <button type="button" className={`btn ${inviteChoice[c.id] ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleInvite(c.id)}>Invite</button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => handleDelete(c.id, c.name)}
                    >
                      Delete
                    </button>
                    </>
                  ) : (
                    c.owner ? <span className="muted">Owner: {c.owner}</span> : null
                  )}
                </div>
              </li>
            ))}
            {campaigns.length === 0 && !loading && (
              <li style={{ color: '#8a7f72' }}>No campaigns yet. Create one above.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
