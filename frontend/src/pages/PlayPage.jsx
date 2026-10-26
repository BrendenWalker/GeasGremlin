import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPlayerCharacters } from '../api/api';
import { useAuth } from '../components/AuthContext';

export default function PlayPage() {
  const { campaignId } = useParams();
  const { user } = useAuth();
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getPlayerCharacters()
      .then((r) => {
        const rows = r.data || [];
        setCharacters(rows.filter((c) => (
          (c.campaign_ids || []).some((id) => String(id) === String(campaignId))
        )));
      })
      .catch((err) => {
        setError(err.response?.data?.error || err.message);
        setCharacters([]);
      })
      .finally(() => setLoading(false));
  }, [campaignId]);

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1 style={{ marginTop: 0 }}>My Characters</h1>
      <p style={{ color: '#8a7f72', marginBottom: '1rem' }}>
        Characters owned by {user.username} in this campaign. Open a sheet to receive GM rewards and send items or gold to other party members.
      </p>

      {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
      {loading && <p style={{ color: '#8a7f72' }}>Loading…</p>}

      {!loading && (
        <>
          <h2 style={{ marginBottom: '0.5rem' }}>Characters</h2>
          {characters.length === 0 ? (
            <p style={{ color: '#8a7f72' }}>None of your characters are in this campaign.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {characters.map((c) => (
                <li key={c.id} style={{ marginBottom: '0.5rem' }}>
                  <Link to={`/play/${campaignId}/characters/${c.id}`} style={{ color: '#c9a227', textDecoration: 'none' }}>
                    <strong>{c.name}</strong>
                    {c.race_name || c.class_name ? (
                      <span style={{ color: '#8a7f72', marginLeft: 8 }}> · {[c.race_name, c.class_name].filter(Boolean).join(' ')}</span>
                    ) : null}
                    {c.campaign_names?.length ? (
                      <span style={{ color: '#6a5f52', fontSize: '0.9rem', display: 'block' }}>
                        Campaigns: {c.campaign_names.join(', ')}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
