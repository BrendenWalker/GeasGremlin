import React, { useState, useEffect } from 'react';
import { getItems } from '../api/api';

export default function ItemsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getItems()
      .then((res) => setItems(res.data || []))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card">
      <h2>Items</h2>
      <p style={{ color: '#8a7f72', marginBottom: '1rem' }}>Reference data for your game system.</p>
      {error && <p style={{ color: '#c95858', marginBottom: '0.5rem' }}>{error}</p>}
      {loading ? (
        <p style={{ color: '#8a7f72' }}>Loading…</p>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {items.map((i) => (
            <li
              key={i.id}
              style={{
                padding: '0.75rem 0',
                borderBottom: '1px solid #3d3530',
              }}
            >
              <strong style={{ color: '#c9a227' }}>{i.name}</strong>
              {(i.category_name || i.type_name) && (
                <span style={{ color: '#8a7f72', marginLeft: '0.5rem', fontSize: '0.9rem' }}>
                  — {[i.category_name, i.type_name].filter(Boolean).join(' / ')}
                </span>
              )}
              {i.price != null && <span style={{ color: '#b8b0a0', marginLeft: '0.5rem' }}>({i.price} gp)</span>}
              {i.description && <p style={{ color: '#b8b0a0', marginTop: 4, fontSize: '0.9rem' }}>{i.description}</p>}
            </li>
          ))}
          {items.length === 0 && !loading && <li style={{ color: '#8a7f72' }}>No items in database.</li>}
        </ul>
      )}
    </div>
  );
}
