import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCampaigns, createCampaign, deleteCampaign } from '../api/api';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    getCampaigns()
      .then((res) => setCampaigns(res.data || []))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(), []);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    createCampaign({ name: newName.trim() })
      .then(() => {
        setNewName('');
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

  return (
    <div>
      <div className="card">
        <h2>Campaigns</h2>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New campaign name"
            style={{ flex: 1, padding: '0.5rem', borderRadius: 4, border: '1px solid #3d3530', background: '#1a1614', color: '#e8e0d5' }}
          />
          <button type="submit" className="btn btn-primary" disabled={creating || !newName.trim()}>
            Add
          </button>
        </form>
        {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
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
                <Link to={`/campaigns/${c.id}/characters`} style={{ color: '#c9a227', textDecoration: 'none' }}>
                  {c.name}
                </Link>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                  onClick={() => handleDelete(c.id, c.name)}
                >
                  Delete
                </button>
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
