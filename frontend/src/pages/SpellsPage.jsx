import React, { useState, useEffect } from 'react';
import { getSpells } from '../api/api';

export default function SpellsPage() {
  const [spells, setSpells] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getSpells()
      .then((res) => setSpells(res.data || []))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card">
      <h2>Spells</h2>
      <p style={{ color: '#8a7f72', marginBottom: '1rem' }}>Reference data for your game system.</p>
      {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
      {loading ? (
        <p style={{ color: '#8a7f72' }}>Loading…</p>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {spells.map((s) => (
            <li
              key={s.id}
              style={{
                padding: '0.75rem 0',
                borderBottom: '1px solid #3d3530',
              }}
            >
              <strong style={{ color: '#c9a227' }}>{s.name}</strong>
              {(s.range || s.duration) && (
                <span style={{ color: '#8a7f72', marginLeft: '0.5rem', fontSize: '0.9rem' }}>
                  — Range: {s.range ?? '—'}, Duration: {s.duration ?? '—'}
                </span>
              )}
              {s.description && <p style={{ color: '#b8b0a0', marginTop: 4, fontSize: '0.9rem' }}>{s.description}</p>}
            </li>
          ))}
          {spells.length === 0 && !loading && <li style={{ color: '#8a7f72' }}>No spells in database.</li>}
        </ul>
      )}
    </div>
  );
}
