import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteCharacter, getPlayerCharacters } from '../api/api';

function listDetail(row) {
  const kind = [row.race_name, row.class_name].filter(Boolean).join(' ');
  const raw = row.level == null || row.level === '' ? 1 : Number(row.level);
  const level = Number.isInteger(raw) ? `(lvl ${raw})` : '';
  return [kind, level].filter(Boolean).join(' ');
}

export default function OwnedCharactersPage() {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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

  const handleDelete = (character) => {
    const campaigns = (character.campaign_names || []).filter(Boolean);
    const campaignLine = campaigns.length
      ? ` This also removes them from ${campaigns.join(', ')}.`
      : '';
    if (!window.confirm(`Delete character "${character.name}"? This cannot be undone.${campaignLine}`)) return;
    setDeletingId(character.id);
    setError(null);
    deleteCharacter(character.id)
      .then(() => setCharacters((list) => list.filter((row) => row.id !== character.id)))
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setDeletingId(null));
  };

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
          {characters.map((c) => {
            const detail = listDetail(c);
            return (
            <li
              key={c.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                marginBottom: '0.5rem',
              }}
            >
              <Link to={`/characters/${c.id}`} style={{ color: '#c9a227', textDecoration: 'none', minWidth: 0 }}>
                <strong>{c.name}</strong>
                {detail ? (
                  <span style={{ color: '#8a7f72', marginLeft: 8 }}> · {detail}</span>
                ) : null}
                {c.campaign_names?.length ? (
                  <span style={{ color: '#6a5f52', fontSize: '0.9rem', display: 'block' }}>
                    Campaigns: {c.campaign_names.join(', ')}
                  </span>
                ) : null}
              </Link>
              <button
                type="button"
                className="btn btn-danger"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                disabled={deletingId === c.id}
                onClick={() => handleDelete(c)}
              >
                Delete
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
