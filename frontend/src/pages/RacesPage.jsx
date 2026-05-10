import React, { useState, useEffect } from 'react';
import { getRaces } from '../api/api';

export default function RacesPage() {
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRaces()
      .then((res) => setRaces(res.data || []))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card">
      <h2>Races</h2>
      <p style={{ color: '#8a7f72', marginBottom: '1rem' }}>Reference data for your game system. Loaded from the database.</p>
      {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
      {loading ? (
        <p style={{ color: '#8a7f72' }}>Loading…</p>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {races.map((r) => (
            <li
              key={r.id}
              style={{
                padding: '0.75rem 0',
                borderBottom: '1px solid #3d3530',
              }}
            >
              <strong style={{ color: '#c9a227' }}>{r.name}</strong>
              {r.description && <p style={{ color: '#b8b0a0', marginTop: 4, fontSize: '0.9rem' }}>{r.description}</p>}
            </li>
          ))}
          {races.length === 0 && !loading && <li style={{ color: '#8a7f72' }}>No races in database.</li>}
        </ul>
      )}
    </div>
  );
}
