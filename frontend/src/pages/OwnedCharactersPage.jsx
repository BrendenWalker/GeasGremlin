import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPlayerCharacters } from '../api/api';

export default function OwnedCharactersPage() {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getPlayerCharacters()
      .then((r) => setCharacters(r.data || []))
      .catch((err) => {
        setError(err.response?.data?.error || err.message);
        setCharacters([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1 style={{ marginTop: 0 }}>Characters</h1>
      <p style={{ color: '#8a7f72', marginBottom: '1rem' }}>
        Characters you own. A character in a campaign is edited by the GM. New characters are created from a campaign.
      </p>
      {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
      {loading && <p style={{ color: '#8a7f72' }}>Loading…</p>}
      {!loading && characters.length === 0 && (
        <p style={{ color: '#8a7f72' }}>
          No characters yet. Create one from a <Link to="/campaigns" style={{ color: '#c9a227' }}>campaign</Link> you belong to.
        </p>
      )}
      {!loading && characters.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {characters.map((c) => (
            <li key={c.id} style={{ marginBottom: '0.5rem' }}>
              <Link to={`/characters/${c.id}`} style={{ color: '#c9a227', textDecoration: 'none' }}>
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
    </div>
  );
}
