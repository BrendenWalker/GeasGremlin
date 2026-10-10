import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCampaign, getCharacters, createCharacter, deleteCharacter, createCampaignCommand } from '../api/api';
import { useAuth } from '../components/AuthContext';

export default function CharactersPage() {
  const { campaignId } = useParams();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', level: 1, xp: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [showGm, setShowGm] = useState(false);
  const [gmTargetId, setGmTargetId] = useState('');
  const [gmXp, setGmXp] = useState(0);
  const [gmGold, setGmGold] = useState(0);
  const [gmSending, setGmSending] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      getCampaign(campaignId).then((r) => r.data).catch(() => null),
      getCharacters(campaignId).then((r) => r.data || []).catch(() => []),
    ])
      .then(([c, list]) => {
        setCampaign(c);
        setCharacters(list);
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), [campaignId]);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    createCharacter(campaignId, { name: form.name.trim(), level: form.level, xp: form.xp })
      .then(() => {
        setForm({ name: '', level: 1, xp: 0 });
        setShowForm(false);
        load();
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setSubmitting(false));
  };

  const handleDelete = (id, name) => {
    if (!window.confirm(`Delete character "${name}"?`)) return;
    deleteCharacter(id)
      .then(load)
      .catch((err) => setError(err.response?.data?.error || err.message));
  };

  if (loading && !campaign) {
    return <div className="card"><p style={{ color: '#8a7f72' }}>Loading…</p></div>;
  }

  if (!campaign) {
    return (
      <div className="card">
        <p style={{ color: '#c95858' }}>Campaign not found.</p>
        <Link to="/campaigns" className="btn btn-secondary">Back to Campaigns</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/campaigns" style={{ color: '#8a7f72', textDecoration: 'none' }}>← Campaigns</Link>
          <h2 style={{ margin: 0 }}>{campaign.name} — Characters</h2>
        </div>
      </div>
      <div className="card">
        {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <Link
            to={`/campaigns/${campaignId}/characters/new`}
            className="btn btn-primary"
          >
            New character (wizard)
          </Link>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : 'New character (quick)'}
          </button>
          {campaign.role === 'gm' && (
            <button type="button" className="btn btn-secondary" onClick={() => setShowGm(!showGm)}>
              {showGm ? 'Hide GM' : 'GM commands'}
            </button>
          )}
        </div>
        {campaign.role === 'gm' && showGm && (
          <div style={{ marginBottom: '1rem', padding: '1rem', background: '#252019', borderRadius: 6, border: '1px solid #3d3530' }}>
            <h3 style={{ marginTop: 0 }}>GM: Send to player</h3>
            <p style={{ color: '#8a7f72', fontSize: '0.9rem', marginBottom: '0.75rem' }}>Commands are delivered when the player has their character open in Play mode.</p>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>Character</label>
                <select
                  value={gmTargetId}
                  onChange={(e) => setGmTargetId(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5', minWidth: 160 }}
                >
                  <option value="">— Select —</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>XP</label>
                <input type="number" min={0} value={gmXp} onChange={(e) => setGmXp(parseInt(e.target.value, 10) || 0)} style={{ width: 80, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }} />
              </div>
              <button type="button" className="btn btn-primary" disabled={!gmTargetId || gmXp <= 0 || gmSending} onClick={() => { setGmSending(true); createCampaignCommand(campaignId, { recipient_character_id: parseInt(gmTargetId, 10), type: 'give_xp', payload: { amount: gmXp } }).then(() => { setGmXp(0); }).catch((err) => setError(err.response?.data?.error || err.message)).finally(() => setGmSending(false)); }}>Give XP</button>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>Gold (cp)</label>
                <input type="number" min={0} value={gmGold} onChange={(e) => setGmGold(parseInt(e.target.value, 10) || 0)} style={{ width: 80, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }} />
              </div>
              <button type="button" className="btn btn-primary" disabled={!gmTargetId || gmGold <= 0 || gmSending} onClick={() => { setGmSending(true); createCampaignCommand(campaignId, { recipient_character_id: parseInt(gmTargetId, 10), type: 'give_gold', payload: { amount_cp: gmGold } }).then(() => { setGmGold(0); }).catch((err) => setError(err.response?.data?.error || err.message)).finally(() => setGmSending(false)); }}>Give gold</button>
              <button type="button" className="btn btn-secondary" disabled={!gmTargetId || gmSending} onClick={() => { setGmSending(true); createCampaignCommand(campaignId, { recipient_character_id: parseInt(gmTargetId, 10), type: 'new_day', payload: {} }).catch((err) => setError(err.response?.data?.error || err.message)).finally(() => setGmSending(false)); }}>New day</button>
              <button type="button" className="btn btn-secondary" disabled={!gmTargetId || gmSending} onClick={() => { setGmSending(true); createCampaignCommand(campaignId, { recipient_character_id: parseInt(gmTargetId, 10), type: 'new_round', payload: {} }).catch((err) => setError(err.response?.data?.error || err.message)).finally(() => setGmSending(false)); }}>New round</button>
            </div>
          </div>
        )}
        {showForm && (
          <form onSubmit={handleCreate} style={{ marginBottom: '1rem', padding: '1rem', background: '#1a1614', borderRadius: 6 }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: 2 }}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Character name"
                style={{ width: '100%', maxWidth: 300, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#252019', color: '#e8e0d5' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>Level</label>
                <input
                  type="number"
                  min={1}
                  value={form.level}
                  onChange={(e) => setForm((f) => ({ ...f, level: parseInt(e.target.value, 10) || 1 }))}
                  style={{ width: 80, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#252019', color: '#e8e0d5' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 2 }}>XP</label>
                <input
                  type="number"
                  min={0}
                  value={form.xp}
                  onChange={(e) => setForm((f) => ({ ...f, xp: parseInt(e.target.value, 10) || 0 }))}
                  style={{ width: 100, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#252019', color: '#e8e0d5' }}
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting || !form.name.trim()}>
              Create
            </button>
          </form>
        )}
        {loading ? (
          <p style={{ color: '#8a7f72' }}>Loading characters…</p>
        ) : (
          <ul style={{ listStyle: 'none' }}>
            {characters.map((c) => (
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
                <Link to={`/characters/${c.id}`} style={{ color: '#c9a227', textDecoration: 'none' }}>
                  {c.name}
                  {(c.race_name || c.class_name) && (
                    <span style={{ color: '#8a7f72', fontSize: '0.9rem', marginLeft: '0.5rem' }}>
                      — {[c.race_name, c.class_name].filter(Boolean).join(' ')}
                    </span>
                  )}
                </Link>
                {(campaign.role === 'gm' || String(c.user || '').toLowerCase() === user.username.toLowerCase()) && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                    onClick={() => handleDelete(c.id, c.name)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
            {characters.length === 0 && !loading && (
              <li style={{ color: '#8a7f72' }}>No characters in this campaign.</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
