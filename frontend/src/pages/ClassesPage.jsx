import React, { useState, useEffect } from 'react';
import { getClasses } from '../api/api';

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getClasses()
      .then((res) => setClasses(res.data || []))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card">
      <h2>Classes</h2>
      <p style={{ color: '#8a7f72', marginBottom: '1rem' }}>Reference data for your game system.</p>
      {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
      {loading ? (
        <p style={{ color: '#8a7f72' }}>Loading…</p>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {classes.map((c) => (
            <li
              key={c.id}
              style={{
                padding: '0.75rem 0',
                borderBottom: '1px solid #3d3530',
              }}
            >
              <strong style={{ color: '#c9a227' }}>{c.name}</strong>
              {c.description && <p style={{ color: '#b8b0a0', marginTop: 4, fontSize: '0.9rem' }}>{c.description}</p>}
            </li>
          ))}
          {classes.length === 0 && !loading && <li style={{ color: '#8a7f72' }}>No classes in database.</li>}
        </ul>
      )}
    </div>
  );
}
