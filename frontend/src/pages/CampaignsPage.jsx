import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCampaigns, createCampaign, deleteCampaign, getInvites, inviteToCampaign, acceptInvite, declineInvite, startCampaign } from '../api/api';
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
  const [inviteName, setInviteName] = useState({});
  const [startingId, setStartingId] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      getCampaigns().then((res) => res.data || []),
      getInvites().then((res) => res.data || []),
    ])
      .then(([list, pending]) => {
        setCampaigns(list);
        setInvites(pending);
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
    const username = (inviteName[id] || '').trim();
    if (!username) return;
    inviteToCampaign(id, username)
      .then(() => setInviteName((prev) => ({ ...prev, [id]: '' })))
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
                  <Link to={`/campaigns/${c.id}/characters`} style={{ color: '#c9a227', textDecoration: 'none' }}>
                    {c.name}
                  </Link>
                  {c.ruleset_name && <span className="muted">{c.ruleset_name}</span>}
                </span>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  {c.role && (c.role === 'gm' || c.running) && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      disabled={startingId === c.id}
                      onClick={() => handleStart(c.id)}
                    >
                      Start
                    </button>
                  )}
                  {c.role === 'gm' && (
                    <>
                    <input
                      type="text"
                      value={inviteName[c.id] || ''}
                      onChange={(e) => setInviteName((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="Invite username"
                      style={{ width: 140, padding: '0.25rem 0.4rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }}
                    />
                    <button type="button" className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }} onClick={() => handleInvite(c.id)}>Invite</button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                      onClick={() => handleDelete(c.id, c.name)}
                    >
                      Delete
                    </button>
                    </>
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
